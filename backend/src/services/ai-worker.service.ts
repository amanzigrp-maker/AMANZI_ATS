/**
 * Integrated AI Worker Service
 * Node = source of truth
 * Python = pure worker (JSON by resume_id only)
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import axios from 'axios';
import { logDebug, logInfo, logWarn, shouldLog } from '../lib/logging';

export class AIWorkerService {
  private pythonProcess: ChildProcess | null = null;
  private isInitialized = false;

  private readonly pythonWorkerPath: string;
  private readonly baseUrl = 'http://127.0.0.1:8001';

  constructor() {
    this.pythonWorkerPath = path.join(process.cwd(), '..', 'python-worker');
  }

  async embedJob(jobId: number): Promise<void> {
    if (!this.isInitialized) {
      logWarn('embedJob skipped: AI Worker Service not initialized');
      return;
    }

    if (!Number.isInteger(jobId)) {
      logWarn('embedJob skipped: invalid jobId', jobId);
      return;
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/embed-job`,
        { job_id: jobId },
        {
          timeout: 90_000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (status) => status < 500,
        }
      );

      if (response.status >= 400) {
        logWarn(`embedJob failed | job_id=${jobId} | status=${response.status}`, response.data);
        return;
      }

      logDebug(`embedJob queued/updated | job_id=${jobId}`);
    } catch (err: any) {
      logWarn(`embedJob error | job_id=${jobId}`, err?.response?.data || err.message);
    }
  }

  async embedAssessment(assessmentId: number): Promise<void> {
    if (!this.isInitialized) {
      logWarn('embedAssessment skipped: AI Worker Service not initialized');
      return;
    }

    if (!Number.isInteger(assessmentId)) {
      logWarn('embedAssessment skipped: invalid assessmentId', assessmentId);
      return;
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/embed-assessment`,
        { assessment_id: assessmentId },
        {
          timeout: 90_000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (status) => status < 500,
        }
      );

      if (response.status >= 400) {
        logWarn(`embedAssessment failed | assessment_id=${assessmentId} | status=${response.status}`, response.data);
        return;
      }

      logDebug(`embedAssessment queued/updated | assessment_id=${assessmentId}`);
    } catch (err: any) {
      logWarn(`embedAssessment error | assessment_id=${assessmentId}`, err?.response?.data || err.message);
    }
  }

  async semanticQuestionSearch(
    assessmentId: number,
    queryText: string,
    topK: number = 8,
    excludeQuestionIds: number[] = []
  ): Promise<any[]> {
    if (!this.isInitialized) return [];
    if (!Number.isInteger(assessmentId) || !String(queryText || '').trim()) return [];

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/semantic/question-search`,
        {
          assessment_id: assessmentId,
          query_text: queryText,
          top_k: topK,
          exclude_question_ids: excludeQuestionIds,
        },
        {
          timeout: 30_000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (status) => status < 500,
        }
      );

      if (response.status >= 400) {
        logWarn(`semanticQuestionSearch failed | assessment_id=${assessmentId} | status=${response.status}`, response.data);
        return [];
      }

      return Array.isArray(response.data?.matches) ? response.data.matches : [];
    } catch (err: any) {
      logWarn(`semanticQuestionSearch error | assessment_id=${assessmentId}`, err?.response?.data || err.message);
      return [];
    }
  }

  async semanticCandidateContext(candidateEmail: string, queryText: string, topK: number = 4): Promise<any[]> {
    if (!this.isInitialized) return [];
    if (!String(candidateEmail || '').trim() || !String(queryText || '').trim()) return [];

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/semantic/candidate-context`,
        {
          candidate_email: candidateEmail,
          query_text: queryText,
          top_k: topK,
        },
        {
          timeout: 30_000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (status) => status < 500,
        }
      );

      if (response.status >= 400) {
        logWarn(`semanticCandidateContext failed | candidate_email=${candidateEmail} | status=${response.status}`, response.data);
        return [];
      }

      return Array.isArray(response.data?.matches) ? response.data.matches : [];
    } catch (err: any) {
      logWarn(`semanticCandidateContext error | candidate_email=${candidateEmail}`, err?.response?.data || err.message);
      return [];
    }
  }

  async initialize(): Promise<void> {
    logInfo('Initializing AI Worker Service...');

    await this.validatePythonWorker();
    await this.startPythonWorker();
    await this.waitForService();

    this.isInitialized = true;
    logInfo('AI Worker Service initialized');
  }

  private async validatePythonWorker(): Promise<void> {
    await fs.access(this.pythonWorkerPath);
    await fs.access(path.join(this.pythonWorkerPath, 'main.py'));
    await fs.access(path.join(this.pythonWorkerPath, 'requirements.txt'));
  }

  private async startPythonWorker(): Promise<void> {
    const isWin = process.platform === 'win32';
    const rootDir = path.join(this.pythonWorkerPath, '..');
    const venvWin = path.join(rootDir, '.venv', 'Scripts', 'python.exe');
    const venvLin = path.join(rootDir, '.venv', 'bin', 'python');
    const venvLocalLin = path.join(this.pythonWorkerPath, 'venv', 'bin', 'python');

    let pythonCmd = isWin ? 'python' : 'python3';

    const exists = async (p: string) => {
      try {
        await fs.access(p);
        return true;
      } catch {
        return false;
      }
    };

    if (isWin && await exists(venvWin)) {
      pythonCmd = venvWin;
    } else if (!isWin && await exists(venvLin)) {
      pythonCmd = venvLin;
    } else if (!isWin && await exists(venvLocalLin)) {
      pythonCmd = venvLocalLin;
    }

    logInfo(`Starting Python worker using: ${pythonCmd}`);

    return new Promise((resolve, reject) => {
      this.pythonProcess = spawn(pythonCmd, ['main.py'], {
        cwd: this.pythonWorkerPath,
        env: {
          ...process.env,
          WORKER_API_HOST: '127.0.0.1',
          WORKER_API_PORT: '8001',
          PYTHONIOENCODING: 'utf-8',
          HF_HUB_DISABLE_PROGRESS_BARS: '1',
          TRANSFORMERS_NO_ADVISORY_WARNINGS: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.pythonProcess.stdout?.on('data', (d) => {
        const lines = d.toString().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        for (const line of lines) {
          const isNoisyInfo =
            /\b(INFO|SUCCESS)\b/.test(line) ||
            line.startsWith('INFO:') ||
            line.includes('Application startup complete') ||
            line.includes('Uvicorn running on') ||
            line.includes('"GET /health');

          if (isNoisyInfo && !shouldLog('debug')) {
            continue;
          }

          if (/\b(WARNING|ERROR|FATAL)\b/.test(line) || line.startsWith('ERROR:')) {
            console.warn(`[Python] ${line}`);
          } else {
            logDebug(`[Python] ${line}`);
          }
        }
      });

      this.pythonProcess.stderr?.on('data', (d) => {
        const text = d.toString().trim();
        if (text) console.error(`[Python ERROR] ${text}`);
      });

      this.pythonProcess.on('error', reject);
      setTimeout(resolve, 500);
    });
  }

  private async waitForService(retries = 180): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        const r = await axios.get(`${this.baseUrl}/health`, { timeout: 2000 });
        if (r.status === 200) {
          logInfo('Python worker ready');
          return;
        }
      } catch {
        if (i % 15 === 0 && i > 0) {
          logDebug(`Waiting for Python worker... (${i}/${retries})`);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error(`Python worker did not become ready after ${retries} seconds`);
  }

  async parseResume(resumeId: number, isBulk: boolean = false): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('AI Worker Service not initialized');
    }

    if (!Number.isInteger(resumeId)) {
      throw new Error('Invalid resumeId');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/api/parse-resume`,
        { resume_id: resumeId, is_bulk: isBulk },
        {
          timeout: 90_000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: (status) => status < 500,
        }
      );

      if (response.status === 409) {
        const err: any = new Error('Duplicate resume');
        err.status = 409;
        throw err;
      }

      return response.data;
    } catch (err: any) {
      console.error('Python parse failed:', err?.response?.data || err.message);
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const r = await axios.get(`${this.baseUrl}/health`, { timeout: 3000 });
      return r.status === 200;
    } catch {
      return false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.pythonProcess && !this.pythonProcess.killed) {
      this.pythonProcess.kill('SIGTERM');
    }
    this.isInitialized = false;
  }
}

export const aiWorkerService = new AIWorkerService();
