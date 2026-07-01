/**
 * Step definitions — spec-variant-matrix BDD migration (SVM — variant-matrix engine, in-process).
 *
 * Drives the REAL variant-matrix engine (no mock, no inline copy of production logic) per the
 * BDD-migration rollout (spec-generator-v4 FR-51 / Phase 27):
 *   - in-process TS: detectPolymorphicFRs (trigger-phrases.ts), parseDecisionTable /
 *     parseExamplesTable / parseVariantTasks (parsers.ts), checkVariantCoverage (audit.ts),
 *     appendEscapeLog (escape-log.ts) — each over the SAME six real fixtures the vitest twin uses.
 *   - artifact: FR-8 reads the real variant-matrix-build SKILL.md frontmatter; FR-9 asserts the
 *     deferred form-guard file is ABSENT (proves the OUT-OF-SCOPE deferral; reddens if shipped).
 * No spawn: every behaviour is a deterministic pure-function / fs call.
 *
 * The vitest twin being migrated is tests/e2e/specs-generator-variant-matrix.test.ts (17 it()s).
 * 16 of those 17 behaviours are ported 1:1 here, grouped under the spec's @feature1..@feature9 tags.
 * The 17th — SVM_DETECT_04 — is `expect(content).toMatch(/[skip-variant-matrix:…]/)`, a tautological
 * assertion over fixture CONTENT that drives no production code (structurally incapable of going RED),
 * so it is deliberately NOT ported as a fake-green; its intent (the escape-hatch syntax is recognised)
 * is subsumed — and proven behaviourally — by the @feature7 escape scenarios (short-reason →
 * WARNING_REASON_TOO_SHORT, exactly-8-char boundary → ESCAPE_HATCH_USED), which DO redden if the
 * marker is absent. Added on top of the 16: the FR-7 exactly-8-char boundary (the escape-hatch-boundary-8
 * fixture the vitest twin left unused) and the FR-8 / FR-9 artifact scenarios the twin never had.
 *
 * REGEX step-defs (NOT cucumber-expressions): the scenario text carries backticks, `()`, `[]` and
 * `=` (`parseDecisionTable`, `[skip-variant-matrix: …]`, `axis=value`) which a cucumber-expression
 * reads as optional/alternative groups (see .claude/rules reference_cucumber-js-step-parens-optional).
 * Every regex is scoped to spec-variant-matrix's own vocabulary (detectPolymorphicFRs /
 * checkVariantCoverage / VARIANT_COVERAGE / MATRIX_COMPLETE / AC_DECISION_TABLE_MISSING /
 * [skip-variant-matrix:] / parseDecisionTable|parseExamplesTable|parseVariantTasks) so the file —
 * loaded by the whole suite via cucumber.json's tests/step_definitions/** glob — cannot collide with
 * another feature's step in the shared run.
 *
 * Reconciliation applied to the .feature via the MCP door (see the migration report):
 *   - all 9 scenarios were scenario-writer skeletons (Given `<precondition>` / When `<action>` /
 *     Then `<expected>`), graph-tagged @feature1..@feature9 but with no real steps. Rewritten so each
 *     FR's scenario(s) assert what the real engine actually returns.
 *   - FR-8's FR.md cited the stale pre-v2.0 path extensions/specs-workflow/.claude/skills/… ; the
 *     real skill lives at the canonical .claude/skills/variant-matrix-build/SKILL.md (reconciled).
 *
 * @see .specs/spec-variant-matrix/spec-variant-matrix.feature
 * @see .claude/skills/bdd-migrator/SKILL.md
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import {
  detectPolymorphicFRs,
  type PolymorphicFRResult,
} from '../../tools/specs-generator/variant-matrix/trigger-phrases.ts';
import {
  parseDecisionTable,
  parseExamplesTable,
  parseVariantTasks,
  type DecisionTableRow,
  type ExamplesRow,
  type VariantTask,
} from '../../tools/specs-generator/variant-matrix/parsers.ts';
import {
  checkVariantCoverage,
  type AuditFinding,
} from '../../tools/specs-generator/variant-matrix/audit.ts';
import { appendEscapeLog } from '../../tools/specs-generator/variant-matrix/escape-log.ts';

const REPO_ROOT = process.cwd();
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'specs-generator', 'variant-matrix');
const SKILL_MD = path.join(REPO_ROOT, '.claude', 'skills', 'variant-matrix-build', 'SKILL.md');
const GUARD_TS = path.join(REPO_ROOT, 'tools', 'specs-generator', 'variant-matrix', 'variant-matrix-guard.ts');

interface SvmWorld extends V4World {
  // detection
  detected?: PolymorphicFRResult[];
  // parsers
  decisionRows?: DecisionTableRow[];
  examplesRows?: ExamplesRow[];
  variantTasks?: VariantTask[];
  // audit
  findings?: AuditFinding[];
  // escape-log
  logRows?: string[];
  // artifacts
  skillText?: string;
}

// --- fixture readers (the SAME six fixtures the vitest twin reads, no fabricated data) ---
function readFixtureFR(fixture: string): string {
  return fs.readFileSync(path.join(FIXTURES, fixture, 'FR.md'), 'utf-8');
}
function readFixtureAC(fixture: string): string {
  return fs.readFileSync(path.join(FIXTURES, fixture, 'ACCEPTANCE_CRITERIA.md'), 'utf-8');
}
function readFixtureFeature(fixture: string): string {
  const dir = path.join(FIXTURES, fixture);
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.feature'));
  assert.ok(file, `fixture ${fixture} has a .feature file`);
  return fs.readFileSync(path.join(dir, file!), 'utf-8');
}

// =====================================================================================
// @feature1 — FR-1: Polymorphic trigger detection через mechanical regex (detectPolymorphicFRs)
// =====================================================================================
// Named fixture, referenced bare (`polymorphic-fr-no-matrix/`) — capture the dir name.
Given(/^FR\.md fixture `([\w-]+)\/` загружен для detectPolymorphicFRs$/, function (this: SvmWorld, fixture: string) {
  this.detected = detectPolymorphicFRs(readFixtureFR(fixture));
});

When(/^запущен detectPolymorphicFRs над содержимым FR\.md$/, function () {
  // detection already ran in the Given (content is the input); this When is the action marker.
});

Then(/^detectPolymorphicFRs возвращает ровно (\d+) polymorphic FR с hardOut=false и >=2 triggers$/, function (this: SvmWorld, n: string) {
  const r = this.detected ?? [];
  assert.equal(r.length, Number(n), `expected ${n} detected FRs; got ${JSON.stringify(r.map((x) => x.frId))}`);
  assert.equal(r[0].frId, 'FR-1', 'first detected FR is FR-1');
  assert.equal(r[0].hardOut, false, 'not a hard-OUT match');
  assert.ok(r[0].triggers.length >= 2, `>=2 trigger hits; got ${r[0].triggers.length}`);
});

Then(/^среди triggers detectPolymorphicFRs есть RU фраза \(для каждого\|переиспользуем\|общая\)$/, function (this: SvmWorld) {
  const r = this.detected ?? [];
  assert.equal(r.length, 1, 'one RU polymorphic FR detected');
  assert.equal(r[0].hardOut, false, 'RU FR is not hard-OUT');
  const ruMatched = r[0].triggers.some((t) => /для каждого|переиспользуем|общ(?:ая|ий)/i.test(t.phrase));
  assert.ok(ruMatched, `a RU trigger phrase matched; got ${JSON.stringify(r[0].triggers.map((t) => t.phrase))}`);
});

// =====================================================================================
// @feature2 — FR-2: Hard-OUT signals / anti-over-application (detectPolymorphicFRs hardOut path)
// =====================================================================================
Then(/^каждый detectPolymorphicFRs результат имеет hardOut=true$/, function (this: SvmWorld) {
  const r = this.detected ?? [];
  assert.ok(r.length >= 1, 'hard-OUT fixture still surfaces the FR for diagnostic visibility');
  assert.ok(r.every((x) => x.hardOut === true), `every result hardOut=true; got ${JSON.stringify(r.map((x) => ({ fr: x.frId, hardOut: x.hardOut })))}`);
});

// =====================================================================================
// @feature3 — FR-3: AC Decision Table обязательна per polymorphic FR (parseDecisionTable)
// =====================================================================================
Given(/^ACCEPTANCE_CRITERIA\.md fixture `([\w-]+)\/` загружен для parseDecisionTable FR-1$/, function (this: SvmWorld, fixture: string) {
  this.decisionRows = parseDecisionTable(readFixtureAC(fixture), 'FR-1');
});

When(/^запущен parseDecisionTable над AC содержимым$/, function () {});

Then(/^parseDecisionTable возвращает >=(\d+) строк и первая строка variant=inbound$/, function (this: SvmWorld, n: string) {
  const rows = this.decisionRows ?? [];
  assert.ok(rows.length >= Number(n), `expected >=${n} decision rows; got ${rows.length}`);
  assert.equal(rows[0].variant, 'inbound', `first row variant=inbound; got ${rows[0].variant}`);
});

Then(/^parseDecisionTable возвращает пустой массив$/, function (this: SvmWorld) {
  assert.deepEqual(this.decisionRows, [], 'AC without a Variant+Coverage table yields no rows');
});

Then(/^среди parseDecisionTable строк есть coverage=excluded с outOfScopeReason про server-generated$/, function (this: SvmWorld) {
  const excluded = (this.decisionRows ?? []).find((r) => r.coverage === 'excluded');
  assert.ok(excluded, 'an excluded row is present');
  assert.match(String(excluded!.outOfScopeReason), /server-generated/, 'excluded row carries its OUT_OF_SCOPE reason');
});

// =====================================================================================
// @feature4 — FR-4: Gherkin Scenario Outline в .feature 1:1 с AC (parseExamplesTable)
// =====================================================================================
// Drives parseExamplesTable over the FIXTURE's .feature (the complete fixture's @feature1 Outline) —
// NOT over this spec's own .feature, which is deliberately plain (no Examples) so it can't add noise.
Given(/^\.feature fixture `polymorphic-fr-complete\/` загружен для parseExamplesTable @feature1$/, function (this: SvmWorld) {
  this.examplesRows = parseExamplesTable(readFixtureFeature('polymorphic-fr-complete'), '@feature1');
});

Given(/^\.feature без Scenario Outline собран inline для parseExamplesTable @feature1$/, function (this: SvmWorld) {
  const noOutline = 'Feature: NoOutline\n\n  Scenario: just one\n    Given x\n    When y\n    Then z\n';
  this.examplesRows = parseExamplesTable(noOutline, '@feature1');
});

When(/^запущен parseExamplesTable над \.feature содержимым$/, function () {});

Then(/^parseExamplesTable возвращает >=(\d+) Examples строк$/, function (this: SvmWorld, n: string) {
  assert.ok((this.examplesRows ?? []).length >= Number(n), `expected >=${n} Examples rows; got ${(this.examplesRows ?? []).length}`);
});

Then(/^parseExamplesTable возвращает пустой массив Examples$/, function (this: SvmWorld) {
  assert.deepEqual(this.examplesRows, [], 'a plain Scenario (no Outline) yields no Examples rows');
});

// =====================================================================================
// @feature5 — FR-5: TASKS.md per-variant (parseVariantTasks)
// =====================================================================================
Given(/^TASKS\.md с двумя задачами и tracer line `_Variant: axis=value_` собран inline$/, function (this: SvmWorld) {
  const tasks =
    '## Phase 1\n\n' +
    '- [ ] T1 -- @feature1 — Status: TODO | Est: 30m\n  _Variant: doctype=IN_\n' +
    '- [ ] T2 -- @feature1 — Status: TODO | Est: 30m\n  _Variant: doctype=OUT_\n';
  this.variantTasks = parseVariantTasks(tasks, '@feature1');
});

When(/^запущен parseVariantTasks над TASKS содержимым$/, function () {});

Then(/^parseVariantTasks возвращает 2 задачи и первая axis=doctype value=IN$/, function (this: SvmWorld) {
  const t = this.variantTasks ?? [];
  assert.equal(t.length, 2, `expected 2 variant tasks; got ${t.length}`);
  assert.equal(t[0].axis, 'doctype', 'first task axis=doctype');
  assert.equal(t[0].value, 'IN', 'first task value=IN');
});

// =====================================================================================
// @feature6 — FR-6: Audit category VARIANT_COVERAGE (checkVariantCoverage)
// =====================================================================================
Given(/^spec fixture `([\w-]+)\/` передан в checkVariantCoverage$/, function (this: SvmWorld, fixture: string) {
  this.findings = checkVariantCoverage(path.join(FIXTURES, fixture));
});

When(/^запущен checkVariantCoverage над spec директорией$/, function () {});

Then(/^checkVariantCoverage не выдаёт ни одного WARNING и есть MATRIX_COMPLETE INFO finding$/, function (this: SvmWorld) {
  const f = this.findings ?? [];
  const warnings = f.filter((x) => x.severity === 'WARNING');
  assert.deepEqual(warnings, [], `complete matrix emits 0 WARNINGs; got ${JSON.stringify(warnings.map((w) => w.code))}`);
  const complete = f.find((x) => x.code === 'MATRIX_COMPLETE');
  assert.ok(complete, 'a MATRIX_COMPLETE finding is present');
  assert.equal(complete!.severity, 'INFO', 'MATRIX_COMPLETE is an INFO positive-signal finding');
});

Then(/^первый checkVariantCoverage finding имеет category=VARIANT_COVERAGE code=AC_DECISION_TABLE_MISSING severity=WARNING$/, function (this: SvmWorld) {
  const f = this.findings ?? [];
  assert.ok(f.length >= 1, `expected >=1 finding; got ${f.length}`);
  assert.equal(f[0].category, 'VARIANT_COVERAGE', 'category is VARIANT_COVERAGE');
  assert.equal(f[0].code, 'AC_DECISION_TABLE_MISSING', `code AC_DECISION_TABLE_MISSING; got ${f[0].code}`);
  assert.equal(f[0].severity, 'WARNING', 'missing decision table is a STOP-blocking WARNING');
});

Then(/^среди checkVariantCoverage findings есть AC_DECISION_TABLE_MISSING$/, function (this: SvmWorld) {
  const hit = (this.findings ?? []).find((x) => x.code === 'AC_DECISION_TABLE_MISSING');
  assert.ok(hit, `RU polymorphic FR is flagged AC_DECISION_TABLE_MISSING; got ${JSON.stringify((this.findings ?? []).map((x) => x.code))}`);
});

Then(/^checkVariantCoverage не выдаёт ни одного WARNING \(hard-OUT\)$/, function (this: SvmWorld) {
  const warnings = (this.findings ?? []).filter((x) => x.severity === 'WARNING');
  assert.deepEqual(warnings, [], `hard-OUT spec must emit 0 WARNINGs (H1 anti-over-application); got ${JSON.stringify(warnings.map((w) => w.code))}`);
});

Then(/^среди checkVariantCoverage findings есть WARNING_REASON_TOO_SHORT INFO$/, function (this: SvmWorld) {
  const short = (this.findings ?? []).find((x) => x.code === 'WARNING_REASON_TOO_SHORT');
  assert.ok(short, 'short escape reason surfaces WARNING_REASON_TOO_SHORT');
  assert.equal(short!.severity, 'INFO', 'short-reason finding is downgraded to INFO');
});

// boundary-8: escape reason exactly 8 chars → valid escape (ESCAPE_HATCH_USED INFO), NOT too-short.
Then(/^среди checkVariantCoverage findings есть ESCAPE_HATCH_USED INFO и нет WARNING_REASON_TOO_SHORT$/, function (this: SvmWorld) {
  const f = this.findings ?? [];
  const used = f.find((x) => x.code === 'ESCAPE_HATCH_USED');
  assert.ok(used, `8-char reason is a valid escape (ESCAPE_HATCH_USED); got ${JSON.stringify(f.map((x) => x.code))}`);
  assert.equal(used!.severity, 'INFO', 'valid escape is INFO');
  const tooShort = f.find((x) => x.code === 'WARNING_REASON_TOO_SHORT');
  assert.equal(tooShort, undefined, 'exactly-8-char boundary must NOT trip WARNING_REASON_TOO_SHORT');
});

// =====================================================================================
// @feature7 — FR-7: Escape hatch с audit log (appendEscapeLog атомарность)
// =====================================================================================
Given(/^один appendEscapeLog вызван в tmpdir с reason >=8 chars$/, async function (this: SvmWorld) {
  await appendEscapeLog(this.tempDir, {
    ts: '2026-04-29T00:00:00Z',
    spec: 'spec-x',
    fr: 'FR-1',
    reason: 'covered by parametrized helper at runner.ts',
    session_id: 'abc',
  });
});

Given(/^appendEscapeLog вызван дважды в tmpdir \(O_APPEND\)$/, async function (this: SvmWorld) {
  const entry = {
    ts: '2026-04-29T00:00:00Z',
    spec: 'spec-x',
    fr: 'FR-1',
    reason: 'covered by parametrized helper at runner.ts',
    session_id: 'abc',
  };
  await appendEscapeLog(this.tempDir, entry);
  await appendEscapeLog(this.tempDir, { ...entry, fr: 'FR-2' });
});

When(/^прочитан spec-variant-matrix-escapes\.jsonl лог$/, function (this: SvmWorld) {
  const logPath = path.join(this.tempDir, '.claude', 'logs', 'spec-variant-matrix-escapes.jsonl');
  assert.ok(fs.existsSync(logPath), 'appendEscapeLog created the JSONL log at .claude/logs/');
  this.logRows = fs.readFileSync(logPath, 'utf-8').split('\n').filter(Boolean);
});

Then(/^лог содержит ровно 1 JSONL строку с spec=spec-x$/, function (this: SvmWorld) {
  const rows = this.logRows ?? [];
  assert.equal(rows.length, 1, `one append → one JSONL row; got ${rows.length}`);
  assert.equal(JSON.parse(rows[0]).spec, 'spec-x', 'logged entry carries the spec slug');
});

Then(/^лог содержит ровно 2 JSONL строки \(idempotent O_APPEND\)$/, function (this: SvmWorld) {
  assert.equal((this.logRows ?? []).length, 2, `two appends → two JSONL rows; got ${(this.logRows ?? []).length}`);
});

// =====================================================================================
// @feature8 — FR-8: Phase 2 sub-skill variant-matrix-build (ARTIFACT — frontmatter contract)
// =====================================================================================
Given(/^файл SKILL\.md скила variant-matrix-build прочитан$/, function (this: SvmWorld) {
  assert.ok(fs.existsSync(SKILL_MD), `variant-matrix-build SKILL.md present at ${SKILL_MD}`);
  this.skillText = fs.readFileSync(SKILL_MD, 'utf-8');
});

When(/^проверен frontmatter контракт variant-matrix-build$/, function () {});

Then(/^SKILL\.md содержит disable-model-invocation: true и ссылается на polymorphic dispatch detection$/, function (this: SvmWorld) {
  const text = this.skillText ?? '';
  assert.match(text, /^disable-model-invocation:\s*true\s*$/m, 'caller-only skill: disable-model-invocation: true');
  assert.match(text, /name:\s*variant-matrix-build/, 'frontmatter names the skill');
  assert.match(text, /polymorphic/i, 'mission references polymorphic dispatch detection (its real job)');
});

// =====================================================================================
// @feature9 — FR-9: PreToolUse form-guard — OUT OF SCOPE (negative artifact assertion)
// =====================================================================================
// FR-9 is deferred to v0.2.0 (FR.md "> OUT OF SCOPE"). No code exists — assert the guard is ABSENT.
// This is honest (not faked-green): it reddens the moment someone ships variant-matrix-guard.ts
// without lifting the OUT-OF-SCOPE marker, surfacing the spec/reality divergence.
Given(/^FR-9 form-guard помечен OUT OF SCOPE \(deferred to v0\.2\.0\)$/, function () {});

When(/^проверено наличие variant-matrix-guard\.ts$/, function () {});

Then(/^файл variant-matrix-guard\.ts отсутствует в tools\/specs-generator\/variant-matrix$/, function () {
  assert.ok(!fs.existsSync(GUARD_TS), `FR-9 is deferred: variant-matrix-guard.ts must NOT exist yet (found ${GUARD_TS})`);
});
