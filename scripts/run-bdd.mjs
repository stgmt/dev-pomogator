#!/usr/bin/env node
/**
 * scripts/run-bdd.mjs — clobber-safe cucumber-js runner (P28-1 / FR-52a).
 *
 * The default cucumber.json writes its `message` formatter to the CANONICAL
 * .dev-pomogator/.last-test-run.ndjson — which spec-verdict / the task census /
 * the claim-evidence Stop-gate all read as the authoritative last run. A FILTERED
 * run (--name / --tags) through that same config OVERWRITES the canonical artifact
 * with a partial result, so every spec NOT in the filter then reads as `not_run`.
 * That is the F2 footgun (audit-reports/session-dogfood-findings-2026-06-18.md):
 * a one-scenario diagnostic run silently wiped the full-suite coverage this session.
 *
 * This wrapper routes a FILTERED run's `message` output to a throwaway ndjson and
 * leaves the canonical untouched; a FULL run still writes the canonical. Use it for
 * any diagnostic / single-scenario run. Full runs may use it too (identical to a
 * bare cucumber invocation in that case).
 *
 *   node scripts/run-bdd.mjs --name "SPECGEN004_149"   # → throwaway, canonical safe
 *   node scripts/run-bdd.mjs                            # → full run, canonical
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Strict host-block (rule no-host-bdd-runs, owner directive 2026-06-24 "ничего на машине, всё в
// Docker"): run-bdd is a HOST-only tool (docker-bdd.sh runs cucumber in-container directly, never via
// run-bdd), so refuse on the host. Belt-and-suspenders behind the test_guard PreToolUse hook — if a
// caller bypasses the Bash hook, this still stops a host run. No bypass by design (mirrors
// tests/setup/ensure-docker.ts).
if (process.env.DEV_POMOGATOR_TEST_IN_DOCKER !== '1') {
  process.stderr.write(
    '\n[run-bdd] host BDD runs are disabled — the cucumber suite must run in Docker.\n' +
      '   Use:  bash scripts/docker-bdd.sh [--tags "@featureN" | --name "SCENARIO"]\n' +
      '         npm run test:bdd:docker   /   /run-tests --docker\n\n',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const FILTER_FLAGS = ['--name', '-n', '--tags', '-t'];
const isFiltered = args.some(
  (a) => FILTER_FLAGS.includes(a) || FILTER_FLAGS.some((f) => a.startsWith(f + '=')),
);
// A --dry-run executes NOTHING (every scenario reports `skipped`), so its ndjson is
// all-skipped — writing it to the canonical poisons the census exactly like a filtered
// run (the honesty gate then reads 0 passed). The collision-check dry-run is UNFILTERED
// (all paths), so isFiltered is false — route a dry-run to the throwaway regardless.
// (Dogfood 2026-06-20: an agent's `run-bdd.mjs --dry-run` clobbered the canonical with
// 703 all-skipped events — done-but-not-run 43→234.)
const isDryRun = args.includes('--dry-run');
const isPartial = isFiltered || isDryRun;
const hasExplicitConfig = args.some(
  (a) => a === '--config' || a === '-c' || a.startsWith('--config='),
);

const CANONICAL = path.join('.dev-pomogator', '.last-test-run.ndjson');
const THROWAWAY = path.join('.dev-pomogator', '.tmp', 'bdd-filtered.ndjson');
const cukeBin = path.join('node_modules', '@cucumber', 'cucumber', 'bin', 'cucumber.js');

let runArgs = ['--import', 'tsx', cukeBin, ...args];

if (isPartial && !hasExplicitConfig) {
  // Copy cucumber.json, swap the canonical message target → throwaway, run with that.
  const cfg = JSON.parse(fs.readFileSync('cucumber.json', 'utf8'));
  const profile = cfg.default ?? {};
  profile.format = (profile.format ?? []).map((f) =>
    typeof f === 'string' && f.startsWith('message:') ? `message:${THROWAWAY}` : f,
  );
  cfg.default = profile;
  fs.mkdirSync(path.dirname(THROWAWAY), { recursive: true });
  const tmpCfg = path.join('.dev-pomogator', '.tmp', 'cucumber.filtered.json');
  fs.writeFileSync(tmpCfg, JSON.stringify(cfg, null, 2));
  runArgs = ['--import', 'tsx', cukeBin, '--config', tmpCfg, ...args];
  process.stderr.write(
    `[run-bdd] ${isDryRun && !isFiltered ? 'dry-run' : 'filtered run'} → ${THROWAWAY} (canonical ${CANONICAL} left intact)\n`,
  );
}

const r = spawnSync(process.execPath, runArgs, { stdio: 'inherit' });

// ── Smart chunked run-history with timings (P28-1 / FR-52a) ──────────────────
// Archive EVERY run as a timestamped per-run chunk + one compact index line, so
// the clobber becomes a feature: no run is ever lost and the index gives timing
// trends over time. Full ndjson payloads rotate (keep the newest N); the index
// stays compact + long-lived. The full chunk preserves everything (incl. per-step
// timings + accurate pass/fail derivable later via the canonical ndjson parser).
const HISTORY_KEEP = 30;
try {
  // Only archive runs through the DEFAULT config: full → CANONICAL, filtered → THROWAWAY
  // (both targets known here). An explicit `-c` run writes its own target the wrapper can't
  // know, so skip it (those are scoped validation runs that already use a temp ndjson).
  const wrote = isPartial ? THROWAWAY : CANONICAL;
  if (!hasExplicitConfig && fs.existsSync(wrote)) {
    const HIST = path.join('.dev-pomogator', '.test-history');
    fs.mkdirSync(HIST, { recursive: true });
    const raw = fs.readFileSync(wrote, 'utf8');
    // Lightweight pass: total wall-clock duration + scenario count. (Pass/fail is
    // NOT re-derived here — that needs the worst-of-steps join; the chunk keeps the
    // full payload so counts stay accurate via the canonical parser when needed.)
    let started = null;
    let finished = null;
    let scenarios = 0;
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      let env;
      try {
        env = JSON.parse(line);
      } catch {
        continue;
      }
      if (env.testRunStarted?.timestamp) started = env.testRunStarted.timestamp;
      if (env.testRunFinished?.timestamp) finished = env.testRunFinished.timestamp;
      if (env.testCaseFinished) scenarios++;
    }
    const toMs = (t) => (t ? t.seconds * 1000 + Math.round((t.nanos ?? 0) / 1e6) : null);
    const durationMs = started && finished ? toMs(finished) - toMs(started) : null;
    const epoch = Date.now();
    const kind = isFiltered ? 'filtered' : isDryRun ? 'dry-run' : 'full';
    const chunkName = `run-${epoch}-${kind}.ndjson`;
    fs.copyFileSync(wrote, path.join(HIST, chunkName));
    const entry = {
      ts: new Date(epoch).toISOString(),
      epoch,
      kind,
      scenarios,
      durationMs,
      exit: r.status ?? null,
      file: chunkName,
    };
    fs.appendFileSync(path.join(HIST, 'index.ndjson'), JSON.stringify(entry) + '\n');
    // Rotate full payloads — keep the newest HISTORY_KEEP chunks (epoch is fixed-width
    // 13 digits → lexicographic sort == chronological). Index lines are never pruned.
    const chunks = fs
      .readdirSync(HIST)
      .filter((f) => f.startsWith('run-') && f.endsWith('.ndjson'))
      .sort();
    for (const old of chunks.slice(0, -HISTORY_KEEP)) {
      try {
        fs.unlinkSync(path.join(HIST, old));
      } catch {
        /* best-effort */
      }
    }
    process.stderr.write(
      `[run-bdd] archived ${kind} run → .test-history/${chunkName} (${scenarios} scenarios, ${durationMs ?? '?'}ms)\n`,
    );
  }
} catch (e) {
  process.stderr.write(`[run-bdd] history archive skipped: ${e?.message ?? e}\n`);
}

process.exit(r.status ?? 1);
