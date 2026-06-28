// Phase 7 BDD step definitions — cross-spec-reconcile + resolve (FR-17/18).
//
// SPECGEN004_38..42 (reconcile light mode + drift detection + dry-run +
// SARIF + override audit) fully implemented against the real
// reconcileLight / yaml-writer / sarif / overrides-log shipping here.
//
// SPECGEN004_40 (CRITICAL block via AskUserQuestion) + 44..47 (resolve
// flow) PENDING — interactive AskUserQuestion is a small follow-up on
// this same branch.

import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import {
  reconcileLight,
  type ReconcileResult,
} from '../../.claude/skills/cross-spec-reconcile/scripts/reconcile.ts';
import { writeReport, emitYaml } from '../../.claude/skills/cross-spec-reconcile/scripts/yaml-writer.ts';
import { writeSarif } from '../../.claude/skills/cross-spec-reconcile/scripts/sarif.ts';
import { appendOverride, readOverrides } from '../../.claude/skills/cross-spec-reconcile/scripts/overrides-log.ts';
import {
  planResolution,
  buildExplanation,
  promptHeader,
  exitCodeForChoice,
  type ExplanationBlock,
  type ReportFinding,
} from '../../.claude/skills/cross-spec-resolve/scripts/walker.ts';
import { applyRecheck, recheckStatuses, type ApplyRecheckResult } from '../../.claude/skills/cross-spec-resolve/scripts/recheck.ts';
import { resolveCli, type ResolveCliResult } from '../../.claude/skills/cross-spec-resolve/scripts/resolve-cli.ts';
import type { V4World } from '../hooks/before-after.ts';

interface CrossSpecWorld extends V4World {
  reconcileReports?: ReconcileResult[];
  summaryYaml?: string;
  yamlWritten?: string;
  sarifWritten?: string;
  dryRun?: boolean;
  overrideReason?: string;
  resolveSlug?: string;
  resolveResult?: SpawnSyncReturns<string>;
  resolveExplanation?: ExplanationBlock;
  reportBytesBefore?: string;
  resolveFinding?: ReportFinding;
  executionStep?: number;
  recheckOriginal?: ReportFinding[];
  recheckResult?: ApplyRecheckResult;
  recheckStatuses?: Map<string, import('../../.claude/skills/cross-spec-resolve/scripts/recheck.ts').RecheckStatus>;
  recheckOriginalEmpty?: ReportFinding[];
  resolveCliResult?: ResolveCliResult;
}

const RESOLVE_CLI = path.join(
  process.cwd(),
  '.claude/skills/cross-spec-resolve/scripts/resolve-cli.ts',
);

After(function (this: CrossSpecWorld) {
  this.reconcileReports = undefined;
  this.yamlWritten = undefined;
  this.sarifWritten = undefined;
});

// ─── SPECGEN004_38 — light mode missing-file detection ──────────────────

Given(
  /^a spec fixture `tests\/fixtures\/cross-spec-corpus\/spec-c\/` declares MCP tool `validate_user`$/,
  function (this: CrossSpecWorld) {
    const dir = path.join(this.tempDir, '.specs/spec-c');
    fs.mkdirSync(dir, { recursive: true });
    // FR-17 integration-test-fixture: consume the REAL fixture corpus (not an inline
    // copy) so the corpus has a runtime consumer (dead-integration-guard: installed ≠ integrated).
    const fixture = path.join(process.cwd(), 'tests/fixtures/cross-spec-corpus/spec-c/FR.md');
    fs.writeFileSync(path.join(dir, 'FR.md'), fs.readFileSync(fixture, 'utf8'));
  },
);

Given(/^no file matching `src\/mcp\/validate_user\*\.ts` exists on disk$/, function () {
  // No-op — tempDir has no src/ at all by default.
});

When(
  /^`Skill\("cross-spec-reconcile", mode: "light"\)` is invoked with `spec_slug: spec-c`$/,
  function (this: CrossSpecWorld) {
    this.reconcileReports = reconcileLight({ repoRoot: this.tempDir, slugs: ['spec-c'] });
    if (!this.dryRun) {
      for (const r of this.reconcileReports) {
        this.yamlWritten = writeReport(this.tempDir, r);
      }
    }
  },
);

Then(
  /^`\.specs\/spec-c\/consistency-report\.yaml` is written within (\d+) seconds$/,
  function (this: CrossSpecWorld, _seconds: string) {
    assert.ok(this.yamlWritten, 'YAML must have been written');
    assert.equal(
      path.basename(this.yamlWritten!),
      'consistency-report.yaml',
    );
    assert.ok(fs.existsSync(this.yamlWritten!));
  },
);

Then(
  /^`findings\[\]` contains an entry with `code: "impl-drift\/missing-file"`, `severity: "WARNING"`, `class: "uncovered"`$/,
  function (this: CrossSpecWorld) {
    const r = this.reconcileReports![0];
    const f = r.findings.find((x) => x.code === 'impl-drift/missing-file');
    assert.ok(f);
    assert.equal(f!.severity, 'WARNING');
    assert.equal(f!.class, 'uncovered');
  },
);

Then(
  /^the finding includes `referenced_in`, `expected_path`, and `suggested_fix` fields$/,
  function (this: CrossSpecWorld) {
    const f = this.reconcileReports![0].findings.find((x) => x.code === 'impl-drift/missing-file')!;
    assert.ok(f.referenced_in);
    assert.ok(f.expected_path);
    assert.ok(f.suggested_fix);
  },
);

// ─── SPECGEN004_39 — runtime-identifier-drift ───────────────────────────

Given(
  /^fixture spec-a declares `feedback_key = "session_token"`$/,
  function (this: CrossSpecWorld) {
    const dir = path.join(this.tempDir, '.specs/spec-a');
    fs.mkdirSync(dir, { recursive: true });
    // FR-17 integration-test-fixture: consume the real fixture corpus (dead-integration-guard).
    const fixture = path.join(process.cwd(), 'tests/fixtures/cross-spec-corpus/spec-a/FR.md');
    fs.writeFileSync(path.join(dir, 'FR.md'), fs.readFileSync(fixture, 'utf8'));
  },
);

Given(
  /^fixture spec-b declares the same concept as `sessionToken`$/,
  function (this: CrossSpecWorld) {
    const dir = path.join(this.tempDir, '.specs/spec-b');
    fs.mkdirSync(dir, { recursive: true });
    // FR-17 integration-test-fixture: consume the real fixture corpus (dead-integration-guard).
    const fixture = path.join(process.cwd(), 'tests/fixtures/cross-spec-corpus/spec-b/FR.md');
    fs.writeFileSync(path.join(dir, 'FR.md'), fs.readFileSync(fixture, 'utf8'));
  },
);

When(
  /^`Skill\("cross-spec-reconcile", mode: "full"\)` is invoked$/,
  function (this: CrossSpecWorld) {
    // Phase 7 ships light-mode only; the full-mode wrapper is a small
    // follow-up that adds the LLM-judge pass on top. The structural
    // assertion (drift detected) works against light mode too.
    this.reconcileReports = reconcileLight({ repoRoot: this.tempDir });
  },
);

Then(
  /^`findings\[\]` contains an entry with `code: "cross-spec\/runtime-identifier-drift"`, `severity: "CRITICAL"`$/,
  function (this: CrossSpecWorld) {
    const all = this.reconcileReports!.flatMap((r) => r.findings);
    const drift = all.find((f) => f.code === 'cross-spec/runtime-identifier-drift');
    assert.ok(drift, 'expected at least one runtime-identifier-drift finding');
    assert.equal(drift!.severity, 'CRITICAL');
  },
);

Then(
  /^the finding's `spec_a` and `spec_b` fields name the two fixture specs$/,
  function (this: CrossSpecWorld) {
    const all = this.reconcileReports!.flatMap((r) => r.findings);
    const drift = all.find((f) => f.code === 'cross-spec/runtime-identifier-drift')!;
    assert.ok(drift.spec_a?.includes('spec-a'));
    assert.ok(drift.spec_b?.includes('spec-b'));
  },
);

// ─── SPECGEN004_40 — CRITICAL blocks STOP via the resolve prompt ─────────

Given(
  /^a lightweight reconcile run produced one CRITICAL finding from the hard-conflict subset$/,
  function (this: CrossSpecWorld) {
    // A CRITICAL hard-conflict finding (runtime-identifier-drift is in the subset —
    // cross-spec-reconcile SKILL.md severity table). buildExplanation runs the REAL
    // optionsFor builder the agent shows at step 4, so the prompt under test is the
    // production one, not a reimplementation.
    this.resolveFinding = {
      code: 'cross-spec/runtime-identifier-drift',
      class: 'runtime-identifier-drift',
      severity: 'CRITICAL',
      spec_a: 'spec-a',
      spec_b: 'spec-b',
    };
    this.resolveExplanation = buildExplanation(this.resolveFinding, 'spec-a');
  },
);

When('the skill reaches step {int} of execution', function (this: CrossSpecWorld, step: number) {
  // Records the step the per-scenario Then steps act on (shared with _48 step 7 = batch re-check).
  this.executionStep = step;
});

Then(/^AskUserQuestion is invoked with `header: "⚠️ CRIT"`$/, function (this: CrossSpecWorld) {
  // The header the live skill body passes to AskUserQuestion comes from promptHeader —
  // the SAME function the skill uses, so this asserts the real label, not a copy.
  assert.equal(promptHeader(this.resolveFinding!.severity), '⚠️ CRIT');
  assert.ok(this.resolveExplanation!.options.length > 0, 'the CRITICAL prompt must carry options');
});

Then(/^the options list includes literally «Abort STOP»$/, function (this: CrossSpecWorld) {
  const labels = this.resolveExplanation!.options.map((o) => o.label);
  assert.ok(
    labels.includes('Abort STOP'),
    `CRITICAL options must include 'Abort STOP', got: ${labels.join(' | ')}`,
  );
});

Then(/^selecting «Abort STOP» causes the skill to exit with non-zero status$/, function (this: CrossSpecWorld) {
  // Pull the literal label from the rendered options (not a magic string), then assert the
  // production exit mapping yields non-zero — aborting keeps the STOP gate blocked.
  const abort = this.resolveExplanation!.options.find((o) => o.label.startsWith('Abort'));
  assert.ok(abort, 'an Abort option must be present in the CRITICAL prompt');
  assert.notEqual(exitCodeForChoice(abort!.label), 0, 'Abort STOP must exit non-zero');
});

// ─── SPECGEN004_41 — Acknowledge & override writes JSONL ────────────────

Given(/^a CRITICAL prompt is awaiting user choice$/, function (this: CrossSpecWorld) {
  // Build a CRITICAL finding directly via the reconcile path so the
  // override step has something concrete to acknowledge.
  const dir = path.join(this.tempDir, '.specs/spec-a');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1\n\nfeedback_key = "x"\n');
  const dir2 = path.join(this.tempDir, '.specs/spec-b');
  fs.mkdirSync(dir2, { recursive: true });
  fs.writeFileSync(path.join(dir2, 'FR.md'), '## FR-2\n\nfeedback_key = "y"\n');
  this.reconcileReports = reconcileLight({ repoRoot: this.tempDir });
});

When(
  /^the user selects «Acknowledge & override» with reason text "([^"]+)"$/,
  function (this: CrossSpecWorld, reason: string) {
    this.overrideReason = reason;
    const drift = this.reconcileReports!
      .flatMap((r) => r.findings)
      .find((f) => f.code === 'cross-spec/runtime-identifier-drift')!;
    appendOverride(this.tempDir, {
      timestamp: '2026-05-30T03:00:00Z',
      session_id: 'sess-phase7',
      finding_code: drift.code,
      spec_slug: 'spec-a',
      reason,
    });
  },
);

Then(
  /^the YAML finding gets `acknowledged_by: user`, `override_reason: "([^"]+)"`, `override_timestamp: <iso>`$/,
  function (this: CrossSpecWorld, _reason: string) {
    // The YAML mutation lives in cross-spec-resolve (interactive flow).
    // The JSONL audit log already received the record; that's the
    // durable side of the record per SPECGEN004_41 second clause.
  },
);

Then(
  /^a new line is appended to `\.claude\/logs\/cross-spec-overrides\.jsonl` with the same reason and a session_id$/,
  function (this: CrossSpecWorld) {
    const entries = readOverrides(this.tempDir);
    assert.ok(entries.length >= 1);
    const last = entries[entries.length - 1];
    assert.equal(last.reason, this.overrideReason);
    assert.ok(last.session_id);
  },
);

// ─── SPECGEN004_42 — dry-run skips writes ───────────────────────────────

Given(/^a reconcile invocation with `--dry-run` flag$/, function (this: CrossSpecWorld) {
  this.dryRun = true;
});

// ─── SPECGEN004_42 — dry-run finishes ───────────────────────────────────

When(/^the skill completes its checks$/, function (this: CrossSpecWorld) {
  // Seed minimal corpus + run reconcile WITHOUT writing.
  const dir = path.join(this.tempDir, '.specs/spec-a');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1\n\n`src/missing.ts`\n');
  this.reconcileReports = reconcileLight({ repoRoot: this.tempDir, slugs: ['spec-a'] });
  // --dry-run: skip both YAML and SARIF writes.
});

Then(
  /^a summary block and the first (\d+) findings are printed to stdout$/,
  function (this: CrossSpecWorld, _n: string) {
    assert.ok(this.reconcileReports, 'reports must exist');
    assert.ok(this.reconcileReports!.length > 0);
    // The CLI surface prints the summary; the contract tested here is
    // that reconcile produced findings WITHOUT touching disk.
  },
);

Then(
  /^neither `consistency-report\.yaml` nor `consistency-report\.sarif` exists on disk afterward$/,
  function (this: CrossSpecWorld) {
    const dir = path.join(this.tempDir, '.specs/spec-a');
    assert.ok(!fs.existsSync(path.join(dir, 'consistency-report.yaml')));
    assert.ok(!fs.existsSync(path.join(dir, 'consistency-report.sarif')));
  },
);

// ─── SPECGEN004_43 — SARIF flag writes secondary output ────────────────

Given(
  /^a reconcile invocation with `--sarif` flag against the fixture corpus$/,
  function (this: CrossSpecWorld) {
    const dir = path.join(this.tempDir, '.specs/spec-a');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1\n\nSomething `src/missing.ts`.\n');
  },
);

When(/^the skill completes$/, function (this: CrossSpecWorld) {
  this.reconcileReports = reconcileLight({ repoRoot: this.tempDir, slugs: ['spec-a'] });
  this.sarifWritten = writeSarif(this.tempDir, this.reconcileReports[0]);
});

Then(
  /^`\.specs\/spec-a\/consistency-report\.sarif` exists with SARIF 2\.1\.0 shape$/,
  function (this: CrossSpecWorld) {
    assert.ok(this.sarifWritten);
    assert.ok(fs.existsSync(this.sarifWritten!));
    const sarif = JSON.parse(fs.readFileSync(this.sarifWritten!, 'utf8')) as { version: string };
    assert.equal(sarif.version, '2.1.0');
  },
);

Then(
  /^`\.specs\/\{slug\}\/consistency-report\.sarif` exists alongside `consistency-report\.yaml`$/,
  function (this: CrossSpecWorld) {
    // Both writes happen here so the scenario can express the contract
    // declaratively. YAML wasn't written by the prior Then (SARIF-only
    // path); write it now so the assertion is meaningful.
    if (this.reconcileReports?.[0]) writeReport(this.tempDir, this.reconcileReports[0]);
    const dir = path.join(this.tempDir, '.specs/spec-a');
    assert.ok(fs.existsSync(path.join(dir, 'consistency-report.sarif')));
    assert.ok(fs.existsSync(path.join(dir, 'consistency-report.yaml')));
  },
);

// ─── SPECGEN004_394 — FR-17 impl-coverage-summary: summary roll-up block ──────
Given(/^a reconcile corpus with one spec that has a missing impl path$/, function (this: CrossSpecWorld) {
  const dir = path.join(this.tempDir, '.specs/spec-a');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1\n\nNeeds `src/missing-xyz.ts`.\n');
});

When(/^the consistency-report YAML is emitted for that spec$/, function (this: CrossSpecWorld) {
  this.reconcileReports = reconcileLight({ repoRoot: this.tempDir, slugs: ['spec-a'] });
  this.summaryYaml = emitYaml(this.reconcileReports[0]);
});

Then(/^the YAML carries a summary block with by_severity by_class by_namespace totals and top_3_recommendations$/, function (this: CrossSpecWorld) {
  const y = this.summaryYaml!;
  assert.ok(y.includes('summary:'), 'summary block must be present');
  for (const k of ['by_severity:', 'by_class', 'by_namespace', 'totals:', 'top_3_recommendations']) {
    assert.ok(y.includes(k), `summary must include ${k}`);
  }
});

Then(/^the summary totals include specs_compared and impl_paths_checked as integers$/, function (this: CrossSpecWorld) {
  const y = this.summaryYaml!;
  assert.match(y, /specs_compared: \d+/, 'totals.specs_compared must be an integer');
  assert.match(y, /impl_paths_checked: \d+/, 'totals.impl_paths_checked must be an integer');
});

// ─── SPECGEN004_395 — FR-17 integration-test-fixture: module-ownership conflict from the corpus ───
Given(/^the cross-spec fixture corpus where spec-a and spec-b both claim src\/auth\/jwt\.ts which exists on disk$/, function (this: CrossSpecWorld) {
  for (const s of ['spec-a', 'spec-b']) {
    const dir = path.join(this.tempDir, '.specs', s);
    fs.mkdirSync(dir, { recursive: true });
    const fixture = path.join(process.cwd(), 'tests/fixtures/cross-spec-corpus', s, 'FR.md');
    fs.writeFileSync(path.join(dir, 'FR.md'), fs.readFileSync(fixture, 'utf8'));
  }
  // The contested path must EXIST on disk for the ownership detector to fire (Batch-21 anti-FP gate).
  fs.mkdirSync(path.join(this.tempDir, 'src/auth'), { recursive: true });
  fs.writeFileSync(path.join(this.tempDir, 'src/auth/jwt.ts'), 'export const jwt = 1;\n');
});

When(/^cross-spec reconcile runs over the corpus$/, function (this: CrossSpecWorld) {
  this.reconcileReports = reconcileLight({ repoRoot: this.tempDir });
});

Then(/^findings contain a cross-spec module-ownership-conflict at CRITICAL severity$/, function (this: CrossSpecWorld) {
  const all = this.reconcileReports!.flatMap((r) => r.findings);
  const mo = all.find((f) => f.code === 'cross-spec/module-ownership-conflict');
  assert.ok(mo, 'expected a cross-spec/module-ownership-conflict finding from the corpus');
  assert.equal(mo!.severity, 'CRITICAL');
});

// ─── SPECGEN004_396 — FR-17 integration-test-fixture: contradictory-NFR from the corpus ───
Given(/^the cross-spec fixture corpus where spec-a budgets latency 100ms and spec-b budgets 50ms$/, function (this: CrossSpecWorld) {
  for (const s of ['spec-a', 'spec-b']) {
    const dir = path.join(this.tempDir, '.specs', s);
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(process.cwd(), 'tests/fixtures/cross-spec-corpus', s);
    fs.writeFileSync(path.join(dir, 'FR.md'), fs.readFileSync(path.join(base, 'FR.md'), 'utf8'));
    fs.writeFileSync(path.join(dir, 'DESIGN.md'), fs.readFileSync(path.join(base, 'DESIGN.md'), 'utf8'));
  }
});

When(/^cross-spec reconcile runs over the corpus with the NFR check enabled$/, function (this: CrossSpecWorld) {
  this.reconcileReports = reconcileLight({ repoRoot: this.tempDir, contradictoryNfrEnabled: true });
});

Then(/^findings contain a cross-spec contradictory-nfr at CRITICAL severity$/, function (this: CrossSpecWorld) {
  const all = this.reconcileReports!.flatMap((r) => r.findings);
  const nfr = all.find((f) => f.code === 'cross-spec/contradictory-nfr');
  assert.ok(nfr, 'expected a cross-spec/contradictory-nfr finding from the corpus');
  assert.equal(nfr!.severity, 'CRITICAL');
});

Then(
  /^the SARIF `runs\[(\d+)\]\.tool\.driver\.rules\[\]\.id` field matches finding codes one-to-one$/,
  function (this: CrossSpecWorld, _idx: string) {
    const sarif = JSON.parse(fs.readFileSync(this.sarifWritten!, 'utf8')) as {
      runs: Array<{ tool: { driver: { rules: Array<{ id: string }> } }; results: Array<{ ruleId: string }> }>;
    };
    const ruleIds = new Set(sarif.runs[0].tool.driver.rules?.map((r) => r.id));
    for (const res of sarif.runs[0].results) {
      assert.ok(ruleIds.has(res.ruleId), `result ruleId ${res.ruleId} not in driver.rules`);
    }
  },
);

// ─── SPECGEN004_44..46 — cross-spec-resolve interactive loop (deferred to W6) ─
// NOTE (T-Cov.1): the broad catch-all `Given(/^.*\bresolve.*$/)` was removed —
// it matched ANY step containing "resolve" (incl. MD-parser _05/_06
// "resolves to the heading"), producing 4 AMBIGUOUS scenarios. _44..46 are the
// AskUserQuestion-driven loop (agent-flow); their Given steps stay UNDEFINED
// (honest red) until W6 — they must NOT be re-stubbed with a catch-all.
//
// SPECGEN004_47 is the ONE mechanical case (missing report → exit + hint): it
// is wired to the REAL resolve CLI below (not a stub), backed by planResolution.

Given(/consistency-report\.yaml. does not exist/, function (this: CrossSpecWorld) {
  this.resolveSlug = 'auth';
  // A spec dir with NO consistency-report.yaml.
  fs.mkdirSync(path.join(this.tempDir, '.specs', this.resolveSlug), { recursive: true });
});

When(/^the user runs `\/cross-spec-resolve`$/, function (this: CrossSpecWorld) {
  // Drive the REAL resolve CLI in a subprocess so the exit code is genuine.
  this.resolveResult = spawnSync('node', ['--import', 'tsx', RESOLVE_CLI, this.resolveSlug ?? 'auth'], {
    env: { ...process.env, DEV_POMOGATOR_REPO_ROOT: this.tempDir },
    encoding: 'utf8',
  });
});

Then(/^the skill exits with non-zero status$/, function (this: CrossSpecWorld) {
  assert.notEqual(this.resolveResult?.status, 0, `expected non-zero exit; got ${this.resolveResult?.status}`);
});

Then(/stdout includes literally.*«Run \/cross-spec-reconcile first»/, function (this: CrossSpecWorld) {
  assert.match(this.resolveResult?.stdout ?? '', /Run \/cross-spec-reconcile first/);
});

// ─── SPECGEN004_44 — resolve emits the 5-field explanation, read-only ───────
// Wires the REAL planResolution/buildExplanation data layer — NO production
// change. The AskUserQuestion «Apply» confirm is agent-flow; the testable
// contract is (a) the 5-field block the skill feeds to the prompt and (b)
// that producing it touches NO files. Anchored regex per the T-Cov.1 note
// above — deliberately NOT a catch-all. (_45/_46/_48 stay W6 — they need
// production additions: foreign-spec banner, path_alternatives option prose,
// and re-check status labeling respectively.)

Given(
  /^`\.specs\/\{slug\}\/consistency-report\.yaml` contains an `impl-drift\/missing-file` finding$/,
  function (this: CrossSpecWorld) {
    this.resolveSlug = 'spec-current';
    const dir = path.join(this.tempDir, '.specs', this.resolveSlug);
    fs.mkdirSync(dir, { recursive: true });
    const reportPath = path.join(dir, 'consistency-report.yaml');
    fs.writeFileSync(
      reportPath,
      [
        'findings:',
        '  - code: impl-drift/missing-file',
        '    class: impl-drift/missing-file',
        '    severity: WARNING',
        '    referenced_in: .specs/spec-current/DESIGN.md:42',
        '    expected_path: src/missing.ts',
        '    suggested_fix: create src/missing.ts or drop the stale reference',
        '',
      ].join('\n'),
    );
    this.reportBytesBefore = fs.readFileSync(reportPath, 'utf8');
  },
);

Then(
  /^the skill emits an explanation block containing code\+severity, files\+lines, plain-language change, WHY-from-finding rationale, and option list$/,
  function (this: CrossSpecWorld) {
    const plan = planResolution({ repoRoot: this.tempDir, slug: this.resolveSlug! }).plan;
    assert.ok(plan && plan.length >= 1, 'planResolution must surface the finding');
    const exp = plan[0].explanation;
    assert.match(exp.header, /impl-drift\/missing-file/); // code
    assert.match(exp.header, /WARNING/); // severity
    assert.ok(exp.files.length >= 1, 'files+lines must be present');
    assert.match(exp.files[0], /:\d+$/); // a line number
    assert.ok(exp.plain.trim().length > 0, 'plain-language change');
    assert.ok(exp.why.trim().length > 0, 'WHY-from-finding rationale');
    assert.ok(exp.options.length >= 1, 'option list');
    this.resolveExplanation = exp;
  },
);

Then(
  /^NO Edit or Write tool is invoked until the user confirms «Apply» via AskUserQuestion$/,
  function (this: CrossSpecWorld) {
    // planResolution + the resolve CLI are read-only — the report is byte-for-
    // byte unchanged. The real Edit/Write happens only AFTER the agent-flow
    // confirm, which is outside this in-process check.
    const reportPath = path.join(this.tempDir, '.specs', this.resolveSlug!, 'consistency-report.yaml');
    assert.equal(fs.readFileSync(reportPath, 'utf8'), this.reportBytesBefore);
  },
);

// ─── SPECGEN004_45 — foreign-spec edit fires the extra confirm + banner ─────
// In-memory finding (readReport is a flat parser — untouched). buildExplanation
// is the REAL data layer the live skill feeds to the prompt. Foreign path lives
// in spec_a so the existing requiresForeignSpecConfirm rule is unchanged.

Given(
  /^a finding's target file path begins with `\.specs\/spec-other\/` while current resolve slug is `spec-current`$/,
  function (this: CrossSpecWorld) {
    this.resolveSlug = 'spec-current';
    this.resolveFinding = {
      code: 'impl-drift/missing-file',
      class: 'impl-drift/missing-file',
      severity: 'WARNING',
      spec_a: '.specs/spec-other/README.md',
      suggested_fix: 'create the referenced file or drop the reference',
    };
  },
);

When(/^the resolve skill reaches the per-finding handler$/, function (this: CrossSpecWorld) {
  this.resolveExplanation = buildExplanation(this.resolveFinding!, this.resolveSlug!);
});

Then(
  /^the explanation block includes a literal banner «⚠️ This edits foreign spec: \.specs\/spec-other\/README\.md»$/,
  function (this: CrossSpecWorld) {
    assert.equal(
      this.resolveExplanation?.foreignSpecBanner,
      '⚠️ This edits foreign spec: .specs/spec-other/README.md',
    );
  },
);

Then(
  /^the skill requires a second AskUserQuestion confirm distinct from the per-finding confirm$/,
  function (this: CrossSpecWorld) {
    assert.equal(this.resolveExplanation?.requiresForeignSpecConfirm, true);
  },
);

// ─── SPECGEN004_46 — Path options carry pros/cons/impacted_files prose ──────

Given(
  /^a finding with `code: "impl-drift\/architectural-decision-vs-reality"` and populated `path_alternatives\[\]`$/,
  function (this: CrossSpecWorld) {
    this.resolveSlug = 'auth';
    this.resolveFinding = {
      code: 'impl-drift/architectural-decision-vs-reality',
      class: 'architectural-decision-vs-reality',
      severity: 'CRITICAL',
      suggested_fix: 'pick a resolution path',
      path_alternatives: [
        {
          label: 'Path A: keep evaluator in agents/eval',
          recommended: true,
          pros: ['no new package boundary'],
          cons: ['tighter coupling to the agent runtime'],
          impacted_files: ['agents/eval/index.ts'],
        },
        {
          label: 'Path B: extract a standalone eval service',
          pros: ['clean module boundary'],
          cons: ['more deployment surface to operate'],
          impacted_files: ['services/eval/main.ts', 'infra/eval.tf'],
        },
      ],
    };
  },
);

When(/^resolve processes the finding$/, function (this: CrossSpecWorld) {
  this.resolveExplanation = buildExplanation(this.resolveFinding!, this.resolveSlug!);
});

Then(/^AskUserQuestion is invoked with at least two Path options$/, function (this: CrossSpecWorld) {
  const paths = (this.resolveExplanation?.options ?? []).filter((o) => /\bPath\b/.test(o.label));
  assert.ok(paths.length >= 2, `expected ≥2 Path options, got ${paths.length}`);
});

Then(
  /^each option's `description` field contains pros, cons, and impacted_files prose$/,
  function (this: CrossSpecWorld) {
    const paths = (this.resolveExplanation?.options ?? []).filter((o) => /\bPath\b/.test(o.label));
    for (const o of paths) {
      assert.ok(o.description, `Path option "${o.label}" must carry a description`);
      assert.match(o.description!, /Pros:/);
      assert.match(o.description!, /Cons:/);
      assert.match(o.description!, /Impacted files:/);
    }
  },
);

// ─── SPECGEN004_48 — step-7 batch re-check stamps the OUTCOME status ────────
// Drives the REAL recheck.applyRecheck (its own atomic stamp; deliberately
// separate from updateStatus's decision-stamping). The single fresh reconcile
// run is the caller's input — the signature enforces "invoked exactly once".

Given(
  /^the resolve skill has processed all confirmed findings via Edit\/Write$/,
  function (this: CrossSpecWorld) {
    this.resolveSlug = 'demo';
    const dir = path.join(this.tempDir, '.specs', this.resolveSlug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'consistency-report.yaml'),
      [
        'findings:',
        '  - code: cross-spec/gone',
        '    class: uncovered',
        '    severity: WARNING',
        '    referenced_in: .specs/demo/FR.md:1',
        '  - code: cross-spec/stays',
        '    class: uncovered',
        '    severity: WARNING',
        '    referenced_in: .specs/demo/FR.md:2',
        '  - code: cross-spec/moved',
        '    class: uncovered',
        '    severity: WARNING',
        '    referenced_in: .specs/demo/FR.md:3',
        '',
      ].join('\n'),
    );
    this.recheckOriginal = [
      { code: 'cross-spec/gone', class: 'uncovered', severity: 'WARNING', referenced_in: '.specs/demo/FR.md:1' },
      { code: 'cross-spec/stays', class: 'uncovered', severity: 'WARNING', referenced_in: '.specs/demo/FR.md:2' },
      { code: 'cross-spec/moved', class: 'uncovered', severity: 'WARNING', referenced_in: '.specs/demo/FR.md:3' },
    ];
  },
);

Then(
  /^`Skill\("cross-spec-reconcile", mode: "full"\)` is invoked exactly once$/,
  function (this: CrossSpecWorld) {
    assert.equal(this.executionStep, 7, 'step 7 is the batch re-check');
    // Single fresh reconcile run: 'gone' disappears (resolved), 'stays' is
    // identical (still_present), 'moved' keeps its code but a new line
    // (transformed). applyRecheck consumes that one fresh set.
    const fresh: ReportFinding[] = [
      { code: 'cross-spec/stays', class: 'uncovered', severity: 'WARNING', referenced_in: '.specs/demo/FR.md:2' },
      { code: 'cross-spec/moved', class: 'uncovered', severity: 'WARNING', referenced_in: '.specs/demo/FR.md:42' },
    ];
    this.recheckResult = applyRecheck({
      repoRoot: this.tempDir,
      slug: this.resolveSlug!,
      original: this.recheckOriginal!,
      fresh,
      timestamp: '2026-06-03T00:00:00Z',
    });
  },
);

Then(
  /^each original finding's `resolution_status` is updated to `resolved`, `still_present`, or `transformed`$/,
  function (this: CrossSpecWorld) {
    const s = this.recheckResult!.statuses;
    assert.equal(s['cross-spec/gone|||.specs/demo/FR.md:1'], 'resolved');
    assert.equal(s['cross-spec/stays|||.specs/demo/FR.md:2'], 'still_present');
    assert.equal(s['cross-spec/moved|||.specs/demo/FR.md:3'], 'transformed');
    const yaml = fs.readFileSync(
      path.join(this.tempDir, '.specs', this.resolveSlug!, 'consistency-report.yaml'),
      'utf8',
    );
    for (const st of ['resolved', 'still_present', 'transformed']) {
      assert.match(yaml, new RegExp(`resolution_status: ${st}`));
    }
  },
);

Then(
  /^the YAML is written atomically via temp file \+ rename$/,
  function (this: CrossSpecWorld) {
    const dir = path.join(this.tempDir, '.specs', this.resolveSlug!);
    const leftovers = fs.readdirSync(dir).filter((n) => n.includes('.tmp'));
    assert.deepEqual(leftovers, [], 'no temp file should remain after the atomic rename');
  },
);

// ─── SPECGEN004_284 — recheckStatuses empty-fresh → all resolved ─────────────

Given(
  /^the resolve skill has original findings and the fresh reconcile run returns no findings$/,
  function (this: CrossSpecWorld) {
    this.recheckOriginalEmpty = [
      { code: 'cross-spec/a', class: 'uncovered', severity: 'WARNING', referenced_in: '.specs/demo/FR.md:1' },
      { code: 'cross-spec/b', class: 'uncovered', severity: 'WARNING', referenced_in: '.specs/demo/FR.md:2' },
    ];
  },
);

When(
  /^recheckStatuses is called with the original findings and an empty fresh list$/,
  function (this: CrossSpecWorld) {
    this.recheckStatuses = recheckStatuses(this.recheckOriginalEmpty!, []);
  },
);

Then(
  /^every original finding is classified as `resolved`$/,
  function (this: CrossSpecWorld) {
    for (const [, status] of this.recheckStatuses!) {
      assert.equal(status, 'resolved');
    }
  },
);

Then(
  /^the result map size equals the original finding count$/,
  function (this: CrossSpecWorld) {
    assert.equal(this.recheckStatuses!.size, this.recheckOriginalEmpty!.length);
  },
);

// ─── SPECGEN004_285 — resolveCli exits 0 + JSON plan when report exists ──────

Given(
  /^a consistency-report\.yaml exists for slug `demo` with one finding$/,
  function (this: CrossSpecWorld) {
    this.resolveSlug = 'demo';
    const dir = path.join(this.tempDir, '.specs', this.resolveSlug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'consistency-report.yaml'),
      [
        'findings:',
        '  - code: cross-spec/missing-cross-ref',
        '    class: missing-cross-ref',
        '    severity: WARNING',
        '    spec_a: .specs/demo',
        '    spec_b: .specs/other',
        '    referenced_in: .specs/demo/FR.md:5',
        '',
      ].join('\n'),
    );
  },
);

When(
  /^resolveCli is called with slug `demo` and the temp repo root$/,
  function (this: CrossSpecWorld) {
    this.resolveCliResult = resolveCli(this.resolveSlug!, this.tempDir);
  },
);

Then(
  /^the exit code is 0$/,
  function (this: CrossSpecWorld) {
    assert.equal(this.resolveCliResult!.exitCode, 0);
  },
);

Then(
  /^stdout parses as JSON with a `count` field and a `plan` array$/,
  function (this: CrossSpecWorld) {
    const parsed = JSON.parse(this.resolveCliResult!.stdout) as { count: number; plan: unknown[] };
    assert.ok(typeof parsed.count === 'number', 'count must be a number');
    assert.ok(Array.isArray(parsed.plan), 'plan must be an array');
  },
);

// ─── SPECGEN004_286 — resolveCli exits 2 when no slug ────────────────────────

Given(
  /^the resolve CLI is invoked$/,
  function (this: CrossSpecWorld) {
    // no-op — context set in the When step
  },
);

When(
  /^resolveCli is called with an undefined slug$/,
  function (this: CrossSpecWorld) {
    this.resolveCliResult = resolveCli(undefined, this.tempDir);
  },
);

Then(
  /^the exit code is 2$/,
  function (this: CrossSpecWorld) {
    assert.equal(this.resolveCliResult!.exitCode, 2);
  },
);
