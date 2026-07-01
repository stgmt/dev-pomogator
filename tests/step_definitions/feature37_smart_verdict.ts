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
import { runSpecVerdict, type SpecVerdictResult } from '../../tools/specs-generator/spec-verdict.ts';
import { buildGraphFromCwd } from '../../tools/spec-graph/builder.ts';
import { checkTraceabilityCompleteness } from '../../tools/spec-graph/traceability.ts';

interface F37World extends V4World {
  stalePath?: string;
  verdictSpecPath?: string;
  verdictCwd?: string;
  verdictResult?: SpecVerdictResult;
  /** FR-8 semantic controls for the shared When (SPECGEN004_99/_100). */
  verdictSemantic?: boolean;
  verdictJudgeSpawn?: (prompt: string) => Promise<string>;
  savedClaudeBin?: string | undefined;
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
    const rule = fs.readFileSync(rulePath, 'utf-8');
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
