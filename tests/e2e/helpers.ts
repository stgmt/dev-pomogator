import { execSync, spawn, spawnSync, ChildProcess } from 'child_process';
import crossSpawn from 'cross-spawn';
import { readFileSync, readdirSync, readlinkSync } from 'fs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';

const APP_DIR = process.env.APP_DIR || process.cwd();
const WORKER_PORT = 37777;

/**
 * Get enhanced PATH with bun location
 * Bun installs to ~/.bun/bin which may not be in child process PATH
 */
function getEnhancedPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '/home/testuser';
  const bunPath = `${home}/.bun/bin`;
  const currentPath = process.env.PATH || '';
  
  // Add bun to PATH if not already present
  if (!currentPath.includes(bunPath)) {
    return `${bunPath}:${currentPath}`;
  }
  return currentPath;
}

export interface InstallerResult {
  logs: string;
  exitCode: number;
}

/**
 * Run the dev-pomogator installer
 * Note: Use --all flag to install all plugins in non-interactive mode
 */
export async function runInstaller(
  args: string = '--claude --all',
  extraEnv: Record<string, string> = {},
): Promise<InstallerResult> {
  // spawnSync never throws — surface spawn errors directly so callers can
  // distinguish "installer exited non-zero" from "node binary not found".
  const result = spawnSync('node', ['dist/index.js', ...args.split(/\s+/).filter(Boolean)], {
    encoding: 'utf-8',
    cwd: APP_DIR,
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      ...extraEnv,
    },
  });
  if (result.error) {
    return { logs: `spawn failed: ${result.error.message}`, exitCode: -1 };
  }
  const logs = (result.stdout || '') + (result.stderr || '');
  return { logs, exitCode: result.status ?? -1 };
}

// ============================================================================
// runInstallerViaNpx — for CORE003_18 / CORE003_19 silent install regression
// ============================================================================

export interface NpxInstallResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Lines matching `npm warn cleanup` from stderr (Windows EPERM signal) */
  cleanupWarnings: string[];
  /** True if `_npx/<hash>/node_modules/dev-pomogator/package.json` exists after run */
  cachePopulated: boolean;
  /** True if mtime of `~/.dev-pomogator/logs/install.log` advanced during run */
  installerLogTouched: boolean;
  /** Temp directory created for this run (caller is responsible for cleanup) */
  tempDir: string;
  /** Temp NPM cache directory (only if `options.fresh === true`) */
  tempCache: string | null;
}

/**
 * Run dev-pomogator installer via `npx --yes github:stgmt/dev-pomogator …`.
 *
 * Used by CORE003_18 (Linux control) and CORE003_19 (Windows TDD red — known
 * silent install bug). Reproduces the exact code path users hit when invoking
 * dev-pomogator via npx, including npm reify and bin extraction.
 *
 * The helper:
 *   1. Creates an isolated `mkdtempSync` working directory.
 *   2. Optionally creates a fresh `NPM_CONFIG_CACHE` to bypass any locked
 *      `_npx/<hash>` files left over from prior runs.
 *   3. Captures the mtime of `~/.dev-pomogator/logs/install.log` BEFORE the
 *      run so the caller can detect whether the installer ever wrote to it.
 *   4. Spawns `npx --loglevel verbose --yes github:stgmt/dev-pomogator <args>`
 *      synchronously with `input: 'y\n'` to auto-accept the npx download
 *      confirmation.
 *   5. Parses stderr for `npm warn cleanup` lines — these are emitted at WARN
 *      level on Windows when reify cleanup hits EPERM and are HIDDEN at the
 *      default loglevel. Their presence is the canonical signal of the bug
 *      documented in `.specs/install-diagnostics/RESEARCH.md`.
 *   6. Checks whether `_npx/<hash>/node_modules/dev-pomogator/package.json`
 *      exists, indicating that the package was actually extracted (it is
 *      NOT extracted in the bug case — reify rolls back).
 *   7. Compares the install.log mtime — if it advanced, dev-pomogator's main()
 *      ran; if it did NOT advance, the installer never started.
 *
 * Note: callers are responsible for cleaning up `result.tempDir` and
 * `result.tempCache` (if non-null). The helper does not auto-delete them
 * because failing tests benefit from being able to inspect the leftover state.
 */
export async function runInstallerViaNpx(
  args: string = '--claude --all',
  options: { fresh?: boolean } = {},
): Promise<NpxInstallResult> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pom-npx-'));
  const tempCache = options.fresh
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'pom-npx-cache-'))
    : null;

  // Capture install.log mtime BEFORE running so we can detect if installer ran.
  const installLogPath = getInstallLogPath();
  let beforeMtime = 0;
  try {
    if (fs.existsSync(installLogPath)) {
      beforeMtime = fs.statSync(installLogPath).mtimeMs;
    }
  } catch {
    // log file does not exist yet — beforeMtime stays 0
  }

  const env: Record<string, string> = {
    ...process.env,
    FORCE_COLOR: '0',
  };
  if (tempCache) {
    env.NPM_CONFIG_CACHE = tempCache;
  }

  const result = spawnSync(
    'npx',
    [
      '--loglevel',
      'verbose',
      '--yes',
      'github:stgmt/dev-pomogator',
      ...args.split(/\s+/).filter(Boolean),
    ],
    {
      encoding: 'utf-8',
      cwd: tempDir,
      env,
      input: 'y\n',
      shell: process.platform === 'win32',
      // Allow up to 2 minutes — npm reify can be slow on Windows
      timeout: 120_000,
    },
  );

  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const exitCode = result.status ?? -1;

  // Parse cleanup warnings from stderr (the silent failure signal).
  const cleanupWarnings = stderr
    .split('\n')
    .filter((line) => /npm warn cleanup/i.test(line));

  // Check if dev-pomogator was actually extracted into the npx cache.
  // npx hashes the package spec to derive the cache subdirectory name; we
  // can't trivially recompute that hash, so instead we walk `_npx/*/node_modules/dev-pomogator/package.json`.
  const cacheRoot = tempCache
    ? path.join(tempCache, '_npx')
    : path.join(os.homedir(), 'AppData', 'Local', 'npm-cache', '_npx');
  let cachePopulated = false;
  try {
    if (fs.existsSync(cacheRoot)) {
      const hashes = fs.readdirSync(cacheRoot);
      for (const h of hashes) {
        const pkgJson = path.join(
          cacheRoot,
          h,
          'node_modules',
          'dev-pomogator',
          'package.json',
        );
        if (fs.existsSync(pkgJson)) {
          cachePopulated = true;
          break;
        }
      }
    }
  } catch {
    // permission errors — leave cachePopulated as false
  }

  // Check if installer touched the log file (proves main() actually ran).
  let afterMtime = 0;
  try {
    if (fs.existsSync(installLogPath)) {
      afterMtime = fs.statSync(installLogPath).mtimeMs;
    }
  } catch {
    // log not created — afterMtime stays 0
  }
  const installerLogTouched = afterMtime > beforeMtime;

  return {
    stdout,
    stderr,
    exitCode,
    cleanupWarnings,
    cachePopulated,
    installerLogTouched,
    tempDir,
    tempCache,
  };
}

/**
 * Get the HOME directory
 */
export function getHome(): string {
  return process.env.HOME || process.env.USERPROFILE || '/home/testuser';
}

/**
 * Get the APP directory (where installer runs)
 */
export function getAppDir(): string {
  return APP_DIR;
}

/**
 * Get path relative to HOME
 */
export function homePath(...segments: string[]): string {
  return path.join(getHome(), ...segments);
}

/**
 * Get path relative to APP_DIR
 */
export function appPath(...segments: string[]): string {
  return path.join(APP_DIR, ...segments);
}

/**
 * Initialize a git repository in APP_DIR.
 * This is required for findRepoRoot() to work correctly in tests.
 */
export async function initGitRepo(): Promise<void> {
  const gitDir = path.join(APP_DIR, '.git');
  await fs.ensureDir(gitDir);
  
  // Create minimal git structure so `git rev-parse --show-toplevel` works
  await fs.writeFile(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  await fs.ensureDir(path.join(gitDir, 'refs', 'heads'));
  await fs.writeFile(path.join(gitDir, 'config'), `[core]
	repositoryformatversion = 0
	filemode = true
	bare = false
`);
}

// ============================================================================
// Claude-mem Worker helpers
// ============================================================================

let workerProcess: ChildProcess | null = null;

/**
 * Get the claude-mem directory
 */
export function getClaudeMemDir(): string {
  return homePath('.claude', 'plugins', 'marketplaces', 'thedotmack');
}

/**
 * Get the worker-service.cjs path
 */
export function getWorkerServicePath(): string {
  return path.join(getClaudeMemDir(), 'plugin', 'scripts', 'worker-service.cjs');
}

/**
 * Get claude-mem data directory
 */
export function getClaudeMemDataDir(): string {
  return homePath('.claude-mem');
}

/**
 * Configure claude-mem settings with OpenRouter API key
 * Creates ~/.claude-mem/settings.json with required configuration
 * 
 * API key is read from CLAUDE_MEM_OPENROUTER_API_KEY environment variable
 * (set in .env.test and loaded via docker-compose)
 */
export function configureClaudeMemSettings(): void {
  const fs = require('fs-extra');
  const dataDir = getClaudeMemDataDir();
  const settingsPath = path.join(dataDir, 'settings.json');

  // Create data directory if needed
  fs.ensureDirSync(dataDir);

  // Get API key from environment variable
  const apiKey = process.env.CLAUDE_MEM_OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('[helpers] Warning: CLAUDE_MEM_OPENROUTER_API_KEY not set, summarization may fail');
  }

  // OpenRouter configuration for AI summarization
  const settings = {
    CLAUDE_MEM_PROVIDER: 'openrouter',
    CLAUDE_MEM_OPENROUTER_API_KEY: apiKey || '',
    CLAUDE_MEM_OPENROUTER_MODEL: 'xiaomi/mimo-v2-flash:free',
    CLAUDE_MEM_WORKER_PORT: '37777',
    CLAUDE_MEM_LOG_LEVEL: 'DEBUG',
    CLAUDE_MEM_CHROMA_MODE: 'external',
  };

  fs.writeJsonSync(settingsPath, settings, { spaces: 2 });
  console.log('[helpers] Configured claude-mem settings:', settingsPath);
}

/**
 * Wait for claude-mem worker to be ready
 */
export async function waitForWorker(timeoutMs = 15000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${WORKER_PORT}/api/health`);
      if (res.ok) return;
    } catch {
      // Worker not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Worker did not start within ${timeoutMs}ms`);
}

/**
 * Kill any process listening on a TCP port using /proc filesystem (Linux only).
 * Works without procps/psmisc/fuser packages.
 */
function killProcessOnPort(port: number): void {
  if (process.platform !== 'linux') return;

  const portHex = port.toString(16).toUpperCase().padStart(4, '0');

  // Find inode of socket in LISTEN state on our port
  let inode: string | null = null;
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const cols = line.trim().split(/\s+/);
        if (cols[1]?.endsWith(':' + portHex) && cols[3] === '0A') {
          inode = cols[9];
          break;
        }
      }
    } catch {}
    if (inode && inode !== '0') break;
  }
  if (!inode || inode === '0') return;

  // Find PID owning this socket inode by scanning /proc/*/fd/
  const socketTarget = `socket:[${inode}]`;
  try {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        for (const fd of readdirSync(`/proc/${entry}/fd`)) {
          try {
            if (readlinkSync(`/proc/${entry}/fd/${fd}`) === socketTarget) {
              const pid = parseInt(entry);
              process.kill(pid, 'SIGKILL');
              console.log(`[helpers] Killed process ${pid} on port ${port}`);
              return;
            }
          } catch {}
        }
      } catch {}
    }
  } catch {}
}

/**
 * Start claude-mem worker in background
 */
export async function startWorker(): Promise<void> {
  const claudeMemDir = getClaudeMemDir();

  // Configure settings before starting (OpenRouter API key)
  configureClaudeMemSettings();

  // Check if already running
  try {
    const res = await fetch(`http://127.0.0.1:${WORKER_PORT}/api/health`);
    if (res.ok) {
      console.log('[helpers] Worker already running');
      return;
    }
  } catch {
    // Not running
  }

  // Kill any stale process holding the port (e.g. daemon from installer)
  killProcessOnPort(WORKER_PORT);
  await new Promise(r => setTimeout(r, 500));

  // Pre-flight: verify claude-mem is installed
  const packageJsonPath = path.join(claudeMemDir, 'package.json');
  if (!await fs.pathExists(packageJsonPath)) {
    throw new Error(`[startWorker] package.json not found at ${packageJsonPath}. Claude-mem not installed.`);
  }

  console.log('[helpers] Starting claude-mem worker...');

  let workerStdout = '';
  let workerStderr = '';
  let workerExitedEarly = false;
  let workerExitCode: number | null = null;

  // Start worker-service.cjs with bun in foreground mode (no args).
  // - Must use bun (not node) because worker-service.cjs depends on bun:sqlite.
  // - The 'start' arg triggers daemon fork which fails in Docker — omit it.
  // - Without args, WorkerService starts HTTP server directly in-process.
  // - Port is configured via configureClaudeMemSettings() above (CLAUDE_MEM_WORKER_PORT).
  const workerScript = path.join(claudeMemDir, 'plugin', 'scripts', 'worker-service.cjs');
  const bunBin = path.join(process.env.HOME || process.env.USERPROFILE || '/home/testuser', '.bun', 'bin', 'bun');
  workerProcess = spawn(bunBin, [workerScript], {
    cwd: claudeMemDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PATH: getEnhancedPath(),
    },
  });

  // Capture diagnostics
  if (workerProcess.stderr) {
    workerProcess.stderr.on('data', (chunk: Buffer) => {
      workerStderr += chunk.toString();
    });
  }
  if (workerProcess.stdout) {
    workerProcess.stdout.on('data', (chunk: Buffer) => {
      workerStdout += chunk.toString();
    });
  }
  workerProcess.on('exit', (code) => {
    workerExitedEarly = true;
    workerExitCode = code;
  });
  workerProcess.on('error', (err) => {
    workerExitedEarly = true;
    workerStderr += `\nSpawn error: ${err.message}`;
  });

  // Wait for worker to become ready (foreground mode — process stays alive)
  const startTime = Date.now();
  while (Date.now() - startTime < 30000) {
    if (workerExitedEarly) {
      // Read claude-mem log files for additional diagnostics
      let logContent = '';
      try {
        const logsDir = path.join(getClaudeMemDataDir(), 'logs');
        if (await fs.pathExists(logsDir)) {
          const logFiles = (await fs.readdir(logsDir)).sort().slice(-2);
          for (const f of logFiles) {
            const content = await fs.readFile(path.join(logsDir, f), 'utf8');
            logContent += `\n--- ${f} ---\n${content.slice(-500)}`;
          }
        }
      } catch {}
      throw new Error(
        `[startWorker] Worker exited with code ${workerExitCode} before becoming ready.\n` +
        `stdout: ${workerStdout || '(empty)'}\n` +
        `stderr: ${workerStderr || '(empty)'}` +
        (logContent ? `\nlogs: ${logContent}` : '')
      );
    }
    try {
      const res = await fetch(`http://127.0.0.1:${WORKER_PORT}/api/health`);
      if (res.ok) {
        console.log('[helpers] Worker started');
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }

  // Timeout — include diagnostics
  let logContent = '';
  try {
    const logsDir = path.join(getClaudeMemDataDir(), 'logs');
    if (await fs.pathExists(logsDir)) {
      const logFiles = (await fs.readdir(logsDir)).sort().slice(-2);
      for (const f of logFiles) {
        const content = await fs.readFile(path.join(logsDir, f), 'utf8');
        logContent += `\n--- ${f} ---\n${content.slice(-500)}`;
      }
    }
  } catch {}
  const diag = [
    `stdout: ${workerStdout || '(empty)'}`,
    `stderr: ${workerStderr || '(empty)'}`,
    `exited early: ${workerExitedEarly}`,
    `exit code: ${workerExitCode}`,
    `PID: ${workerProcess?.pid ?? 'N/A'}`,
  ].join(', ');
  throw new Error(`Worker did not start within 30000ms. Diagnostics: ${diag}${logContent ? `\nlogs: ${logContent}` : ''}`);
}

/**
 * Stop claude-mem worker
 */
export async function stopWorker(): Promise<void> {
  console.log('[helpers] Stopping claude-mem worker...');

  // 1. Kill tracked process (started by startWorker in this test file)
  if (workerProcess) {
    try {
      workerProcess.kill('SIGTERM');
    } catch {
      // Ignore — process already dead
    }
    workerProcess = null;
  }

  // 2. Kill daemon started by installer (reads PID from worker.pid)
  const pidFile = path.join(getClaudeMemDataDir(), 'worker.pid');
  try {
    if (await fs.pathExists(pidFile)) {
      const content = await fs.readJson(pidFile);
      const pid = content?.pid;
      if (pid) {
        try {
          process.kill(pid, 'SIGTERM');
          console.log(`[helpers] Killed daemon worker PID ${pid}`);
        } catch {
          // Process already dead
        }
      }
      await fs.remove(pidFile);
    }
  } catch {
    // Ignore
  }

  // 3. Kill any process on the port via /proc (no procps needed)
  killProcessOnPort(WORKER_PORT);

  // Wait for port to actually be released (avoid race with next startWorker)
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${WORKER_PORT}/api/health`);
      await new Promise(r => setTimeout(r, 200));
    } catch {
      break; // Connection refused = port free
    }
  }
  console.log('[helpers] Worker stopped');
}

/**
 * Run a claude-mem hook command
 */
export function runHook(action: string): string {
  const workerPath = getWorkerServicePath();
  try {
    return execSync(`bun "${workerPath}" hook claude ${action}`, {
      encoding: 'utf-8',
      timeout: 30000,
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
      },
    });
  } catch (error: any) {
    return error.stdout || error.message || '';
  }
}

/**
 * Check if worker is running
 */
export async function isWorkerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${WORKER_PORT}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Claude-mem API helpers
// ============================================================================

const WORKER_BASE_URL = `http://127.0.0.1:${WORKER_PORT}`;

/**
 * Types for claude-mem API
 */
export interface Observation {
  id: number;
  session_id: number;
  tool_name: string;
  tool_input: string;
  tool_result: string;
  correlation_id?: string;
  created_at: string;
}

export interface Stats {
  observations: number;
  summaries: number;
  prompts: number;
  sessions: number;
  projects?: Record<string, { observations: number; summaries: number }>;
}

export interface SessionStatus {
  status: 'active' | 'not_found';
  sessionDbId?: number;
  project?: string;
  queueLength?: number;
  uptime?: number;
}

/**
 * Initialize a new session via API (new endpoint with contentSessionId)
 * Uses POST /api/sessions/init
 * Body: { contentSessionId, project, prompt }
 * Returns: { sessionDbId, promptNumber, skipped, reason? }
 */
export async function initSession(sessionId: string, project: string, prompt?: string): Promise<number> {
  const res = await fetch(`${WORKER_BASE_URL}/api/sessions/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentSessionId: sessionId,
      project,
      prompt: prompt || 'E2E test session initialization',
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to init session: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.sessionDbId;
}

/**
 * Add observation to session via API (new endpoint with contentSessionId)
 * Uses POST /api/sessions/observations
 * Body: { contentSessionId, tool_name, tool_input, tool_response, cwd }
 * Returns: { status: 'queued' | 'skipped', reason? }
 */
export async function addObservation(
  contentSessionId: string,
  toolName: string,
  toolInput: object | string,
  toolResponse: object | string,
  cwd?: string,
): Promise<{ status: string; reason?: string }> {
  const res = await fetch(`${WORKER_BASE_URL}/api/sessions/observations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentSessionId,
      tool_name: toolName,
      tool_input: typeof toolInput === 'string' ? JSON.parse(toolInput) : toolInput,
      tool_response: typeof toolResponse === 'string' ? JSON.parse(toolResponse) : toolResponse,
      cwd: cwd || '/home/testuser/test-project',
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to add observation: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Trigger session summary via API (new endpoint with contentSessionId)
 * Uses POST /api/sessions/summarize
 * Body: { contentSessionId, last_assistant_message }
 * Returns: { status: 'queued' | 'skipped', reason? }
 */
export async function summarizeSession(
  contentSessionId: string,
  lastAssistantMessage?: string,
): Promise<{ status: string; reason?: string }> {
  const res = await fetch(`${WORKER_BASE_URL}/api/sessions/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentSessionId,
      last_assistant_message: lastAssistantMessage || 'E2E test completed successfully.',
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to summarize session: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Get session status via API
 */
export async function getSessionStatus(sessionDbId: number): Promise<SessionStatus> {
  const res = await fetch(`${WORKER_BASE_URL}/sessions/${sessionDbId}/status`);
  if (!res.ok) {
    throw new Error(`Failed to get session status: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Get list of projects from claude-mem
 */
export async function getProjects(): Promise<string[]> {
  const res = await fetch(`${WORKER_BASE_URL}/api/projects`);
  if (!res.ok) {
    throw new Error(`Failed to get projects: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  // API may return array of strings or objects with name property
  if (Array.isArray(data)) {
    return data.map((p: string | { name: string }) => (typeof p === 'string' ? p : p.name));
  }
  return [];
}

/**
 * Get observations from claude-mem
 */
export async function getObservations(project?: string, limit = 100): Promise<Observation[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (project) {
    params.set('project', project);
  }
  const res = await fetch(`${WORKER_BASE_URL}/api/observations?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to get observations: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return Array.isArray(data) ? data : data.observations || [];
}

/**
 * Get database stats from claude-mem
 */
export async function getStats(): Promise<Stats> {
  const res = await fetch(`${WORKER_BASE_URL}/api/stats`);
  if (!res.ok) {
    throw new Error(`Failed to get stats: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Get health check response
 */
export async function getHealth(): Promise<{ status: string; uptime: number; port: number }> {
  const res = await fetch(`${WORKER_BASE_URL}/health`);
  if (!res.ok) {
    throw new Error(`Failed to get health: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Trigger pending queue processing
 * POST /api/pending-queue/process
 * Forces the SDK agent to process any queued observations/summaries
 */
export async function processPendingQueue(): Promise<{ status: string; processed?: number }> {
  const res = await fetch(`${WORKER_BASE_URL}/api/pending-queue/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to process pending queue: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Get prompts from /api/prompts
 * Prompts are saved immediately during session init (no SDK agent processing needed)
 */
export interface Prompt {
  id: number;
  content_session_id: string;
  project: string;
  prompt_number: number;
  prompt_text: string;
  created_at_epoch: number;
}

export interface PromptsResponse {
  items: Prompt[];
  offset: number;
  limit: number;
  hasMore?: boolean;
}

export async function getPrompts(project?: string, offset = 0, limit = 20): Promise<PromptsResponse> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });
  if (project) {
    params.set('project', project);
  }
  const res = await fetch(`${WORKER_BASE_URL}/api/prompts?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to get prompts: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ============================================================================
// Hook execution with parameters via STDIN
// ============================================================================

export interface HookParams {
  // Common fields
  conversationId?: string;
  workspaceRoot?: string;
  // session-init (beforeSubmitPrompt)
  prompt?: string;
  // observation (afterMCPExecution/afterShellExecution)
  toolName?: string;
  toolInput?: unknown;
  toolResult?: unknown;
  // Shell command (afterShellExecution)
  command?: string;
  output?: string;
  // file-edit (afterFileEdit)
  filePath?: string;
  edits?: unknown[];
  // summarize (stop) - transcript path
  transcriptPath?: string;
}

/**
 * Create a test transcript JSONL file for summarize hook testing
 * Returns the path to the created file
 */
export function createTestTranscript(sessionId: string): string {
  const fs = require('fs-extra');
  const dataDir = getClaudeMemDataDir();
  const transcriptDir = path.join(dataDir, 'transcripts');
  const transcriptPath = path.join(transcriptDir, `${sessionId}.jsonl`);

  // Create directory if needed
  fs.ensureDirSync(transcriptDir);

  // Create JSONL transcript with user and assistant messages
  const transcriptLines = [
    JSON.stringify({
      type: 'user',
      message: { content: 'Please help me with E2E testing' },
    }),
    JSON.stringify({
      type: 'assistant',
      message: {
        content: 'I will help you set up comprehensive E2E tests for the dev-pomogator installer. This includes testing claude-mem hooks, worker service, and API endpoints.',
      },
    }),
    JSON.stringify({
      type: 'user',
      message: { content: 'Great, please implement the tests' },
    }),
    JSON.stringify({
      type: 'assistant',
      message: {
        content: 'I have implemented the E2E tests successfully. All 59 tests are passing, covering installation, hooks configuration, worker runtime, and data persistence.',
      },
    }),
  ];

  fs.writeFileSync(transcriptPath, transcriptLines.join('\n'), 'utf-8');
  console.log('[helpers] Created test transcript:', transcriptPath);

  return transcriptPath;
}

/**
 * Build Cursor-format JSON for stdin
 * 
 * Cursor hooks receive JSON on stdin with fields:
 * - conversation_id: session identifier
 * - workspace_roots: array of project paths
 * - prompt: user prompt (for session-init)
 * - tool_name: MCP tool name (for observation)
 * - tool_input: tool input object (for observation)
 * - result_json: tool result (for observation)
 * - command/output: for shell commands
 * - file_path/edits: for file edits
 */
function buildCursorStdinJson(action: string, params: HookParams): string {
  const sessionId = params.conversationId || generateTestSessionId();
  const workspaceRoot = params.workspaceRoot || '/home/testuser/test-project';
  
  const base: Record<string, unknown> = {
    conversation_id: sessionId,
    workspace_roots: [workspaceRoot],
  };
  
  switch (action) {
    case 'session-init':
      return JSON.stringify({
        ...base,
        prompt: params.prompt || 'E2E test prompt',
      });
      
    case 'context':
      return JSON.stringify(base);
      
    case 'observation':
      // Check if it's a shell command
      if (params.command) {
        return JSON.stringify({
          ...base,
          command: params.command,
          output: params.output || '',
        });
      }
      // MCP tool execution
      return JSON.stringify({
        ...base,
        tool_name: params.toolName || 'TestTool',
        tool_input: params.toolInput || {},
        result_json: params.toolResult || { success: true },
      });
      
    case 'file-edit':
      return JSON.stringify({
        ...base,
        file_path: params.filePath || '/test/file.ts',
        edits: params.edits || [{ type: 'replace', content: 'test' }],
      });
      
    case 'summarize':
      // Summarize hook (stop event) - requires transcript_path
      // If not provided, create a test transcript file
      const transcriptPath = params.transcriptPath || createTestTranscript(sessionId);
      return JSON.stringify({
        ...base,
        transcript_path: transcriptPath,
      });
      
    default:
      return JSON.stringify(base);
  }
}

/**
 * Run a claude-mem hook command with parameters via stdin (Cursor format)
 * 
 * Pipes JSON to stdin as Cursor does:
 * echo '{"conversation_id":"...","prompt":"..."}' | bun worker-service.cjs hook claude session-init
 */
export function runHookWithParams(action: string, params: HookParams): string {
  const workerPath = getWorkerServicePath();
  const stdinJson = buildCursorStdinJson(action, params);
  
  try {
    // Use shell to pipe JSON to stdin
    const result = execSync(`echo '${stdinJson.replace(/'/g, "'\\''")}' | bun "${workerPath}" hook claude ${action}`, {
      encoding: 'utf-8',
      timeout: 30000,
      shell: '/bin/bash',
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
      },
    });
    return result;
  } catch (error: any) {
    // Return stdout if available, otherwise error message
    const output = error.stdout || '';
    const errMsg = error.stderr || error.message || '';
    console.log(`[runHookWithParams] Hook ${action} error: ${errMsg}`);
    return output;
  }
}

/**
 * Run a claude-mem hook command, THROWING on non-zero exit.
 * Use when hook success is a test requirement (not just "doesn't crash").
 * Unlike runHookWithParams, this does NOT swallow errors.
 */
export function runHookExpectSuccess(action: string, params: HookParams): string {
  const workerPath = getWorkerServicePath();
  const stdinJson = buildCursorStdinJson(action, params);

  // No try/catch: execSync throws on non-zero exit code
  const result = execSync(
    `echo '${stdinJson.replace(/'/g, "'\\''")}' | bun "${workerPath}" hook claude ${action}`,
    {
      encoding: 'utf-8',
      timeout: 30000,
      shell: '/bin/bash',
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
      },
    }
  );
  return result;
}

/**
 * Generate a unique session ID for testing
 */
export function generateTestSessionId(): string {
  return `e2e-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// ============================================================================
// Typed API helpers for persistence testing
// ============================================================================

/**
 * Full stats response from /api/stats (actual claude-mem format)
 */
export interface StatsResponse {
  worker: {
    version: string;
    uptime: number;
    activeSessions: number;
    sseClients: number;
    port: number;
  };
  database: {
    path: string;
    size: number;
    observations: number;
    sessions: number;
    summaries: number;
  };
}

/**
 * Projects response from /api/projects
 */
export interface ProjectsResponse {
  projects: string[];
}

/**
 * Paginated observations response from /api/observations
 */
export interface ObservationsResponse {
  items: Array<{
    id: number;
    tool_name: string;
    tool_input: string;
    tool_response: string;
    project: string;
    created_at_epoch: number;
  }>;
  offset: number;
  limit: number;
  hasMore?: boolean;
  total?: number;
}

/**
 * Get full stats with typed response
 */
export async function getStatsTyped(): Promise<StatsResponse> {
  const res = await fetch(`${WORKER_BASE_URL}/api/stats`);
  if (!res.ok) {
    throw new Error(`Failed to get stats: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Get list of projects as array
 */
export async function getProjectsList(): Promise<string[]> {
  const res = await fetch(`${WORKER_BASE_URL}/api/projects`);
  if (!res.ok) {
    throw new Error(`Failed to get projects: ${res.status} ${await res.text()}`);
  }
  const data: ProjectsResponse = await res.json();
  return data.projects || [];
}

/**
 * Get paginated observations, optionally filtered by project
 */
export async function getObservationsByProject(
  project?: string,
  offset = 0,
  limit = 20
): Promise<ObservationsResponse> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });
  if (project) {
    params.set('project', project);
  }
  const res = await fetch(`${WORKER_BASE_URL}/api/observations?${params}`);
  if (!res.ok) {
    throw new Error(`Failed to get observations: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ============================================================================
// Polling helpers for async data verification
// ============================================================================

/**
 * Observation item type (extracted from ObservationsResponse for reuse)
 */
export type ObservationItem = ObservationsResponse['items'][number];

/**
 * Poll /api/stats until the specified field increases beyond initialCount
 * 
 * @param initialCount - The count to compare against
 * @param field - Which database field to check ('observations' or 'sessions')
 * @param timeoutMs - Maximum time to wait (default 10s)
 * @param intervalMs - Polling interval (default 500ms)
 * @returns The new count when it increases
 * @throws Error if timeout is reached
 */
export async function waitForStatsIncrease(
  initialCount: number,
  field: 'observations' | 'sessions' = 'observations',
  timeoutMs = 10000,
  intervalMs = 500
): Promise<number> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const stats = await getStatsTyped();
    const currentCount = stats.database[field];

    if (currentCount > initialCount) {
      return currentCount;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Stats ${field} did not increase within ${timeoutMs}ms (stuck at ${initialCount})`);
}

/**
 * Poll /api/observations until a record with the specified tool_name appears
 * 
 * @param toolName - The tool_name to search for
 * @param project - Optional project filter
 * @param timeoutMs - Maximum time to wait (default 10s)
 * @param intervalMs - Polling interval (default 500ms)
 * @returns The found observation
 * @throws Error if timeout is reached
 */
export async function waitForObservation(
  toolName: string,
  project?: string,
  timeoutMs = 10000,
  intervalMs = 500
): Promise<ObservationItem> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const response = await getObservationsByProject(project, 0, 50);
    const found = response.items.find((obs) => obs.tool_name === toolName);

    if (found) {
      return found;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`Observation with tool_name="${toolName}" not found within ${timeoutMs}ms`);
}

// ============================================================================
// Auto-update config helpers (CORE002)
// ============================================================================

/**
 * Managed file entry (new format with hash tracking)
 */
export interface ManagedFileEntryTest {
  path: string;
  hash: string;
}

/** Managed file item: plain string (old format) or entry with hash (new format) */
export type ManagedFileItemTest = string | ManagedFileEntryTest;

/**
 * Managed files tracking structure (mirrors src/config/schema.ts ManagedFiles)
 */
export interface ManagedFilesTest {
  commands?: ManagedFileItemTest[];
  rules?: ManagedFileItemTest[];
  tools?: ManagedFileItemTest[];
  hooks?: Record<string, string[]>;
}

/**
 * Installed extension config structure
 */
export interface InstalledExtension {
  name: string;
  version: string;
  platform: 'claude';
  projectPaths: string[];
  managed?: Record<string, ManagedFilesTest>;
}

/**
 * Full dev-pomogator config structure
 */
export interface DevPomogatorConfig {
  autoUpdate: boolean;
  cooldownHours: number;
  lastCheck?: string;
  installedExtensions: InstalledExtension[];
}

/**
 * Get path to dev-pomogator config file
 */
export function getDevPomogatorConfigPath(): string {
  return homePath('.dev-pomogator', 'config.json');
}

/**
 * Generate ISO timestamp for N hours ago
 */
export function hoursAgo(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

/**
 * Load dev-pomogator config
 */
export async function getDevPomogatorConfig(): Promise<DevPomogatorConfig | null> {
  const configPath = getDevPomogatorConfigPath();
  try {
    if (await fs.pathExists(configPath)) {
      return await fs.readJson(configPath);
    }
  } catch {
    // Return null if config doesn't exist or is invalid
  }
  return null;
}

/**
 * Save dev-pomogator config
 */
export async function saveDevPomogatorConfig(config: DevPomogatorConfig): Promise<void> {
  const configPath = getDevPomogatorConfigPath();
  await fs.ensureDir(path.dirname(configPath));
  await fs.writeJson(configPath, config, { spaces: 2 });
}

/**
 * Setup config for auto-update testing
 * Creates a config with the specified parameters
 */
export async function setupConfigForUpdate(config: DevPomogatorConfig): Promise<void> {
  await saveDevPomogatorConfig(config);
}

/**
 * Set config.lastCheck to N hours ago
 * Preserves other config values
 */
export async function setConfigLastCheck(hours: number): Promise<void> {
  const config = await getDevPomogatorConfig() || {
    autoUpdate: true,
    cooldownHours: 24,
    installedExtensions: [],
  };
  config.lastCheck = hoursAgo(hours);
  await saveDevPomogatorConfig(config);
}

/**
 * Get config.lastCheck value
 */
export async function getConfigLastCheck(): Promise<string | null> {
  const config = await getDevPomogatorConfig();
  return config?.lastCheck || null;
}

/**
 * Run check-update.js script
 * Returns stdout output
 * 
 * @param args - Optional CLI arguments (e.g. '--claude' to update Claude platform)
 */
export async function runCheckUpdate(args: string = ''): Promise<string> {
  const scriptPath = homePath('.dev-pomogator', 'scripts', 'check-update.js');
  try {
    const result = execSync(`node "${scriptPath}" ${args}`.trim(), {
      encoding: 'utf-8',
      timeout: 60000, // 60s for network requests
      env: {
        ...process.env,
        HOME: getHome(),
        DEV_POMOGATOR_UPDATE_SOURCE_ROOT: getAppDir(),
      },
    });
    return result;
  } catch (error: any) {
    // check-update.js always outputs {"continue":true} even on success
    return error.stdout || '';
  }
}

/**
 * Get the path to the update log file
 */
export function getUpdateLogPath(): string {
  return homePath('.dev-pomogator', 'logs', 'update.log');
}

/**
 * Read the update log file
 */
export async function getUpdateLog(): Promise<string> {
  const logPath = getUpdateLogPath();
  if (await fs.pathExists(logPath)) {
    return fs.readFile(logPath, 'utf-8');
  }
  return '';
}

/**
 * Get the path to the install log file
 */
export function getInstallLogPath(): string {
  return homePath('.dev-pomogator', 'logs', 'install.log');
}

/**
 * Read the install log file
 */
export async function getInstallLog(): Promise<string> {
  const logPath = getInstallLogPath();
  if (await fs.pathExists(logPath)) {
    return fs.readFile(logPath, 'utf-8');
  }
  return '';
}

/**
 * Ensure the check-update.js script is installed (bundled version).
 * ALWAYS copies the bundled script from /app/dist to ~/.dev-pomogator/scripts/
 * to ensure we're testing the correct version with logging support.
 */
export async function ensureCheckUpdateScript(): Promise<void> {
  const destDir = homePath('.dev-pomogator', 'scripts');
  const destScript = path.join(destDir, 'check-update.js');
  
  // Copy bundled script from /app/dist (always overwrite to ensure correct version)
  const appDir = getAppDir();
  const bundledPath = path.join(appDir, 'dist', 'check-update.bundle.cjs');
  
  await fs.ensureDir(destDir);
  
  if (await fs.pathExists(bundledPath)) {
    await fs.copy(bundledPath, destScript, { overwrite: true });
    console.log('[helpers] Copied check-update.bundle.cjs to', destScript);
  } else {
    // Fallback: try unbundled version from scripts/
    const fallbackPath = path.join(appDir, 'scripts', 'check-update.js');
    if (await fs.pathExists(fallbackPath)) {
      await fs.copy(fallbackPath, destScript, { overwrite: true });
      console.log('[helpers] Copied check-update.js (unbundled) to', destScript);
    } else {
      console.warn('[helpers] No check-update script found to copy');
    }
  }
}

// ============================================================================
// Platform setup helpers (test fixture states)
// ============================================================================

const FIXTURES_BASE = path.join(__dirname, '..', 'fixtures');
const CONFIG_TEMPLATES_DIR = path.join(FIXTURES_BASE, 'configs');

/**
 * Snapshot of project state for before/after comparison
 */
export interface StateSnapshot {
  /** Map of relative file path → SHA-256 hash */
  files: Map<string, string>;
  /** Hook counts per event type */
  hookCount: Record<string, number>;
  /** Number of installed extensions in config */
  configExtensions: number;
}

/**
 * Load a config template JSON and replace placeholders.
 *
 * Supported placeholders: {{PROJECT_PATH}}, {{LAST_CHECK}}, {{HASH}},
 * {{PLATFORM}}, {{EXTENSION_NAME}}, and any custom key in `vars`.
 */
export async function loadConfigTemplate(
  name: string,
  vars: Record<string, string>,
): Promise<DevPomogatorConfig> {
  const templatePath = path.join(CONFIG_TEMPLATES_DIR, name);
  let raw = await fs.readFile(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    // Replace all occurrences
    while (raw.includes(placeholder)) {
      raw = raw.replace(placeholder, value);
    }
  }
  return JSON.parse(raw);
}

/**
 * Clean ~/.claude/ directory while preserving claude-mem clone cache.
 * Removes settings.json, commands/, rules/ etc but keeps plugins/.
 */
async function cleanClaudeDir(): Promise<void> {
  const claudeDir = homePath('.claude');
  if (!await fs.pathExists(claudeDir)) return;

  const entries = await fs.readdir(claudeDir);
  for (const entry of entries) {
    if (entry === 'plugins') continue; // preserve claude-mem clone
    await fs.remove(path.join(claudeDir, entry));
  }
}

/**
 * Set up a clean (pre-install) state for the given platform.
 *
 * - Removes HOME-level platform directories and .dev-pomogator config
 * - Removes project-level platform artifacts
 * - For Claude: cleans ~/.claude/ but preserves plugins/ (claude-mem cache)
 * - Initialises a git repo so findRepoRoot() works
 */
export async function setupCleanState(platform: 'claude' = 'claude'): Promise<void> {
  // Clean HOME-level state
  await fs.remove(homePath('.dev-pomogator'));
  await cleanClaudeDir();
  // Clean project-level Claude artifacts
  // Preserve .claude/rules/ and .claude/commands/ — these are committed source files
  // that installer reads FROM (not installed copies). Deleting them breaks installer.
  await fs.remove(appPath('.claude', 'settings.json'));
  await fs.remove(appPath('.claude', 'settings.json.bak'));
  // Personal-pomogator FR-2 writes here; must be cleaned between tests otherwise
  // self-guard tests (PERSO001_31) see pre-existing file and fail.
  await fs.remove(appPath('.claude', 'settings.local.json'));
  await fs.remove(appPath('.claude', 'settings.local.json.bak'));
  // Remove .dev-pomogator but skip .docker-status (Docker volume mount, EBUSY)
  const devPomDir = appPath('.dev-pomogator');
  if (await fs.pathExists(devPomDir)) {
    const entries = await fs.readdir(devPomDir);
    for (const entry of entries) {
      if (entry === '.docker-status') continue;
      await fs.remove(path.join(devPomDir, entry)).catch(() => {});
    }
  }

  // Initialise minimal git repo
  await initGitRepo();
}

/**
 * Set up an "installed" state by running the real installer.
 *
 * Returns a StateSnapshot that can be used for before/after comparison.
 */
export async function setupInstalledState(platform: 'claude'): Promise<StateSnapshot> {
  // Start from a clean state
  await setupCleanState(platform);

  // Run the installer
  const flag = '--claude';
  const { exitCode } = await runInstaller(`${flag} --all`);
  if (exitCode !== 0) {
    throw new Error(`Installer failed with exit code ${exitCode} for platform ${platform}`);
  }

  // Capture and return a state snapshot
  return captureSnapshot(platform);
}

/**
 * Set up a "needs-update" state for a specific extension.
 *
 * Uses the needs-update config template with version "0.0.1" so the updater
 * sees a newer version on GitHub and triggers an update.
 *
 * @param platform - Target platform
 * @param extension - Extension name (e.g. 'suggest-rules')
 * @param options.userModified - Array of relative paths to simulate user-modified files
 */
export async function setupNeedsUpdateState(
  platform: 'claude',
  extension: string,
  options?: { userModified?: string[] },
): Promise<void> {
  const config = await loadConfigTemplate('needs-update.json', {
    LAST_CHECK: hoursAgo(25),
    PLATFORM: platform,
    EXTENSION_NAME: extension,
    PROJECT_PATH: appPath(),
  });
  await saveDevPomogatorConfig(config);

  // Ensure check-update script is available
  await ensureCheckUpdateScript();

  // If userModified paths are given, create those files with custom content
  if (options?.userModified) {
    for (const relPath of options.userModified) {
      const absPath = path.join(appPath(), relPath);
      await fs.ensureDir(path.dirname(absPath));
      await fs.writeFile(absPath, `# User modified: ${relPath}\n`, 'utf-8');
    }
  }
}

/**
 * Capture a snapshot of the current project state for the given platform.
 */
export async function captureSnapshot(platform: 'claude'): Promise<StateSnapshot> {
  const crypto = await import('crypto');
  const files = new Map<string, string>();

  // Collect files from the platform-specific directories
  const dirs = [appPath('.claude'), appPath('.dev-pomogator')];

  for (const dir of dirs) {
    if (await fs.pathExists(dir)) {
      const entries = await collectFiles(dir);
      for (const filePath of entries) {
        const relPath = path.relative(appPath(), filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
        files.set(relPath.replace(/\\/g, '/'), hash);
      }
    }
  }

  // Count hooks
  const hookCount: Record<string, number> = {};
  const settingsPath = homePath('.claude', 'settings.json');
  if (await fs.pathExists(settingsPath)) {
    const settings = await fs.readJson(settingsPath);
    for (const [event, list] of Object.entries(settings.hooks || {})) {
      hookCount[event] = Array.isArray(list) ? list.length : 0;
    }
  }

  // Count config extensions
  const config = await getDevPomogatorConfig();
  const configExtensions = config?.installedExtensions?.length ?? 0;

  return { files, hookCount, configExtensions };
}

/**
 * Recursively collect all file paths under a directory.
 */
async function collectFiles(dir: string): Promise<string[]> {
  const result: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await collectFiles(fullPath));
    } else {
      result.push(fullPath);
    }
  }
  return result;
}

// ============================================================================
// Shell Script Helpers
// ============================================================================

export interface ShellScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  json?: any;
}

/**
 * Extract JSON object from script output.
 * Useful when the shell prepends warnings before the actual JSON payload.
 */
function parseJsonFromOutput(output: string): any | undefined {
  const objectStart = output.indexOf('{');
  const arrayStart = output.indexOf('[');
  let start = -1;

  if (objectStart >= 0 && arrayStart >= 0) {
    start = Math.min(objectStart, arrayStart);
  } else if (objectStart >= 0) {
    start = objectStart;
  } else if (arrayStart >= 0) {
    start = arrayStart;
  }

  if (start < 0) {
    return undefined;
  }

  try {
    return JSON.parse(output.slice(start).trim());
  } catch {
    return undefined;
  }
}

/**
 * Run a shell script and return the result.
 * 
 * @param scriptPath - Path to the .sh script (relative to APP_DIR or absolute)
 * @param args - Array of arguments to pass to the script
 * @param cwd - Working directory for the script (defaults to APP_DIR)
 * @returns ShellScriptResult with stdout, stderr, exitCode, and parsed JSON
 */
export function runShellScript(
  scriptPath: string,
  args: string[] = [],
  cwd: string = APP_DIR
): ShellScriptResult {
  // Resolve script path
  const resolvedScript = path.isAbsolute(scriptPath)
    ? scriptPath
    : path.join(APP_DIR, scriptPath);
  
  // Quote arguments that contain spaces or JSON payloads
  const quotedArgs = args.map(arg => {
    if (arg.includes(' ') || arg.startsWith('{') || arg.startsWith('[')) {
      return `'${arg.replace(/'/g, "'\\''")}'`;
    }
    return arg;
  });
  
  // Always add -Format json for structured output
  const hasFormatArg = args.includes('-Format');
  const argsStr = [...quotedArgs, ...(hasFormatArg ? [] : ['-Format', 'json'])].join(' ');
  // For .ts wrappers that delegate to specs-generator-core.mjs, call node directly
  // to skip npx tsx startup overhead (~500ms per invocation)
  const coreMjs = path.join(path.dirname(resolvedScript), 'specs-generator-core.mjs');
  const commandName = path.basename(resolvedScript, '.ts');
  let command: string;
  if (resolvedScript.endsWith('.ts') && fs.existsSync(coreMjs)) {
    command = `node "${coreMjs}" ${commandName} ${argsStr}`.trim();
  } else if (resolvedScript.endsWith('.ts')) {
    command = `npx tsx "${resolvedScript}" ${argsStr}`.trim();
  } else {
    command = `"${resolvedScript}" ${argsStr}`.trim();
  }
  
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      cwd,
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    return {
      stdout,
      stderr: '',
      exitCode: 0,
      json: parseJsonFromOutput(stdout),
    };
  } catch (error: any) {
    const stdout = error.stdout || '';
    const stderr = error.stderr || '';
    const exitCode = error.status ?? 1;
    
    return {
      stdout,
      stderr,
      exitCode,
      json: parseJsonFromOutput(stdout),
    };
  }
}

/**
 * Get path to specs-generator scripts
 */
export function getSpecsGeneratorPath(script: string): string {
  return path.join(
    APP_DIR,
    '.dev-pomogator',
    'tools',
    'specs-generator',
    script
  );
}

/**
 * Get path to specs-generator test fixtures
 */
export function getSpecsGeneratorFixturePath(fixture: string): string {
  return path.join(APP_DIR, 'tests', 'fixtures', 'specs-generator', fixture);
}

// ============================================================================
// CLI integration helpers
// ============================================================================

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Assert that a CLI binary is available on PATH.
 * Throws (fails the test) with a descriptive error if not found.
 */
export function assertCliAvailable(name: string): void {
  try {
    execSync(`which ${name}`, { encoding: 'utf-8', stdio: 'pipe' });
  } catch {
    throw new Error(
      `CLI binary "${name}" is not installed or not on PATH. ` +
      `Ensure Dockerfile.test installs it correctly.`
    );
  }
}

/**
 * Run `claude <args>` and return stdout/stderr/exitCode.
 * Does NOT throw on non-zero exit — caller decides what to assert.
 */
export function runClaude(args: string, timeoutMs = 30000): CliResult {
  try {
    const stdout = execSync(`claude ${args}`, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      cwd: APP_DIR,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.status ?? 1,
    };
  }
}

/**
 * Run `cursor-agent <args>` and return stdout/stderr/exitCode.
 * Note: The Cursor CLI binary is called `cursor-agent` (installed via cursor.com/install).
 * Does NOT throw on non-zero exit — caller decides what to assert.
 */
export function runCursorCli(args: string, timeoutMs = 30000): CliResult {
  try {
    const stdout = execSync(`cursor-agent ${args}`, {
      encoding: 'utf-8',
      timeout: timeoutMs,
      cwd: APP_DIR,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      exitCode: error.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Python Runner (shared across TUI / statusline tests)
// ---------------------------------------------------------------------------

export interface PythonRunner {
  command: string;
  prefixArgs: string[];
}

let cachedPythonRunner: PythonRunner | null = null;

export function getPythonRunner(): PythonRunner {
  if (cachedPythonRunner) return cachedPythonRunner;

  const candidates: PythonRunner[] = process.platform === 'win32'
    ? [
        { command: 'python', prefixArgs: [] },
        { command: 'py', prefixArgs: ['-3'] },
        { command: 'python3', prefixArgs: [] },
      ]
    : [
        { command: 'python3', prefixArgs: [] },
        { command: 'python', prefixArgs: [] },
      ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefixArgs, '--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    if (result.status === 0) {
      cachedPythonRunner = candidate;
      return candidate;
    }
  }

  throw new Error('Python 3 required for tests');
}

export interface TsxResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

/**
 * Cross-platform helper to run a TypeScript file via npx tsx.
 * Uses cross-spawn for transparent .cmd resolution on Windows.
 */
export function runTsx(
  scriptPath: string,
  options: {
    input?: Record<string, unknown>;
    args?: string[];
    env?: Record<string, string>;
    timeout?: number;
  } = {},
): TsxResult {
  const args = ['tsx', appPath(scriptPath), ...(options.args || [])];
  const result = crossSpawn.sync('npx', args, {
    input: options.input ? JSON.stringify(options.input) : undefined,
    encoding: 'utf-8',
    cwd: appPath(),
    env: { ...process.env, FORCE_COLOR: '0', ...(options.env || {}) },
    timeout: options.timeout ?? 15000,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

export function runPythonJson<T = Record<string, unknown>>(
  script: string,
  payload: Record<string, unknown>,
  timeoutMs = 30000,
): T {
  const runner = getPythonRunner();
  const result = spawnSync(runner.command, [...runner.prefixArgs, '-c', script], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    cwd: appPath(),
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    throw new Error(`Python script failed (exit ${result.status}): ${result.stderr}`);
  }
  const stdout = (result.stdout || '').trim();
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`runPythonJson: invalid JSON output. stdout: ${stdout.substring(0, 200)}`);
  }
}
