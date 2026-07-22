import fs from 'node:fs';
import path from 'node:path';
import { JsonObject, inspectMcpOnlyConfig, inspectPluginRegistry, readJsonObject } from '../context-mode-setup/state.ts';
import { HandshakeState, classifyHandshake } from './handshake.ts';

export type ContextModeDoctorStatus =
  | 'OK'
  | 'INSTALL_MISSING'
  | 'CONFIG_POISONED'
  | 'MCP_ONLY_CONFIGURED'
  | 'MCP_DEAD_IN_SESSION'
  | 'HANDSHAKE_FAILED'
  | 'HOOK_UNSAFE'
  | 'ERROR_FAIL_OPEN';

export interface ContextModeDoctorReport {
  status: ContextModeDoctorStatus;
  registration: 'present' | 'missing' | 'poisoned' | 'malformed';
  manifestCommand: string | null;
  process: 'alive' | 'dead' | 'unknown';
  handshake: HandshakeState;
  hookSafety: 'safe' | 'unsafe' | 'not-installed' | 'unknown';
  remediation: string[];
  evidence: string[];
}

function readManifestCommand(manifestPath: string | undefined, pluginRoot: string | undefined): string | null {
  const candidates = [
    manifestPath,
    pluginRoot ? path.join(pluginRoot, '.codex-plugin', 'mcp.json') : undefined,
    pluginRoot ? path.join(pluginRoot, '.claude-plugin', 'mcp.json') : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const json = readJsonObject(candidate);
    if (json.state !== 'ok' || !json.value) continue;
    const servers = json.value.mcpServers as JsonObject | undefined;
    const server = servers?.['context-mode'] as JsonObject | undefined;
    if (server && typeof server.command === 'string') {
      const args = Array.isArray(server.args) ? server.args.filter((arg): arg is string => typeof arg === 'string') : [];
      return [server.command, ...args].join(' ');
    }
  }
  return null;
}

function readProcessState(snapshotPath: string | undefined): 'alive' | 'dead' | 'unknown' {
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return 'unknown';
  const json = readJsonObject(snapshotPath);
  if (json.state !== 'ok' || !json.value) return 'unknown';
  const servers = json.value.mcpServers as JsonObject | undefined;
  const contextMode = servers?.['context-mode'] as JsonObject | undefined;
  if (contextMode?.alive === true) return 'alive';
  if (contextMode?.alive === false) return 'dead';
  if (json.value.alive === true) return 'alive';
  if (json.value.alive === false) return 'dead';
  return 'unknown';
}

export function renderRecoveryGuidance(status: ContextModeDoctorStatus): string[] {
  if (status === 'MCP_DEAD_IN_SESSION') {
    return [
      'run the idempotent context-mode heal step',
      'reconnect context-mode through /mcp',
      'verify ctx tools are available with a handshake/tool listing',
      'restart the full Claude Code session only as the last resort',
    ];
  }
  if (status === 'CONFIG_POISONED') {
    return ['repair installed_plugins.json or reinstall context-mode', 'verify enabledPlugins["context-mode@context-mode"] is true'];
  }
  if (status === 'INSTALL_MISSING') {
    return ['/plugin marketplace add mksglu/context-mode', '/plugin install context-mode@context-mode', '/reload-plugins'];
  }
  return ['no context-mode remediation required'];
}

export function runContextModeDoctor(options: {
  homeRoot: string;
  pluginRoot?: string;
  manifestPath?: string;
  processSnapshotPath?: string;
  handshakeResult?: { ok?: boolean; skipped?: boolean } | null;
  hookSafety?: 'safe' | 'unsafe' | 'not-installed' | 'unknown';
}): ContextModeDoctorReport {
  try {
    const registry = inspectPluginRegistry(options.homeRoot);
    const mcpOnly = inspectMcpOnlyConfig(options.homeRoot);
    const registration =
      registry.state === 'registered' ? 'present' : registry.state === 'poisoned' ? 'poisoned' : registry.state === 'malformed' ? 'malformed' : 'missing';
    const processState = readProcessState(options.processSnapshotPath);
    const handshake = classifyHandshake(options.handshakeResult);
    const hookSafety = options.hookSafety ?? 'unknown';

    let status: ContextModeDoctorStatus;
    if (registration === 'malformed' || registration === 'poisoned') status = 'CONFIG_POISONED';
    else if (registration === 'missing' && mcpOnly.active) status = 'MCP_ONLY_CONFIGURED';
    else if (registration === 'missing') status = 'INSTALL_MISSING';
    else if (processState === 'dead') status = 'MCP_DEAD_IN_SESSION';
    else if (handshake === 'failed') status = 'HANDSHAKE_FAILED';
    else if (hookSafety === 'unsafe') status = 'HOOK_UNSAFE';
    else status = 'OK';

    return {
      status,
      registration,
      manifestCommand: readManifestCommand(options.manifestPath, options.pluginRoot),
      process: processState,
      handshake,
      hookSafety,
      remediation: renderRecoveryGuidance(status),
      evidence: [...registry.evidence, ...mcpOnly.evidence],
    };
  } catch (err) {
    return {
      status: 'ERROR_FAIL_OPEN',
      registration: 'missing',
      manifestCommand: null,
      process: 'unknown',
      handshake: 'skipped',
      hookSafety: 'unknown',
      remediation: ['context-mode doctor failed open; inspect configuration manually'],
      evidence: [err instanceof Error ? err.message : String(err)],
    };
  }
}
