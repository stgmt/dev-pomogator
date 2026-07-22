import fs from 'node:fs';
import path from 'node:path';

export const CONTEXT_MODE_PLUGIN_ID = 'context-mode@context-mode';
export const CONTEXT_MODE_SERVER_NAME = 'context-mode';
export const INSTALL_INSTRUCTIONS = [
  '/plugin marketplace add mksglu/context-mode',
  '/plugin install context-mode@context-mode',
  '/reload-plugins',
];

export type RegistryState = 'registered' | 'missing' | 'poisoned' | 'malformed';

export interface RegistryInspection {
  state: RegistryState;
  path: string;
  evidence: string[];
  error?: string;
}

export interface McpOnlyInspection {
  active: boolean;
  path: string;
  evidence: string[];
  error?: string;
}

export type JsonObject = Record<string, unknown>;

interface JsonRead {
  state: 'ok' | 'missing' | 'malformed';
  value?: JsonObject;
  error?: string;
}

export function claudePluginsRegistryPath(homeRoot: string): string {
  return path.join(homeRoot, '.claude', 'plugins', 'installed_plugins.json');
}

export function claudeGlobalSettingsPath(homeRoot: string): string {
  return path.join(homeRoot, '.claude.json');
}

export function contextModeRetryLockPath(homeRoot: string): string {
  return path.join(homeRoot, '.dev-pomogator', '.context-mode-bootstrap.lock');
}

export function readJsonObject(filePath: string): JsonRead {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { state: 'malformed', error: 'JSON root must be an object' };
    }
    return { state: 'ok', value: parsed as JsonObject };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { state: 'missing' };
    return { state: 'malformed', error: err instanceof Error ? err.message : String(err) };
  }
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null;
}

export function inspectPluginRegistry(homeRoot: string): RegistryInspection {
  const registryPath = claudePluginsRegistryPath(homeRoot);
  const json = readJsonObject(registryPath);
  if (json.state === 'missing') {
    return { state: 'missing', path: registryPath, evidence: ['installed_plugins.json missing'] };
  }
  if (json.state === 'malformed' || !json.value) {
    return {
      state: 'malformed',
      path: registryPath,
      evidence: ['installed_plugins.json malformed'],
      error: json.error,
    };
  }

  const enabledPlugins = asObject(json.value.enabledPlugins);
  const plugins = asObject(json.value.plugins);
  const enabled = enabledPlugins?.[CONTEXT_MODE_PLUGIN_ID] === true;
  const pluginKeys = Object.keys(plugins ?? {});
  const hasPluginEvidence =
    Object.prototype.hasOwnProperty.call(enabledPlugins ?? {}, CONTEXT_MODE_PLUGIN_ID) ||
    pluginKeys.some((key) => key === CONTEXT_MODE_PLUGIN_ID || key.startsWith('context-mode@'));

  if (enabled) {
    return {
      state: 'registered',
      path: registryPath,
      evidence: [`enabledPlugins["${CONTEXT_MODE_PLUGIN_ID}"] true`],
    };
  }
  if (hasPluginEvidence) {
    return {
      state: 'poisoned',
      path: registryPath,
      evidence: [`context-mode plugin evidence exists but ${CONTEXT_MODE_PLUGIN_ID} is not enabled`],
    };
  }
  return { state: 'missing', path: registryPath, evidence: ['context-mode plugin evidence missing'] };
}

export function inspectMcpOnlyConfig(homeRoot: string): McpOnlyInspection {
  const settingsPath = claudeGlobalSettingsPath(homeRoot);
  const json = readJsonObject(settingsPath);
  if (json.state === 'missing') return { active: false, path: settingsPath, evidence: ['global settings missing'] };
  if (json.state === 'malformed' || !json.value) {
    return {
      active: false,
      path: settingsPath,
      evidence: ['global settings malformed'],
      error: json.error,
    };
  }
  const mcpServers = asObject(json.value.mcpServers);
  const active = asObject(mcpServers?.[CONTEXT_MODE_SERVER_NAME]) !== null;
  return {
    active,
    path: settingsPath,
    evidence: active ? [`mcpServers.${CONTEXT_MODE_SERVER_NAME} present`] : [`mcpServers.${CONTEXT_MODE_SERVER_NAME} missing`],
  };
}

export function isRetryLockFresh(lockPath: string, nowMs = Date.now(), windowMs = 30 * 60 * 1000): boolean {
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    const parsed = JSON.parse(raw) as { stampedAtMs?: unknown };
    if (typeof parsed.stampedAtMs === 'number') {
      return nowMs - parsed.stampedAtMs < windowMs;
    }
  } catch {
    // Fall back to mtime so a partially written lock is still a backoff signal.
  }
  try {
    return nowMs - fs.statSync(lockPath).mtimeMs < windowMs;
  } catch {
    return false;
  }
}

export function stampRetryLock(homeRoot: string, nowMs = Date.now()): string {
  const lockPath = contextModeRetryLockPath(homeRoot);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({ stampedAt: new Date(nowMs).toISOString(), stampedAtMs: nowMs }, null, 2) + '\n');
  return lockPath;
}

export function writeJsonAtomic(filePath: string, value: JsonObject): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
    fs.renameSync(tmp, filePath);
  } finally {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // best effort
    }
  }
}

export function createTimestampedBackup(filePath: string, now = new Date()): string | null {
  if (!fs.existsSync(filePath)) return null;
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.bak.${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}
