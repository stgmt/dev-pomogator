#!/usr/bin/env -S node --import tsx
/**
 * observe — one "where did the agent stumble" view over dev-pomogator's scattered
 * runtime signals (WS-D / FR-32 observability). Reads files ONLY (no SpecGraph build,
 * no @cucumber/gherkin) so it is dep-safe to ship in the plugin — see
 * `.claude/rules/testing/dead-integration-guard.md` (a graph-building observer would
 * crash for users with no node_modules, the exact class WS-E just fixed).
 *
 * Sources, each summarised: escape-hatch logs (gates bypassed → gaming signal), the
 * last BDD run (red/pending/undefined), the self-improve ledger (pending friction),
 * and any `*.log` errors. Human table by default; `--json` for machines.
 *
 *   node --import tsx tools/observability/observe.ts [--json]
 *
 * @see .claude/skills/observability-review/SKILL.md
 * @see .specs/spec-generator-v4/FR.md FR-32
 */
import fs from 'node:fs';
import path from 'node:path';

interface EscapeLog { file: string; count: number; recent: string[] }
interface Report {
  escapes: EscapeLog[];
  lastRun: { source: string; passed: number; failed: number; pending: number; undefined: number; ambiguous: number } | null;
  selfImprove: { file: string; pending: number; applied: number } | null;
  logErrors: Array<{ file: string; errors: number; lastLine: string }>;
}

const repoRoot = process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();
const read = (p: string): string | null => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const listFiles = (dir: string, suffix: string): string[] => {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith(suffix)).map((f) => path.join(dir, f)); } catch { return []; }
};

/** Escape-hatch JSONL logs (`.claude/logs/*-escapes.jsonl`) — every gate bypass, with reasons. */
function readEscapes(): EscapeLog[] {
  const dir = path.join(repoRoot, '.claude', 'logs');
  return listFiles(dir, '-escapes.jsonl').map((file) => {
    const lines = (read(file) ?? '').split('\n').filter((l) => l.trim());
    const recent = lines.slice(-3).map((l) => { try { return (JSON.parse(l).reason ?? '?').slice(0, 60); } catch { return '?'; } });
    return { file: path.relative(repoRoot, file), count: lines.length, recent };
  }).filter((e) => e.count > 0);
}

/** Last BDD run summary from the cucumber NDJSON (`.dev-pomogator/.last-test-run.ndjson`). */
function readLastRun(): Report['lastRun'] {
  const file = path.join(repoRoot, '.dev-pomogator', '.last-test-run.ndjson');
  const raw = read(file);
  if (!raw) return null;
  const c = { passed: 0, failed: 0, pending: 0, undefined: 0, ambiguous: 0 };
  for (const m of raw.matchAll(/"status":"(PASSED|FAILED|PENDING|UNDEFINED|AMBIGUOUS)"/g)) {
    const k = m[1].toLowerCase() as keyof typeof c;
    c[k]++;
  }
  return { source: '.dev-pomogator/.last-test-run.ndjson', ...c };
}

/** The self-improve ledger — pending (un-applied) friction entries the agent recorded. */
function readSelfImprove(): Report['selfImprove'] {
  for (const rel of ['.specs/spec-generator-v4/SELF_IMPROVE.md', 'SELF_IMPROVE.md']) {
    const raw = read(path.join(repoRoot, rel));
    if (raw) {
      const pending = (raw.match(/status[":\s]*['"]?pending/gi) ?? []).length;
      const applied = (raw.match(/status[":\s]*['"]?applied/gi) ?? []).length;
      return { file: rel, pending, applied };
    }
  }
  return null;
}

/** `*.log` files under `.dev-pomogator/` — error-line counts + the latest line. */
function readLogErrors(): Report['logErrors'] {
  const out: Report['logErrors'] = [];
  for (const dir of [path.join(repoRoot, '.dev-pomogator', 'logs'), path.join(repoRoot, '.dev-pomogator')]) {
    for (const file of listFiles(dir, '.log')) {
      const lines = (read(file) ?? '').split('\n').filter((l) => l.trim());
      const errors = lines.filter((l) => /\b(error|fail|fatal|stall|❌)\b/i.test(l)).length;
      if (errors > 0) out.push({ file: path.relative(repoRoot, file), errors, lastLine: (lines[lines.length - 1] ?? '').slice(0, 80) });
    }
  }
  return out;
}

function build(): Report {
  return { escapes: readEscapes(), lastRun: readLastRun(), selfImprove: readSelfImprove(), logErrors: readLogErrors() };
}

function human(r: Report): string {
  const out: string[] = ['# observe — where did the agent stumble?', ''];
  out.push('## Escape hatches (gates bypassed — gaming signal)');
  out.push(r.escapes.length ? r.escapes.map((e) => `  ${e.file}: ${e.count} escape(s) — recent: ${e.recent.join(' | ')}`).join('\n') : '  (none — no gate bypassed)');
  out.push('', '## Last BDD run');
  out.push(r.lastRun ? `  passed ${r.lastRun.passed} | failed ${r.lastRun.failed} | pending ${r.lastRun.pending} | undefined ${r.lastRun.undefined} | ambiguous ${r.lastRun.ambiguous}` : '  (no .last-test-run.ndjson)');
  out.push('', '## Self-improve ledger');
  out.push(r.selfImprove ? `  ${r.selfImprove.file}: ${r.selfImprove.pending} pending, ${r.selfImprove.applied} applied` : '  (no ledger)');
  out.push('', '## Log errors');
  out.push(r.logErrors.length ? r.logErrors.map((l) => `  ${l.file}: ${l.errors} error line(s) — last: ${l.lastLine}`).join('\n') : '  (no error lines in .dev-pomogator logs)');
  const stumbles = r.escapes.reduce((n, e) => n + e.count, 0) + (r.lastRun ? r.lastRun.failed + r.lastRun.undefined : 0) + (r.selfImprove?.pending ?? 0) + r.logErrors.reduce((n, l) => n + l.errors, 0);
  out.push('', `## Verdict: ${stumbles === 0 ? '🟢 clean — no stumbles surfaced' : `🟡 ${stumbles} stumble-signal(s) — review above`}`);
  return out.join('\n');
}

const report = build();
process.stdout.write(process.argv.includes('--json') ? JSON.stringify(report, null, 2) + '\n' : human(report) + '\n');
