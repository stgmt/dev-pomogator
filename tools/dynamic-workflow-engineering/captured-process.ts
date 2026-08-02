import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { forceKillProcessTree, signalProcessTree } from '../_shared/process-tree.ts';
import { writeJsonAtomic } from './run-state.ts';

export type ProcessClassification = 'SUCCESS' | 'HARNESS_DEFECT' | 'CAPABILITY_GAP' | 'PRODUCT_FAILURE' | 'TIMEOUT' | 'CANCELLED';

export interface CapturedProcessOptions {
  executable: string;
  argv: string[];
  cwd: string;
  evidenceDirectory: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  maxOutputBytes?: number;
  classifyFailure?: (exitCode: number | null, stderr: string) => ProcessClassification;
}

export interface CapturedProcessResult {
  schemaVersion: 1;
  executable: string;
  argv: string[];
  stdoutRef: string;
  stderrRef: string;
  evidenceRef: string;
  encoding: 'UTF-8';
  exitCode: number;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  outputBytes: number;
  classification: ProcessClassification;
  startedAt: string;
  finishedAt: string;
}

function defaultClassification(exitCode: number | null, stderr: string): ProcessClassification {
  if (exitCode === 0) return 'SUCCESS';
  if (/ENOENT|MODULE_NOT_FOUND|cannot find module|invalid arg/i.test(stderr)) return 'HARNESS_DEFECT';
  if (/unsupported|not available|not implemented|permission denied/i.test(stderr)) return 'CAPABILITY_GAP';
  return 'PRODUCT_FAILURE';
}

export function runCapturedProcess(options: CapturedProcessOptions): Promise<CapturedProcessResult> {
  if (!options.executable.trim()) return Promise.reject(new Error('executable is required'));
  if (!Array.isArray(options.argv) || options.argv.some((arg) => typeof arg !== 'string')) return Promise.reject(new Error('argv must be a string array'));
  const timeoutMs = options.timeoutMs ?? 60_000;
  const maxOutputBytes = options.maxOutputBytes ?? 2_000_000;
  fs.mkdirSync(options.evidenceDirectory, { recursive: true });
  const stdoutRef = path.join(options.evidenceDirectory, 'stdout.log');
  const stderrRef = path.join(options.evidenceDirectory, 'stderr.log');
  const evidenceRef = path.join(options.evidenceDirectory, 'result.json');
  const stdout = fs.createWriteStream(stdoutRef, { flags: 'wx', encoding: 'utf8', mode: 0o600 });
  const stderr = fs.createWriteStream(stderrRef, { flags: 'wx', encoding: 'utf8', mode: 0o600 });
  const startedAt = new Date().toISOString();
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let outputBytes = 0;
    let stderrText = '';
    let settled = false;
    const child = spawn(options.executable, options.argv, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    const overflow = (): void => {
      if (settled) return;
      timedOut = true;
      signalProcessTree(child.pid ?? 0);
      setTimeout(() => forceKillProcessTree(child.pid ?? 0), 1_000).unref();
    };
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes <= maxOutputBytes) stdout.write(chunk);
      else overflow();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (stderrText.length < 16_384) stderrText += chunk.toString('utf8');
      if (outputBytes <= maxOutputBytes) stderr.write(chunk);
      else overflow();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      signalProcessTree(child.pid ?? 0);
      setTimeout(() => forceKillProcessTree(child.pid ?? 0), 1_000).unref();
    }, timeoutMs);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdout.end(); stderr.end();
      reject(error);
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdout.end(); stderr.end();
      const finalize = async (): Promise<void> => {
        await Promise.all([
          new Promise<void>((done) => stdout.closed ? done() : stdout.once('close', done)),
          new Promise<void>((done) => stderr.closed ? done() : stderr.once('close', done)),
        ]);
      const exitCode = code ?? (timedOut ? 124 : 1);
      const result: CapturedProcessResult = {
        schemaVersion: 1,
        executable: options.executable,
        argv: options.argv,
        stdoutRef,
        stderrRef,
        evidenceRef,
        encoding: 'UTF-8',
        exitCode,
        signal,
        timedOut,
        outputBytes,
        classification: timedOut ? 'TIMEOUT' : (options.classifyFailure ?? defaultClassification)(code, stderrText),
        startedAt,
        finishedAt: new Date().toISOString(),
      };
        writeJsonAtomic(evidenceRef, result);
        resolve(result);
      };
      finalize().catch(reject);
    });
  });
}

export function assertTypedSummary<T>(summary: { count: number; items: T[] }): void {
  if (!Number.isSafeInteger(summary.count) || summary.count < 0 || summary.count !== summary.items.length) {
    throw new Error(`DWE_CARDINALITY_MISMATCH: count=${summary.count} items=${summary.items.length}`);
  }
}
