import path from 'node:path';
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
  writeJsonAtomic,
} from './state.ts';

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

function resolveHomeRoot(env: NodeJS.ProcessEnv): string {
  return env.CLAUDE_HOME ?? env.HOME ?? env.USERPROFILE ?? process.cwd();
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
