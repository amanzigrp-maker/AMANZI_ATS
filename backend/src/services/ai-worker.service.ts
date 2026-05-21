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
import { config } from '../config/env.config';

export class AIWorkerService {
  private pythonProcess: ChildProcess | null = null;
  private isInitialized = false;

  private readonly pythonWorkerPath: string;
  private readonly baseUrl = config.PYTHON_WORKER_BASE_URL;

  constructor() {
    this.pythonWorkerPath = path.join(process.cwd(), '..', 'python-worker');
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
          WORKER_API_HOST: config.WORKER_API_HOST,
          WORKER_API_PORT: String(config.WORKER_API_PORT),
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
        if (!text) return;

        // Uvicorn/FastAPI often log startup info to stderr
        const isActuallyInfo = text.includes('INFO:') || 
                              text.includes('Started server process') || 
                              text.includes('Waiting for application startup') || 
                              text.includes('Application startup complete');

        if (isActuallyInfo) {
          logDebug(`[Python] ${text}`);
        } else {
          console.error(`[Python ERROR] ${text}`);
        }
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

  async semanticQuestionSearch(
    assessmentId: number,
    queryText: string,
    topK: number,
    excludeQuestionIds: number[]
  ): Promise<any[]> {
    logInfo(`[AIWorkerService] semanticQuestionSearch called for assessmentId=${assessmentId}`);
    return [];
  }

  async embedAssessment(assessmentId: number): Promise<void> {
    logInfo(`[AIWorkerService] embedAssessment called for assessmentId=${assessmentId}`);
  }

  async semanticCandidateContext(
    candidateEmail: string,
    queryText: string,
    topK: number
  ): Promise<any[]> {
    logInfo(`[AIWorkerService] semanticCandidateContext called for ${candidateEmail}`);
    return [];
  }

  async embedJob(jobId: number): Promise<void> {
    logInfo(`[AIWorkerService] embedJob called for jobId=${jobId}`);
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
