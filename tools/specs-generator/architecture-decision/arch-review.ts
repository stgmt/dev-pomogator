#!/usr/bin/env npx tsx
/**
 * Self-review driver for architecture-decision-builder. ONE command runs the whole
 * verification battery and emits a consolidated, severity-ranked verdict — so the
 * fix→verify→re-verify loop is a single command per iteration, not 10 manual ones.
 *
 * Usage: npx tsx arch-review.ts [spec-or-architecture-dir]
 *   - no arg  → skill-source health (eval-runner + spec validate + spec audit)
 *   - with arg → also audits a generated ARCHITECTURE dir (axes / completeness / markers)
 *
 * Exit 0 = PASS (clean), 1 = FINDINGS (loop should fix + re-run), 2 = driver error.
 * JSON to stdout; human summary to stderr.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO = process.cwd();
const CLI = 'tools/specs-generator/architecture-decision/architecture-decision-cli.ts';

// --spec <slug> generalizes the battery to ANY .specs/<slug>. Default architecture-decision-builder.
// eval-runner is architecture-specific → runs only for that slug.
const args = process.argv.slice(2);
const specIdx = args.indexOf('--spec');
const SLUG = specIdx >= 0 && args[specIdx + 1] ? args[specIdx + 1] : 'architecture-decision-builder';
const SPEC = `.specs/${SLUG}`;
const positional = args.filter((a, i) => a !== '--spec' && args[i - 1] !== '--spec');
const RUN_EVAL = SLUG === 'architecture-decision-builder';

interface Finding {
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
}
interface Check {
  name: string;
  ok: boolean;
  summary: string;
  findings: Finding[];
}

function run(cmd: string, args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(cmd, args, { encoding: 'utf-8', cwd: REPO, shell: process.platform === 'win32' });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// Accepted false-positives: a finding whose {check} (and optional {fr}) was logged here is
// downgraded to non-blocking. Stops the loop from thrashing on legit audit-spec false-positives
// (e.g. PARTIAL_IMPL matching the "Deferred" tier name). Anti-gaming: the log is human-auditable.
const ACCEPTED_LOG = '.claude/logs/arch-review-accepted.jsonl';
const accepted: { check: string; fr?: string }[] = [];
{
  const p = path.join(REPO, ACCEPTED_LOG);
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e.check) accepted.push({ check: e.check, fr: e.fr });
      } catch {
        /* skip */
      }
    }
  }
}
function isAccepted(code: string, message: string): boolean {
  return accepted.some((a) => a.check === code && (!a.fr || a.fr.split(',').some((f: string) => message.includes(f.trim()))));
}

const checks: Check[] = [];

// 1) eval-runner (deterministic skill behaviour) — architecture-decision-builder only
if (RUN_EVAL) {
  const r = run('python', ['tools/eval-runner-adb.py']);
  const m = r.stdout.match(/(\d+)\/(\d+) assertions passed/);
  const ok = r.code === 0 && !!m && m[1] === m[2];
  checks.push({
    name: 'eval-runner',
    ok,
    summary: m ? `${m[1]}/${m[2]} assertions` : 'no aggregate parsed',
    findings: ok ? [] : [{ code: 'EVAL_FAIL', severity: 'ERROR', message: m ? `${m[1]}/${m[2]} passed` : r.stderr.slice(0, 200) }],
  });
}

// 2) validate-spec (structure)
{
  const r = run('npx', ['tsx', 'tools/specs-generator/validate-spec.ts', '-Path', SPEC]);
  let errors = -1;
  try {
    errors = JSON.parse(r.stdout).summary.files_with_errors;
  } catch {
    /* parse fail */
  }
  checks.push({
    name: 'validate-spec',
    ok: errors === 0,
    summary: `files_with_errors=${errors}`,
    findings: errors > 0 ? [{ code: 'SPEC_INVALID', severity: 'ERROR', message: `${errors} file(s) with structural errors` }] : [],
  });
}

// 3) audit-spec (semantic — ERROR/WARNING only; INFO is noise)
{
  const r = run('npx', ['tsx', 'tools/specs-generator/audit-spec.ts', '-Path', SPEC]);
  const findings: Finding[] = [];
  let acceptedCount = 0;
  try {
    for (const f of JSON.parse(r.stdout).findings ?? []) {
      if (f.severity === 'ERROR' || f.severity === 'WARNING') {
        const msg = String(f.message).slice(0, 120);
        if (isAccepted(f.check, String(f.message))) {
          acceptedCount++;
          findings.push({ code: f.check, severity: 'INFO', message: `[accepted FP] ${msg}` });
        } else {
          findings.push({ code: f.check, severity: f.severity, message: msg });
        }
      }
    }
  } catch {
    /* parse fail */
  }
  const errs = findings.filter((f) => f.severity === 'ERROR');
  const warns = findings.filter((f) => f.severity === 'WARNING');
  checks.push({
    name: 'audit-spec',
    ok: errs.length === 0 && warns.length === 0,
    summary: `${errs.length} ERROR, ${warns.length} WARNING, ${acceptedCount} accepted-FP`,
    findings,
  });
}

// 4) generated-artefact audits (only if a dir is passed + has AXIS files)
const target = positional[0];
if (target && fs.existsSync(target) && fs.readdirSync(target).some((f) => /^AXIS-.*\.md$/.test(f))) {
  for (const cmd of ['audit', 'audit-completeness', 'audit-markers']) {
    const r = run('npx', ['tsx', CLI, cmd, target]);
    const findings: Finding[] = [];
    try {
      for (const f of JSON.parse(r.stdout).findings ?? []) {
        if (f.severity === 'WARNING' || f.severity === 'ERROR') {
          findings.push({ code: f.code, severity: f.severity, message: String(f.message).slice(0, 140) });
        }
      }
    } catch {
      /* parse fail */
    }
    checks.push({
      name: cmd,
      ok: findings.every((f) => f.severity !== 'ERROR') && !findings.some((f) => f.code === 'UNBACKED_VERIFIED_MARKER' || f.code === 'AXIS_PENDING' || f.code === 'DIMENSION_PENDING'),
      summary: `${findings.length} blocking finding(s)`,
      findings,
    });
  }
}

const allFindings = checks.flatMap((c) => c.findings);
const blocking = checks.filter((c) => !c.ok);
const verdict = blocking.length === 0 ? 'PASS' : 'FINDINGS';

process.stdout.write(JSON.stringify({ verdict, checks, finding_count: allFindings.length }, null, 2));
process.stderr.write(
  `\n=== arch-review [${SLUG}]: ${verdict} ===\n` +
    checks.map((c) => `  ${c.ok ? '✅' : '❌'} ${c.name}: ${c.summary}`).join('\n') +
    (blocking.length
      ? `\n\nTO FIX (${blocking.length} check(s)):\n` +
        blocking.flatMap((c) => c.findings.filter((f) => f.severity !== 'INFO').map((f) => `  [${f.severity}] ${c.name}/${f.code}: ${f.message}`)).join('\n')
      : '\n  all green — loop done') +
    '\n',
);
process.exit(verdict === 'PASS' ? 0 : 1);
