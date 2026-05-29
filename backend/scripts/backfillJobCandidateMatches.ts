import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), override: true });

import pool, { closePool } from '../src/lib/database';
import { computeAiCandidatesForJob } from '../src/controllers/job.controller';

type BackfillConfig = {
  batchSize: number;
  concurrency: number;
  dryRun: boolean;
  jobId?: number;
  modelVersion: string;
};

type BackfillMetrics = {
  total_jobs_seen: number;
  jobs_processed: number;
  empty_jobs: number;
  total_matches_inserted: number;
  failures: number;
};

const parseIntEnv = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

const parseBoolEnv = (key: string, fallback = false): boolean => {
  const raw = String(process.env[key] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'y';
};

const nowIso = () => new Date().toISOString();

// Minimal controlled concurrency (avoids adding new dependencies like p-limit)
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const n = Math.max(1, Math.floor(limit));
  let idx = 0;

  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const current = idx;
      idx += 1;
      if (current >= items.length) return;
      await worker(items[current]);
    }
  });

  await Promise.all(runners);
}

async function fetchJobIdsBatch(batchSize: number, offset: number): Promise<number[]> {
  const res = await pool.query(
    `
    SELECT job_id
    FROM jobs
    ORDER BY job_id
    LIMIT $1 OFFSET $2;
    `,
    [batchSize, offset]
  );

  return (res.rows || []).map((r: any) => Number(r.job_id)).filter((id: number) => Number.isFinite(id) && id > 0);
}

async function ensureTargetTableExists(): Promise<void> {
  // Safety guard: fail early if table is missing. We do NOT create schema here.
  const res = await pool.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'job_candidate_matches'
    LIMIT 1;
    `
  );

  if (!res.rows.length) {
    throw new Error(
      "Table 'job_candidate_matches' does not exist. Run the DB migration that creates it before running this backfill."
    );
  }
}

async function processJob(jobId: number, cfg: BackfillConfig, metrics: BackfillMetrics): Promise<void> {
  const client = await pool.connect();

  try {
    console.log(`[${nowIso()}] Processing job ${jobId}...`);

    await client.query('BEGIN');

    // Reuse the single source of truth for scoring.
    // NOTE: This uses the same SQL/scoring as GET /api/jobs/:job_id/ai-candidates.
    const matches = await computeAiCandidatesForJob(jobId);

    if (!matches.length) {
      metrics.empty_jobs += 1;
      await client.query('COMMIT');
      console.log(`[${nowIso()}] Job ${jobId}: No candidates found.`);
      return;
    }

    if (cfg.dryRun) {
      await client.query('COMMIT');
      console.log(`[${nowIso()}] Job ${jobId}: DRY_RUN=true → would upsert ${matches.length} matches.`);
      return;
    }

    const candidateIds: number[] = [];
    const experienceScores: number[] = [];
    const skillsScores: number[] = [];
    const finalScores: number[] = [];

    for (const m of matches) {
      const candidateId = Number((m as any).candidate_id);
      if (!Number.isFinite(candidateId) || candidateId <= 0) continue;

      candidateIds.push(candidateId);
      experienceScores.push(Number((m as any).experience_score) || 0);
      skillsScores.push(Number((m as any).skills_score) || 0);
      finalScores.push(Number((m as any).final_score) || 0);
    }

    if (!candidateIds.length) {
      metrics.empty_jobs += 1;
      await client.query('COMMIT');
      console.log(`[${nowIso()}] Job ${jobId}: No valid candidates to upsert.`);
      return;
    }

    // Bulk UPSERT per job. organization_id is sourced ONLY from jobs (tenancy source of truth).
    // We pass match rows via UNNEST (single DB round-trip; no per-row inserts).
    const upsertSql = `
      INSERT INTO job_candidate_matches (
        organization_id,
        job_id,
        candidate_id,
        experience_score,
        skills_score,
        education_score,
        projects_score,
        final_score,
        model_version,
        match_source,
        matched_at
      )
      SELECT
        j.organization_id,
        $1::int AS job_id,
        m.candidate_id,
        m.experience_score,
        m.skills_score,
        NULL::double precision AS education_score,
        NULL::double precision AS projects_score,
        m.final_score,
        $2::text AS model_version,
        'backfill'::text AS match_source,
        NOW() AS matched_at
      FROM jobs j
      JOIN (
        SELECT
          *
        FROM unnest(
          $3::int[],
          $4::double precision[],
          $5::double precision[],
          $6::double precision[]
        ) AS u(candidate_id, experience_score, skills_score, final_score)
      ) m ON TRUE
      WHERE j.job_id = $1
      ON CONFLICT (job_id, candidate_id)
      DO UPDATE SET
        experience_score = EXCLUDED.experience_score,
        skills_score = EXCLUDED.skills_score,
        education_score = EXCLUDED.education_score,
        projects_score = EXCLUDED.projects_score,
        final_score = EXCLUDED.final_score,
        model_version = EXCLUDED.model_version,
        match_source = EXCLUDED.match_source,
        matched_at = NOW();
    `;

    const upsertRes = await client.query(upsertSql, [
      jobId,
      cfg.modelVersion,
      candidateIds,
      experienceScores,
      skillsScores,
      finalScores,
    ]);

    const inserted = typeof upsertRes?.rowCount === 'number' ? upsertRes.rowCount : candidateIds.length;

    await client.query('COMMIT');

    metrics.total_matches_inserted += inserted;
    console.log(`[${nowIso()}] Job ${jobId}: Upserted ${inserted} matches.`);
  } catch (err: any) {
    metrics.failures += 1;
    await client.query('ROLLBACK').catch(() => {});
    console.error(`[${nowIso()}] Job ${jobId}: FAILED`, err?.message || err);
  } finally {
    client.release();
  }
}

async function main() {
  const cfg: BackfillConfig = {
    batchSize: parseIntEnv('BATCH_SIZE', 100),
    concurrency: parseIntEnv('CONCURRENCY', 5),
    dryRun: parseBoolEnv('DRY_RUN', false),
    jobId: process.env.JOB_ID ? Number(process.env.JOB_ID) : undefined,
    modelVersion: String(process.env.MODEL_VERSION || 'ai-candidates-v1'),
  };

  const metrics: BackfillMetrics = {
    total_jobs_seen: 0,
    jobs_processed: 0,
    empty_jobs: 0,
    total_matches_inserted: 0,
    failures: 0,
  };

  console.log(`[${nowIso()}] Starting backfill job_candidate_matches...`);
  console.log(`[${nowIso()}] Config:`, {
    batchSize: cfg.batchSize,
    concurrency: cfg.concurrency,
    dryRun: cfg.dryRun,
    jobId: cfg.jobId ?? null,
    modelVersion: cfg.modelVersion,
  });

  await ensureTargetTableExists();

  if (cfg.jobId && Number.isFinite(cfg.jobId) && cfg.jobId > 0) {
    metrics.total_jobs_seen = 1;
    metrics.jobs_processed = 1;
    await processJob(cfg.jobId, cfg, metrics);
  } else {
    let offset = 0;

    while (true) {
      const jobIds = await fetchJobIdsBatch(cfg.batchSize, offset);
      if (!jobIds.length) break;

      metrics.total_jobs_seen += jobIds.length;

      await runWithConcurrency(jobIds, cfg.concurrency, async (jobId) => {
        metrics.jobs_processed += 1;
        await processJob(jobId, cfg, metrics);
      });

      offset += cfg.batchSize;
    }
  }

  console.log('');
  console.log(`[${nowIso()}] Backfill completed.`);
  console.log(`[${nowIso()}] Summary:`);
  console.log(`  total_jobs_seen: ${metrics.total_jobs_seen}`);
  console.log(`  jobs_processed: ${metrics.jobs_processed}`);
  console.log(`  empty_jobs: ${metrics.empty_jobs}`);
  console.log(`  total_matches_inserted: ${metrics.total_matches_inserted}`);
  console.log(`  failures: ${metrics.failures}`);

  await closePool();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[${nowIso()}] Fatal error in backfill script:`, err?.message || err);
    closePool()
      .catch(() => {})
      .finally(() => process.exit(1));
  });
