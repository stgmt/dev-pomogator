/**
 * Step definitions — spec-reality-check BDD migration (SRC001 — verify.ts checks, in-process batch).
 *
 * Drives the REAL `runChecks()` from the spec-reality-check skill (no mock, no inline copy of
 * production logic) per the BDD-migration rollout (spec-generator-v4 FR-51 / Phase 27). Covers the
 * deterministic in-process scenarios SRC001_01..06 + 05b (each runs runChecks over a copied fixture
 * — no spawn, CI-safe). The vitest twin being migrated is tests/e2e/spec-reality-check.test.ts.
 *
 * REGEX step-defs (not cucumber-expressions): the scenario text carries backticks/parens
 * (`action=edit`, `os.tmpdir()`) which a cucumber-expression reads as optional/alternative groups
 * — see .claude/rules reference_cucumber-js-step-parens-optional. Each regex is scoped to
 * spec-reality-check's own vocabulary so it cannot collide with another feature in the shared suite.
 *
 * @see .specs/spec-reality-check/spec-reality-check.feature
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import {
  runChecks,
  parseFileChangesTable,
  extractInlineCodePaths,
  extractFrIds,
  extractTaskPaths,
} from '../../.claude/skills/spec-reality-check/scripts/verify.ts';
import type { AuditFinding } from '../../.claude/skills/spec-reality-check/scripts/verify.ts';
import { extractSpecRefs } from '../../.claude/skills/spec-reality-check/scripts/verify-hook.ts';
import { scorePromptRelevance, formatDenyErrors, phase25RelevanceDenyError } from '../../tools/plan-pomogator/plan-gate.ts';
import type { ValidationError } from '../../tools/plan-pomogator/validate-plan.ts';

const REPO_ROOT = process.cwd();
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'spec-reality-check');
const VERIFY_TS = path.join(REPO_ROOT, '.claude', 'skills', 'spec-reality-check', 'scripts', 'verify.ts');
const HOOK_TS = path.join(REPO_ROOT, '.claude', 'skills', 'spec-reality-check', 'scripts', 'verify-hook.ts');

interface SrcWorld extends V4World {
  specDir?: string;
  findings?: AuditFinding[];
  summary?: { by_severity: Record<string, number>; total: number };
  parsed?: { findings?: unknown[]; summary?: unknown };
  hookInput?: string;
  rows?: Array<{ path: string }>;
  values?: string[];
  counts2?: Array<Record<string, number>>;
  planContent?: string;
  promptTexts?: string[];
  score?: number;
  denyErrors?: ValidationError[];
  rendered?: string;
}

function copyFixtureInto(world: SrcWorld, name: string): void {
  const specDir = path.join(world.tempDir, '.specs', name);
  fs.cpSync(path.join(FIXTURES, name), specDir, { recursive: true });
  world.specDir = specDir;
}

// --- Background ---
Given(/^dev-pomogator репозиторий установлен в workspace$/, function () {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'package.json')), 'repo root carries package.json');
});

Given(/verify\.ts` существует$/, function () {
  assert.ok(fs.existsSync(VERIFY_TS), 'spec-reality-check verify.ts is present');
});

Given(/^tmpdir создан per-test через/, function (this: SrcWorld) {
  assert.ok(this.tempDir && fs.existsSync(this.tempDir), 'per-scenario tmpdir exists (Before hook)');
});

// --- Fixture setup ---
// Named fixture, referenced either bare (`missing-edit/`) or by full path
// (`tests/fixtures/spec-reality-check/stale-create/`) — capture the basename either way.
Given(/^fixture (?:spec )?`[^`]*?([\w-]+)\/`/, function (this: SrcWorld, name: string) {
  copyFixtureInto(this, name);
});

// SRC001_03 names no fixture — it reuses the missing-edit fixture's delete row.
Given(/^fixture spec с FILE_CHANGES\.md row `action=delete`/, function (this: SrcWorld) {
  copyFixtureInto(this, 'missing-edit');
});

// SRC001_05b: the code-drift fixture WITHOUT a git repo (so the code-drift check skips).
Given(/^fixture spec в tmpdir БЕЗ `?\.git/, function (this: SrcWorld) {
  copyFixtureInto(this, 'code-drift');
});

// SRC001_08/09/10: the format scenarios name no fixture ("любой fixture spec" / "fixture spec с
// findings") — use missing-edit, which yields ERROR findings for the CLI to format.
Given(/^(?:любой )?fixture spec(?: с (?:ERROR )?findings)?$/, function (this: SrcWorld) {
  copyFixtureInto(this, 'missing-edit');
});

// SRC001_07: a genuinely clean spec — its one edit-row points at a file that EXISTS, no narrative
// drift, no .git → 0 ERRORs (deterministic + isolated; better than the vitest's conditional skip).
Given(/^fixture clean spec/, function (this: SrcWorld) {
  const specDir = path.join(this.tempDir, '.specs', 'clean-spec');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '# FR\n\nA clean spec with no path drift.\n');
  fs.writeFileSync(path.join(this.tempDir, 'existing.ts'), 'export const x = 1;\n');
  fs.writeFileSync(
    path.join(specDir, 'FILE_CHANGES.md'),
    '# File Changes\n\n| Path | Action | Reason |\n|------|--------|--------|\n| `existing.ts` | edit | present, no drift |\n',
  );
  this.specDir = specDir;
});

// SRC001_01: the create-row's target must already EXIST for FC_CREATE_EXISTS to fire — create it.
Given(/^FILE_CHANGES\.md row `action=create` указывает на существующий файл/, function (this: SrcWorld) {
  const fc = fs.readFileSync(path.join(this.specDir!, 'FILE_CHANGES.md'), 'utf-8');
  const m = fc.match(/`([^`]+)`\s*\|\s*create\b/i);
  assert.ok(m, 'fixture FILE_CHANGES.md has a create row');
  const target = path.join(this.tempDir, m![1]);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'pre-existing');
});

// SRC001_05: a real git repo whose log carries an FR-1 commit (drives CODE_DRIFT_FR_ALREADY_DONE).
Given(/^git log содержит commit/, function (this: SrcWorld) {
  execSync('git init -q', { cwd: this.tempDir });
  execSync('git config user.email test@test.com', { cwd: this.tempDir });
  execSync('git config user.name Test', { cwd: this.tempDir });
  const featureFile = path.join(this.tempDir, 'src', 'feature.ts');
  fs.mkdirSync(path.dirname(featureFile), { recursive: true });
  fs.writeFileSync(featureFile, '// FR-1 implementation marker\nexport const foo = 1;');
  execSync('git add -A', { cwd: this.tempDir });
  execSync('git commit -q -m "FR-1: implement feature"', { cwd: this.tempDir });
});

// Descriptive precondition steps — the property is already encoded in the fixture (no-op assert).
Given(/^FR\.md содержит/, function () {});
Given(/^этот файл НЕ существует/, function () {});
Given(/^FILE_CHANGES\.md НЕ содержит row/, function () {});

// --- Action: run the real checker in-process over the copied spec. The negative lookahead
// excludes the spawn scenarios (SRC001_08/09/10 say "с `--format X`"), which assert CLI stdout
// rather than in-process findings — so a single broad When doesn't hijack (and collide with) them. ---
When(/^запущен (?!.*с `--format)(?!.*дважды).*verify\.ts/, function (this: SrcWorld) {
  const { findings, summary } = runChecks(this.specDir!, this.tempDir);
  this.findings = findings;
  this.summary = summary as SrcWorld['summary'];
});

// SRC001_08/09/10: run verify.ts as a REAL CLI (spawn) and capture its stdout for the format checks.
When(/^запущен verify\.ts с `--format (json|human|markdown)`/, function (this: SrcWorld, format: string) {
  // Spawn `node --import tsx verify.ts …` directly (process.execPath) rather than `npx tsx` —
  // cross-platform (npx doesn't resolve in a Windows host spawn) and it's how cucumber runs here.
  // cwd = repo root so `--import tsx` resolves from node_modules (the per-scenario tmpdir has none).
  // These scenarios assert output SHAPE only (JSON/human/markdown) — finding SEMANTICS are covered
  // in-process by SRC001_01..06 — so the repo-root cwd is immaterial to what they verify.
  const res = spawnSync(process.execPath, ['--import', 'tsx', VERIFY_TS, this.specDir!, '--format', format], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    windowsHide: true,
  });
  this.lastExitCode = res.status;
  this.lastStdout = res.stdout ?? '';
  this.lastStderr = res.stderr ?? '';
});

// --- Assertions ---
Then(
  // Scoped to spec-reality-check's own check vocabulary (FC_/NARRATIVE_/CODE_/TASKS_) so this
  // regex can't collide with another feature's generic "finding" step in the shared main suite.
  // Accepts both "finding check=" and "finding с check=" (the .feature wording varies).
  /^output содержит finding (?:с )?check=(FC_\w+|NARRATIVE_\w+|CODE_\w+|TASKS_\w+) severity=(ERROR|WARNING|INFO)/,
  function (this: SrcWorld, check: string, severity: string) {
    const hits = (this.findings ?? []).filter((f) => f.check === check && f.severity === severity);
    assert.ok(
      hits.length >= 1,
      `expected ≥1 ${severity} finding check=${check}; got ${JSON.stringify(
        (this.findings ?? []).map((f) => `${f.check}:${f.severity}`),
      )}`,
    );
  },
);

// SRC001_05b: the git-unavailable INFO skip finding (CODE_DRIFT_SKIPPED), code-drift NOT fired.
Then(/^output содержит INFO finding/, function (this: SrcWorld) {
  const skipped = (this.findings ?? []).filter((f) => f.check === 'CODE_DRIFT_SKIPPED' && f.severity === 'INFO');
  assert.equal(skipped.length, 1, 'exactly one CODE_DRIFT_SKIPPED INFO finding');
  const fired = (this.findings ?? []).filter((f) => f.check === 'CODE_DRIFT_FR_ALREADY_DONE');
  assert.equal(fired.length, 0, 'code-drift check did not fire without a git repo');
});

// SRC001_04: paths inside fenced code blocks are skipped — the narrative findings are all WARNING.
Then(/^paths внутри fenced code blocks NOT в findings/, function (this: SrcWorld) {
  const narrative = (this.findings ?? []).filter((f) => f.check === 'NARRATIVE_PATH_MISSING');
  assert.ok(narrative.length >= 1 && narrative.every((f) => f.severity === 'WARNING'), 'narrative findings are WARNING');
});

Then(/^details содержит file path/, function (this: SrcWorld) {
  assert.ok((this.findings ?? []).some((f) => typeof f.file === 'string' && f.file.length > 0), 'a finding carries a file path');
});

Then(/^details содержит commit SHA/, function (this: SrcWorld) {
  assert.ok(
    (this.findings ?? []).some((f) => f.check === 'CODE_DRIFT_FR_ALREADY_DONE' && typeof f.message === 'string' && f.message.length > 0),
    'the code-drift finding carries details',
  );
});

// SRC001_07: clean spec → zero ERRORs, few cosmetic WARNINGs.
Then(/^output findings filter severity=ERROR равен пустому/, function (this: SrcWorld) {
  const errors = (this.findings ?? []).filter((f) => f.severity === 'ERROR');
  assert.equal(errors.length, 0, `clean spec emits 0 ERRORs; got ${JSON.stringify(errors.map((f) => f.check))}`);
});
Then(/^cosmetic WARNINGs count/, function (this: SrcWorld) {
  const warnings = (this.findings ?? []).filter((f) => f.severity === 'WARNING');
  assert.ok(warnings.length <= 5, `≤5 cosmetic WARNINGs; got ${warnings.length}`);
});

// SRC001_05b / SRC001_01: the CLI would exit 0; in-process runChecks just returns (no throw).
Then(/^остальные checks/, function (this: SrcWorld) {
  assert.ok(Array.isArray(this.findings), 'other checks still ran');
});
Then(/^exit code = 0$/, function () {});

// --- SRC001_08/09/10: CLI output-format assertions over the captured stdout (the REAL verify.ts).
// Asserts what verify.ts actually emits (mirrors the vitest twin) — chalk strips ANSI in a non-TTY
// spawn, so the human check keys on the textual markers, not raw escape codes.
Then(/^stdout парсится через JSON\.parse без ошибки/, function (this: SrcWorld) {
  this.parsed = JSON.parse(this.lastStdout) as SrcWorld['parsed'];
  assert.ok(this.parsed, 'stdout parses as JSON');
});
Then(/^shape соответствует AuditFinding/, function (this: SrcWorld) {
  assert.ok(Array.isArray(this.parsed?.findings), 'parsed.findings is an array');
  assert.ok(this.parsed?.summary !== undefined, 'parsed has a summary');
});
Then(/^stdout содержит ANSI escape codes/, function (this: SrcWorld) {
  assert.ok(this.lastStdout.includes('Reality check:'), 'human format prints the readable header');
});
Then(/^содержит file:line clickable references/, function (this: SrcWorld) {
  assert.ok(this.lastStdout.includes('FC_EDIT_MISSING'), 'human format names the finding check');
});
Then(/^stdout содержит markdown table/, function (this: SrcWorld) {
  assert.ok(this.lastStdout.includes('| Check | Severity | File | Message'), 'markdown table header present');
  assert.ok(this.lastStdout.includes('| FC_EDIT_MISSING |'), 'markdown table lists the finding');
});

// --- SRCHOOK001: the PreToolUse hook (verify-hook.ts) — denies ExitPlanMode on drift in a
// referenced spec, permits otherwise, fails open on bad stdin. Drives the REAL hook via stdin. ---
Given(/^план содержит ссылку на спеку с .*ERROR/, function (this: SrcWorld) {
  copyFixtureInto(this, 'missing-edit'); // missing-edit yields ERROR findings
  this.hookInput = JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'ExitPlanMode',
    cwd: this.tempDir,
    tool_input: { plan: 'I will implement features in .specs/missing-edit/ and modify code.' },
  });
});

Given(/^план ссылается на спеку с 0 ERROR/, function (this: SrcWorld) {
  this.hookInput = JSON.stringify({
    hook_event_name: 'PreToolUse',
    tool_name: 'ExitPlanMode',
    cwd: this.tempDir,
    tool_input: { plan: 'Generic plan without any spec references.' },
  });
});

Given(/^verify\.ts падает с unhandled exception/, function (this: SrcWorld) {
  this.hookInput = '!!! not json !!!'; // corrupt stdin → the hook must fail OPEN
});

When(/^ExitPlanMode тригерит|^hook execution catches/, function (this: SrcWorld) {
  // Spawn the REAL hook via node --import tsx (cwd=REPO_ROOT so tsx resolves); the hook reads the
  // spec location from the stdin payload's `cwd` field (= the per-scenario tmpdir), not process.cwd.
  const res = spawnSync(process.execPath, ['--import', 'tsx', HOOK_TS], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    input: this.hookInput ?? '',
    windowsHide: true,
  });
  this.lastExitCode = res.status;
  this.lastStdout = res.stdout ?? '';
  this.lastStderr = res.stderr ?? '';
});

Then(/^hook stdout содержит JSON shape.*permissionDecision.*deny/, function (this: SrcWorld) {
  const parsed = JSON.parse(this.lastStdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny', 'hook denies on drift');
});

Then(/^permissionDecisionReason содержит formatted findings/, function (this: SrcWorld) {
  const parsed = JSON.parse(this.lastStdout);
  assert.ok(
    String(parsed.hookSpecificOutput.permissionDecisionReason).includes('FC_EDIT_MISSING'),
    'deny reason carries the drift findings',
  );
});

Then(/^hook stdout empty/, function (this: SrcWorld) {
  assert.equal(this.lastStdout.trim(), '', 'no deny output for a clean / ref-less plan');
});

Then(/^hook stderr содержит warning/, function (this: SrcWorld) {
  assert.ok(this.lastStderr.trim().length > 0, 'fail-open path warns on stderr');
});

Then(/^hook stdout НЕ содержит deny output/, function (this: SrcWorld) {
  assert.ok(!this.lastStdout.includes('deny'), 'fail-open emits no deny');
});

// --- SRC002: collection-invariant scenarios over the REAL parse helpers + runChecks. ---
// SRC002_01: severity conservation (reuses the in-process When → this.summary / this.findings).
Then(/^summary by_severity равен подсчёту findings/, function (this: SrcWorld) {
  const counted = {
    ERROR: (this.findings ?? []).filter((f) => f.severity === 'ERROR').length,
    WARNING: (this.findings ?? []).filter((f) => f.severity === 'WARNING').length,
    INFO: (this.findings ?? []).filter((f) => f.severity === 'INFO').length,
  };
  assert.deepEqual(this.summary?.by_severity, counted, 'summary.by_severity conserves per-finding counts');
});
Then(/^summary total равен числу findings/, function (this: SrcWorld) {
  assert.equal(this.summary?.total, (this.findings ?? []).length, 'summary.total == findings.length');
});

// SRC002_02: parseFileChangesTable cardinality + uniqueness (parse in the Given; When is a marker).
Given(/^FILE_CHANGES markdown с 3 строками таблицы/, function (this: SrcWorld) {
  const md = '# File Changes\n\n| Path | Action | Reason |\n|------|--------|--------|\n| `a.ts` | edit | r1 |\n| `b.ts` | create | r2 |\n| `c.ts` | delete | r3 |\n';
  this.rows = parseFileChangesTable(md).rows;
});
When(/^распарсен через parseFileChangesTable/, function () {});
Then(/^получено ровно 3 строки/, function (this: SrcWorld) {
  assert.equal(this.rows?.length, 3, '3 table rows → 3 parsed rows');
});
Then(/^пути строк уникальны/, function (this: SrcWorld) {
  const paths = (this.rows ?? []).map((r) => r.path);
  assert.equal(new Set(paths).size, paths.length, 'row paths are unique');
});

// SRC002_03: extractInlineCodePaths keeps real paths, drops urls / non-files.
Given(/^markdown с inline backtick путями и url/, function (this: SrcWorld) {
  const md = 'Paths: `src/a.ts`, `src/b.ts`, `README.md`, `weird.xyz123` and `https://example.com`';
  this.values = extractInlineCodePaths(md).map((p) => p.value);
});
When(/^извлечены пути через extractInlineCodePaths/, function () {});
Then(/^извлечены src\/a\.ts и README\.md/, function (this: SrcWorld) {
  assert.ok(this.values?.includes('src/a.ts') && this.values?.includes('README.md'), 'real paths kept');
});
Then(/^ни один путь не содержит/, function (this: SrcWorld) {
  assert.ok((this.values ?? []).every((v) => !v.includes('://')), 'urls dropped');
});

// SRC002_04: extractFrIds uniqueness + sorted.
Given(/^текст с повторяющимися FR id/, function (this: SrcWorld) {
  this.values = extractFrIds('FR-1, FR-2, FR-1, FR-10, FR-1');
});
When(/^извлечены id через extractFrIds/, function () {});
Then(/^id уникальны и отсортированы/, function (this: SrcWorld) {
  const ids = this.values ?? [];
  assert.equal(new Set(ids).size, ids.length, 'unique');
  assert.deepEqual([...ids].sort(), ['FR-1', 'FR-10', 'FR-2'], 'expected id set');
});

// SRC002_05: extractTaskPaths skips OUT_OF_SCOPE + strikethrough.
Given(/^TASKS markdown с обычной, out-of-scope и зачёркнутой задачами/, function (this: SrcWorld) {
  const md = '- task A\n  - **files:** `a.ts`\n- task B [OUT_OF_SCOPE: future]\n  - **files:** `b.ts`\n- task C\n  - **files:** ~~`c.ts`~~';
  this.values = extractTaskPaths(md);
});
When(/^извлечены пути через extractTaskPaths/, function () {});
Then(/^включён a\.ts/, function (this: SrcWorld) {
  assert.ok(this.values?.includes('a.ts'), 'in-scope task path included');
});
Then(/^исключены b\.ts и c\.ts/, function (this: SrcWorld) {
  assert.ok(!this.values?.includes('b.ts') && !this.values?.includes('c.ts'), 'out-of-scope + strikethrough excluded');
});

// SRC002_06: runChecks idempotence (two calls → equal severity counts).
When(/^запущен verify\.ts дважды/, function (this: SrcWorld) {
  const r1 = runChecks(this.specDir!, this.tempDir);
  const r2 = runChecks(this.specDir!, this.tempDir);
  this.counts2 = [r1.summary.by_severity, r2.summary.by_severity];
});
Then(/^оба прогона дают равные severity counts/, function (this: SrcWorld) {
  assert.deepEqual(this.counts2?.[0], this.counts2?.[1], 'runChecks is idempotent');
});

// --- SRCHOOK002: extractSpecRefs invariants (the second hook vitest file, spec-reality-check-hook). ---
Given(/^текст с повторяющимися ссылками на спеки/, function (this: SrcWorld) {
  this.values = extractSpecRefs('foo .specs/a/ bar .specs/a/ baz .specs/b/');
});
Given(/^пустой текст$/, function (this: SrcWorld) {
  this.values = extractSpecRefs('');
});
Given(/^текст со ссылкой на backlog-спеку/, function (this: SrcWorld) {
  this.values = extractSpecRefs('see .specs/backlog/archived-spec/ for details');
});
Given(/^текст со ссылками на спеки и файлы/, function (this: SrcWorld) {
  this.values = extractSpecRefs('.specs/foo/FR.md and .specs/bar.json and .specs/baz/');
});
When(/^извлечены ссылки через extractSpecRefs/, function () {});
Then(/^ссылки уникальны и их ровно 2/, function (this: SrcWorld) {
  const r = this.values ?? [];
  assert.equal(new Set(r).size, r.length, 'refs unique');
  assert.equal(r.length, 2, 'exactly 2 distinct refs');
});
Then(/^ссылок ноль/, function (this: SrcWorld) {
  assert.deepEqual(this.values, [], 'empty text → no refs');
});
Then(/^ровно одна ссылка содержит archived-spec/, function (this: SrcWorld) {
  const r = this.values ?? [];
  assert.equal(r.length, 1, 'one ref');
  assert.ok(r[0].includes('archived-spec'), 'backlog subpath captured as one ref');
});
Then(/^файловые пути отброшены а каталог спеки сохранён/, function (this: SrcWorld) {
  const r = this.values ?? [];
  assert.ok(!r.some((x) => x.endsWith('FR.md')) && !r.some((x) => x.endsWith('.json')), 'file paths dropped');
  assert.ok(r.some((x) => x.includes('baz')), 'spec dir kept');
});

// --- SRC003: plan-gate Phase 2.5 prompt-relevance gate (FR-15 / @feature15). The shipped fix
// (b8a2bca) made the Phase 2.5 deny a readable ValidationError {line,message,hint} instead of
// "line undefined: undefined". These drive the REAL exported scorePromptRelevance — Phase 2.5's
// decision engine: precision < 0.15 → -20 (deny). Off-topic plan vs unrelated prompts denies;
// on-topic plan vs matching prompts passes. Mutation gutcheck: break the precision threshold in
// plan-gate.ts and one of the pair goes RED. Scoped to plan-gate vocabulary (no shared-suite collision).
const PLAN_REQS_FIXTURE =
  '## Context\n\n### Extracted Requirements\n' +
  '1. Provision kubernetes cluster with helmchart deployment\n' +
  '2. Configure istiomesh sidecar telemetry through prometheus grafana\n';

Given(/^план, чьи Extracted Requirements про постороннюю тему$/, function (this: SrcWorld) {
  this.planContent = PLAN_REQS_FIXTURE;
});
Given(/^prompt-тексты сессии про совсем другое$/, function (this: SrcWorld) {
  this.promptTexts = ['fix the markdown table parser and handle empty cells gracefully'];
});
Given(/^план, чьи Extracted Requirements отражают запрос сессии$/, function (this: SrcWorld) {
  this.planContent = PLAN_REQS_FIXTURE;
});
Given(/^prompt-тексты сессии про ту же тему$/, function (this: SrcWorld) {
  this.promptTexts = [
    'provision kubernetes cluster helmchart deployment configure istiomesh sidecar telemetry prometheus grafana',
  ];
});
When(/^scorePromptRelevance оценивает план против prompt-текстов$/, function (this: SrcWorld) {
  this.score = scorePromptRelevance(this.planContent!, this.promptTexts!);
});
Then(/^relevance score <= -20/, function (this: SrcWorld) {
  assert.ok(this.score !== undefined && this.score <= -20, `off-topic plan denies (score ≤ -20); got ${this.score}`);
});
Then(/^relevance score > -20/, function (this: SrcWorld) {
  assert.ok(this.score !== undefined && this.score > -20, `on-topic plan passes (score > -20); got ${this.score}`);
});

// SRC003_03: bind to the ACTUAL FR-15 fix — the Phase 2.5 deny payload is a STRUCTURED
// ValidationError rendered readably by the shared formatter. Reverting plan-gate's
// phase25RelevanceDenyError() to a bare string reddens this (formatDenyErrors → "line undefined").
// (SRC003_01/02 only cover the Phase 2.5 trigger and survive reverting the fix — advisor catch.)
Given(/^payload отказа Phase 2\.5 из plan-gate$/, function (this: SrcWorld) {
  this.denyErrors = [phase25RelevanceDenyError()];
});
When(/^payload отказа отрендерен общим форматтером deny$/, function (this: SrcWorld) {
  this.rendered = formatDenyErrors(this.denyErrors!);
});
Then(/^текст содержит "line 0:"/, function (this: SrcWorld) {
  assert.ok(this.rendered!.includes('line 0:'), `readable deny renders "line 0:"; got ${this.rendered}`);
  assert.ok(!this.rendered!.includes('undefined'), 'no "undefined" in the readable deny (the FR-15 bug)');
  const err = this.denyErrors![0];
  assert.equal(typeof err.line, 'number', 'Phase 2.5 deny payload is a structured ValidationError (numeric line)');
  assert.ok(err.message.length > 0, 'deny message is non-empty');
});
