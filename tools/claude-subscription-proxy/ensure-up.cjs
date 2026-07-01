#!/usr/bin/env node
/**
 * SessionStart hook — ensure the local Meridian subscription proxy is up.
 *
 * Why: the claim-evidence-gate FR-49e judge (and any other Meridian consumer) needs the
 * proxy running. This brings it up automatically for every user, so "it just works" without
 * a manual `proxy-up`. The container reuses the host's existing Claude login (mounted
 * ~/.claude) — no separate `claude login`.
 *
 * Contract (must never disrupt a session):
 *   - FAST: health probe with a short timeout; a down port fails instantly (ECONNREFUSED).
 *   - NON-BLOCKING: if down, spawn the start script DETACHED (fire-and-forget) and return —
 *     never wait for the (first-run ~3min) Docker build.
 *   - FAIL-OPEN: Docker absent / any error → log one line, exit 0. Never throw, never block.
 *   - IDEMPOTENT: a lock file suppresses repeated start attempts within a cooldown.
 *
 * Pure node builtins (deps-absent safe: ships in the plugin, runs on machines with no
 * node_modules). Run directly via `node`, no tsx needed.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');

const HEALTH_URL = process.env.MERIDIAN_URL || 'http://127.0.0.1:3456';
const PROBE_MS = 700;
const COOLDOWN_MS = 240_000; // > first-run image build (~3min) so a mid-build second session doesn't fire a duplicate `up --build`
const LOCK = path.join(os.homedir(), '.dev-pomogator', '.meridian-autostart.lock');

function note(msg) {
  try {
    process.stderr.write(`[meridian-autostart] ${msg}\n`);
  } catch {
    /* best-effort */
  }
}

function recentlyAttempted() {
  try {
    return Date.now() - fs.statSync(LOCK).mtimeMs < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function stampLock() {
  try {
    fs.mkdirSync(path.dirname(LOCK), { recursive: true });
    fs.writeFileSync(LOCK, new Date().toISOString());
  } catch {
    /* best-effort */
  }
}

function dockerAvailable() {
  try {
    const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeout: 2500,
      stdio: 'ignore',
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function hostCredsDir() {
  // Reuse the existing host Claude login; host-native path so Docker Desktop resolves it.
  const base = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
  return path.join(base || os.homedir(), '.claude');
}

/**
 * Drive `docker` DIRECTLY (node spawns docker reliably — no shell-script / powershell-resolution
 * fragility, no dependency on start.ps1). Returns 'started' | 'building' | 'failed'.
 *   - existing (stopped) container → `docker start` synchronously (~4s, confirmable, no rebuild).
 *   - none (fresh) → detached `docker compose up -d --build` (slow first run; fire-and-forget).
 * A pinned container_name makes `up` conflict with a stale container, so the `start`-first path
 * also dodges that.
 */
function startProxy() {
  const env = { ...process.env, CLAUDE_CREDS_DIR: hostCredsDir() };
  try {
    const r = spawnSync('docker', ['start', 'claude-proxy-meridian'], { timeout: 15_000, stdio: 'ignore', env });
    if (r.status === 0) return 'started';
  } catch {
    /* fall through to build */
  }
  try {
    const composeFile = path.join(__dirname, 'docker-compose.yml');
    const child = spawn('docker', ['compose', '-f', composeFile, 'up', '-d', '--build'], {
      detached: true,
      stdio: 'ignore',
      env,
    });
    child.unref();
    return 'building';
  } catch {
    return 'failed';
  }
}

async function probeHealthy() {
  if (typeof fetch !== 'function') return false; // old node → can't probe; treat as not-up
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_MS);
  try {
    const r = await fetch(`${HEALTH_URL}/health`, { signal: ctrl.signal });
    return r.ok;
  } catch {
    return false; // ECONNREFUSED (down) is instant; timeout caps a black-holed port
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  // Explicit opt-out for users who don't want autostart.
  if ((process.env.MERIDIAN_AUTOSTART ?? 'true').toLowerCase() === 'false') return;
  if (await probeHealthy()) return; // already up — nothing to do
  if (recentlyAttempted()) return; // started moments ago; let it finish building
  if (!dockerAvailable()) {
    note('proxy down and Docker not available — skipping (the FR-49e judge fails open). Install Docker + run the proxy-up skill to enable Meridian.');
    return;
  }
  stampLock();
  const outcome = startProxy();
  if (outcome === 'started') {
    note('proxy was down — started the existing Meridian container.');
  } else if (outcome === 'building') {
    note('proxy down, no container yet — building + starting Meridian in the background (first run ~3min). It will be ready shortly.');
  } else {
    note('proxy down and could not invoke docker — start it manually via the proxy-up skill.');
  }
}

// SessionStart: exit 0 = continue. Never block, never throw.
main()
  .catch((e) => note(`skipped: ${e && e.message ? e.message : e}`))
  .finally(() => process.exit(0));
