import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  CONTEXT_MODE_SERVER_NAME,
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
  };
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch(() => writeOutput({ continue: true, suppressOutput: true }))
    .finally(() => process.exit(0));
}
