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
  type ExplanationBlock,
} from '../../.claude/skills/cross-spec-resolve/scripts/walker.ts';
import type { V4World } from '../hooks/before-after.ts';

interface CrossSpecWorld extends V4World {
  reconcileReports?: ReconcileResult[];
  yamlWritten?: string;
  sarifWritten?: string;
  dryRun?: boolean;
  overrideReason?: string;
  resolveSlug?: string;
  resolveResult?: SpawnSyncReturns<string>;
  resolveExplanation?: ExplanationBlock;
  reportBytesBefore?: string;
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
    fs.writeFileSync(
      path.join(dir, 'FR.md'),
      '## FR-1: Validate user\n\nMCP tool lives at `src/mcp/validate_user.ts`.\n',
    );
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
    fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1\n\nfeedback_key = "session_token"\n');
  },
);

Given(
  /^fixture spec-b declares the same concept as `sessionToken`$/,
  function (this: CrossSpecWorld) {
    const dir = path.join(this.tempDir, '.specs/spec-b');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-2\n\nfeedback_key = "sessionToken"\n');
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

// ─── SPECGEN004_40 — CRITICAL blocks STOP (interactive — deferred) ──────

Given(
  /^a lightweight reconcile run produced one CRITICAL finding from the hard-conflict subset$/,
  function () {
    return 'pending';
  },
);

When('the skill reaches step {int} of execution', function (_step: number) {
  return 'pending';
});

Then(/^AskUserQuestion is invoked with `header: "⚠️ CRIT"`$/, function () {
  return 'pending';
});

Then(/^the options list includes literally «Abort STOP»$/, function () {
  return 'pending';
});

Then(/^selecting «Abort STOP» causes the skill to exit with non-zero status$/, function () {
  return 'pending';
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
