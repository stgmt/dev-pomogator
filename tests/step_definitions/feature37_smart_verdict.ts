/**
 * @feature37 step definitions — smart verdict authoritative (FR-37), bound to
 * the REAL verdict entrypoint (no mocks). Built incrementally per Phase-14:
 *   97 → FR-37e  a stale FILE_CHANGES path fails the authoritative verdict
 *   (96 → FR-37a, 98 → FR-37b, 99/100 → FR-37c, 101 → FR-37d land with
 *    P14-2..P14-4 — their steps stay undefined until those tasks ship.)
 *
 * Integration discipline: the When step drives `runSpecVerdict()` — which
 * spawns the real `specs-generator-core.mjs` validate-spec + audit-spec —
 * against a temp fixture spec, NOT a hand-built findings array.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_96..101
 * @see .specs/spec-generator-v4/FR.md FR-37
 * @see tools/specs-generator/spec-verdict.ts
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { renderVerdict, runSpecVerdict, verdictExitCode, type SpecVerdictResult } from '../../tools/specs-generator/spec-verdict.ts';
import { buildGraphFromCwd } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { checkTraceabilityCompleteness } from '../../tools/spec-graph/traceability.ts';
import { setEntityStatus, type SetStatusResult } from '../../tools/spec-mcp-server/set-status.ts';
import { validateSpecChange, type ValidateResult } from '../../tools/spec-mcp-server/mutations.ts';
import { computeTaskCensus } from '../../tools/spec-graph/task-census.ts';
import { readRuleContentForAdaptation } from '../../tools/carl/context-diet.ts';
import { writeScenarioOverlayFromNdjson } from '../../scripts/bdd-overlay.mjs';

interface F37World extends V4World {
  stalePath?: string;
  verdictSpecPath?: string;
  verdictCwd?: string;
  verdictResult?: SpecVerdictResult;
  /** FR-8 semantic controls for the shared When (SPECGEN004_99/_100). */
  verdictSemantic?: boolean;
  verdictJudgeSpawn?: (prompt: string) => Promise<string>;
  savedClaudeBin?: string | undefined;
  verdictText?: string;
  mcpStatusPayload?: {
    lifecycle: string;
    gaps: Record<string, number>;
    execution_gaps: { SCENARIO_NOT_RUN: number; scenario_ids: string[]; FR_NOT_EXECUTION_VERIFIED: number; fr_ids: string[] };
    coverage: { totals: Record<string, number>; task_verification: Record<string, { verified_status: string; scenarios: string[]; truth_issues?: Array<{ code: string; message: string }> }> };
    hint: string;
  };
  setStatusResult?: SetStatusResult;
  applyStatusResult?: ValidateResult;
  censusRow?: { open: number; doneRed: number; doneUnrun: number };
  canonicalBefore?: string | null;
}

// ── SPECGEN004_97 — FR-37e: a stale FILE_CHANGES path fails the verdict ──

Given('a FILE_CHANGES path that does not exist on disk', function (this: F37World) {
  // Fixture corpus in the scenario temp workspace: one spec whose
  // FILE_CHANGES.md has an action=edit row pointing at a deleted path —
  // the exact shape of the 9 real `extensions/…` P0s this FR closes.
  this.stalePath = 'extensions/old-extension/tools/gone.ts';
  const specDir = path.join(this.tempDir, '.specs', 'stale-demo');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, 'FILE_CHANGES.md'),
    [
      '# File Changes',
      '',
      '| Path | Action | Reason |',
      '|------|--------|--------|',
      `| \`${this.stalePath}\` | edit | path deleted by the canonical-plugin migration |`,
      '',
    ].join('\n'),
    'utf-8',
  );
  this.verdictSpecPath = path.join('.specs', 'stale-demo');
  this.verdictCwd = this.tempDir;
});

When('the authoritative verdict runs', async function (this: F37World) {
  assert.ok(this.verdictSpecPath, 'no spec prepared for the verdict (Given step missing?)');
  try {
    this.verdictResult = await runSpecVerdict(this.verdictSpecPath, {
      cwd: this.verdictCwd,
      // Hermetic default: scenarios that don't exercise FR-8 skip the judge
      // explicitly (fail-loud SEMANTIC_SKIPPED) — _99/_100 override.
      semantic: this.verdictSemantic ?? false,
      judgeSpawn: this.verdictJudgeSpawn,
    });
  } finally {
    if (this.savedClaudeBin !== undefined) {
      process.env.CLAUDE_BIN = this.savedClaudeBin;
      this.savedClaudeBin = undefined;
    } else if (Object.prototype.hasOwnProperty.call(this, 'savedClaudeBin')) {
      delete process.env.CLAUDE_BIN;
    }
  }
});

Then('it fails with a hard error naming the stale path', function (this: F37World) {
  const r = this.verdictResult;
  assert.ok(r, 'verdict did not run');
  assert.equal(r.verdict, 'RED', `expected RED verdict, got ${r.verdict}`);
  const staleFindings = r.auditGate.byClass['FILE_CHANGES_VERIFY'] ?? [];
  assert.ok(
    staleFindings.length >= 1,
    `expected a FILE_CHANGES_VERIFY hard error, got classes: ${Object.keys(r.auditGate.byClass).join(', ') || '(none)'}`,
  );
  assert.ok(
    staleFindings.some((f) => f.message.includes(this.stalePath!)),
    `stale path "${this.stalePath}" not named in: ${staleFindings.map((f) => f.message).join(' | ')}`,
  );
  // The gap list (what an agent acts on) must name it too.
  assert.ok(
    r.gapList.some((line) => line.includes('FILE_CHANGES_VERIFY') && line.includes(this.stalePath!)),
    `gap list does not name the stale path: ${r.gapList.join(' | ')}`,
  );
});

// ── SPECGEN004_98 — FR-37b: an untraced atom fails the traceability gate ──

Given(
  'an UNCOVERED_FR or a TASK_UNTESTED or an UNTAGGED_SCENARIO exists',
  function (this: F37World) {
    // Real fixture: a spec whose FR has NO AC and NO tested-by scenario —
    // the UNCOVERED_FR class of untraced atom (FR-37b).
    const specDir = path.join(this.tempDir, '.specs', 'untraced-demo');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1: Orphan requirement\n\nNo AC, no scenario.\n');
    fs.writeFileSync(
      path.join(specDir, 'FILE_CHANGES.md'),
      '# File Changes\n\n| Path | Action | Reason |\n|------|--------|--------|\n| `src/x.ts` | create | planned |\n',
    );
    this.verdictSpecPath = path.join('.specs', 'untraced-demo');
    this.verdictCwd = this.tempDir;
  },
);

Then('it fails with a per-item gap list', function (this: F37World) {
  const r = this.verdictResult;
  assert.ok(r, 'verdict did not run');
  assert.equal(r.verdict, 'RED', 'an untraced atom must make the verdict RED (FR-37b hard gate)');
  assert.ok(r.traceabilityGate.gapCount >= 1, 'traceability gate must report at least one gap');
  const gap = r.traceabilityGate.gaps.find((g) => g.class === 'UNCOVERED_FR');
  assert.ok(gap, `expected an UNCOVERED_FR gap, got: ${JSON.stringify(r.traceabilityGate.byClass)}`);
  assert.ok(gap!.nodeId.includes('untraced-demo:FR-1'), `the gap must name the atom: ${gap!.nodeId}`);
  assert.ok(
    r.gapList.some((line) => line.includes('UNCOVERED_FR') && line.includes('FR.md')),
    'the per-item gap list must carry the class + location',
  );
});

// ── SPECGEN004_96 — FR-37a: a bare structural pass is not reportable as clean ──

Given(
  'validate-spec returns zero structural errors but the smart analysis has open findings',
  function (this: F37World) {
    // Real scaffold → structurally VALID (0 errors); then plant a smart-only
    // finding: an FR with no AC and no scenario (UNCOVERED_FR).
    const repoRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
    execFileSync(
      process.execPath,
      [path.join(repoRoot, 'tools/specs-generator/specs-generator-core.mjs'), 'scaffold-spec', '-Name', 'health-demo'],
      { env: { ...process.env, SPECS_GENERATOR_ROOT: this.tempDir }, stdio: 'ignore', timeout: 60_000 },
    );
    fs.appendFileSync(
      path.join(this.tempDir, '.specs', 'health-demo', 'FR.md'),
      '\n## FR-77: Smart-only finding bait\n\nNo AC, no scenario — invisible to the structural validator.\n',
    );
    this.verdictSpecPath = path.join('.specs', 'health-demo');
    this.verdictCwd = this.tempDir;
  },
);

When('spec health is reported', async function (this: F37World) {
  this.verdictResult = await runSpecVerdict(this.verdictSpecPath!, {
    cwd: this.verdictCwd,
    semantic: false,
  });
});

Then('the verdict is the smart analysis over the one graph', function (this: F37World) {
  const r = this.verdictResult!;
  assert.equal(r.prefilter.structuralErrors, 0, 'fixture must be structurally CLEAN');
  assert.equal(r.verdict, 'RED', 'the SMART analysis must decide — open findings ⇒ RED despite 0 structural errors');
  assert.ok(
    r.traceabilityGate.gaps.some((g) => g.nodeId.includes('FR-77')),
    'the smart gap (UNCOVERED_FR FR-77) must be what made it RED',
  );
});

Then(
  'a bare validate-spec zero-errors is not reportable as valid or clean or done',
  function (this: F37World) {
    const r = this.verdictResult!;
    assert.match(
      r.prefilter.note,
      /NOT reportable as "valid\/clean\/done"/,
      'the pre-filter must carry the FR-37a non-reportability note',
    );
    assert.equal(r.verdict, 'RED');
  },
);

// ── SPECGEN004_99 / _100 — FR-37c: semantic ON when binary present, fail-loud otherwise ──

Given('a claude binary is present', function (this: F37World) {
  // Injected judge subprocess = "binary present" path, hermetic for CI.
  const specDir = path.join(this.tempDir, '.specs', 'sem-demo');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1: Semantic pair\n\nBody.\n');
  fs.writeFileSync(
    path.join(specDir, 'sem.feature'),
    '@FR-1\nFeature: Sem\n  Scenario: pair one\n    Given x\n',
  );
  this.verdictSpecPath = path.join('.specs', 'sem-demo');
  this.verdictCwd = this.tempDir;
  this.verdictSemantic = true;
  this.verdictJudgeSpawn = async () => JSON.stringify({ result: 'NO_DRIFT_DETECTED' });
});

Then('the FR-8 semantic drift check runs as part of it', function (this: F37World) {
  const s = this.verdictResult!.semantic;
  assert.equal(s.ran, true, 'semantic must RUN in the verdict path when the binary is present');
  assert.ok(s.pairsChecked >= 1, `at least one FR↔Scenario pair must be judged, got ${s.pairsChecked}`);
});

Given('no claude binary is available', function (this: F37World) {
  const specDir = path.join(this.tempDir, '.specs', 'nosem-demo');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '## FR-1: Unchecked pair\n\nBody.\n');
  fs.writeFileSync(
    path.join(specDir, 'nosem.feature'),
    '@FR-1\nFeature: NoSem\n  Scenario: pair one\n    Given x\n',
  );
  this.verdictSpecPath = path.join('.specs', 'nosem-demo');
  this.verdictCwd = this.tempDir;
  this.verdictSemantic = true; // semantic WANTED — but the binary probe must fail:
  this.savedClaudeBin = process.env.CLAUDE_BIN;
  process.env.CLAUDE_BIN = 'claude-definitely-not-installed-xyz';
});

Then('it carries a SEMANTIC_SKIPPED note', function (this: F37World) {
  const r = this.verdictResult!;
  assert.equal(r.semantic.ran, false);
  assert.ok(
    r.notes.some((n) => n.includes('SEMANTIC_SKIPPED')),
    `notes must carry SEMANTIC_SKIPPED, got: ${r.notes.join(' | ')}`,
  );
});

Then('it never reports no drift detected for unchecked content', function (this: F37World) {
  const s = this.verdictResult!.semantic;
  // Nothing was checked ⇒ no per-pair claims may exist; the note says
  // UNCHECKED, never "no drift".
  assert.equal(s.pairsChecked, 0, 'unchecked content must report ZERO pairs checked');
  assert.equal(s.drifts.length, 0);
  assert.match(s.note ?? '', /NOT "no drift"/);
});

// ── SPECGEN004_101 — FR-37d: a skill may not launder a structural pass ────

interface F37GuardWorld extends F37World {
  guardSkillTexts?: Map<string, string>;
}

const GUARDED_SKILLS = ['spec-status', 'spec-mcp-dogfood', 'runtime-dogfood', 'suite-failure-triage'];

Given('a skill or agent reports spec health', function (this: F37GuardWorld) {
  // The skills ARE prompts — their text is the behavioural contract an agent
  // executes. Load the four health-reporting skills.
  const repoRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
  this.guardSkillTexts = new Map();
  for (const name of GUARDED_SKILLS) {
    const p = path.join(repoRoot, '.claude', 'skills', name, 'SKILL.md');
    assert.ok(fs.existsSync(p), `guarded skill missing: ${name}`);
    this.guardSkillTexts.set(name, fs.readFileSync(p, 'utf-8'));
  }
});

When('it produces its verdict', function (this: F37GuardWorld) {
  // No-op transition: the contract under test is the prompt text loaded above.
  assert.ok(this.guardSkillTexts?.size === GUARDED_SKILLS.length);
});

Then('it surfaces the smart verdict and gap list', function (this: F37GuardWorld) {
  for (const [name, text] of this.guardSkillTexts!) {
    assert.ok(
      text.includes('spec-verdict.ts') && /gap list/i.test(text),
      `${name}/SKILL.md must direct the agent to the smart verdict (spec-verdict.ts) + gap list`,
    );
  }
});

Then(
  'it does not state valid or clean or done off validate-spec alone',
  function (this: F37GuardWorld) {
    for (const [name, text] of this.guardSkillTexts!) {
      assert.ok(
        /ЗАПРЕЩЕНО.*valid \/ clean \/ done|forbidden.*valid\/clean\/done/is.test(text),
        `${name}/SKILL.md must FORBID reporting valid/clean/done off validate-spec alone`,
      );
    }
    // The .claude/rules/ guard encodes the incident for future sessions.
    const repoRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
    const rulePath = path.join(repoRoot, '.claude', 'rules', 'spec-verdict', 'no-structural-valid.md');
    assert.ok(fs.existsSync(rulePath), 'the no-structural-valid rule must exist');
    const rule = readRuleContentForAdaptation(repoRoot, rulePath, '.claude/rules/spec-verdict/no-structural-valid.md');
    assert.ok(rule.includes('spec-verdict.ts') && rule.includes('false green'),
      'the rule must point at the smart verdict and encode the false-green incident');
  },
);

Then(
  'within spec-generator-v4 these must be zero for a green verdict',
  function (this: F37World) {
    // LIVE corpus assertion — the P14-2 Done-When itself: the real
    // spec-generator-v4 cell carries ZERO untraced atoms.
    const repoRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
    const graph = buildGraphFromCwd(repoRoot);
    const gaps = checkTraceabilityCompleteness(graph, { spec: 'spec-generator-v4' });
    assert.equal(
      gaps.length,
      0,
      `spec-generator-v4 must have 0 traceability gaps, got ${gaps.length}: ${gaps
        .slice(0, 5)
        .map((g) => `${g.class}:${g.nodeId}`)
        .join(', ')}`,
    );
  },
);

// ── SPECGEN004_539 — FR-61a: graph green is not readiness green ─────────────

function writeReadinessDebtSpec(root: string): void {
  const dir = path.join(root, '.specs', 'readiness-demo');
  fs.mkdirSync(dir, { recursive: true });
  const write = (name: string, text: string): void => fs.writeFileSync(path.join(dir, name), text, 'utf-8');
  write(
    'USER_STORIES.md',
    [
      '# User Stories',
      '',
      '### User Story 1: Honest readiness (Priority: P1)',
      '',
      'As a maintainer, I want one readiness answer, чтобы not-run work is not reported green.',
      '',
      '**Требование:** [FR-1](FR.md#fr-1-readiness)',
      '**Why:** Avoid false-green release decisions.',
      '**Independent Test:** SPECGEN004_539',
      '**Acceptance Scenarios:**',
      '',
      'Given a structurally valid spec',
      'When verdict runs',
      'Then readiness is NOT_READY',
      '',
    ].join('\n'),
  );
  write('USE_CASES.md', '# Use Cases\n\n## UC-1: Readiness\n\n- Run verdict\n- See readiness lanes\n- Act on the next step\n');
  write('RESEARCH.md', '# Research\n\nNo external research needed.\n');
  write('REQUIREMENTS.md', '# Requirements\n\n| CHK | Requirement | Scenario |\n|-----|-------------|----------|\n| CHK-1 | [FR-1](FR.md#fr-1-readiness) | SPECGEN004_539 |\n');
  write(
    'FR.md',
    '# Functional Requirements\n\n## FR-1: Readiness\n\nThe system SHALL separate graph health from readiness debt.\n\n**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)\n**Use Case:** [UC-1](USE_CASES.md#uc-1-readiness)\n',
  );
  write('NFR.md', '# Non-Functional Requirements\n\n## Performance\nNone.\n\n## Security\nNone.\n\n## Reliability\nNone.\n\n## Usability\nReadable lanes.\n');
  write(
    'ACCEPTANCE_CRITERIA.md',
    '# Acceptance Criteria\n\n## AC-1 (FR-1)\n\n**Требование:** [FR-1](FR.md#fr-1-readiness)\n\nWHEN canonical evidence is missing THEN the system SHALL report readiness debt AND SHALL show OVERALL NOT_READY.\n',
  );
  write(
    'DESIGN.md',
    '# Design\n\n### Decision: Readiness lanes\n\n**Требование:** [FR-1](FR.md#fr-1-readiness)\n\nUse explicit verdict lanes.\n',
  );
  write(
    'TASKS.md',
    '# Tasks\n\n## Phase 1: Implementation\n\n- [x] Implement readiness lane output -- @feature1 — id: P1-1 — Status: DONE | Est: 30m\n  _Requirements: [FR-1](FR.md#fr-1-readiness)_\n  **Done When:**\n  - [x] SPECGEN004_539 scenario passes\n',
  );
  write('FILE_CHANGES.md', '# File Changes\n\n| Path | Action | Reason |\n|------|--------|--------|\n| `src/readiness-demo.ts` | create | readiness output implementation |\n');
  write('CHANGELOG.md', '# Changelog\n\n- Added readiness lanes.\n');
  write('README.md', '# Readiness demo\n\nFixture spec for FR-61.\n');
  fs.writeFileSync(
    path.join(root, 'cucumber.json'),
    JSON.stringify({ default: { paths: ['.specs/readiness-demo/readiness-demo.feature'] } }),
  );
  write(
    'readiness-demo.feature',
    '@feature1\nFeature: SPECGEN004_Readiness\n\n  Scenario: SPECGEN004_539 readiness lane debt\n    Given a readiness fixture\n    When spec-verdict runs\n    Then output is not plain green\n',
  );
}

Given('a spec is structurally valid and traceable but has unrun scenarios and DONE-but-unverified tasks', function (this: F37World) {
  writeReadinessDebtSpec(this.tempDir);
  this.verdictSpecPath = path.join('.specs', 'readiness-demo');
  this.verdictCwd = this.tempDir;
  this.verdictSemantic = false;
});

When('spec-verdict summarizes that spec', async function (this: F37World) {
  this.verdictResult = await runSpecVerdict(this.verdictSpecPath!, {
    cwd: this.verdictCwd,
    semantic: false,
  });
  this.verdictText = renderVerdict(this.verdictResult);
});

Then('the output shows STRUCTURE, TRACEABILITY, EXECUTION, TASK_TRUTH, BDD_SYNC, SEMANTIC, and FILTERED_PROOF lanes', function (this: F37World) {
  const r = this.verdictResult!;
  assert.equal(r.verdict, 'NOT_READY', 'the canonical verdict must fold readiness debt into the top-level answer');
  assert.equal(r.traceabilityGate.gapCount, 0, 'fixture must be traceable so EXECUTION/TASK_TRUTH are the blockers');
  assert.equal(r.readiness.lanes.STRUCTURE.status, 'GREEN');
  assert.equal(r.readiness.lanes.TRACEABILITY.status, 'GREEN');
  assert.equal(r.readiness.lanes.EXECUTION.status, 'NOT_RUN');
  assert.equal(r.readiness.lanes.TASK_TRUTH.status, 'RED');
  assert.equal(r.readiness.lanes.BDD_SYNC.status, 'GREEN');
  assert.equal(r.readiness.lanes.SEMANTIC.status, 'SKIPPED');
  assert.equal(r.readiness.lanes.FILTERED_PROOF.status, 'NONE');
  for (const lane of ['STRUCTURE', 'TRACEABILITY', 'EXECUTION', 'TASK_TRUTH', 'BDD_SYNC', 'SEMANTIC', 'FILTERED_PROOF']) {
    assert.match(this.verdictText!, new RegExp(`\\b${lane}:`), `rendered verdict must show ${lane} lane`);
  }
});

Then('the final readiness label is OVERALL NOT_READY and the canonical verdict is NOT_READY', function (this: F37World) {
  assert.equal(this.verdictResult!.readiness.overall, 'NOT_READY');
  assert.equal(this.verdictResult!.verdict, 'NOT_READY');
  const completion = this.verdictResult!.blocking.find((finding) => finding.code === 'UNVERIFIED_COMPLETION');
  assert.ok(completion, JSON.stringify(this.verdictResult!.blocking));
  assert.equal(verdictExitCode(this.verdictResult!), 1, 'NOT_READY must fail the machine/CLI contract');
  assert.match(this.verdictText!, /OVERALL:\s*NOT_READY/);
  assert.match(this.verdictText!, /VERDICT:\s*NOT_READY/);
  assert.doesNotMatch(this.verdictText!, /VERDICT:\s*GREEN\b/, this.verdictText);
});

// ── SPECGEN004_540 — FR-61b: status gap semantics match verdict semantics ───

Given('an FR has traceability edges but no canonical passed execution evidence', function (this: F37World) {
  writeReadinessDebtSpec(this.tempDir);
  this.verdictSpecPath = path.join('.specs', 'readiness-demo');
  this.verdictCwd = this.tempDir;
  this.verdictSemantic = false;
});

When('get_spec_status and spec-verdict report the spec', async function (this: F37World) {
  const graph = buildGraphFromCwd(this.verdictCwd!);
  const statusTool = buildToolRegistry(() => graph).find((t) => t.name === 'get_spec_status');
  assert.ok(statusTool, 'get_spec_status tool must be registered');
  const status = await statusTool.handler({ spec: 'readiness-demo', view: 'status' });
  this.mcpStatusPayload = JSON.parse(status.content[0].text);
  this.verdictResult = await runSpecVerdict(this.verdictSpecPath!, {
    cwd: this.verdictCwd,
    semantic: false,
  });
  this.verdictText = renderVerdict(this.verdictResult);
});

Then('execution absence is reported as SCENARIO_NOT_RUN or FR_NOT_EXECUTION_VERIFIED', function (this: F37World) {
  const status = this.mcpStatusPayload!;
  assert.equal(status.lifecycle, 'TESTS_NOT_RUN');
  assert.ok(status.execution_gaps.SCENARIO_NOT_RUN >= 1, JSON.stringify(status.execution_gaps));
  assert.deepEqual(status.execution_gaps.scenario_ids, ['readiness-demo:SCEN-specgen004-539-readiness-lane-debt']);
  assert.deepEqual(status.execution_gaps.fr_ids, ['readiness-demo:FR-1']);
  assert.equal(status.execution_gaps.FR_NOT_EXECUTION_VERIFIED, 1);
  assert.match(status.hint, /run the suite|SCENARIO_NOT_RUN/i);
  assert.match(this.verdictText!, /EXECUTION:\s*NOT_RUN/);
});

Then('the same condition is not reported as UNCOVERED_FR', function (this: F37World) {
  const status = this.mcpStatusPayload!;
  assert.equal(status.gaps.UNCOVERED_FR, 0, JSON.stringify(status.gaps));
  assert.equal(this.verdictResult!.traceabilityGate.byClass.UNCOVERED_FR?.length ?? 0, 0);
  assert.equal(this.verdictResult!.traceabilityGate.gapCount, 0);
});

// ── SPECGEN004_541 — FR-61c: task DONE truth guard ───────────────────────────

function writeTaskTruthGuardSpec(root: string): void {
  const dir = path.join(root, '.specs', 'truth-guard-demo');
  fs.mkdirSync(dir, { recursive: true });
  const write = (name: string, text: string): void => fs.writeFileSync(path.join(dir, name), text, 'utf-8');
  write(
    'USER_STORIES.md',
    [
      '# User Stories',
      '',
      '### User Story 1: Truthful task close (Priority: P1)',
      '',
      'As a maintainer, I want task DONE to mean executable evidence exists.',
      '',
      '**Требование:** [FR-1](FR.md#fr-1-truth-guard)',
      '**Why:** A checked task without a green canonical scenario is a false-green release signal.',
      '**Independent Test:** SPECGEN004_541',
      '**Acceptance Scenarios:**',
      '',
      'Given a task is textually marked DONE without evidence',
      'When the door and verdict evaluate it',
      'Then the task is treated as IN_PROGRESS with concrete missing evidence',
      '',
    ].join('\n'),
  );
  write('USE_CASES.md', '# Use Cases\n\n## UC-1: Close task truthfully\n\n- Attempt to close task\n- See evidence refusal\n');
  write('RESEARCH.md', '# Research\n\nNo external research needed.\n');
  write('REQUIREMENTS.md', '# Requirements\n\n| CHK | Requirement | Scenario |\n|-----|-------------|----------|\n| CHK-1 | [FR-1](FR.md#fr-1-truth-guard) | SPECGEN004_541 |\n');
  write(
    'FR.md',
    '# Functional Requirements\n\n## FR-1: Truth guard\n\nThe system SHALL refuse task DONE without canonical scenario evidence and completed Done When checks.\n\n**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)\n**Use Case:** [UC-1](USE_CASES.md#uc-1-close-task-truthfully)\n',
  );
  write('NFR.md', '# Non-Functional Requirements\n\n## Performance\nNone.\n\n## Security\nNone.\n\n## Reliability\nDo not false-green task status.\n\n## Usability\nName the missing evidence.\n');
  write(
    'ACCEPTANCE_CRITERIA.md',
    '# Acceptance Criteria\n\n## AC-1 (FR-1)\n\n**Требование:** [FR-1](FR.md#fr-1-truth-guard)\n\nWHEN task status is changed to DONE without canonical passed evidence or with an unchecked Done When item THEN the door SHALL refuse and the verdict SHALL report evidence-derived IN_PROGRESS.\n',
  );
  write(
    'DESIGN.md',
    '# Design\n\n### Decision: Derived task truth\n\n**Требование:** [FR-1](FR.md#fr-1-truth-guard)\n\nUse the shared coverage mapper as the single source for task truth.\n',
  );
  write(
    'TASKS.md',
    '# Tasks\n\n## Phase 1: Implementation\n\n- [ ] Close only with evidence -- @feature1 — id: truth-task — Status: IN_PROGRESS | Est: 30m\n  _Requirements: [FR-1](FR.md#fr-1-truth-guard)_\n  **Done When:**\n  - [ ] SPECGEN004_541 passes in canonical Docker BDD\n',
  );
  write('FILE_CHANGES.md', '# File Changes\n\n| Path | Action | Reason |\n|------|--------|--------|\n| `src/truth-guard-demo.ts` | create | truth guard implementation |\n');
  write('CHANGELOG.md', '# Changelog\n\n- Added task truth guard.\n');
  write('README.md', '# Truth guard demo\n\nFixture spec for FR-61c.\n');
  write(
    'truth-guard-demo.feature',
    '@feature1\nFeature: SPECGEN004 Truth guard\n\n  Scenario: SPECGEN004_541 task DONE truth guard fixture\n    Given a truth guard fixture\n    When task truth is checked\n    Then the task is not done\n',
  );
}

function forceDoneTruthTask(root: string): void {
  const tasksPath = path.join(root, '.specs', 'truth-guard-demo', 'TASKS.md');
  const current = fs.readFileSync(tasksPath, 'utf-8');
  fs.writeFileSync(
    tasksPath,
    current.replace('- [ ] Close only with evidence -- @feature1 — id: truth-task — Status: IN_PROGRESS | Est: 30m', '- [x] Close only with evidence -- @feature1 — id: truth-task — Status: DONE | Est: 30m'),
    'utf-8',
  );
}

Given('a task is textually marked DONE with an unchecked Done When item or a mapped scenario that is not canonical PASSED', function (this: F37World) {
  writeTaskTruthGuardSpec(this.tempDir);
  this.verdictSpecPath = path.join('.specs', 'truth-guard-demo');
  this.verdictCwd = this.tempDir;
  this.verdictSemantic = false;
});

When('the status mutation door and verdict evaluate that task', async function (this: F37World) {
  let graph = buildGraphFromCwd(this.tempDir);
  this.setStatusResult = setEntityStatus(graph, this.tempDir, { id: 'truth-task', spec: 'truth-guard-demo', to: 'done' });

  const tasksPath = path.join(this.tempDir, '.specs', 'truth-guard-demo', 'TASKS.md');
  const currentTasks = fs.readFileSync(tasksPath, 'utf-8');
  this.applyStatusResult = validateSpecChange(this.tempDir, 'truth-guard-demo', 'TASKS.md', {
    old_string: '- [ ] Close only with evidence -- @feature1 — id: truth-task — Status: IN_PROGRESS | Est: 30m',
    new_string: '- [x] Close only with evidence -- @feature1 — id: truth-task — Status: DONE | Est: 30m',
  });
  assert.equal(fs.readFileSync(tasksPath, 'utf-8'), currentTasks, 'dry-run apply_spec_change must not mutate the fixture');

  forceDoneTruthTask(this.tempDir);
  graph = buildGraphFromCwd(this.tempDir);
  const statusTool = buildToolRegistry(() => graph).find((t) => t.name === 'get_spec_status');
  assert.ok(statusTool, 'get_spec_status tool must be registered');
  const status = await statusTool.handler({ spec: 'truth-guard-demo', view: 'status' });
  this.mcpStatusPayload = JSON.parse(status.content[0].text);
  this.censusRow = computeTaskCensus(graph).specs.find((s) => s.slug === 'truth-guard-demo');
  this.verdictResult = await runSpecVerdict(this.verdictSpecPath!, { cwd: this.verdictCwd, semantic: false });
  this.verdictText = renderVerdict(this.verdictResult);
});

Then('the DONE status is denied or downgraded to evidence-derived IN_PROGRESS', function (this: F37World) {
  assert.equal(this.setStatusResult!.ok, false, JSON.stringify(this.setStatusResult));
  assert.equal(this.setStatusResult!.error, 'DONE_TRUTH_UNVERIFIED');
  assert.match(this.setStatusResult!.reason ?? '', /not all canonical PASSED|Done When/i);

  assert.equal(this.applyStatusResult!.ok, false, 'apply_spec_change dry-run must refuse a textual DONE bypass');
  const applyMessages = this.applyStatusResult!.findings.map((f) => f.message).join(' | ');
  assert.match(applyMessages, /TASK_DONE_UNVERIFIED|TASK_DONE_CHECKLIST_OPEN/, applyMessages);

  const task = this.mcpStatusPayload!.coverage.task_verification['truth-guard-demo:truth-task'];
  assert.equal(task.verified_status, 'IN_PROGRESS', JSON.stringify(task));
  assert.ok(task.truth_issues?.some((issue) => issue.code === 'TASK_DONE_CHECKLIST_OPEN'), JSON.stringify(task.truth_issues));
  assert.equal(this.censusRow!.doneUnrun, 1, 'prompt-time census must count DONE-but-unconfirmed as open truth debt');
  assert.equal(this.verdictResult!.readiness.lanes.TASK_TRUTH.status, 'RED');
});

Then('the missing scenario or checklist evidence is named to the agent', function (this: F37World) {
  assert.match(this.setStatusResult!.reason ?? '', /SPECGEN004_541|Done When|canonical PASSED/i);
  assert.match(this.verdictText!, /TASK_TRUTH:\s*RED/);
  assert.match(this.verdictText!, /truth-guard-demo:truth-task/);
  assert.match(this.verdictText!, /unchecked|canonical PASSED|SCENARIO_NOT_RUN/i);
});

// ── SPECGEN004_542 — FR-61d: source/executable BDD sync ──────────────────────

Given(/a source spec feature and an executable tests\/features feature disagree on scenario ids, FR tags, or scenario count prose/, function (this: F37World) {
  writeReadinessDebtSpec(this.tempDir);
  const specDir = path.join(this.tempDir, '.specs', 'readiness-demo');
  fs.appendFileSync(
    path.join(specDir, 'readiness-demo.feature'),
    '\n  @feature1\n  Scenario: SPECGEN004_544 source-only drift\n    Given source-only evidence\n\n  # The source feature contains two scenarios.\n\n  @feature1 @wip\n  Scenario: SPECGEN004_546 intentionally pending source scenario\n    Given pending source evidence\n',
  );
  const executable = path.join(this.tempDir, 'acceptance', 'readiness-demo-executable.feature');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(
    executable,
    [
      '@feature2',
      'Feature: Executable readiness demo',
      '',
      '  Scenario: SPECGEN004_539 readiness lane debt',
      '    Given an executable counterpart with the wrong FR tag',
      '',
      '  Scenario: SPECGEN004_545 executable-only drift',
      '    Given an unmarked executable-only scenario',
      '',
      '  @EXEC_ONLY',
      '  Scenario: SPECGEN004_547 intentional executable-only scenario',
      '    Given an explicitly marked executable-only scenario',
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(this.tempDir, 'cucumber.json'),
    JSON.stringify({ default: { paths: [path.relative(this.tempDir, executable).replace(/\\/g, '/')] } }),
  );
  fs.writeFileSync(
    path.join(this.tempDir, 'cucumber.docker.json'),
    JSON.stringify({ default: { paths: [path.relative(this.tempDir, executable).replace(/\\/g, '/')] } }),
  );
  this.verdictSpecPath = path.join('.specs', 'readiness-demo');
  this.verdictCwd = this.tempDir;
});

When('the BDD sync checker runs', async function (this: F37World) {
  this.verdictResult = await runSpecVerdict(this.verdictSpecPath!, { cwd: this.verdictCwd, semantic: false });
  this.verdictText = renderVerdict(this.verdictResult);
});

Then('executable-only scenarios require EXEC_ONLY or OUT_OF_SCOPE markers', function (this: F37World) {
  const debt = [...this.verdictResult!.evidence.bddSync.debt].sort();
  assert.deepEqual(debt, [
    'EXEC_ONLY_MISSING_MARKER specgen004_545: executable scenario has no source counterpart',
    'FR_TAG_DRIFT specgen004_539: source=@feature1 executable=@feature2',
    'SCENARIO_COUNT_DRIFT two scenarios: actual source scenario count is 3',
    'SOURCE_ONLY specgen004_544: source scenario has no executable counterpart or pending marker',
  ].sort());
  assert.equal(this.verdictResult!.readiness.lanes.BDD_SYNC.status, 'RED');
  assert.match(this.verdictResult!.readiness.nextAction, /Fix source\/executable BDD sync drift/);
});

Then('source-only scenarios require an explicit pending marker or executable counterpart', function (this: F37World) {
  const debt = this.verdictResult!.evidence.bddSync.debt;
  assert.ok(debt.some((item) => /SOURCE_ONLY specgen004_544/.test(item)), JSON.stringify(debt));
  assert.match(this.verdictText!, /BDD_SYNC:\s*RED/);
  assert.match(this.verdictText!, /SOURCE_ONLY specgen004_544/);
  assert.equal(this.verdictResult!.readiness.overall, 'NOT_READY');
});

// ── SPECGEN004_543 — FR-61e: filtered proof without canonical poisoning ─────

Given('a filtered Docker BDD run passes selected scenario ids for a spec', function (this: F37World) {
  writeReadinessDebtSpec(this.tempDir);
  const devDir = path.join(this.tempDir, '.dev-pomogator');
  const canonical = path.join(devDir, '.last-test-run.ndjson');
  const traceRel = '.dev-pomogator/.test-history/run-filtered-543.ndjson';
  const traceAbs = path.join(this.tempDir, traceRel);
  const uri = '.specs/readiness-demo/readiness-demo.feature';
  fs.mkdirSync(path.dirname(traceAbs), { recursive: true });
  fs.writeFileSync(canonical, '{"sentinel":"canonical-before-543"}\n');
  this.canonicalBefore = fs.readFileSync(canonical, 'utf-8');
  const stream = [
    { gherkinDocument: { uri, feature: { children: [{ scenario: { id: 'sc-543', location: { line: 3 } } }] } } },
    { pickle: { id: 'pk-543', uri, name: 'SPECGEN004_539 readiness lane debt', tags: [{ name: '@feature1' }], astNodeIds: ['sc-543'], steps: [{ id: 'ps-543', text: 'a readiness fixture' }] } },
    { testCase: { id: 'tc-543', pickleId: 'pk-543', testSteps: [{ id: 'ts-543', pickleStepId: 'ps-543' }] } },
    { testCaseStarted: { id: 'tcs-543', testCaseId: 'tc-543', timestamp: { seconds: 4_072_147_202, nanos: 0 } } },
    { testStepFinished: { testCaseStartedId: 'tcs-543', testStepId: 'ts-543', testStepResult: { status: 'PASSED' } } },
    { testCaseFinished: { testCaseStartedId: 'tcs-543', timestamp: { seconds: 4_072_147_202, nanos: 0 } } },
  ].map((row) => JSON.stringify(row)).join('\n');
  fs.writeFileSync(traceAbs, stream);
  const written = writeScenarioOverlayFromNdjson(traceAbs, {
    overlayPath: path.join(devDir, '.scenario-results.ndjson'),
    runId: 'filtered-543',
    source: 'docker-bdd:filtered',
    traceFile: traceRel,
  });
  assert.equal(written, 1, 'real Cucumber-message overlay producer must emit exactly one scenario row');
  const [row] = fs.readFileSync(path.join(devDir, '.scenario-results.ndjson'), 'utf-8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.deepEqual(row, {
    scenario_id: 'SPECGEN004_539', result: 'PASSED', time: '2099-01-15T08:00:02.000Z',
    run_id: 'filtered-543', source: 'docker-bdd:filtered',
    trace_id: `${traceRel}#tcs-543`, trace_file: traceRel, test_case_started_id: 'tcs-543',
    uri, line: 3, scenario_name: 'SPECGEN004_539 readiness lane debt', tags: ['@feature1'],
  });
  this.verdictSpecPath = path.join('.specs', 'readiness-demo');
  this.verdictCwd = this.tempDir;
});

When('MCP status or spec-verdict reports coverage evidence', async function (this: F37World) {
  const graph = buildGraphFromCwd(this.tempDir);
  const statusTool = buildToolRegistry(() => graph, { repoRoot: this.tempDir }).find((tool) => tool.name === 'get_spec_status');
  assert.ok(statusTool, 'get_spec_status tool must be registered');
  const status = await statusTool.handler({ spec: 'readiness-demo', view: 'status' });
  const coverage = await statusTool.handler({ spec: 'readiness-demo', view: 'coverage' });
  this.mcpStatusPayload = JSON.parse(status.content[0].text);
  const coveragePayload = JSON.parse(coverage.content[0].text) as { execution_gaps: { SCENARIO_NOT_RUN: number }; filtered_proof: { runId: string } };
  assert.equal(coveragePayload.execution_gaps.SCENARIO_NOT_RUN, 1, 'coverage view must use canonical execution gaps, not filtered effective pass');
  assert.equal(coveragePayload.filtered_proof.runId, 'filtered-543', 'coverage view must expose the same filtered proof as status/verdict');
  this.verdictResult = await runSpecVerdict(this.verdictSpecPath!, { cwd: this.verdictCwd, semantic: false });
  this.verdictText = renderVerdict(this.verdictResult);
});

Then('canonical coverage remains unchanged until a full run or accepted attachment lands', function (this: F37World) {
  const canonical = path.join(this.tempDir, '.dev-pomogator', '.last-test-run.ndjson');
  const after = fs.existsSync(canonical) ? fs.readFileSync(canonical, 'utf-8') : null;
  assert.equal(after, this.canonicalBefore, 'reading filtered proof must never create or overwrite canonical NDJSON');
  assert.equal(this.verdictResult!.coverage.canonicalBuckets.passed, 0);
  assert.equal(this.verdictResult!.coverage.canonicalBuckets.not_run, 1);
  const status = this.mcpStatusPayload as typeof this.mcpStatusPayload & { canonical_coverage: { totals: Record<string, number> } };
  assert.equal(status!.canonical_coverage.totals.passed, 0);
  assert.equal(status!.canonical_coverage.totals.not_run, 1);
});

Then(/^a FILTERED_PROOF lane shows the artifact path, selected ids, pass\/fail summary, timestamp, source, and next action$/, function (this: F37World) {
  const proof = this.verdictResult!.evidence.filteredProof.latest!;
  assert.deepEqual(proof, {
    runId: 'filtered-543',
    artifact: '.dev-pomogator/.test-history/run-filtered-543.ndjson',
    selectedScenarioIds: ['SPECGEN004_539'],
    passed: 1,
    nonPassed: 0,
    timestamp: '2099-01-15T08:00:02.000Z',
    source: 'docker-bdd:filtered',
    canonicalCoverageUnchanged: true,
    acceptedAttachment: false,
  });
  assert.equal(this.verdictResult!.readiness.lanes.FILTERED_PROOF.status, 'GREEN');
  assert.match(this.verdictText!, /FILTERED_PROOF:\s*GREEN/);
  assert.match(this.verdictText!, /1 passed \/ 0 non-passed/);
  assert.match(this.verdictResult!.readiness.nextAction, /filtered-543|filtered artifact|full Docker BDD/i);
  const status = this.mcpStatusPayload as typeof this.mcpStatusPayload & {
    filtered_proof: typeof proof;
    readiness: { next_action: string };
  };
  assert.deepEqual(status!.filtered_proof, proof);
  assert.match(status!.readiness.next_action, /filtered-543|filtered artifact|full Docker BDD/i);
});
