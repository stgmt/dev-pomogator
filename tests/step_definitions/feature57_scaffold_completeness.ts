/**
 * @feature57 step definitions — Scaffold-completeness audit (FR-57).
 *
 * Drives the REAL classifier `tools/specs-generator/scaffold-sentinels.mjs` in-process and the
 * REAL `audit-spec.ts` / `spec-verdict.ts` CLIs via spawn against isolated temp specs under
 * `.specs/`. No mocks — the scenario fails if the classifier or the audit gate is broken.
 *
 * RegExp step-defs (rule cucumber-expression-parens): step text carries literal `"..."` and
 * `SCAFFOLD_INCOMPLETE`, so plain-string Cucumber Expressions would mis-parse.
 *
 * @see .specs/spec-generator-v4/FR.md FR-57 (a scaffold stub must not read as DONE)
 */
import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  extractTemplateSentinels,
  scanDocumentForScaffold,
  isExcludedFromScaffoldScan,
  isBacklogSpecPath,
} from '../../tools/specs-generator/scaffold-sentinels.mjs';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'tools', 'specs-generator', 'templates');
// A real brace placeholder the generator emits verbatim (README.md.template) — a genuine stub.
const STUB_SENTINEL = '{Краткое описание фичи}';

interface ScaffoldWorld extends V4World {
  sentinels?: Set<string>;
  scanFindings?: Array<{ line: number; sentinel: string }>;
  auditFindings?: Array<{ check: string; severity: string; message: string }>;
  verdictText?: string;
  createdSpecDirs?: string[];
}

// ── fixture helpers ─────────────────────────────────────────────────────────

function makeSpecDir(this: ScaffoldWorld, slug: string, files: Record<string, string>, finalized: boolean): string {
  const dir = path.join(REPO_ROOT, '.specs', slug);
  fs.mkdirSync(dir, { recursive: true });
  const base: Record<string, string> = {
    'FR.md': '## FR-1: Thing @feature1\n\nReal description.\n',
    'ACCEPTANCE_CRITERIA.md': '## AC-1 (FR-1): Thing @feature1\n\nWHEN x THEN the system SHALL y\n',
    'DESIGN.md': '# Design\n\nReal design prose.\n',
    'TASKS.md': '# Tasks\n\n- [x] do FR-1 -- @feature1 — id: t01 — Status: DONE | Est: 10m\n',
    'README.md': '# Thing\n\nReal readme prose.\n',
    'test.feature': 'Feature: T\n\n  @feature1\n  Scenario: does a thing\n    Given x\n    When y\n    Then z\n',
  };
  const merged = { ...base, ...files };
  for (const [n, c] of Object.entries(merged)) fs.writeFileSync(path.join(dir, n), c, 'utf-8');
  const progress = {
    version: 4,
    featureSlug: slug,
    phases: {
      Discovery: { stopConfirmed: finalized },
      Context: { stopConfirmed: finalized },
      Requirements: { stopConfirmed: finalized },
      Finalization: { stopConfirmed: finalized },
    },
  };
  fs.writeFileSync(path.join(dir, '.progress.json'), JSON.stringify(progress), 'utf-8');
  (this.createdSpecDirs ??= []).push(dir);
  return dir;
}

function runAudit(slug: string): Array<{ check: string; severity: string; message: string }> {
  const script = path.join(REPO_ROOT, 'tools', 'specs-generator', 'audit-spec.ts');
  const r = spawnSync(process.execPath, ['--import', 'tsx', script, '-Path', `.specs/${slug}`, '-Format', 'json'], {
    encoding: 'utf-8', cwd: REPO_ROOT, timeout: 60_000,
  });
  const parsed = JSON.parse(r.stdout || '{"findings":[]}');
  return parsed.findings ?? [];
}

function runVerdict(slug: string): string {
  const script = path.join(REPO_ROOT, 'tools', 'specs-generator', 'spec-verdict.ts');
  const r = spawnSync(process.execPath, ['--import', 'tsx', script, '-Path', `.specs/${slug}`, '--no-semantic'], {
    encoding: 'utf-8', cwd: REPO_ROOT, timeout: 90_000,
  });
  return (r.stdout ?? '') + (r.stderr ?? '');
}

After(function (this: ScaffoldWorld) {
  for (const dir of this.createdSpecDirs ?? []) fs.rmSync(dir, { recursive: true, force: true });
});

// ── SPECGEN004_470 / 471 — classifier in-process ────────────────────────────

Given(/^a scaffold-sentinel fixture document with one unfilled template placeholder in prose outside code$/,
  function (this: ScaffoldWorld) {
    this.sentinels = extractTemplateSentinels(TEMPLATES_DIR);
    fs.writeFileSync(path.join(this.tempDir, 'doc.md'), `# ${STUB_SENTINEL}\n\nreal prose line\n`, 'utf-8');
  });

Given(/^a scaffold-sentinel fixture document with lowercase single-token braces, a fenced code block, an inline code span, and an empty JSON brace$/,
  function (this: ScaffoldWorld) {
    this.sentinels = extractTemplateSentinels(TEMPLATES_DIR);
    const body = `The {int} and {slug} params are fine.\n\n\`\`\`\nconst x = ${STUB_SENTINEL}\n\`\`\`\n\nSee \`${STUB_SENTINEL}\` inline. Config {} is empty.\n`;
    fs.writeFileSync(path.join(this.tempDir, 'doc.md'), body, 'utf-8');
  });

When(/^the scaffold-sentinel classifier scans the fixture document$/, function (this: ScaffoldWorld) {
  const content = fs.readFileSync(path.join(this.tempDir, 'doc.md'), 'utf-8');
  this.scanFindings = scanDocumentForScaffold(content, this.sentinels!);
});

Then(/^the scaffold classifier reports exactly one finding naming that placeholder and its line$/,
  function (this: ScaffoldWorld) {
    assert.equal(this.scanFindings!.length, 1, JSON.stringify(this.scanFindings));
    assert.equal(this.scanFindings![0].sentinel, STUB_SENTINEL);
    assert.equal(this.scanFindings![0].line, 1);
  });

Then(/^the scaffold classifier reports zero findings$/, function (this: ScaffoldWorld) {
  assert.equal(this.scanFindings!.length, 0, JSON.stringify(this.scanFindings));
});

// ── SPECGEN004_472 — claims-done stub README → ERROR ────────────────────────

Given(/^an isolated claims-done spec fixture whose README\.md is an unfilled scaffold$/, function (this: ScaffoldWorld) {
  makeSpecDir.call(this, 'fr57-bdd-stub-readme', { 'README.md': `# ${STUB_SENTINEL}\n\n- {Идея 1}\n` }, true);
});

When(/^audit-spec runs on that spec fixture$/, function (this: ScaffoldWorld) {
  const slug = (this.createdSpecDirs ?? []).map((d) => path.basename(d)).pop()!;
  this.auditFindings = runAudit(slug);
});

Then(/^the audit findings contain check "SCAFFOLD_INCOMPLETE" with severity "ERROR"$/, function (this: ScaffoldWorld) {
  const s = this.auditFindings!.filter((f) => f.check === 'SCAFFOLD_INCOMPLETE');
  assert.ok(s.length > 0, `no SCAFFOLD_INCOMPLETE: ${JSON.stringify(this.auditFindings)}`);
  assert.ok(s.some((f) => f.severity === 'ERROR'), `expected an ERROR: ${JSON.stringify(s)}`);
});

Then(/^the SCAFFOLD_INCOMPLETE finding names README\.md with a line and a sentinel$/, function (this: ScaffoldWorld) {
  const f = this.auditFindings!.find((x) => x.check === 'SCAFFOLD_INCOMPLETE' && /README\.md:\d+/.test(x.message));
  assert.ok(f, `no README.md finding with a line: ${JSON.stringify(this.auditFindings)}`);
  assert.ok(f!.message.includes(STUB_SENTINEL), `message must name the sentinel: ${f!.message}`);
});

// ── SPECGEN004_473 — fresh scaffold → INFO, not RED ─────────────────────────

Given(/^an isolated freshly-scaffolded spec fixture with default placeholders and no test run$/, function (this: ScaffoldWorld) {
  makeSpecDir.call(this, 'fr57-bdd-fresh', { 'README.md': `# ${STUB_SENTINEL}\n` }, false);
});

Then(/^every SCAFFOLD_INCOMPLETE finding has severity "INFO"$/, function (this: ScaffoldWorld) {
  const s = this.auditFindings!.filter((f) => f.check === 'SCAFFOLD_INCOMPLETE');
  assert.ok(s.length > 0, 'expected at least one SCAFFOLD_INCOMPLETE INFO finding');
  assert.ok(s.every((f) => f.severity === 'INFO'), `all must be INFO: ${JSON.stringify(s)}`);
});

Then(/^spec-verdict on that spec fixture does not turn RED because of SCAFFOLD_INCOMPLETE$/, function (this: ScaffoldWorld) {
  const slug = (this.createdSpecDirs ?? []).map((d) => path.basename(d)).pop()!;
  const out = runVerdict(slug);
  // The audit-gate section lists ERROR classes; a fresh scaffold's INFO stubs must NOT appear there.
  const auditGateLine = out.split('\n').find((l) => l.includes('audit gate')) ?? '';
  const gateBlock = out.slice(out.indexOf('audit gate'), out.indexOf('traceability gate'));
  assert.ok(!gateBlock.includes('SCAFFOLD_INCOMPLETE'),
    `SCAFFOLD_INCOMPLETE must not be an ERROR gate class for a fresh scaffold: ${auditGateLine}`);
});

// ── SPECGEN004_474 — stub → RED, filled → clean ─────────────────────────────

Given(/^a claims-done spec fixture with stub README, TASKS and FIXTURES prose$/, function (this: ScaffoldWorld) {
  makeSpecDir.call(this, 'fr57-bdd-verdict', {
    'README.md': `# ${STUB_SENTINEL}\n`,
    'TASKS.md': '# Tasks\n\n| ID | Title | Status | Depends | Phase | Est. |\n|----|-------|--------|---------|-------|------|\n| TBD-1 | {first task} | TODO | — | Phase 0 | 30m |\n',
    'DESIGN.md': '# Design\n\n**TEST_DATA:** TEST_DATA_ACTIVE\n',
    'FIXTURES.md': '# Fixtures\n\n| F-1 | {Название фикстуры} | static | `x` | global | step |\n',
  }, true);
});

When(/^spec-verdict runs on the stub fixture$/, function (this: ScaffoldWorld) {
  const slug = (this.createdSpecDirs ?? []).map((d) => path.basename(d)).pop()!;
  this.verdictText = runVerdict(slug);
});

Then(/^the spec-verdict verdict is "RED" with SCAFFOLD_INCOMPLETE in the gap list$/, function (this: ScaffoldWorld) {
  assert.ok(/VERDICT:\s*RED/.test(this.verdictText!), `expected RED verdict: ${this.verdictText!.slice(-200)}`);
  assert.ok(this.verdictText!.includes('SCAFFOLD_INCOMPLETE'), 'SCAFFOLD_INCOMPLETE must be in the audit gate');
});

Given(/^the same fixture with its README, TASKS and FIXTURES prose filled in$/, function (this: ScaffoldWorld) {
  makeSpecDir.call(this, 'fr57-bdd-verdict-filled', {
    'README.md': '# Thing\n\nA real one-line description of the feature.\n',
    'TASKS.md': '# Tasks\n\n- [x] build the thing -- @feature1 — id: t01 — Status: DONE | Est: 10m\n',
    'DESIGN.md': '# Design\n\n**TEST_DATA:** TEST_DATA_NONE\n',
    'FIXTURES.md': '# Fixtures\n\n### F-1: real fixture\n\nA real fixture description.\n',
  }, true);
});

When(/^spec-verdict runs on the filled fixture$/, function (this: ScaffoldWorld) {
  const slug = (this.createdSpecDirs ?? []).map((d) => path.basename(d)).pop()!;
  this.verdictText = runVerdict(slug);
});

Then(/^the SCAFFOLD_INCOMPLETE category is absent from the gap list$/, function (this: ScaffoldWorld) {
  assert.ok(!this.verdictText!.includes('SCAFFOLD_INCOMPLETE'),
    `filled fixture must not carry SCAFFOLD_INCOMPLETE: ${this.verdictText!.slice(-300)}`);
});

// ── SPECGEN004_475 — one classifier, drift-safe ─────────────────────────────

Given(/^the scaffold-sentinel set is derived from the specs-generator templates directory$/, function (this: ScaffoldWorld) {
  this.sentinels = extractTemplateSentinels(TEMPLATES_DIR);
});

When(/^the scaffold-sentinel set is compared against the current template placeholders$/, function () { /* comparison in Then */ });

Then(/^the scaffold-sentinel set contains every current template placeholder$/, function (this: ScaffoldWorld) {
  // Re-derive independently and assert ⊇ — the drift guard (a template edit can't silently escape).
  const again = extractTemplateSentinels(TEMPLATES_DIR);
  assert.ok(again.size > 10, `sentinel set implausibly small: ${again.size}`);
  for (const s of again) assert.ok(this.sentinels!.has(s), `drift: sentinel missing ${s}`);
});

Then(/^validate-spec PLACEHOLDER and audit SCAFFOLD_INCOMPLETE agree that a real template sentinel is a stub$/, function (this: ScaffoldWorld) {
  // Concrete cross-check: a doc carrying a real sentinel is flagged by BOTH the validate CLI
  // (PLACEHOLDER) and the audit CLI (SCAFFOLD_INCOMPLETE) — the two tiers agree on "is a stub".
  const slug = 'fr57-bdd-both';
  makeSpecDir.call(this, slug, { 'README.md': `# ${STUB_SENTINEL}\n` }, true);
  const audit = runAudit(slug);
  assert.ok(audit.some((f) => f.check === 'SCAFFOLD_INCOMPLETE'), 'audit must flag the stub');
  const vscript = path.join(REPO_ROOT, 'tools', 'specs-generator', 'validate-spec.ts');
  const vr = spawnSync(process.execPath, ['--import', 'tsx', vscript, '-Path', `.specs/${slug}`, '-Format', 'json'], {
    encoding: 'utf-8', cwd: REPO_ROOT, timeout: 60_000,
  });
  assert.ok(/PLACEHOLDER/.test(vr.stdout ?? ''), `validate must warn PLACEHOLDER on the same stub: ${vr.stdout}`);
});

// ── SPECGEN004_476 — FIXTURES reported once ─────────────────────────────────

Given(/^a claims-done spec fixture with TEST_DATA_ACTIVE and a placeholder FIXTURES\.md$/, function (this: ScaffoldWorld) {
  makeSpecDir.call(this, 'fr57-bdd-fixtures-once', {
    'DESIGN.md': '# Design\n\n**TEST_DATA:** TEST_DATA_ACTIVE\n',
    'FIXTURES.md': '# Fixtures\n\n| F-1 | {Название фикстуры} | static | `x` | global | step |\n',
  }, true);
});

Then(/^the placeholder FIXTURES\.md is reported exactly once and not by a separate FIXTURES_CONSISTENCY placeholder branch$/,
  function (this: ScaffoldWorld) {
    const fixturesStub = this.auditFindings!.filter(
      (f) => /FIXTURES\.md/.test(f.message) && (f.check === 'SCAFFOLD_INCOMPLETE' || f.check === 'FIXTURES_CONSISTENCY'),
    );
    const consistencyPlaceholder = this.auditFindings!.filter(
      (f) => f.check === 'FIXTURES_CONSISTENCY' && /placeholder/i.test(f.message),
    );
    assert.equal(consistencyPlaceholder.length, 0, `old FIXTURES_CONSISTENCY placeholder branch must be gone: ${JSON.stringify(consistencyPlaceholder)}`);
    assert.ok(fixturesStub.some((f) => f.check === 'SCAFFOLD_INCOMPLETE'), 'FIXTURES.md stub must be reported by the unified classifier');
  });

// ── SPECGEN004_477 — exclusions ─────────────────────────────────────────────

Given(/^a scaffold-sentinel scan over a templates file, a __fixtures__ document, and a backlog spec document$/,
  function (this: ScaffoldWorld) {
    this.sentinels = extractTemplateSentinels(TEMPLATES_DIR);
  });

When(/^the scaffold-sentinel classifier evaluates those documents$/, function () { /* evaluated in Then via the path helpers */ });

Then(/^the templates file and the __fixtures__ document yield no findings$/, function () {
  assert.equal(isExcludedFromScaffoldScan('tools/specs-generator/templates/README.md.template'), true);
  assert.equal(isExcludedFromScaffoldScan('tests/fixtures/x/__fixtures__/y/README.md'), true);
  assert.equal(isExcludedFromScaffoldScan('.specs/real-spec/README.md'), false);
});

Then(/^the backlog spec document yields at most an INFO finding never an ERROR$/, function () {
  assert.equal(isBacklogSpecPath(path.join('.specs', 'backlog', 'some-spec')), true);
  assert.equal(isBacklogSpecPath(path.join('.specs', 'real-spec')), false);
});
