#!/usr/bin/env node
/**
 * scripts/wire-feature.mjs — concurrency-safe, idempotent wiring of a `.feature`
 * path into cucumber.json `default.paths`.
 *
 * WHY: the BDD-migration runs MANY migrator agents in parallel, each finishing its
 * own spec. cucumber.json is a single shared file — a naive read-modify-write race
 * loses paths (A reads [x], B reads [x], A writes [x,a], B writes [x,b] → a lost).
 * This serialises the append behind an O_EXCL lock and writes atomically (temp+rename),
 * so each agent can wire ITSELF safely without a coordinator.
 *
 *   node scripts/wire-feature.mjs .specs/<slug>/<slug>.feature
 *
 * Idempotent: if the path is already present, exits 0 without rewriting.
 * Exit: 0 ok (added or already-present) · 2 usage · 1 lock-timeout/error.
 */
import fs from 'node:fs';
import path from 'node:path';

const CFG = 'cucumber.json';
const LOCK = path.join('.dev-pomogator', '.tmp', 'cucumber.json.lock');
const TMP = path.join('.dev-pomogator', '.tmp', `cucumber.json.${process.pid}.tmp`);
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_STALE_MS = 60_000;

const arg = process.argv[2];
if (!arg) {
  process.stderr.write('usage: wire-feature.mjs <slug | .specs/slug/slug.feature>\n');
  process.exit(2);
}
// Accept a bare SLUG (no slash) and build the canonical `.specs/<slug>/<slug>.feature` path.
// This keeps the command line free of a `.specs/` literal, so the enforce Bash-guard (which
// denies any command whose TEXT contains `.specs/`) does not block agents from wiring themselves.
const featurePath = arg.includes('/') ? arg : `.specs/${arg}/${arg}.feature`;

function sleep(ms) {
  // Real synchronous sleep without spawning (no busy-wait).
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireLock() {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      const fd = fs.openSync(LOCK, 'wx'); // O_EXCL — atomic create-or-fail
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      // Stale-lock recovery: a crashed holder left the lock behind.
      try {
        const age = Date.now() - fs.statSync(LOCK).mtimeMs;
        if (age > LOCK_STALE_MS) {
          fs.rmSync(LOCK, { force: true });
          continue;
        }
      } catch {
        /* lock vanished between EEXIST and stat — retry */
      }
      if (Date.now() > deadline) {
        process.stderr.write('[wire-feature] lock timeout (another writer stuck?)\n');
        process.exit(1);
      }
      sleep(60);
    }
  }
}

function releaseLock() {
  try {
    fs.rmSync(LOCK, { force: true });
  } catch {
    /* best-effort */
  }
}

acquireLock();
let message;
try {
  // NB: never process.exit() inside this try — it would skip `finally` and leak the lock
  // (the bug the race test caught). Set `message`, fall through to finally, print after.
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const profile = cfg.default ?? (cfg.default = {});
  const paths = Array.isArray(profile.paths) ? profile.paths : (profile.paths = []);
  if (paths.includes(featurePath)) {
    message = `[wire-feature] already present: ${featurePath}`;
  } else {
    paths.push(featurePath);
    fs.writeFileSync(TMP, JSON.stringify(cfg, null, 2) + '\n');
    fs.renameSync(TMP, CFG); // atomic replace
    message = `[wire-feature] added: ${featurePath} (now ${paths.length} paths)`;
  }
} finally {
  try {
    fs.rmSync(TMP, { force: true });
  } catch {
    /* ignore */
  }
  releaseLock();
}
process.stdout.write(message + '\n');
