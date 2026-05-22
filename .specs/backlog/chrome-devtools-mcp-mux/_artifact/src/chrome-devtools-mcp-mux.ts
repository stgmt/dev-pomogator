import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { readMcpConfigs } from './mcp-parse.js';

const EXTENSION_NAME = 'chrome-devtools-mcp-mux';
const SERVER_NAME = 'chrome-devtools-mcp-mux';
const PINNED_VERSION_REGEX = /^chrome-devtools-mcp-mux@(\d+\.\d+\.\d+)$/;

/**
 * Per-extension gate — only run CDMM-* checks when chrome-devtools-mcp-mux
 * is actually installed (mirrors `pomogator-doctor` per-extension driving).
 */
function isInstalled(ctx: CheckContext): boolean {
  const installed = ctx.installedExtensions ?? [];
  return installed.some((e) => e.name === EXTENSION_NAME);
}

function gate(ctx: CheckContext): { relevant: boolean; reason?: string } {
  if (!isInstalled(ctx)) {
    return { relevant: false, reason: `${EXTENSION_NAME} not in installedExtensions` };
  }
  return { relevant: true };
}

function makeBase(id: string, name: string): Pick<
  CheckResult,
  'id' | 'fr' | 'name' | 'group' | 'reinstallable' | 'extension' | 'durationMs'
> {
  return {
    id,
    fr: 'FR-4',
    name,
    group: 'needs-external',
    reinstallable: false,
    extension: EXTENSION_NAME,
    durationMs: 0,
  };
}

// CDMM-1: extension installed in config
async function runCheck1(ctx: CheckContext): Promise<CheckResult> {
  const installed = isInstalled(ctx);
  if (!installed) {
    return {
      ...makeBase('CDMM-1', 'extension installed'),
      severity: 'critical',
      reinstallable: true,
      message: `${EXTENSION_NAME} not in ~/.dev-pomogator/config.json installedExtensions`,
      hint: 'Run `npx dev-pomogator --claude --plugins chrome-devtools-mcp-mux`',
    };
  }
  return {
    ...makeBase('CDMM-1', 'extension installed'),
    severity: 'ok',
    reinstallable: true,
    message: `${EXTENSION_NAME} installed`,
  };
}

// CDMM-2: MCP entry present in .mcp.json with valid shape
async function runCheck2(ctx: CheckContext): Promise<CheckResult> {
  const configured = readMcpConfigs(ctx);
  const entry = configured.get(SERVER_NAME);
  if (!entry) {
    return {
      ...makeBase('CDMM-2', 'mcp entry in .mcp.json'),
      severity: 'critical',
      reinstallable: true,
      message: `${SERVER_NAME} entry missing from .mcp.json / ~/.claude/mcp.json`,
      hint: 'Re-run installer to write mcp config: `npx dev-pomogator --claude`',
    };
  }
  // Validate structure: must have command + args containing pinned package spec
  const args = Array.isArray(entry.args) ? entry.args : [];
  const pkgSpec = args.find((a) => typeof a === 'string' && PINNED_VERSION_REGEX.test(a));
  if (!entry.command || !pkgSpec) {
    return {
      ...makeBase('CDMM-2', 'mcp entry in .mcp.json'),
      severity: 'critical',
      reinstallable: true,
      message: `${SERVER_NAME} entry malformed (command='${entry.command ?? ''}', args=${JSON.stringify(args)})`,
      hint: 'Delete the entry from .mcp.json and re-run installer',
    };
  }
  // Co-existence with claude-in-chrome → warning per FR-5
  if (configured.has('claude-in-chrome')) {
    return {
      ...makeBase('CDMM-2', 'mcp entry in .mcp.json'),
      severity: 'warning',
      reinstallable: false,
      message: `${SERVER_NAME} configured alongside claude-in-chrome (mutually exclusive in one Chrome instance)`,
      hint:
        'Pick one workflow per Chrome instance: keep claude-in-chrome (revert mux) OR ' +
        'use mux against a separate Chrome via CDMCP_MUX_USER_DATA_DIR. ' +
        'See FR-5 conflict resolution in .specs/chrome-devtools-mcp-mux/',
    };
  }
  return {
    ...makeBase('CDMM-2', 'mcp entry in .mcp.json'),
    severity: 'ok',
    reinstallable: true,
    message: `${SERVER_NAME} entry valid (${pkgSpec})`,
  };
}

// CDMM-3: npx -y chrome-devtools-mcp-mux@<version> --version reachable
async function runCheck3(ctx: CheckContext): Promise<CheckResult> {
  const TIMEOUT_MS = 15_000;
  const configured = readMcpConfigs(ctx);
  const entry = configured.get(SERVER_NAME);
  const args = entry?.args ?? [];
  const pkgSpec = args.find((a) => typeof a === 'string' && PINNED_VERSION_REGEX.test(a));
  if (!pkgSpec) {
    return {
      ...makeBase('CDMM-3', 'cdmcp-mux package available via npx'),
      severity: 'warning',
      reinstallable: false,
      message: 'no pinned version found in .mcp.json — skipping npx check',
      hint: 'Re-run installer to write the pinned mcp entry',
    };
  }

  return await new Promise<CheckResult>((resolve) => {
    const start = Date.now();
    const child = spawn('npx', ['--yes', pkgSpec, '--help'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let stderr = '';
    child.stderr?.on('data', (b) => (stderr += b.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({
        ...makeBase('CDMM-3', 'cdmcp-mux package available via npx'),
        severity: 'warning',
        reinstallable: false,
        message: `npx -y ${pkgSpec} --help timed out after ${TIMEOUT_MS}ms`,
        hint: `run \`npm view ${pkgSpec.split('@')[0] + '@' + pkgSpec.split('@')[1]}\` to verify package availability; check network`,
        durationMs: Date.now() - start,
      });
    }, TIMEOUT_MS);
    timer.unref();
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        ...makeBase('CDMM-3', 'cdmcp-mux package available via npx'),
        severity: 'warning',
        reinstallable: false,
        message: `failed to spawn npx: ${err.message}`,
        hint: 'Verify Node + npm are on PATH',
        durationMs: Date.now() - start,
      });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      // npx --help may exit non-zero for unrecognized flags depending on version;
      // accept exit 0 OR any output written without crash. If clearly broken
      // (ENOENT, permission denied, etc), stderr will indicate that.
      if (code === 0) {
        resolve({
          ...makeBase('CDMM-3', 'cdmcp-mux package available via npx'),
          severity: 'ok',
          reinstallable: false,
          message: `npx -y ${pkgSpec} reachable`,
          durationMs,
        });
        return;
      }
      // Tolerate non-zero if process actually started (no spawn error)
      const looksReachable = stderr.length > 0 && !/ENOENT|not found/i.test(stderr);
      resolve({
        ...makeBase('CDMM-3', 'cdmcp-mux package available via npx'),
        severity: looksReachable ? 'ok' : 'warning',
        reinstallable: false,
        message: looksReachable
          ? `npx -y ${pkgSpec} reachable (exit ${code})`
          : `npx -y ${pkgSpec} failed (exit ${code}): ${stderr.split('\n')[0] || '(no stderr)'}`,
        hint: looksReachable
          ? undefined
          : `run \`npm view ${pkgSpec.split('@')[0]}\` to verify package availability; check network`,
        durationMs,
      });
    });
  });
}

// CDMM-4: Chrome / Chromium binary resolvable
async function runCheck4(ctx: CheckContext): Promise<CheckResult> {
  const candidates: { name: string; check: () => boolean }[] = [];

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const p = process.env.PUPPETEER_EXECUTABLE_PATH;
    candidates.push({
      name: `PUPPETEER_EXECUTABLE_PATH=${p}`,
      check: () => fs.existsSync(p),
    });
  }

  // Common system Chrome paths
  if (process.platform === 'win32') {
    const winPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(ctx.homeDir, 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    for (const p of winPaths) candidates.push({ name: p, check: () => fs.existsSync(p) });
  } else if (process.platform === 'darwin') {
    candidates.push({
      name: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      check: () => fs.existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    });
  } else {
    for (const p of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
      candidates.push({ name: p, check: () => fs.existsSync(p) });
    }
  }

  // Puppeteer cache (default download location)
  const puppeteerCache = path.join(ctx.homeDir, '.cache', 'puppeteer');
  if (fs.existsSync(puppeteerCache)) {
    candidates.push({ name: puppeteerCache, check: () => true });
  }
  const puppeteerCacheWin = path.join(ctx.homeDir, 'AppData', 'Local', 'puppeteer');
  if (fs.existsSync(puppeteerCacheWin)) {
    candidates.push({ name: puppeteerCacheWin, check: () => true });
  }

  for (const c of candidates) {
    try {
      if (c.check()) {
        return {
          ...makeBase('CDMM-4', 'Chrome/Chromium binary available'),
          severity: 'ok',
          reinstallable: false,
          message: `Chrome found at ${c.name}`,
        };
      }
    } catch {
      // skip permission errors
    }
  }

  return {
    ...makeBase('CDMM-4', 'Chrome/Chromium binary available'),
    severity: 'warning',
    reinstallable: false,
    message: 'no Chrome/Chromium binary found in standard paths',
    hint:
      'puppeteer (used by chrome-devtools-mcp) will download Chrome on first run. ' +
      'To skip the runtime download set PUPPETEER_EXECUTABLE_PATH or run ' +
      '`npx puppeteer browsers install chrome` ahead of time.',
  };
}

// CDMM-5: SKILL.md exists physically
async function runCheck5(ctx: CheckContext): Promise<CheckResult> {
  const skillPath = path.join(ctx.projectRoot, '.claude', 'skills', EXTENSION_NAME, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    return {
      ...makeBase('CDMM-5', 'skill SKILL.md present'),
      severity: 'critical',
      reinstallable: true,
      message: `SKILL.md missing at ${skillPath}`,
      hint: 'Re-run installer: `npx dev-pomogator --claude --plugins chrome-devtools-mcp-mux`',
    };
  }
  return {
    ...makeBase('CDMM-5', 'skill SKILL.md present'),
    severity: 'ok',
    reinstallable: true,
    message: `SKILL.md present at ${skillPath}`,
  };
}

export const chromeDevtoolsMcpMuxCheck: CheckDefinition = {
  id: 'CDMM',
  fr: 'FR-4',
  name: 'chrome-devtools-mcp-mux',
  group: 'needs-external',
  reinstallable: true,
  pool: 'mcp',
  gate,
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const start = Date.now();
    const [r1, r2, r3, r4, r5] = await Promise.all([
      runCheck1(ctx),
      runCheck2(ctx),
      runCheck3(ctx),
      runCheck4(ctx),
      runCheck5(ctx),
    ]);
    const totalDuration = Date.now() - start;
    // Distribute total duration across 5 checks (rough — not measured per-check)
    const perCheck = Math.floor(totalDuration / 5);
    return [
      { ...r1, durationMs: r1.durationMs || perCheck },
      { ...r2, durationMs: r2.durationMs || perCheck },
      { ...r3, durationMs: r3.durationMs || perCheck },
      { ...r4, durationMs: r4.durationMs || perCheck },
      { ...r5, durationMs: r5.durationMs || perCheck },
    ];
  },
};
