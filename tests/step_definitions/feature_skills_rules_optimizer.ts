/**
 * Step definitions for the `skills-rules-optimizer` spec (SRO001).
 *
 * Every step drives the REAL skills-rules-optimizer engine living under
 * `.claude/skills/skills-rules-optimizer/scripts/` — no mocks, no inline copies:
 *   - in-process TS: the exported `audit()` / `checkAllowedToolsCoverage()` /
 *     `checkOversize()` (audit-skills.ts) and `detectOverlaps()` (detect-overlap.ts),
 *     imported and called directly (deterministic, fast).
 *   - spawn: `merge-skills.ts`, `verify-merge.ts` and the `audit.ts` dispatcher,
 *     which export nothing (CLI-only) — driven via
 *     `spawnSync(process.execPath, ['--import','tsx', <ABS>, ...], {cwd: REPO_ROOT})`,
 *     NOT npx (npx empties stdout in a host spawn; `--import tsx` needs node_modules
 *     so cwd must be the repo root, not the per-scenario tmpDir).
 *
 * Regex step patterns (NOT Cucumber Expressions) so literal backticks, `/`, `{}`
 * and `"` match verbatim; every pattern is scoped to THIS spec's vocabulary
 * (skills-rules-optimizer / audit-skills / detect-overlap / merge-skills /
 * verify-merge / the SRO fixtures) so this file — loaded by the WHOLE suite —
 * never hijacks another feature's step.
 *
 * Reconciliations applied to the .feature (see the migration report):
 *   - SRO002: prose said "5 valid skills" + "user runs audit.ts --dir .claude/skills".
 *     The fixture dir holds 5 skill subdirs of which 4 are DELIBERATELY invalid
 *     (claude-in-name, missing-allowed-tools, oversize-skill, transitive-references)
 *     + 1 valid (valid-skill). Reconciled to drive the real `audit()` over the
 *     fixtures dir; assert totalSkills == 5 + the four keys.
 *   - SRO004: prose said `error.missing == ["Skill"]`. The real fixture body uses
 *     BOTH `Bash` and `Skill(...)` undeclared → engine returns `["Skill","Bash"]`.
 *     Reconciled to assert the list CONTAINS Skill AND Bash.
 *   - SRO006 / SRO009: prose over-claimed main-turn orchestration (Agent runs,
 *     draft written, continuation invoked). The scripts only EMIT an envelope /
 *     route to the rules pipeline. Reconciled to assert the real envelope /
 *     dispatcher output the script actually produces.
 *   - SRO007: the main-turn EXECUTION (delete draft + exit 1 + the stderr
 *     "regression: ratchet rejected merge") is performed by the orchestrating
 *     agent turn, not by any script — no headless hook, no vitest covers it.
 *     Tagged `# @manual` with NO step-def (never faked green). verify-merge's
 *     ENVELOPE shape lives in its own runtime scenario (SRO013).
 *   - SRO008: the `cleanup_suggestions` field is emitted by verify-merge (not
 *     merge-skills); moved to SRO013. SRO008 asserts ONLY originals-unchanged.
 *
 * @see .specs/skills-rules-optimizer/skills-rules-optimizer.feature
 * @see .claude/skills/bdd-migrator/SKILL.md
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { V4World } from '../hooks/before-after.ts';

// --- Repo-relative locations (the engine + fixtures live in the repo tree) ---

const REPO_ROOT = process.cwd();
const SRO_SCRIPTS = path.join(REPO_ROOT, '.claude', 'skills', 'skills-rules-optimizer', 'scripts');
const SRO_FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'skills-rules-optimizer');
const SRO_OVERLAP_DIR = path.join(SRO_FIXTURES, 'overlap-pair');

function sroScript(name: string): string {
  return path.join(SRO_SCRIPTS, name);
}

/** Spawn an SRO CLI script via the real node + tsx (NOT npx), cwd = REPO_ROOT. */
function runSroScript(
  script: string,
  args: string[],
  timeout = 30000,
): { stdout: string; stderr: string; status: number | null } {
  const res = spawnSync(process.execPath, ['--import', 'tsx', sroScript(script), ...args], {
    encoding: 'utf-8',
    cwd: REPO_ROOT,
    timeout,
  });
  return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', status: res.status };
}

interface SroWorld extends V4World {
  sroAudit?: import('../../.claude/skills/skills-rules-optimizer/scripts/shared.ts').SkillAuditResult;
  sroCoverage?: import('../../.claude/skills/skills-rules-optimizer/scripts/shared.ts').SkillFinding | null;
  sroOversize?: import('../../.claude/skills/skills-rules-optimizer/scripts/shared.ts').SkillFinding | null;
  sroOverlaps?: import('../../.claude/skills/skills-rules-optimizer/scripts/shared.ts').OverlapPair[];
  sroRun?: { stdout: string; stderr: string; status: number | null };
  sroEnvelope?: any;
  sroOriginalsBefore?: { a: string; b: string };
  sroRuleFm?: string;
  sroSkillFm?: string;
  sroRuleParsed?: { frontmatter: Record<string, unknown>; hasFrontmatter: boolean; body: string };
  sroSkillParsed?: { frontmatter: Record<string, unknown>; hasFrontmatter: boolean; body: string };
  sroMergeSrc?: string;
  sroOverlapSrc?: string;
  sroEmbeddingHits?: string[];
  sroProbeMergedDir?: string;
}

// ============================================================================
// Background (SRO001 feature preamble) — scoped to this spec's wording. No
// environment to bootstrap; the engine + fixtures are exercised from the tree.
// ============================================================================

Given(/^dev-pomogator установлен$/, function (this: SroWorld) {
  // No-op: the skills-rules-optimizer scripts are exercised directly from the tree.
});

Given(
  /^`\.claude\/skills\/skills-rules-optimizer\/scripts\/` содержит audit\.ts, audit-skills\.ts, detect-overlap\.ts, merge-skills\.ts, verify-merge\.ts$/,
  function (this: SroWorld) {
    for (const s of ['audit.ts', 'audit-skills.ts', 'detect-overlap.ts', 'merge-skills.ts', 'verify-merge.ts']) {
      assert.ok(fs.existsSync(sroScript(s)), `expected SRO script ${s} on disk`);
    }
  },
);

Given(/^`tests\/fixtures\/skills-rules-optimizer\/` содержит test fixtures$/, function (this: SroWorld) {
  assert.ok(fs.existsSync(SRO_FIXTURES), 'expected the SRO fixtures dir on disk');
});

// ============================================================================
// SRO002 — audit emits structured JSON (FR-1). In-process `audit()`.
//   Reconciled: drive the fixtures dir (5 skill subdirs), not .claude/skills.
// ============================================================================

Given(
  /^`\.claude\/skills\/` содержит 5 valid skills \(frontmatter ОК, body ОК\)$/,
  function (this: SroWorld) {
    // Reconciled to the real fixture dir: 5 skill subdirs (1 valid + 4 deliberately
    // invalid). The audit must still report totalSkills == 5 + the canonical keys.
    assert.ok(fs.existsSync(SRO_FIXTURES), 'expected the SRO fixtures dir');
  },
);

When(/^the skills audit runs over the SRO fixtures directory$/, async function (this: SroWorld) {
  const mod = await import(pathToFileURL(sroScript('audit-skills.ts')).href);
  this.sroAudit = mod.audit(SRO_FIXTURES);
});

Then(/^the SRO audit result has totalSkills == 5$/, function (this: SroWorld) {
  assert.equal(this.sroAudit!.totalSkills, 5, `expected 5 skill subdirs, got ${this.sroAudit!.totalSkills}`);
});

Then(
  /^the SRO audit result contains keys "withErrors", "withWarnings", "overlaps", "details"$/,
  function (this: SroWorld) {
    for (const k of ['withErrors', 'withWarnings', 'overlaps', 'details']) {
      assert.ok(k in this.sroAudit!, `expected key "${k}" in the audit result`);
    }
  },
);

// ============================================================================
// SRO003 — forbidden token in frontmatter name (FR-2). In-process `audit()`.
// ============================================================================

Given(
  /^the SRO fixture `claude-in-name\/SKILL\.md` with a name carrying the forbidden token "claude"$/,
  function (this: SroWorld) {
    assert.ok(fs.existsSync(path.join(SRO_FIXTURES, 'claude-in-name', 'SKILL.md')), 'expected claude-in-name fixture');
  },
);

When(/^the skills audit scans the SRO fixtures for a forbidden name token$/, async function (this: SroWorld) {
  const mod = await import(pathToFileURL(sroScript('audit-skills.ts')).href);
  this.sroAudit = mod.audit(SRO_FIXTURES);
});

Then(
  /^the SRO audit withErrors contains a FRONTMATTER_NAME_FORBIDDEN_TOKEN finding with token "claude"$/,
  function (this: SroWorld) {
    const finding = this.sroAudit!.withErrors.find(
      (f) => f.code === 'FRONTMATTER_NAME_FORBIDDEN_TOKEN' && f.path.includes('claude-in-name'),
    );
    assert.ok(finding, 'expected a FRONTMATTER_NAME_FORBIDDEN_TOKEN finding for claude-in-name');
    // Real fixture name is `claude-helper` (kebab-case); the engine nests the offending
    // value + matched token under details (scenario prose originally said "Claude Helper",
    // which is only the body H1 — reconciled to the real frontmatter name + token).
    assert.equal((finding!.details as any).value, 'claude-helper');
    assert.equal((finding!.details as any).token, 'claude');
  },
);

// ============================================================================
// SRO004 — allowed-tools coverage gap (FR-3). In-process checkAllowedToolsCoverage().
//   Reconciled: the fixture body uses Bash AND Skill undeclared → ["Skill","Bash"].
// ============================================================================

Given(
  /^the SRO fixture with `allowed-tools: Read, Write` and a `Skill\(` invocation in the body$/,
  function (this: SroWorld) {
    assert.ok(
      fs.existsSync(path.join(SRO_FIXTURES, 'missing-allowed-tools', 'SKILL.md')),
      'expected missing-allowed-tools fixture',
    );
  },
);

When(/^the allowed-tools coverage check runs over that SRO fixture$/, async function (this: SroWorld) {
  const [auditMod, sharedMod] = await Promise.all([
    import(pathToFileURL(sroScript('audit-skills.ts')).href),
    import(pathToFileURL(sroScript('shared.ts')).href),
  ]);
  const asset = sharedMod.buildAsset(path.join(SRO_FIXTURES, 'missing-allowed-tools', 'SKILL.md'), 'skill');
  this.sroCoverage = auditMod.checkAllowedToolsCoverage(asset);
});

Then(
  /^the SRO coverage finding has code ALLOWED_TOOLS_MISSING and missing contains Skill and Bash$/,
  function (this: SroWorld) {
    assert.ok(this.sroCoverage, 'expected an ALLOWED_TOOLS_MISSING finding');
    assert.equal(this.sroCoverage!.code, 'ALLOWED_TOOLS_MISSING');
    const missing = (this.sroCoverage!.details as any).missing as string[];
    assert.ok(missing.includes('Skill'), `expected Skill in missing, got ${JSON.stringify(missing)}`);
    assert.ok(missing.includes('Bash'), `expected Bash in missing, got ${JSON.stringify(missing)}`);
  },
);

// ============================================================================
// SRO005 — triple-axis Jaccard overlap (FR-4). In-process detectOverlaps().
// ============================================================================

Given(
  /^the SRO `overlap-pair\/\{a,b\}` fixtures with overlapping trigger phrases$/,
  function (this: SroWorld) {
    for (const n of ['a', 'b']) {
      assert.ok(fs.existsSync(path.join(SRO_OVERLAP_DIR, n, 'SKILL.md')), `expected overlap-pair/${n} fixture`);
    }
  },
);

When(/^the overlap detector runs over the SRO fixtures$/, async function (this: SroWorld) {
  const mod = await import(pathToFileURL(sroScript('detect-overlap.ts')).href);
  this.sroOverlaps = mod.detectOverlaps(SRO_FIXTURES);
});

Then(
  /^the SRO overlaps contain a trigger-axis pair of a and b with similarity >= 0\.3$/,
  function (this: SroWorld) {
    const pair = this.sroOverlaps!.find(
      (p) => (p.a === 'a' && p.b === 'b') || (p.a === 'b' && p.b === 'a'),
    );
    assert.ok(pair, `expected an a/b overlap pair, got ${JSON.stringify(this.sroOverlaps)}`);
    assert.equal(pair!.axis, 'trigger');
    assert.ok(pair!.similarity >= 0.3, `expected similarity >= 0.3, got ${pair!.similarity}`);
  },
);

// ============================================================================
// SRO006 — merge emits invoke-agent envelope (FR-5). Spawn merge-skills.ts.
//   Reconciled: assert the real ENVELOPE the script emits (no main-turn orchestration).
// ============================================================================

Given(/^the SRO `overlap-pair` skills a and b with valid SKILL\.md files$/, function (this: SroWorld) {
  for (const n of ['a', 'b']) {
    assert.ok(fs.existsSync(path.join(SRO_OVERLAP_DIR, n, 'SKILL.md')), `expected overlap-pair/${n} fixture`);
  }
});

When(/^merge-skills runs `--execute a b --merged-name ab` over the SRO overlap pair$/, function (this: SroWorld) {
  this.sroRun = runSroScript('merge-skills.ts', [
    '--execute', 'a', 'b', '--merged-name', 'ab', '--skills-dir', SRO_OVERLAP_DIR,
  ]);
  assert.equal(this.sroRun.status, 0, `merge-skills exited ${this.sroRun.status}: ${this.sroRun.stderr}`);
  this.sroEnvelope = JSON.parse(this.sroRun.stdout);
});

Then(/^the SRO merge envelope action is "invoke-agent" with subagent_type "general-purpose"$/, function (this: SroWorld) {
  assert.equal(this.sroEnvelope.action, 'invoke-agent');
  assert.equal(this.sroEnvelope.subagent_type, 'general-purpose');
});

Then(/^the SRO merge envelope prompt contains both skill bodies and the continuation invokes verify-merge$/, function (this: SroWorld) {
  assert.ok(this.sroEnvelope.prompt.includes('overlap-fixture-a'), 'expected skill a body in prompt');
  assert.ok(this.sroEnvelope.prompt.includes('overlap-fixture-b'), 'expected skill b body in prompt');
  assert.ok(/verify-merge\.ts --merged/.test(this.sroEnvelope.continuation), 'expected verify-merge continuation');
});

// ============================================================================
// SRO011 — merge rejects path traversal in --merged-name (FR-5 / NFR-Security). Spawn.
// ============================================================================

When(/^merge-skills runs with a path-traversal merged-name over the SRO overlap pair$/, function (this: SroWorld) {
  this.sroRun = runSroScript('merge-skills.ts', [
    '--execute', 'a', 'b', '--merged-name', '../escape', '--skills-dir', SRO_OVERLAP_DIR,
  ]);
});

Then(/^the SRO merge exits non-zero rejecting path traversal$/, function (this: SroWorld) {
  assert.notEqual(this.sroRun!.status, 0, 'expected a non-zero exit for path traversal');
  assert.ok(this.sroRun!.stderr.includes('path traversal'), `expected "path traversal" in stderr, got: ${this.sroRun!.stderr}`);
});

// ============================================================================
// SRO012 — merge rejects a forbidden token in --merged-name (FR-5 / FR-2 reuse). Spawn.
// ============================================================================

When(/^merge-skills runs with a forbidden-token merged-name over the SRO overlap pair$/, function (this: SroWorld) {
  this.sroRun = runSroScript('merge-skills.ts', [
    '--execute', 'a', 'b', '--merged-name', 'claude-helper', '--skills-dir', SRO_OVERLAP_DIR,
  ]);
});

Then(/^the SRO merge exits non-zero rejecting the forbidden token$/, function (this: SroWorld) {
  assert.notEqual(this.sroRun!.status, 0, 'expected a non-zero exit for a forbidden token');
  assert.ok(this.sroRun!.stderr.includes('forbidden token'), `expected "forbidden token" in stderr, got: ${this.sroRun!.stderr}`);
});

// ============================================================================
// SRO013 — verify-merge emits the ratchet scorer envelope (FR-6). Spawn verify-merge.ts.
//   Consolidates the envelope shape: on_regression + on_pass + cleanup_suggestions.
// ============================================================================

When(/^verify-merge runs over a draft and the SRO overlap originals$/, function (this: SroWorld) {
  const fakeDraft = path.join(SRO_OVERLAP_DIR, 'a', 'SKILL.md');
  this.sroRun = runSroScript('verify-merge.ts', [
    '--merged', fakeDraft, '--originals', 'a', 'b', '--skills-dir', SRO_OVERLAP_DIR,
  ]);
  assert.equal(this.sroRun.status, 0, `verify-merge exited ${this.sroRun.status}: ${this.sroRun.stderr}`);
  this.sroEnvelope = JSON.parse(this.sroRun.stdout);
});

Then(/^the SRO scorer envelope routes on_regression to delete and on_pass to rename$/, function (this: SroWorld) {
  assert.equal(this.sroEnvelope.action, 'invoke-agent');
  assert.equal(this.sroEnvelope.subagent_type, 'general-purpose');
  assert.equal(this.sroEnvelope.decision_handler.on_regression, 'delete_draft_emit_report');
  assert.equal(this.sroEnvelope.decision_handler.on_pass, 'rename_draft_emit_cleanup');
});

Then(/^the SRO scorer envelope cleanup_suggestions lists rm -rf for both originals$/, function (this: SroWorld) {
  const cs = this.sroEnvelope.decision_handler.cleanup_suggestions as string[];
  assert.equal(cs.length, 2, `expected 2 cleanup suggestions, got ${cs.length}`);
  assert.ok(cs[0].includes('rm -rf') && cs[0].includes('a'), `expected rm -rf for a, got ${cs[0]}`);
  assert.ok(cs[1].includes('rm -rf') && cs[1].includes('b'), `expected rm -rf for b, got ${cs[1]}`);
});

// ============================================================================
// SRO014 — verify-merge --force propagates through decision_handler (FR-6). Spawn.
// ============================================================================

When(/^verify-merge runs with `--force` over a draft and the SRO overlap originals$/, function (this: SroWorld) {
  const fakeDraft = path.join(SRO_OVERLAP_DIR, 'a', 'SKILL.md');
  this.sroRun = runSroScript('verify-merge.ts', [
    '--merged', fakeDraft, '--originals', 'a', 'b', '--skills-dir', SRO_OVERLAP_DIR, '--force',
  ]);
  assert.equal(this.sroRun.status, 0, `verify-merge exited ${this.sroRun.status}: ${this.sroRun.stderr}`);
  this.sroEnvelope = JSON.parse(this.sroRun.stdout);
});

Then(/^the SRO scorer envelope decision_handler force is true$/, function (this: SroWorld) {
  assert.equal(this.sroEnvelope.decision_handler.force, true);
});

// ============================================================================
// SRO008 — originals preserved after a successful merge (FR-7). Spawn merge + read.
//   Reconciled: cleanup_suggestions moved to SRO013; here we assert only that the
//   originals are byte-unchanged after the merge envelope is generated.
// ============================================================================

Given(/^the SRO overlap originals a and b are captured byte-for-byte$/, function (this: SroWorld) {
  this.sroOriginalsBefore = {
    a: fs.readFileSync(path.join(SRO_OVERLAP_DIR, 'a', 'SKILL.md'), 'utf-8'),
    b: fs.readFileSync(path.join(SRO_OVERLAP_DIR, 'b', 'SKILL.md'), 'utf-8'),
  };
});

When(/^merge-skills generates a merge envelope over the SRO overlap pair$/, function (this: SroWorld) {
  this.sroRun = runSroScript('merge-skills.ts', [
    '--execute', 'a', 'b', '--merged-name', 'merged-preserve-test', '--skills-dir', SRO_OVERLAP_DIR,
  ]);
  assert.equal(this.sroRun.status, 0, `merge-skills exited ${this.sroRun.status}: ${this.sroRun.stderr}`);
});

Then(/^the SRO originals a and b remain on disk unchanged$/, function (this: SroWorld) {
  assert.equal(fs.readFileSync(path.join(SRO_OVERLAP_DIR, 'a', 'SKILL.md'), 'utf-8'), this.sroOriginalsBefore!.a);
  assert.equal(fs.readFileSync(path.join(SRO_OVERLAP_DIR, 'b', 'SKILL.md'), 'utf-8'), this.sroOriginalsBefore!.b);
});

// ============================================================================
// SRO010 — OVERSIZE warning for a SKILL.md over the 500-line cap (FR-2).
//   In-process checkOversize(). (vitest it#4 had no scenario twin — added.)
// ============================================================================

Given(/^the SRO `oversize-skill\/SKILL\.md` fixture over 500 lines$/, function (this: SroWorld) {
  assert.ok(fs.existsSync(path.join(SRO_FIXTURES, 'oversize-skill', 'SKILL.md')), 'expected oversize-skill fixture');
});

When(/^the oversize check runs over that SRO fixture$/, async function (this: SroWorld) {
  const [auditMod, sharedMod] = await Promise.all([
    import(pathToFileURL(sroScript('audit-skills.ts')).href),
    import(pathToFileURL(sroScript('shared.ts')).href),
  ]);
  const asset = sharedMod.buildAsset(path.join(SRO_FIXTURES, 'oversize-skill', 'SKILL.md'), 'skill');
  this.sroOversize = auditMod.checkOversize(asset);
});

Then(/^the SRO oversize finding has code OVERSIZE with more than 500 lines$/, function (this: SroWorld) {
  assert.ok(this.sroOversize, 'expected an OVERSIZE finding');
  assert.equal(this.sroOversize!.code, 'OVERSIZE');
  assert.ok((this.sroOversize!.details as any).lines > 500, `expected > 500 lines, got ${(this.sroOversize!.details as any).lines}`);
});

// ============================================================================
// SRO015 — FR-8 unified scoring engine: ONE flexible parser handles BOTH a rule
// (paths:) and a skill (name/description/allowed-tools). Drives the real
// parseFrontmatterFlexible from shared.ts. Mutation: break the parser → RED.
// ============================================================================

Given(/^a rule-format frontmatter and a skill-format frontmatter for the unified engine$/, function (this: SroWorld) {
  this.sroRuleFm = '---\npaths:\n  - "**/*.ts"\n---\nrule body for the unified engine';
  this.sroSkillFm = '---\nname: probe-skill\ndescription: Does a probe thing for the unified engine.\nallowed-tools: Read, Write\n---\nskill body for the unified engine';
});

When(/^parseFrontmatterFlexible parses each through the unified engine$/, async function (this: SroWorld) {
  const shared = await import(pathToFileURL(sroScript('shared.ts')).href);
  this.sroRuleParsed = shared.parseFrontmatterFlexible(this.sroRuleFm!);
  this.sroSkillParsed = shared.parseFrontmatterFlexible(this.sroSkillFm!);
});

Then(/^the rule frontmatter exposes paths and the skill frontmatter exposes name and allowed-tools$/, function (this: SroWorld) {
  assert.ok(this.sroRuleParsed!.hasFrontmatter && 'paths' in this.sroRuleParsed!.frontmatter, 'unified engine parsed the rule paths');
  const sf = this.sroSkillParsed!.frontmatter;
  assert.ok('name' in sf && 'allowed-tools' in sf, 'unified engine parsed the skill name + allowed-tools');
});

// ============================================================================
// SRO016 — FR-10 embedding-based semantic merge is OUT OF SCOPE: the merge +
// overlap engine carry NO embedding/vector code (overlap is Jaccard, FR-4).
// Mutation: add an embedding-merge path → RED. Drives the real engine sources.
// ============================================================================

Given(/^the merge-skills and detect-overlap engine sources$/, function (this: SroWorld) {
  this.sroMergeSrc = fs.readFileSync(sroScript('merge-skills.ts'), 'utf-8');
  this.sroOverlapSrc = fs.readFileSync(sroScript('detect-overlap.ts'), 'utf-8');
});

When(/^the merge engine sources are scanned for embedding or vector similarity dependencies$/, function (this: SroWorld) {
  this.sroEmbeddingHits = `${this.sroMergeSrc}\n${this.sroOverlapSrc}`.match(/embedding|cosine|\bvectors?\b|openai|sentence-transformer/gi) ?? [];
});

Then(/^no embedding-based implementation is present and overlap detection uses Jaccard$/, function (this: SroWorld) {
  assert.deepEqual(this.sroEmbeddingHits, [], `FR-10 OUT OF SCOPE — no embedding code expected; got ${JSON.stringify(this.sroEmbeddingHits)}`);
  assert.ok(/jaccard/i.test(this.sroOverlapSrc!), 'overlap detection uses Jaccard (the non-embedding approach)');
});

// ============================================================================
// SRO017 — FR-11 auto-apply WITHOUT human review is OUT OF SCOPE: merge-skills
// EMITS an invoke-agent envelope and writes NO merged skill to disk (the apply
// is deferred to the reviewed agent turn). Mutation: auto-write the merge → RED.
// ============================================================================

Given(/^the SRO overlap-pair skills a and b$/, function (this: SroWorld) {
  for (const n of ['a', 'b']) {
    assert.ok(fs.existsSync(path.join(SRO_OVERLAP_DIR, n, 'SKILL.md')), `expected overlap-pair/${n} fixture`);
  }
});

When(/^merge-skills runs --execute over the overlap pair with a probe merged-name$/, function (this: SroWorld) {
  this.sroProbeMergedDir = path.join(SRO_OVERLAP_DIR, 'sro-autoapply-probe');
  this.sroRun = runSroScript('merge-skills.ts', [
    '--execute', 'a', 'b', '--merged-name', 'sro-autoapply-probe', '--skills-dir', SRO_OVERLAP_DIR,
  ]);
  try { this.sroEnvelope = JSON.parse(this.sroRun.stdout); } catch { this.sroEnvelope = null; }
});

Then(/^it emits an invoke-agent envelope and writes no merged skill directory to disk$/, function (this: SroWorld) {
  assert.ok(this.sroEnvelope && this.sroEnvelope.action === 'invoke-agent', `merge emits an invoke-agent envelope (delegation, not auto-apply); got: ${this.sroRun!.stdout.slice(0, 160)}`);
  assert.ok(!fs.existsSync(this.sroProbeMergedDir!), 'FR-11 OUT OF SCOPE — merge auto-wrote a merged skill dir; it must only emit an envelope for reviewed apply');
});

// ============================================================================
// SRO009 — rules backward-compat dispatcher (FR-9). Spawn audit.ts.
//   Reconciled: assert audit.ts routes .claude/rules to the rules pipeline and
//   --save writes the 6 canonical rules-audit keys (the verifiable backward-compat).
// ============================================================================

Given(/^the SRO audit dispatcher is invoked against the real `\.claude\/rules` directory$/, function (this: SroWorld) {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, '.claude', 'rules')), 'expected .claude/rules on disk');
});

When(/^audit\.ts runs `--dir \.claude\/rules --save` to a temp file$/, function (this: SroWorld) {
  const saveTo = path.join(this.tempDir, 'audit_before.json');
  this.sroRun = runSroScript('audit.ts', ['--dir', path.join(REPO_ROOT, '.claude', 'rules'), '--save', saveTo]);
  assert.equal(this.sroRun.status, 0, `audit.ts exited ${this.sroRun.status}: ${this.sroRun.stderr}`);
  this.sroEnvelope = JSON.parse(fs.readFileSync(saveTo, 'utf-8'));
});

Then(
  /^the SRO rules audit JSON contains keys totalFiles, totalTokens, withPaths, withoutPaths, mergeCandidates, antipatternFiles$/,
  function (this: SroWorld) {
    for (const k of ['totalFiles', 'totalTokens', 'withPaths', 'withoutPaths', 'mergeCandidates', 'antipatternFiles']) {
      assert.ok(k in this.sroEnvelope, `expected rules-audit key "${k}"`);
    }
  },
);
