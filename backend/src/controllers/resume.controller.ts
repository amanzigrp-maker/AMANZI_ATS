/**
 * Resume Controller
 * Node = source of truth
 * Python = pure worker (parse by resume_id only)
 */

import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { pool } from '../lib/database';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';

import { aiWorkerService } from '../services/ai-worker.service';
import elasticsearchService from '../services/elasticsearch.service';
import notificationService from '../services/notification.service';

/* -------------------------------------------------------------------------- */
/*                               MULTER CONFIG                                 */
/* -------------------------------------------------------------------------- */

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    try {
      const now = new Date();
      const uploadDir = path.join(
        process.cwd(),
        'storage',
        'resumes',
        String(now.getFullYear()),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0')
      );

      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (err) {
      cb(err as Error, '');
    }
  },

  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const tmp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, `tmp-${tmp}${ext}`);
  },
});

const allowedExt = [
  '.pdf', '.doc', '.docx',
  '.xls', '.xlsx',
  '.jpg', '.jpeg', '.png',
  '.bmp', '.tiff',
];

export const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    allowedExt.includes(ext)
      ? cb(null, true)
      : cb(new Error('Invalid file type'));
  },
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const bulkUpload = upload.array('files', 1000);

/* -------------------------------------------------------------------------- */
/*                               UPLOAD RESUME                                 */
/* -------------------------------------------------------------------------- */

export const uploadResume = async (req: Request, res: Response) => {
  const client = await pool.connect();
  let resumeId: number | null = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, path: filePath, size, mimetype } = req.file;
    const userId = (req as any).user?.userid ?? (req as any).user?.id ?? null;

    /* ---------------- JOB ID (REQUIRED, FK -> jobs) ---------------- */
    const rawJobId = Number(req.body.job_id);

    if (!req.body.job_id || !Number.isInteger(rawJobId)) {
      return res.status(400).json({ error: 'Job is required' });
    }

    const jobCheck = await client.query(
      `SELECT job_id FROM jobs WHERE job_id = $1`,
      [rawJobId]
    );

    if (jobCheck.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid job selected' });
    }

    /* -------------------- TRANSACTION -------------------- */
    await client.query('BEGIN');

    const insertRes = await client.query(
      `
      INSERT INTO resumes (
        job_id,
        original_filename,
        file_path,
        file_size_bytes,
        file_type,
        uploaded_at,
        uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), $6)
      RETURNING resume_id
      `,
      [rawJobId, originalname, filePath, size, mimetype, userId]
    );

    resumeId = insertRes.rows[0].resume_id;

    await client.query('COMMIT');

    /* -------------------- AI PARSE (AFTER COMMIT) -------------------- */
    const rawGender = (req as any).body?.gender;
    const genderNormalized = (() => {
      const g = String(rawGender ?? '').trim();
      if (!g) return null;
      const gl = g.toLowerCase();
      if (gl.startsWith('f')) return 'Female';
      if (gl.startsWith('m')) return 'Male';
      return g;
    })();

    let parseResult: any;
    try {
      parseResult = await aiWorkerService.parseResume(resumeId);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 400 && typeof detail === 'string' && detail.toLowerCase().includes('mandatory')) {
        try {
          await pool.query('DELETE FROM resumes WHERE resume_id = $1', [resumeId]);
        } catch {
          // best-effort cleanup
        }

        try {
          await fs.unlink(filePath);
        } catch {
          // best-effort cleanup
        }

        return res.status(400).json({
          error: detail,
        });
      }

      const errorMessage =
        (typeof detail === 'string' && detail.trim()) ||
        (typeof err?.response?.data?.error === 'string' && err.response.data.error.trim()) ||
        (typeof err?.message === 'string' && err.message.trim()) ||
        'Resume parsing failed';

      try {
        await pool.query(
          `UPDATE resumes
           SET processing_status = 'failed',
               error_message = $1,
               updated_at = NOW()
           WHERE resume_id = $2`,
          [errorMessage, resumeId]
        );
      } catch {
        // best-effort
      }

      return res.status(422).json({
        error: 'resume_parse_failed',
        message: errorMessage,
        resume_id: resumeId,
      });
    }

    const candidateId = parseResult?.candidate_id ?? null;

    // if (!candidateId) {
    //   return res.status(400).json({
    //     error: 'Resume rejected: email or phone number is mandatory',
    //   });
    // }

    if (candidateId) {
      await pool.query(
        `UPDATE resumes SET candidate_id = $1 WHERE resume_id = $2`,
        [candidateId, resumeId]
      );

      if (genderNormalized) {
        console.log('[UPLOAD] Persisting gender from upload form:', {
          resumeId,
          candidateId,
          gender: genderNormalized,
        });
        await pool.query(
          `UPDATE candidates
           SET gender = $1, updated_at = NOW()
           WHERE candidate_id = $2`,
          [genderNormalized, candidateId]
        );
      }

      elasticsearchService.indexResume({
        resume_id: resumeId,
        candidate_id: candidateId,
        raw_text: originalname,
        skills: parseResult?.parsed_data?.skills || [],
      });

      // --- Link Candidate to Job & Create Application Entry ---
      // This ensures the upload shows up in "Recent Applications" immediately.
      try {
        const uploaderId = (req as any).user?.userid ?? (req as any).user?.id ?? null;
        if (uploaderId && rawJobId) {
          await client.query(
            `INSERT INTO applications (
              job_id, 
              candidate_id, 
              status, 
              applied_date, 
              uploaded_by_user_id,
              application_type
            ) VALUES ($1, $2, 'pending', NOW(), $3, $4)
            ON CONFLICT (job_id, candidate_id) DO NOTHING`,
            [
              rawJobId, 
              candidateId, 
              uploaderId,
              (req as any).user?.role === 'vendor' ? 'vendor' : 'recruiter', 
            ]
          );
          console.log(`✅ Application auto-created for candidate ${candidateId} on job ${rawJobId}`);
        }

        // --- Notify Admins/System about New Resume ---
        const admins = await pool.query(
          `SELECT userid FROM users WHERE role = 'admin' AND status = 'active'`
        );

        if (admins.rows.length > 0) {
          const jobRow = await pool.query("SELECT job_code FROM jobs WHERE job_id = $1", [rawJobId]);
          const jobCode = jobRow.rows[0]?.job_code || rawJobId;

          const notifications = admins.rows.map((a) => ({
            userId: a.userid as number,
            title: "New Application Received",
            message: `New candidate linked to job ${jobCode}`,
            type: "info" as const,
            relatedJobId: Number(rawJobId),
            relatedJobCode: String(jobCode),
            relatedEntityType: "application",
            relatedEntityId: resumeId || undefined,
          }));

          await notificationService.sendBulkNotifications(notifications);
        }
      } catch (notifyErr) {
        console.error("⚠️ Failed to process post-upload actions (app linking/notifications):", notifyErr);
      }
    }

    return res.status(201).json({
      success: true,
      resume_id: resumeId,
      candidate_id: candidateId,
      filename: path.basename(filePath),
      parsed_data: parseResult?.parsed_data ?? null,
    });

  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch { }

    console.error('❌ Resume upload error:', err);

    if (req.file && fsSync.existsSync(req.file.path)) {
      await fs.unlink(req.file.path).catch(() => { });
    }

    return res.status(500).json({
      error: 'Upload failed',
      message: err.message,
    });

  } finally {
    client.release();
  }
};

export const bulkUploadResumes = async (req: AuthenticatedRequest, res: Response) => {
  const files = ((req as any).files || []) as any[];

  if (!files.length) {
    return res.status(400).json({
      success: false,
      error: 'No files uploaded',
    });
  }

  const userId = (req as any).user?.userid ?? (req as any).user?.id ?? null;
  const rawJobId = Number((req as any).body?.job_id);

  if (!rawJobId || !Number.isInteger(rawJobId)) {
    return res.status(400).json({
      success: false,
      error: 'Job is required',
    });
  }

  const results: any[] = [];

  for (const file of files) {
    const client = await pool.connect();
    let resumeId: number | null = null;

    try {
      const jobCheck = await client.query(
        `SELECT job_id FROM jobs WHERE job_id = $1`,
        [rawJobId]
      );

      if (jobCheck.rowCount === 0) {
        throw new Error('Invalid job selected');
      }

      const { originalname, path: filePath, size, mimetype } = file;

      await client.query('BEGIN');
      const insertRes = await client.query(
        `
        INSERT INTO resumes (
          job_id,
          original_filename,
          file_path,
          file_size_bytes,
          file_type,
          uploaded_at,
          uploaded_by
        )
        VALUES ($1, $2, $3, $4, $5, NOW(), $6)
        RETURNING resume_id
        `,
        [rawJobId, originalname, filePath, size, mimetype, userId]
      );

      resumeId = insertRes.rows?.[0]?.resume_id ?? null;
      await client.query('COMMIT');

      if (!resumeId) {
        throw new Error('Failed to create resume record');
      }

      let parseResult: any;
      try {
        parseResult = await aiWorkerService.parseResume(resumeId, true);
      } catch (err: any) {
        const detail = err?.response?.data?.detail;

        const errorMessage =
          (typeof detail === 'string' && detail.trim()) ||
          (typeof err?.response?.data?.error === 'string' && err.response.data.error.trim()) ||
          (typeof err?.message === 'string' && err.message.trim()) ||
          'Resume parsing failed';

        try {
          await pool.query(
            `UPDATE resumes
             SET processing_status = 'failed',
                 error_message = $1,
                 updated_at = NOW()
             WHERE resume_id = $2`,
            [errorMessage, resumeId]
          );
        } catch { }

        results.push({
          status: 'failed',
          filename: originalname,
          resume_id: resumeId,
          error: errorMessage,
        });
        continue;
      }

      const candidateId = parseResult?.candidate_id ?? null;
      if (!candidateId) {
        results.push({
          status: 'failed',
          filename: originalname,
          resume_id: resumeId,
          error: 'Resume rejected: email or phone number is mandatory',
        });
        continue;
      }

      await pool.query(
        `UPDATE resumes SET candidate_id = $1 WHERE resume_id = $2`,
        [candidateId, resumeId]
      );

      elasticsearchService.indexResume({
        resume_id: resumeId,
        candidate_id: candidateId,
        raw_text: originalname,
        skills: parseResult?.parsed_data?.skills || [],
      });

      results.push({
        status: 'completed',
        filename: originalname,
        resume_id: resumeId,
        candidate_id: candidateId,
      });
    } catch (err: any) {
      try {
        await client.query('ROLLBACK');
      } catch { }

      results.push({
        status: 'failed',
        filename: file?.originalname,
        resume_id: resumeId ?? undefined,
        error: err?.message || 'Upload failed',
      });
    } finally {
      client.release();
    }
  }

  // Notify admins about the bulk upload
  try {
    const successCount = results.filter(r => r.status === 'completed').length;
    if (successCount > 0) {
      const admins = await pool.query(
        `SELECT userid FROM users WHERE role = 'admin' AND status = 'active'`
      );

      if (admins.rows.length > 0) {
        const jobRow = await pool.query("SELECT job_code FROM jobs WHERE job_id = $1", [rawJobId]);
        const jobCode = jobRow.rows[0]?.job_code || rawJobId;

        const notifications = admins.rows.map((a) => ({
          userId: a.userid as number,
          title: "Bulk Resume Upload Completed",
          message: `${successCount} new candidates uploaded for job ${jobCode}`,
          type: "success" as const,
          relatedJobId: Number(rawJobId),
          relatedJobCode: String(jobCode),
          relatedEntityType: "bulk_upload",
          relatedEntityId: Date.now(),
        }));

        await notificationService.sendBulkNotifications(notifications);
      }
    }
  } catch (notifyErr) {
    console.error("⚠️ Failed to send admin bulk upload notification:", notifyErr);
  }

  return res.status(200).json({
    success: true,
    data: {
      job_id: Date.now(),
      results,
    },
  });
};

/* -------------------------------------------------------------------------- */
/*                          UPLOAD MODIFIED RESUME                             */
/* -------------------------------------------------------------------------- */

export const uploadModifiedResume = async (req: AuthenticatedRequest, res: Response) => {
  const client = await pool.connect();
  let resumeId: number | null = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const role = String((req as any).user?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'recruiter' && role !== 'lead') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { originalname, path: filePath, size, mimetype } = req.file as any;
    const userId = req.user?.id;

    const rawJobId = Number(req.body.job_id);
    const rawCandidateId = Number(req.body.candidate_id);

    if (!Number.isInteger(rawJobId)) {
      return res.status(400).json({ error: 'Job is required' });
    }

    if (!Number.isInteger(rawCandidateId)) {
      return res.status(400).json({ error: 'Candidate is required' });
    }

    const jobCheck = await client.query(
      `SELECT job_id FROM jobs WHERE job_id = $1`,
      [rawJobId]
    );
    if (jobCheck.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid job selected' });
    }

    const candidateCheck = await client.query(
      `SELECT candidate_id FROM candidates WHERE candidate_id = $1`,
      [rawCandidateId]
    );
    if (candidateCheck.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid candidate selected' });
    }

    const existingApp = await client.query(
      `
      SELECT application_id
      FROM applications
      WHERE job_id = $1
        AND candidate_id = $2
        AND (application_type IS NULL OR application_type != 'vendor')
      LIMIT 1
      `,
      [rawJobId, rawCandidateId]
    );

    if (existingApp.rowCount === 0) {
      return res.status(400).json({
        error: 'Application not found for this candidate and job',
      });
    }

    await client.query('BEGIN');

    const insertRes = await client.query(
      `
      INSERT INTO resumes (
        job_id,
        candidate_id,
        original_filename,
        file_path,
        file_size_bytes,
        file_type,
        uploaded_at,
        uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      RETURNING resume_id
      `,
      [rawJobId, rawCandidateId, originalname, filePath, size, mimetype, userId]
    );

    resumeId = insertRes.rows[0].resume_id;

    await client.query('COMMIT');

    const parseResult = await aiWorkerService.parseResume(resumeId);

    elasticsearchService.indexResume({
      resume_id: resumeId,
      candidate_id: rawCandidateId,
      raw_text: originalname,
      skills: parseResult?.parsed_data?.skills || [],
    });

    // Notify Admins about the modified upload
    try {
      const admins = await pool.query(
        `SELECT userid FROM users WHERE role = 'admin' AND status = 'active'`
      );

      if (admins.rows.length > 0) {
        const jobRow = await pool.query("SELECT job_code FROM jobs WHERE job_id = $1", [rawJobId]);
        const jobCode = jobRow.rows[0]?.job_code || rawJobId;

        const notifications = admins.rows.map((a) => ({
          userId: a.userid as number,
          title: "Candidate Update",
          message: `Candidate ${parseResult?.parsed_data?.full_name || 'ID '+rawCandidateId} updated resume for job ${jobCode}`,
          type: "info" as const,
          relatedJobId: Number(rawJobId),
          relatedJobCode: String(jobCode),
          relatedEntityType: "application",
          relatedEntityId: resumeId || undefined,
        }));

        await notificationService.sendBulkNotifications(notifications);
      }
    } catch (notifyErr) {
      console.error("⚠️ Failed to send admin modification notification:", notifyErr);
    }

    return res.status(201).json({
      success: true,
      resume_id: resumeId,
      candidate_id: rawCandidateId,
      job_id: rawJobId,
      filename: path.basename(filePath),
      parsed_data: parseResult?.parsed_data ?? null,
    });
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch { }

    console.error('❌ Modified resume upload error:', err);

    if (req.file && fsSync.existsSync(req.file.path)) {
      await fs.unlink(req.file.path).catch(() => { });
    }

    return res.status(500).json({
      error: 'Upload failed',
      message: err.message,
    });
  } finally {
    client.release();
  }
};

/* -------------------------------------------------------------------------- */
/*                              DOWNLOAD RESUME                                */
/* -------------------------------------------------------------------------- */

export const downloadResume = async (req: Request, res: Response) => {
  try {
    const resumeId = Number(req.params.resumeId);

    const result = await pool.query(
      `
      SELECT
        r.file_path,
        r.original_filename,
        c.candidate_code,
        c.full_name
      FROM resumes r
      LEFT JOIN candidates c ON c.candidate_id = r.candidate_id
      WHERE r.resume_id = $1
      `,
      [resumeId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    const { file_path, original_filename, candidate_code, full_name } = result.rows[0];

    if (!file_path || !fsSync.existsSync(file_path)) {
      return res.status(404).json({ error: 'File missing on server' });
    }

    const ext =
      path.extname(original_filename || '') ||
      path.extname(file_path) ||
      '.pdf';

    const safeName = (full_name || 'Candidate')
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 60);

    const downloadName = candidate_code
      ? `${candidate_code}_${safeName}${ext}`
      : original_filename || path.basename(file_path);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName}"`
    );

    return res.sendFile(path.resolve(file_path));
  } catch (err) {
    console.error('❌ Download error:', err);
    return res.status(500).json({ error: 'Download failed' });
  }
};
