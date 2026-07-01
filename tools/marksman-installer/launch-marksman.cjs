#!/usr/bin/env node
/**
 * Marksman LSP launcher shim (FR-7 — native Claude Code LSP plugin).
 *
 * Claude Code spawns this as the LSP server `command` (see `.lsp.json`). It is a
 * thin, dependency-free CJS wrapper whose only job is to locate the Marksman
 * binary and exec it with `stdio: 'inherit'` so the LSP JSON-RPC stream flows
 * UNTOUCHED between Claude Code and Marksman (no framing, no buffering layer).
 *
 * Why a shim and not `command: "marksman"` directly:
 *   - The binary is AUTO-installed by us (FR-7a) into the per-project
 *     `.dev-pomogator/bin/`, which is NOT on PATH — so a bare `marksman` command
 *     would not find it and would violate "no reliance on the user".
 *   - `.lsp.json` is static JSON: its `command` cannot branch on OS, so it cannot
 *     pick `marksman.exe` vs `marksman`. This shim resolves the platform-correct
 *     path at spawn time. Mirrors `.mcp.json`'s `node` launcher pattern.
 *
 * Resolution order (identical to resolve-binary.ts, package-first):
 *   1. PATH               — marksman from the OS package manager (winget/brew/…)
 *   2. managed            — `.dev-pomogator/bin/marksman[.exe]` we downloaded
 *   3. (none) → exit 1    — NO js-fallback (FR-7a): we do not fake an MD-LSP.
 *                           Print an actionable message and fail cleanly.
 *
 * @see ./resolve-binary.ts  (the typed source of the same policy)
 * @see ./ensure-marksman.ts (the SessionStart hook that populates the managed path)
 * @see .specs/spec-generator-v4/FR.md FR-7 / FR-7a
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** Pure PATH scan — no shell-out. Honours Windows executable extensions.
 *  Platform-aware (path.win32/path.posix) so it is correct AND testable on any host. */
function whichOnPath(cmd, env, platform, existsFn) {
  const P = platform === 'win32' ? path.win32 : path.posix;
  const exts = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const dirs = (env.PATH || env.Path || '').split(P.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = P.join(dir, cmd + ext);
      if (existsFn(candidate)) return candidate;
    }
  }
  return null;
}

/** Absolute path of the managed (downloaded) binary for the platform. */
function managedBinaryPath(repoRoot, platform) {
  const P = platform === 'win32' ? path.win32 : path.posix;
  const name = platform === 'win32' ? 'marksman.exe' : 'marksman';
  return P.join(repoRoot, '.dev-pomogator', 'bin', name);
}

/**
 * Resolve the Marksman binary, package-first. Returns `{ source, binaryPath }`
 * or `null` when nothing is available. Pure + injectable for unit tests.
 */
function resolveMarksmanBinary(opts) {
  const platform = opts.platform || process.platform;
  const existsFn = opts.existsFn || fs.existsSync;
  const env = opts.env || process.env;
  const whichFn = opts.whichFn || ((c) => whichOnPath(c, env, platform, existsFn));

  // Explicit override (highest priority) — mirrors resolve-binary.ts. The Docker
  // test image sets DEV_POMOGATOR_MARKSMAN_BIN to a path not on PATH.
  const override = env.DEV_POMOGATOR_MARKSMAN_BIN;
  if (override && existsFn(override)) return { source: 'env', binaryPath: override };

  const onPath = whichFn('marksman');
  if (onPath) return { source: 'path', binaryPath: onPath };

  const managed = managedBinaryPath(opts.repoRoot, platform);
  if (existsFn(managed)) return { source: 'managed', binaryPath: managed };

  return null;
}

/** The per-project root we resolve the managed binary under. */
function repoRootFromEnv(env) {
  return env.CLAUDE_PROJECT_DIR || env.DEV_POMOGATOR_REPO_ROOT || process.cwd();
}

function main() {
  const env = process.env;
  const repoRoot = repoRootFromEnv(env);
  const resolved = resolveMarksmanBinary({ repoRoot, env });

  if (!resolved) {
    // FR-7a: no fallback. Fail with an actionable message — Claude Code surfaces
    // this in the /plugin Errors tab; the SessionStart hook auto-installs on the
    // next session, after which /reload-plugins picks up the binary.
    process.stderr.write(
      '[marksman-lsp] Marksman binary not found.\n' +
        `  Looked on PATH and at ${managedBinaryPath(repoRoot, process.platform)}.\n` +
        '  It is auto-installed by the SessionStart hook (ensure-marksman); run\n' +
        '  /reload-plugins after the first session, or install marksman on PATH.\n',
    );
    process.exit(1);
  }

  // Forward whatever args .lsp.json supplied (normally ["server"]) verbatim.
  const args = process.argv.slice(2);
  // NOTE: do NOT use stdio:'inherit'. When this launcher is itself spawned with
  // node-created pipes (the common case), those pipes are O_NONBLOCK; handing them
  // raw to Marksman via 'inherit' makes its blocking reads fail — fatal on Linux
  // (Windows pipe semantics differ, so it "worked" there). Instead let node own
  // the pipes and forward bytes both ways — the standard transparent-proxy shape,
  // negligible overhead for LSP traffic. stderr is inherited (Marksman logs pass
  // straight to our stderr).
  const child = spawn(resolved.binaryPath, args, { stdio: ['pipe', 'pipe', 'inherit'] });
  const ignoreEpipe = (s) =>
    s.on('error', (e) => {
      if (e && e.code !== 'EPIPE') throw e; // EPIPE just means the other side closed first
    });
  ignoreEpipe(child.stdin);
  ignoreEpipe(process.stdout);
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.on('error', (err) => {
    process.stderr.write(`[marksman-lsp] failed to spawn ${resolved.binaryPath}: ${err.message}\n`);
    process.exit(1);
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code === null ? 1 : code);
  });
}

module.exports = { whichOnPath, managedBinaryPath, resolveMarksmanBinary, repoRootFromEnv };

// Run only when invoked directly (not when required by the unit test).
if (require.main === module) main();
