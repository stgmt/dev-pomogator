import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sweepStaleContextModeWorkers } from './stale-workers.ts';
import {
  CONTEXT_MODE_SERVER_NAME,
  CONTEXT_MODE_PLUGIN_ID,
  INSTALL_INSTRUCTIONS,
  JsonObject,
  claudeGlobalSettingsPath,
  contextModeRetryLockPath,
  createTimestampedBackup,
  inspectMcpOnlyConfig,
  inspectPluginRegistry,
  isRetryLockFresh,
  readJsonObject,
  stampRetryLock,
  writeJsonAtomic,
} from './state.ts';

const DEFAULT_BACKOFF_WINDOW_MS = 6 * 60 * 60 * 1000;
const CONTEXT_MODE_MARKETPLACE_SOURCE = 'mksglu/context-mode';
const CONTEXT_MODE_INSTALL_ENV: Record<string, string> = {
  CI: '1',
  NO_COLOR: '1',
};

export interface InstallInvocation {
  cmd: string;
  args: string[];
  env: Record<string, string>;
}

export type SetupStatus =
  | 'PLUGIN_REGISTERED'
  | 'MCP_ONLY_CONFIGURED'
  | 'INSTALL_MISSING'
  | 'SKIP_OPTOUT'
  | 'SKIP_BACKOFF'
  | 'ERROR_FAIL_OPEN';

export interface SetupDecision {
  status: SetupStatus;
  home: string;
  evidence: string[];
  instructions: string[];
  lockPath: string;
  exitCode: 0;
  launchedInteractiveCommand: false;
  launchedInstallerCommand: boolean;
}

export interface ContextModeHookOutput {
  continue: true;
  suppressOutput?: boolean;
  additionalContext?: string;
}

export interface McpOnlyResult {
  settingsPath: string;
  backupPath: string | null;
  settings: JsonObject;
}

export function buildContextModeMcpServer(pluginRoot = '.'): JsonObject {
  return {
    command: 'node',
    args: ['./start.mjs'],
    cwd: pluginRoot,
    env: {
      CONTEXT_MODE_PLATFORM: 'codex',
    },
    default_tools_approval_mode: 'approve',
  };
}

function resolveHomeRoot(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string {
  if (env.CLAUDE_HOME) return env.CLAUDE_HOME;
  if (platform === 'win32' && env.USERPROFILE) return env.USERPROFILE;
  return env.HOME ?? env.USERPROFILE ?? os.homedir() ?? process.cwd();
}

function decision(status: SetupStatus, home: string, evidence: string[], instructions: string[] = []): SetupDecision {
  return {
    status,
    home,
    evidence,
    instructions,
    lockPath: contextModeRetryLockPath(home),
    exitCode: 0,
    launchedInteractiveCommand: false,
    launchedInstallerCommand: false,
  };
}

export function buildContextModeInstallInvocation(platform: NodeJS.Platform = process.platform): InstallInvocation {
  if (platform === 'win32') {
    return {
      cmd: 'cmd',
      args: [
        '/c',
        'claude',
        'plugin',
        'marketplace',
        'add',
        CONTEXT_MODE_MARKETPLACE_SOURCE,
        '&&',
        'claude',
        'plugin',
        'install',
        CONTEXT_MODE_PLUGIN_ID,
        '-s',
        'user',
      ],
      env: { ...CONTEXT_MODE_INSTALL_ENV },
    };
  }

  return {
    cmd: 'sh',
    args: [
      '-lc',
      `claude plugin marketplace add ${CONTEXT_MODE_MARKETPLACE_SOURCE} && claude plugin install ${CONTEXT_MODE_PLUGIN_ID} -s user`,
    ],
    env: { ...CONTEXT_MODE_INSTALL_ENV },
  };
}

export function fireContextModeInstaller(env: NodeJS.ProcessEnv = process.env): boolean {
  const inv = buildContextModeInstallInvocation();
  const launcher = env.DEV_POMOGATOR_CONTEXT_MODE_INSTALL_LAUNCHER;
  const childEnv = { ...process.env, ...env, ...inv.env };

  try {
    if (launcher) {
      const result = spawnSync(process.execPath, [launcher, inv.cmd, ...inv.args], { env: childEnv, stdio: 'ignore' });
      return result.status === 0;
    }

    const workerDir = fs.mkdtempSync(path.join(os.tmpdir(), '.ctx-mode-'));
    const workerScript = path.join(workerDir, 'script');
    fs.writeFileSync(workerScript, 'dev-pomogator context-mode owned worker\n', { mode: 0o600 });
    const worker = spawn(process.execPath, [
      '-e', `require(${JSON.stringify(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '_shared', 'bootstrap.cjs'))})`, '--',
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker.ts'),
      '--worker-script', workerScript,
      '--command', inv.cmd,
      '--args', JSON.stringify(inv.args),
    ], { detached: true, env: childEnv, stdio: 'ignore', windowsHide: true });
    worker.unref();
    return true;
  } catch {
    return false;
  }
}

export function getContextModeSetupDecision(options: {
  homeRoot?: string;
  env?: NodeJS.ProcessEnv;
  nowMs?: number;
  backoffWindowMs?: number;
}): SetupDecision {
  const env = options.env ?? process.env;
  const home = options.homeRoot ?? resolveHomeRoot(env);
  const lockPath = contextModeRetryLockPath(home);

  if (env.DEV_POMOGATOR_CONTEXT_MODE === 'off') {
    return decision('SKIP_OPTOUT', home, ['DEV_POMOGATOR_CONTEXT_MODE=off']);
  }
  if (isRetryLockFresh(lockPath, options.nowMs, options.backoffWindowMs)) {
    return decision('SKIP_BACKOFF', home, [`fresh retry lock: ${lockPath}`]);
  }

  const registry = inspectPluginRegistry(home);
  if (registry.state === 'registered') {
    return decision('PLUGIN_REGISTERED', home, registry.evidence);
  }
  if (registry.state === 'malformed') {
    return decision('ERROR_FAIL_OPEN', home, registry.evidence);
  }

  const mcpOnly = inspectMcpOnlyConfig(home);
  if (mcpOnly.active) {
    return decision('MCP_ONLY_CONFIGURED', home, mcpOnly.evidence);
  }

  return decision('INSTALL_MISSING', home, registry.evidence, INSTALL_INSTRUCTIONS);
}

export function runContextModeSetupHook(options: {
  homeRoot?: string;
  env?: NodeJS.ProcessEnv;
  nowMs?: number;
  backoffWindowMs?: number;
}): { exitCode: 0; decision: SetupDecision } {
  try {
    return { exitCode: 0, decision: getContextModeSetupDecision(options) };
  } catch (err) {
    const home = options.homeRoot ?? resolveHomeRoot(options.env ?? process.env);
    return {
      exitCode: 0,
      decision: decision('ERROR_FAIL_OPEN', home, [err instanceof Error ? err.message : String(err)]),
    };
  }
}

export function renderSetupHookOutput(decision: SetupDecision): ContextModeHookOutput {
  if (decision.status === 'INSTALL_MISSING') {
    const instructions = decision.instructions.length > 0 ? decision.instructions : INSTALL_INSTRUCTIONS;
    return {
      continue: true,
      additionalContext: [
        'context-mode is not installed for this Claude/Codex home.',
        ...(decision.launchedInstallerCommand ? ['dev-pomogator started the context-mode installer in the background.'] : []),
        'Install it with:',
        ...instructions.map((line) => `  ${line}`),
        'Opt out: DEV_POMOGATOR_CONTEXT_MODE=off.',
      ].join('\n'),
    };
  }
  return { continue: true, suppressOutput: true };
}

export function runContextModeSessionStart(options: {
  homeRoot?: string;
  env?: NodeJS.ProcessEnv;
  nowMs?: number;
  backoffWindowMs?: number;
  pluginRoot?: string;
}): { decision: SetupDecision; output: ContextModeHookOutput; mcpOnlyResult?: McpOnlyResult } {
  const env = options.env ?? process.env;
  // Reap only roots that carry both our launcher marker and a stale, private temp script.
  // The bounded sweep is intentionally diagnostic/fail-open and never broad-kills runtimes.
  sweepStaleContextModeWorkers({ homeRoot: options.homeRoot });
  const decisionResult = runContextModeSetupHook({
    homeRoot: options.homeRoot,
    env,
    nowMs: options.nowMs,
    backoffWindowMs: options.backoffWindowMs ?? DEFAULT_BACKOFF_WINDOW_MS,
  });
  let decisionValue = decisionResult.decision;
  let mcpOnlyResult: McpOnlyResult | undefined;

  if (
    decisionValue.status === 'INSTALL_MISSING' &&
    (env.DEV_POMOGATOR_CONTEXT_MODE_MCP_ONLY === '1' || env.DEV_POMOGATOR_CONTEXT_MODE_MCP_ONLY === 'true')
  ) {
    try {
      mcpOnlyResult = applyMcpOnlyContextModeConfig({
        homeRoot: decisionValue.home,
        pluginRoot: options.pluginRoot,
      });
      decisionValue = {
        ...decisionValue,
        status: 'MCP_ONLY_CONFIGURED',
        evidence: [...decisionValue.evidence, `wrote MCP-only config: ${mcpOnlyResult.settingsPath}`],
        instructions: [],
      };
    } catch (err) {
      decisionValue = {
        ...decisionValue,
        status: 'ERROR_FAIL_OPEN',
        evidence: [...decisionValue.evidence, err instanceof Error ? err.message : String(err)],
        instructions: [],
      };
    }
  } else if (decisionValue.status === 'INSTALL_MISSING') {
    stampRetryLock(decisionValue.home, options.nowMs ?? Date.now());
    const launchedInstallerCommand = fireContextModeInstaller(env);
    decisionValue = {
      ...decisionValue,
      launchedInstallerCommand,
      evidence: [
        ...decisionValue.evidence,
        launchedInstallerCommand
          ? 'fired detached context-mode installer'
          : 'failed to fire detached context-mode installer',
      ],
    };
  }

  return {
    decision: decisionValue,
    output: renderSetupHookOutput(decisionValue),
    mcpOnlyResult,
  };
}

export function applyMcpOnlyContextModeConfig(options: {
  homeRoot: string;
  pluginRoot?: string;
  now?: Date;
  server?: JsonObject;
}): McpOnlyResult {
  const settingsPath = claudeGlobalSettingsPath(options.homeRoot);
  const existing = readJsonObject(settingsPath);
  const base = existing.state === 'ok' && existing.value ? existing.value : {};
  const currentServers =
    base.mcpServers && typeof base.mcpServers === 'object' && !Array.isArray(base.mcpServers)
      ? (base.mcpServers as JsonObject)
      : {};
  const settings: JsonObject = {
    ...base,
    mcpServers: {
      ...currentServers,
      [CONTEXT_MODE_SERVER_NAME]: options.server ?? buildContextModeMcpServer(options.pluginRoot ? path.resolve(options.pluginRoot) : '.'),
    },
  };
  const backupPath = createTimestampedBackup(settingsPath, options.now ?? new Date());
  writeJsonAtomic(settingsPath, settings);
  return { settingsPath, backupPath, settings };
}

async function drainStdin(): Promise<void> {
  try {
    for await (const _chunk of process.stdin) {
      // Consume hook protocol stdin so the parent process never blocks on the pipe.
    }
  } catch {
    // fail-open
  }
}

function writeOutput(output: ContextModeHookOutput): void {
  try {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // fail-open
  }
}

async function main(): Promise<void> {
  await drainStdin();
  const result = runContextModeSessionStart({
    env: process.env,
    pluginRoot: process.env.CLAUDE_PLUGIN_ROOT ?? process.cwd(),
  });
  writeOutput(result.output);
}

// Basename-сверка обязательна: модуль инлайнится в doctor.bundle.mjs, где
// import.meta.url схлопывается в URL самого бандла. Без неё guard срабатывает при
// ЛЮБОМ запуске бандла, а `process.exit(0)` ниже убивает чужую асинхронную работу
// (доктор переставал разворачивать проектный CARL и молча отдавал suppressOutput).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href &&
  !import.meta.url.endsWith('.bundle.mjs')
) {
  main()
    .catch(() => writeOutput({ continue: true, suppressOutput: true }))
    .finally(() => process.exit(0));
}
