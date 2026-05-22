#!/usr/bin/env node
/**
 * claim-tab.mjs — manual ownership management CLI for cims-guard.
 *
 * Usage:
 *   node claim-tab.mjs add <tabId>           Add tabId to current session's allowlist
 *   node claim-tab.mjs release <tabId>       Remove tabId from current session
 *   node claim-tab.mjs list                  Show ownership table for all sessions
 *   node claim-tab.mjs clean                 Remove sessions with lastUsedAt > 24h ago
 *   node claim-tab.mjs reset                 Wipe ALL session state (destructive)
 *
 * Required env: CLAUDE_SESSION_ID (set by Claude Code skill before invocation)
 * OR --session <id> flag for admin override.
 *
 * Self-contained — runs from .dev-pomogator/tools/ at install time.
 *
 * See `.specs/claude-in-chrome-multisession/` FR-7.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STATE_ROOT = path.join(os.homedir(), '.dev-pomogator', 'cdmm-sessions');
const TTL_MS = 24 * 60 * 60 * 1000;

const sanitize = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
const sessionDir = (s) => path.join(STATE_ROOT, sanitize(s));

function bail(msg) {
  console.error(`[claim-tab] error: ${msg}`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let cmd = null;
  let tabId = null;
  let sessionOverride = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--session') {
      sessionOverride = args[++i];
    } else if (a === '--help' || a === '-h') {
      console.log('Usage: claim-tab.mjs <add|release|list|clean|reset> [<tabId>] [--session <id>]');
      process.exit(0);
    } else if (!cmd) {
      cmd = a;
    } else if (tabId == null) {
      tabId = Number(a);
    } else {
      bail(`unexpected arg: ${a}`);
    }
  }
  if (!cmd) bail('missing command');
  return { cmd, tabId, sessionOverride };
}

function readOwned(sid) {
  try {
    return JSON.parse(fs.readFileSync(path.join(sessionDir(sid), 'owned-tabs.json'), 'utf-8'));
  } catch {
    return null;
  }
}

function writeOwned(data) {
  fs.mkdirSync(sessionDir(data.sessionId), { recursive: true });
  const file = path.join(sessionDir(data.sessionId), 'owned-tabs.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(file + '.tmp', file);
}

function getCurrentSessionId(override) {
  if (override) return override;
  const env = process.env.CLAUDE_SESSION_ID;
  if (env) return env;
  bail(
    'CLAUDE_SESSION_ID env var not set and no --session flag provided. ' +
      'Run via Claude Code skill (which sets the env), OR pass --session <id> for admin operations.',
  );
}

function listAll() {
  if (!fs.existsSync(STATE_ROOT)) {
    console.log(JSON.stringify({ sessions: [], totalSessions: 0 }, null, 2));
    return;
  }
  const sessions = [];
  for (const entry of fs.readdirSync(STATE_ROOT)) {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(STATE_ROOT, entry, 'owned-tabs.json'), 'utf-8'),
      );
      sessions.push({
        sessionId: data.sessionId,
        tabCount: Array.isArray(data.tabIds) ? data.tabIds.length : 0,
        tabIds: data.tabIds ?? [],
        createdAt: data.createdAt,
        lastUsedAt: data.lastUsedAt,
        ageMs: data.lastUsedAt ? Date.now() - new Date(data.lastUsedAt).getTime() : null,
      });
    } catch {
      sessions.push({ sessionId: entry, error: 'corrupt or missing JSON' });
    }
  }
  console.log(JSON.stringify({ sessions, totalSessions: sessions.length }, null, 2));
}

function cleanStale() {
  if (!fs.existsSync(STATE_ROOT)) {
    console.log(JSON.stringify({ removed: [] }, null, 2));
    return;
  }
  const removed = [];
  for (const entry of fs.readdirSync(STATE_ROOT)) {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(STATE_ROOT, entry, 'owned-tabs.json'), 'utf-8'),
      );
      const last = new Date(data.lastUsedAt).getTime();
      if (Number.isFinite(last) && Date.now() - last > TTL_MS) {
        fs.rmSync(path.join(STATE_ROOT, entry), { recursive: true, force: true });
        removed.push({ sessionId: data.sessionId, ageHours: (Date.now() - last) / 3_600_000 });
      }
    } catch {
      /* skip */
    }
  }
  console.log(JSON.stringify({ removed, count: removed.length }, null, 2));
}

function resetAll() {
  if (fs.existsSync(STATE_ROOT)) {
    fs.rmSync(STATE_ROOT, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ ok: true, reset: STATE_ROOT }, null, 2));
}

function add(sid, tabId) {
  if (tabId == null || !Number.isFinite(tabId)) bail('add requires numeric <tabId>');
  const cur = readOwned(sid) ?? {
    sessionId: sid,
    tabIds: [],
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };
  if (!cur.tabIds.includes(tabId)) cur.tabIds.push(tabId);
  cur.lastUsedAt = new Date().toISOString();
  writeOwned(cur);
  console.log(JSON.stringify({ ok: true, sessionId: sid, tabIds: cur.tabIds }, null, 2));
}

function release(sid, tabId) {
  if (tabId == null || !Number.isFinite(tabId)) bail('release requires numeric <tabId>');
  const cur = readOwned(sid);
  if (!cur) {
    console.log(JSON.stringify({ ok: true, sessionId: sid, removed: false, reason: 'no allowlist' }, null, 2));
    return;
  }
  const before = cur.tabIds.length;
  cur.tabIds = cur.tabIds.filter((t) => t !== tabId);
  cur.lastUsedAt = new Date().toISOString();
  writeOwned(cur);
  console.log(
    JSON.stringify(
      { ok: true, sessionId: sid, removed: cur.tabIds.length < before, tabIds: cur.tabIds },
      null,
      2,
    ),
  );
}

function main() {
  const { cmd, tabId, sessionOverride } = parseArgs(process.argv);
  switch (cmd) {
    case 'list':
      listAll();
      return;
    case 'clean':
      cleanStale();
      return;
    case 'reset':
      resetAll();
      return;
    case 'add':
      add(getCurrentSessionId(sessionOverride), tabId);
      return;
    case 'release':
      release(getCurrentSessionId(sessionOverride), tabId);
      return;
    default:
      bail(`unknown command "${cmd}"; expected one of: add, release, list, clean, reset`);
  }
}

try {
  main();
} catch (err) {
  bail(err instanceof Error ? err.message : String(err));
}
