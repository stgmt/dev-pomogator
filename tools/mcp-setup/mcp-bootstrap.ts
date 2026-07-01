// SessionStart hook: install Context7 + Octocode MCP servers GLOBALLY (user scope) and nag with a
// warning until each is properly auth-configured — then go silent. The "install" part is the v2
// mechanism (a canonical plugin install runs no scripts; the SessionStart hook IS the installer).
//
// Design (per the approved plan + owner decisions):
//   - Install both servers into ~/.claude.json top-level `mcpServers` (user scope = all projects,
//     F1). Context7 is wired KEYLESS up front (owner: "включить сразу без ключа") — the anonymous
//     tier works; the warning then drives the user to add a key. NEVER written to project .mcp.json
//     (personal-pomogator FR-10 — don't mix our servers with user secrets in a git-tracked file).
//   - Warn (every session) while Context7 lacks an API key OR Octocode lacks GitHub auth — with
//     instructions on how to configure. The disappear is "не вслепую, а с проверками": a real read
//     of the live config + a real `gh auth status` (see mcp-auth-detect.ts).
//
// Contract (must never disrupt a session):
//   - FAST: a JSON read + at most one local write + at most one `gh auth status` spawn.
//   - FAIL-OPEN: any error → {continue:true, suppressOutput:true}. Never throw, never block.
//   - IDEMPOTENT: a server already present is never re-written or clobbered.
//   - OPT-OUT: DEV_POMOGATOR_MCP_SETUP=off → install nothing, warn nothing.
//   - DEPS-ABSENT SAFE: node builtins + child_process only (ships in plugin, runs with no node_modules).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { log as logShared } from '../_shared/hook-utils.ts';
import { detectMcpAuth, type McpEntry } from './mcp-auth-detect.ts';

const LOG_PREFIX = 'mcp-bootstrap';
const VERBOSE = process.env.DEV_POMOGATOR_HOOK_VERBOSE === '1';

/** Canonical server definitions (npx package + base args). Kept in code so the hook needs no file. */
export const MCP_SERVERS: Record<string, { package: string; baseArgs: string[] }> = {
  context7: { package: '@upstash/context7-mcp@latest', baseArgs: ['-y', '@upstash/context7-mcp@latest'] },
  octocode: { package: 'octocode-mcp@latest', baseArgs: ['-y', 'octocode-mcp@latest'] },
};

function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', msg: string): void {
  if (level !== 'ERROR' && !VERBOSE) return;
  try {
    logShared(level, LOG_PREFIX, msg);
  } catch {
    /* best-effort */
  }
}

/** Platform-correct stdio entry. Windows needs `cmd /c npx ...` (npx is a .cmd shim there) — F7. */
export function buildEntry(baseArgs: string[], platform: NodeJS.Platform): McpEntry {
  if (platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'npx', ...baseArgs] };
  }
  return { command: 'npx', args: baseArgs };
}

/**
 * Pure decision: which server keys to install given opt-out + which are already present. A server
 * already in the config is left untouched (idempotent, never clobbers a user's customized entry).
 */
export function mcpInstallDecision(state: {
  optOut: boolean;
  present: Record<string, boolean>;
}): string[] {
  if (state.optOut) return [];
  return Object.keys(MCP_SERVERS).filter((name) => !state.present[name]);
}

/**
 * Pure warning builder. Returns null when both servers are properly configured (warning vanishes),
 * else an instruction banner naming exactly what is missing and how to fix it.
 */
export function buildMcpWarning(auth: { context7: boolean; octocode: boolean }): string | null {
  if (auth.context7 && auth.octocode) return null;
  const lines: string[] = ['⚠ dev-pomogator MCP — требуется настройка:'];
  if (!auth.context7) {
    lines.push(
      '• Context7 без API-ключа (работает на анонимном тире с низкими лимитами). ' +
        'Возьми бесплатный ключ: https://context7.com/dashboard — дай его мне в чате, я впишу ' +
        '(или скажи «настрой mcp» / запусти `npx ctx7 setup`).',
    );
  }
  if (!auth.octocode) {
    lines.push(
      '• Octocode без GitHub-доступа (GitHub-поиск не работает). Запусти `gh auth login`, ' +
        'или дай GitHub-токен (scopes: repo, read:user, read:org) — впишу в чате.',
    );
  }
  lines.push('Подробнее: /pomogator-doctor. Отключить авто-настройку: DEV_POMOGATOR_MCP_SETUP=off.');
  return lines.join('\n');
}

interface ClaudeJson {
  mcpServers?: Record<string, McpEntry>;
  [k: string]: unknown;
}

function userConfigPath(homeDir: string): string {
  return path.join(homeDir, '.claude.json');
}

/** Read ~/.claude.json. Returns null on a missing OR malformed file (never clobber a bad file). */
export function readUserConfig(homeDir: string): ClaudeJson | null {
  try {
    return JSON.parse(fs.readFileSync(userConfigPath(homeDir), 'utf-8')) as ClaudeJson;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { mcpServers: {} };
    log('WARN', `~/.claude.json unreadable/malformed — skipping install: ${(e as Error).message}`);
    return null;
  }
}

/** Atomic write: temp file in the same dir → fsync → rename. */
function writeUserConfigAtomic(homeDir: string, data: ClaudeJson): void {
  const target = userConfigPath(homeDir);
  const tmp = target + '.dev-pomogator.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, target);
}

/** Add the missing server entries to the config object. Returns the count actually added. */
export function applyInstall(config: ClaudeJson, toInstall: string[], platform: NodeJS.Platform): number {
  if (!config.mcpServers) config.mcpServers = {};
  let added = 0;
  for (const name of toInstall) {
    if (config.mcpServers[name]) continue; // never clobber
    config.mcpServers[name] = buildEntry(MCP_SERVERS[name].baseArgs, platform);
    added++;
  }
  return added;
}

async function drainStdin(): Promise<void> {
  try {
    for await (const _chunk of process.stdin) {
      /* consume — hook protocol */
    }
  } catch {
    /* best-effort */
  }
}

function writeOutput(payload: { continue: true; suppressOutput?: boolean; additionalContext?: string }): void {
  try {
    process.stdout.write(JSON.stringify(payload) + '\n');
  } catch {
    /* best-effort */
  }
}

async function main(): Promise<void> {
  await drainStdin();

  const optOut = (process.env.DEV_POMOGATOR_MCP_SETUP ?? '').toLowerCase() === 'off';
  if (optOut) {
    log('DEBUG', 'opt-out via DEV_POMOGATOR_MCP_SETUP=off');
    writeOutput({ continue: true, suppressOutput: true });
    return;
  }

  const homeDir = os.homedir();
  const config = readUserConfig(homeDir);
  if (!config) {
    // Malformed config — do not touch it, do not warn (we cannot read auth state honestly).
    writeOutput({ continue: true, suppressOutput: true });
    return;
  }

  const present = {
    context7: !!config.mcpServers?.context7,
    octocode: !!config.mcpServers?.octocode,
  };
  const toInstall = mcpInstallDecision({ optOut, present });
  if (toInstall.length > 0) {
    const added = applyInstall(config, toInstall, process.platform);
    if (added > 0) {
      writeUserConfigAtomic(homeDir, config);
      log('INFO', `installed ${added} MCP server(s) into ~/.claude.json: ${toInstall.join(', ')}`);
    }
  }

  // Real-check auth on the (now-installed) entries and nag until configured ("с проверками").
  const auth = detectMcpAuth(config.mcpServers ?? {});
  const warning = buildMcpWarning(auth);
  if (warning) {
    writeOutput({ continue: true, additionalContext: warning });
  } else {
    writeOutput({ continue: true, suppressOutput: true });
  }
}

// SessionStart: exit 0 = continue. Never block, never throw.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((e) => {
      log('ERROR', `skipped: ${e && (e as Error).message ? (e as Error).message : e}`);
      writeOutput({ continue: true, suppressOutput: true });
    })
    .finally(() => process.exit(0));
}
