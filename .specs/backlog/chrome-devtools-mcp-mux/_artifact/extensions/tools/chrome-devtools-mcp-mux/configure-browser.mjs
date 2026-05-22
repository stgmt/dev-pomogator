#!/usr/bin/env node
// FR-9: configure browser preference for chrome-devtools-mcp-mux.
//
// Invoked by the chrome-devtools-mcp-mux skill at first-run prompt time.
// Updates the project's .mcp.json mcpServers["chrome-devtools-mcp-mux"].env
// (atomic smart-merge) and writes a per-user marker so the prompt is shown
// at most once per user — unless they explicitly opt back in.
//
// Usage:
//   node configure-browser.mjs <choice> [<path>] [--dismiss] [--project <dir>]
//
//   choice: edge | chrome | bundled | custom
//   path  : required for `custom`; optional path override for edge/chrome
//   --dismiss : set marker file dismissed=true (skill skips prompt forever)
//   --project : path to project root (defaults to process.cwd())
//
// Self-contained — no imports outside Node stdlib (runs from installed
// .dev-pomogator/tools/ location, can't reach src/).
//
// See .specs/chrome-devtools-mcp-mux/ FR-9, AC-9.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VALID_CHOICES = new Set(['edge', 'chrome', 'bundled', 'custom']);

function findEdge() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    for (const p of candidates) if (existsFile(p)) return p;
    return null;
  }
  if (process.platform === 'darwin') {
    const p = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
    return existsFile(p) ? p : null;
  }
  for (const p of ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable']) {
    if (existsFile(p)) return p;
  }
  return null;
}

function findChrome() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    ];
    for (const p of candidates) if (existsFile(p)) return p;
    return null;
  }
  if (process.platform === 'darwin') {
    const p = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return existsFile(p) ? p : null;
  }
  for (const p of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsFile(p)) return p;
  }
  return null;
}

function existsFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let choice = null;
  let pathArg = null;
  let dismiss = false;
  let projectRoot = process.cwd();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--dismiss') {
      dismiss = true;
    } else if (a === '--project') {
      projectRoot = args[++i];
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit(0);
    } else if (!choice) {
      choice = a;
    } else if (!pathArg) {
      pathArg = a;
    } else {
      bail(`unexpected argument: ${a}`);
    }
  }
  if (!choice) bail('missing required <choice> argument (edge | chrome | bundled | custom)');
  if (!VALID_CHOICES.has(choice)) bail(`invalid choice "${choice}"; expected one of: ${[...VALID_CHOICES].join(', ')}`);
  if (choice === 'custom' && !pathArg) bail('choice="custom" requires explicit <path> argument');
  if (choice === 'bundled' && pathArg) bail('choice="bundled" must not have a path argument');
  return { choice, pathArg, dismiss, projectRoot };
}

function printHelpAndExit(code) {
  console.log(`Usage: configure-browser.mjs <choice> [<path>] [--dismiss] [--project <dir>]

  choice: edge | chrome | bundled | custom
  path  : required for 'custom'; optional override for edge/chrome
  --dismiss : write marker dismissed=true so skill never prompts again
  --project : project root containing .mcp.json (default: cwd)
`);
  process.exit(code);
}

function bail(msg) {
  console.error(`[configure-browser] error: ${msg}`);
  process.exit(2);
}

function resolveBinary({ choice, pathArg }) {
  if (choice === 'bundled') return null;
  if (choice === 'custom') {
    if (!existsFile(pathArg)) bail(`custom path does not exist or is not a regular file: ${pathArg}`);
    return pathArg;
  }
  if (pathArg) {
    if (!existsFile(pathArg)) bail(`provided path does not exist or is not a regular file: ${pathArg}`);
    return pathArg;
  }
  if (choice === 'edge') {
    const found = findEdge();
    if (!found) bail('Edge binary not found in standard locations; pass an explicit path: configure-browser.mjs edge <path>');
    return found;
  }
  if (choice === 'chrome') {
    const found = findChrome();
    if (!found) bail('Chrome binary not found in standard locations; pass an explicit path: configure-browser.mjs chrome <path>');
    return found;
  }
  bail(`unreachable: choice=${choice}`);
}

function readJsonOrEmpty(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function writeJsonAtomic(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // Backup current valid JSON before overwriting
  try {
    const current = fs.readFileSync(p, 'utf-8');
    JSON.parse(current);
    fs.writeFileSync(p + '.bak', current, 'utf-8');
  } catch {
    // missing/corrupt — skip backup
  }
  const tempFile = p + '.tmp';
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tempFile, p);
}

function updateMcpJson({ projectRoot, binary }) {
  const mcpPath = path.join(projectRoot, '.mcp.json');
  const existing = readJsonOrEmpty(mcpPath);
  if (!existing || !existing.mcpServers || !existing.mcpServers['chrome-devtools-mcp-mux']) {
    bail(`.mcp.json missing chrome-devtools-mcp-mux entry at ${mcpPath}; run dev-pomogator installer first`);
  }
  const next = {
    ...existing,
    mcpServers: {
      ...existing.mcpServers,
      'chrome-devtools-mcp-mux': { ...existing.mcpServers['chrome-devtools-mcp-mux'] },
    },
  };
  const muxEntry = next.mcpServers['chrome-devtools-mcp-mux'];
  const env = { ...(muxEntry.env ?? {}) };
  if (binary === null) {
    delete env.CDMCP_MUX_CHROMIUM;
    if (Object.keys(env).length === 0) {
      delete muxEntry.env;
    } else {
      muxEntry.env = env;
    }
  } else {
    env.CDMCP_MUX_CHROMIUM = binary;
    muxEntry.env = env;
  }
  writeJsonAtomic(mcpPath, next);
  return mcpPath;
}

function writeMarker({ choice, binary, dismiss }) {
  const markerDir = path.join(os.homedir(), '.dev-pomogator');
  const markerPath = path.join(markerDir, '.cdmm-browser-choice.json');
  const data = {
    choice,
    ...(binary ? { path: binary } : {}),
    dismissed: !!dismiss,
    timestampISO: new Date().toISOString(),
  };
  writeJsonAtomic(markerPath, data);
  return markerPath;
}

function main() {
  const opts = parseArgs(process.argv);
  const binary = resolveBinary(opts);
  const mcpPath = updateMcpJson({ projectRoot: opts.projectRoot, binary });
  const markerPath = writeMarker({ choice: opts.choice, binary, dismiss: opts.dismiss });

  const summary = (() => {
    if (opts.choice === 'bundled') {
      return `chrome-devtools-mcp-mux now uses bundled puppeteer Chromium (isolated sessions). First run downloads ~170MB.`;
    }
    return `chrome-devtools-mcp-mux now uses ${opts.choice}: ${binary}`;
  })();

  console.log(JSON.stringify({
    ok: true,
    choice: opts.choice,
    binary,
    dismissed: opts.dismiss,
    mcpJson: mcpPath,
    marker: markerPath,
    summary,
  }, null, 2));
}

try {
  main();
} catch (err) {
  bail(err instanceof Error ? err.message : String(err));
}
