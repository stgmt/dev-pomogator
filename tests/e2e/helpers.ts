import { execSync, spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs-extra';

const APP_DIR = process.env.APP_DIR || '/home/testuser/app';
const WORKER_PORT = 37777;

/**
 * Get enhanced PATH with bun location
 * Bun installs to ~/.bun/bin which may not be in child process PATH
 */
function getEnhancedPath(): string {
  const home = process.env.HOME || '/home/testuser';
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
export async function runInstaller(args: string = '--cursor --all'): Promise<InstallerResult> {
  try {
    const logs = execSync(`node dist/index.js ${args}`, {
      encoding: 'utf-8',
      cwd: APP_DIR,
      env: {
        ...process.env,
        FORCE_COLOR: '0', // Disable chalk colors for easier parsing
      },
    });
    return { logs, exitCode: 0 };
  } catch (error: any) {
    return {
      logs: error.stdout || error.message,
      exitCode: error.status || 1,
    };
  }
}

/**
 * Get the HOME directory
 */
export function getHome(): string {
  return process.env.HOME || '/home/testuser';
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
      const res = await fetch(`http://127.0.0.1:${WORKER_PORT}/api/readiness`);
      if (res.ok) return;
    } catch {
      // Worker not ready yet
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Worker did not start within ${timeoutMs}ms`);
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
    const res = await fetch(`http://127.0.0.1:${WORKER_PORT}/api/readiness`);
    if (res.ok) {
      console.log('[helpers] Worker already running');
      return;
    }
  } catch {
    // Not running, start it
  }
  
  console.log('[helpers] Starting claude-mem worker...');
  workerProcess = spawn('bun', ['run', 'worker:start'], {
    cwd: claudeMemDir,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      PATH: getEnhancedPath(),
    },
  });
  workerProcess.unref();
  
  await waitForWorker();
  console.log('[helpers] Worker started');
}

/**
 * Stop claude-mem worker
 */
export async function stopWorker(): Promise<void> {
  console.log('[helpers] Stopping claude-mem worker...');
  try {
    execSync('pkill -f worker-service.cjs || true', { stdio: 'ignore' });
  } catch {
    // Ignore errors
  }
  if (workerProcess) {
    try {
      workerProcess.kill('SIGTERM');
    } catch {
      // Ignore
    }
    workerProcess = null;
  }
  console.log('[helpers] Worker stopped');
}

/**
 * Run a claude-mem hook command
 */
export function runHook(action: string): string {
  const workerPath = getWorkerServicePath();
  try {
    return execSync(`bun "${workerPath}" hook cursor ${action}`, {
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
    const res = await fetch(`http://127.0.0.1:${WORKER_PORT}/api/readiness`);
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
// Hook execution with parameters via STDIN (Cursor format)
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
 * echo '{"conversation_id":"...","prompt":"..."}' | bun worker-service.cjs hook cursor session-init
 */
export function runHookWithParams(action: string, params: HookParams): string {
  const workerPath = getWorkerServicePath();
  const stdinJson = buildCursorStdinJson(action, params);
  
  try {
    // Use shell to pipe JSON to stdin
    const result = execSync(`echo '${stdinJson.replace(/'/g, "'\\''")}' | bun "${workerPath}" hook cursor ${action}`, {
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
 * Installed extension config structure
 */
export interface InstalledExtension {
  name: string;
  version: string;
  platform: 'cursor' | 'claude';
  projectPaths: string[];
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
 */
export async function runCheckUpdate(): Promise<string> {
  const scriptPath = homePath('.dev-pomogator', 'scripts', 'check-update.js');
  try {
    const result = execSync(`node "${scriptPath}"`, {
      encoding: 'utf-8',
      timeout: 60000, // 60s for network requests
      env: {
        ...process.env,
        HOME: getHome(),
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
