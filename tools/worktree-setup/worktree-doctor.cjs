#!/usr/bin/env node
/**
 * worktree-doctor — FR-6: standalone diagnostic for a worktree's dev-pomogator state.
 *
 * Pure Node stdlib (CommonJS, zero deps) so it runs regardless of worktree-local
 * install state. Full mode runs 6 checks; `--quick` runs only #3 (tools dir) and
 * #6 (is dev-pomogator repo) for the session-pilot hot path (<50ms target, FR-7).
 *
 * Output: plain `key=value` lines, last line always `status=<STATUS>`.
 * Exit codes (stable, NFR-R4): 0 OK | 1 TOOLS_MISSING/NOT_REGISTERED |
 *                              2 PARTIAL_INSTALL | 3 NOT_APPLICABLE.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const quick = process.argv.includes('--quick');
const cwd = process.cwd();
const out = [];
const emit = (k, v) => out.push(`${k}=${v}`);

function isDevPomogatorRepo(dir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    return pkg && pkg.name === 'dev-pomogator';
  } catch {
    return false;
  }
}

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

function detectMain() {
  try {
    const r = cp.spawnSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf-8', cwd });
    for (const line of (r.stdout || '').split('\n')) {
      const m = line.match(/^worktree (.+)$/);
      if (m) return path.resolve(m[1].trim());
    }
  } catch {
    /* no git */
  }
  return null;
}

function registeredInGlobalConfig(dir) {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), '.dev-pomogator', 'config.json'), 'utf-8'),
    );
    const paths = (cfg.installedExtensions || []).flatMap((e) => e.projectPaths || []);
    return paths.map((p) => path.resolve(p)).includes(path.resolve(dir));
  } catch {
    return false;
  }
}

/** Sample up to 3 hook command targets from settings and check they exist. */
function partialInstallMissing(dir) {
  const missing = [];
  for (const f of ['.claude/settings.local.json', '.claude/settings.json']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    let settings;
    try {
      settings = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
      continue;
    }
    const cmds = JSON.stringify(settings.hooks || {});
    const refs = [...cmds.matchAll(/\.dev-pomogator\/tools\/[^"'\\ ]+\.(?:ts|cjs|js|sh)/g)].map(
      (m) => m[0],
    );
    for (const ref of refs.slice(0, 3)) {
      if (!fs.existsSync(path.join(dir, ref))) missing.push(ref);
    }
    break;
  }
  return missing;
}

// ---- Check #6 first (gates everything): is this a dev-pomogator repo? ----
if (!isGitRepo(cwd) || !isDevPomogatorRepo(cwd)) {
  emit('status', 'NOT_APPLICABLE');
  console.log(out.join('\n'));
  process.exit(3);
}

const toolsPresent = fs.existsSync(path.join(cwd, '.dev-pomogator', 'tools'));
emit('tools_present', toolsPresent);

if (quick) {
  const status = toolsPresent ? 'OK' : 'TOOLS_MISSING';
  emit('status', status);
  console.log(out.join('\n'));
  process.exit(toolsPresent ? 0 : 1);
}

// ---- Full mode: remaining checks ----
const mainPath = detectMain();
const isWorktree = mainPath !== null && path.resolve(cwd) !== mainPath;
emit('worktree', isWorktree);
emit('main_path', mainPath || '');
emit('current_path', cwd);

const registered = registeredInGlobalConfig(cwd);
emit('registered', registered);

if (!toolsPresent) {
  emit('suggested_action', 'bootstrap');
  emit('bootstrap_command', mainPath ? `node ${path.join(mainPath, 'bin', 'cli.js')} --claude --all` : '');
  emit('status', 'TOOLS_MISSING');
  console.log(out.join('\n'));
  process.exit(1);
}
if (!registered) {
  emit('suggested_action', 'bootstrap');
  emit('status', 'NOT_REGISTERED');
  console.log(out.join('\n'));
  process.exit(1);
}

const missing = partialInstallMissing(cwd);
if (missing.length > 0) {
  emit('partial_install_missing', missing.join(','));
  emit('suggested_action', 'repair');
  emit('status', 'PARTIAL_INSTALL');
  console.log(out.join('\n'));
  process.exit(2);
}

emit('suggested_action', 'none');
emit('status', 'OK');
console.log(out.join('\n'));
process.exit(0);
