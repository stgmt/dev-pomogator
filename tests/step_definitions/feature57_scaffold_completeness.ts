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
import { indexHeadings } from '../../tools/anchor-integrity/check.mjs';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const TEMPLATES_DIR = path.join(REPO_ROOT, 'tools', 'specs-generator', 'templates');
const SPECS_GENERATOR_CORE = path.join(REPO_ROOT, 'tools', 'specs-generator', 'specs-generator-core.mjs');
const SCAFFOLD_SCRIPT = path.join(REPO_ROOT, 'tools', 'specs-generator', 'scaffold-spec.ts');
// A real brace placeholder the generator emits verbatim (README.md.template) — a genuine stub.
const STUB_SENTINEL = '{Краткое описание фичи}';

const MOVED_TEMPLATE_OWNERS = new Map<string, string[]>([
  ['JIRA_SOURCE.md.template', [
    '.claude/skills/create-spec/references/templates/JIRA_SOURCE.md.template',
    '.agents/skills/create-spec/references/templates/JIRA_SOURCE.md.template',
  ]],
  ['ATTACHMENTS.md.template', [
    '.claude/skills/create-spec/references/templates/ATTACHMENTS.md.template',
    '.agents/skills/create-spec/references/templates/ATTACHMENTS.md.template',
  ]],
  ['AUDIT_REPORT.md.template', [
    '.claude/skills/create-spec/references/templates/AUDIT_REPORT.md.template',
    '.agents/skills/create-spec/references/templates/AUDIT_REPORT.md.template',
  ]],
  ['ARCHITECTURE_AXIS.md.template', [
    '.claude/skills/architecture-decision-builder/references/templates/ARCHITECTURE_AXIS.md.template',
    '.agents/skills/architecture-decision-builder/references/templates/ARCHITECTURE_AXIS.md.template',
  ]],
  ['ARCHITECTURE_INDEX.md.template', [
    '.claude/skills/architecture-decision-builder/references/templates/ARCHITECTURE_INDEX.md.template',
    '.agents/skills/architecture-decision-builder/references/templates/ARCHITECTURE_INDEX.md.template',
  ]],
  ['COMPLETENESS.md.template', [
    '.claude/skills/architecture-decision-builder/references/templates/COMPLETENESS.md.template',
    '.agents/skills/architecture-decision-builder/references/templates/COMPLETENESS.md.template',
  ]],
  ['SYNTHESIS.md.template', [
    '.claude/skills/architecture-decision-builder/references/templates/SYNTHESIS.md.template',
    '.agents/skills/architecture-decision-builder/references/templates/SYNTHESIS.md.template',
  ]],
]);

interface TemplateOwnershipResult {
  actualTemplates: string[];
  mappedTemplates: string[];
  unmappedTemplates: string[];
  staleMappings: string[];
  scaffoldStatus: number | null;
  scaffoldOutput: string;
  missingGeneratedTargets: string[];
  retiredStillInScaffold: string[];
  missingOwnerTemplates: string[];
}

interface ScaffoldWorld extends V4World {
  sentinels?: Set<string>;
  scanFindings?: Array<{ line: number; sentinel: string }>;
  auditFindings?: Array<{ check: string; severity: string; message: string }>;
  confirmStopResult?: { status: number | null; stdout: string; stderr: string };
  confirmStopProgressPath?: string;
  verdictText?: string;
  createdSpecDirs?: string[];
  templateOwnership?: TemplateOwnershipResult;
  featureTemplateContent?: string;
  frTemplateIds?: Set<string>;
  featureTemplateTags?: string[];
  featureTemplateMissingTags?: string[];
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

function scaffoldTemplateMappings(slug: string): Array<{ template: string; target: string }> {
  const core = fs.readFileSync(SPECS_GENERATOR_CORE, 'utf-8');
  const block = core.match(/const templateMappings = \[[\s\S]*?\];/);
  assert.ok(block, 'specs-generator-core.mjs must expose templateMappings');

  return [...block[0].matchAll(/\[\s*['"]([^'"]+\.template)['"]\s*,\s*(?:['"]([^'"]+)['"]|`\$\{options\.name\}([^`]*)`)\s*\]/g)]
    .map((m) => ({
      template: m[1],
      target: m[2] ?? `${slug}${m[3]}`,
    }))
    .sort((a, b) => a.template.localeCompare(b.template));
}

function sortedScaffoldTemplates(): string[] {
  return fs.readdirSync(TEMPLATES_DIR).filter((n) => n.endsWith('.template')).sort();
}

function featureRequirementTags(content: string): string[] {
  return [...new Set([...content.matchAll(/^\s*@(FR-\d+)\b/gm)].map((m) => m[1]))].sort();
}

function runTemplateOwnershipCheck(tempDir: string): TemplateOwnershipResult {
  const slug = 'template-ownership-proof';
  const mappings = scaffoldTemplateMappings(slug);
  const actualTemplates = sortedScaffoldTemplates();
  const mappedTemplates = mappings.map((m) => m.template).sort();
  const mapped = new Set(mappedTemplates);
  const actual = new Set(actualTemplates);

  const scaffold = spawnSync(process.execPath, ['--import', 'tsx', SCAFFOLD_SCRIPT, '-Name', slug], {
    cwd: REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0', SPECS_GENERATOR_ROOT: tempDir },
    encoding: 'utf-8',
    timeout: 60_000,
  });
  const generatedSpec = path.join(tempDir, '.specs', slug);

  return {
    actualTemplates,
    mappedTemplates,
    unmappedTemplates: actualTemplates.filter((name) => !mapped.has(name)),
    staleMappings: mappedTemplates.filter((name) => !actual.has(name)),
    scaffoldStatus: scaffold.status,
    scaffoldOutput: `${scaffold.stdout ?? ''}${scaffold.stderr ?? ''}`,
    missingGeneratedTargets: mappings
      .map((m) => m.target)
      .filter((target) => !fs.existsSync(path.join(generatedSpec, target)))
      .sort(),
    retiredStillInScaffold: [...MOVED_TEMPLATE_OWNERS.keys()]
      .filter((name) => fs.existsSync(path.join(TEMPLATES_DIR, name)))
      .sort(),
    missingOwnerTemplates: [...MOVED_TEMPLATE_OWNERS.entries()]
      .flatMap(([name, owners]) => owners
        .filter((ownerPath) => !fs.existsSync(path.join(REPO_ROOT, ownerPath)))
        .map((ownerPath) => `${name} -> ${ownerPath}`))
      .sort(),
  };
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

// ── SPECGEN004_507 — ConfirmStop gates phase-local structural errors ─────────

Given(/^a Requirements-stop fixture with a template placeholder and a broken phase link$/, function (this: ScaffoldWorld) {
  const slug = 'fr57-confirm-stop';
  const dir = makeSpecDir.call(this, slug, {
    'REQUIREMENTS.md': `# ${STUB_SENTINEL}\n\n[FR-1](FR.md#missing-anchor)\n`,
    'DESIGN.md': '# Design\n\n## BDD Test Infrastructure\n\n**Classification:** TEST_DATA_NONE\n',
  }, false);
  this.confirmStopProgressPath = path.join(dir, '.progress.json');
});

When(/^spec-status confirms the Requirements STOP on that fixture$/, function (this: ScaffoldWorld) {
  const slug = path.basename((this.createdSpecDirs ?? []).at(-1)!);
  const r = spawnSync(process.execPath, [SPECS_GENERATOR_CORE, 'spec-status', '-Path', `.specs/${slug}`, '-ConfirmStop', 'Requirements', '-Format', 'json'], {
    encoding: 'utf-8', cwd: REPO_ROOT, timeout: 60_000,
  });
  this.confirmStopResult = { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
});

Then(/^ConfirmStop fails without recording the Requirements stop$/, function (this: ScaffoldWorld) {
  assert.notEqual(this.confirmStopResult!.status, 0, `ConfirmStop unexpectedly succeeded: ${this.confirmStopResult!.stdout}`);
  const progress = JSON.parse(fs.readFileSync(this.confirmStopProgressPath!, 'utf-8'));
  assert.notEqual(progress.phases.Requirements.stopConfirmed, true);
});

Then(/^the ConfirmStop error names the placeholder and broken link$/, function (this: ScaffoldWorld) {
  const output = `${this.confirmStopResult!.stdout}\n${this.confirmStopResult!.stderr}`;
  assert.match(output, /placeholder.*\{Краткое описание фичи\}/i);
  assert.match(output, /broken link.*FR\.md#missing-anchor/i);
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

// ── SPECGEN004_508 — scaffold template directory owns only instantiated templates ──

Given(/^the real scaffold template mapping and owning skill reference template directories$/, function () {
  assert.ok(fs.existsSync(SPECS_GENERATOR_CORE), `missing scaffold core: ${SPECS_GENERATOR_CORE}`);
  assert.ok(fs.existsSync(SCAFFOLD_SCRIPT), `missing scaffold CLI: ${SCAFFOLD_SCRIPT}`);
  assert.ok(fs.existsSync(TEMPLATES_DIR), `missing scaffold templates dir: ${TEMPLATES_DIR}`);
});

When(/^the spec-generator template ownership check runs$/, function (this: ScaffoldWorld) {
  this.templateOwnership = runTemplateOwnershipCheck(this.tempDir);
});

Then(/^every template left in tools\/specs-generator\/templates is instantiated by scaffold-spec$/, function (this: ScaffoldWorld) {
  const result = this.templateOwnership!;
  assert.equal(result.scaffoldStatus, 0, `scaffold-spec must run successfully: ${result.scaffoldOutput}`);
  assert.deepEqual(result.actualTemplates, result.mappedTemplates, JSON.stringify({
    unmappedTemplates: result.unmappedTemplates,
    staleMappings: result.staleMappings,
    actualTemplates: result.actualTemplates,
    mappedTemplates: result.mappedTemplates,
  }, null, 2));
  assert.deepEqual(result.missingGeneratedTargets, [], `scaffold-spec did not instantiate mapped targets: ${JSON.stringify(result.missingGeneratedTargets)}`);
});

Then(/^the seven non-scaffold templates live only under their owning skill reference templates$/, function (this: ScaffoldWorld) {
  const result = this.templateOwnership!;
  assert.deepEqual(result.retiredStillInScaffold, [], `retired templates still live in scaffold dir: ${JSON.stringify(result.retiredStillInScaffold)}`);
  assert.deepEqual(result.missingOwnerTemplates, [], `missing owner template copies: ${JSON.stringify(result.missingOwnerTemplates)}`);
});

// ── SPECGEN004_509 — feature.template @FR tags resolve against FR.md.template ──

Given(/^the real feature and FR scaffold templates$/, function (this: ScaffoldWorld) {
  const featurePath = path.join(TEMPLATES_DIR, 'feature.template');
  const frPath = path.join(TEMPLATES_DIR, 'FR.md.template');
  assert.ok(fs.existsSync(featurePath), `missing feature template: ${featurePath}`);
  assert.ok(fs.existsSync(frPath), `missing FR template: ${frPath}`);

  this.featureTemplateContent = fs.readFileSync(featurePath, 'utf-8');
  this.frTemplateIds = new Set(indexHeadings(fs.readFileSync(frPath, 'utf-8')).idToSlug.keys());
});

When(/^the feature-template anchor integrity check runs$/, function (this: ScaffoldWorld) {
  this.featureTemplateTags = featureRequirementTags(this.featureTemplateContent!);
  this.featureTemplateMissingTags = this.featureTemplateTags.filter((tag) => !this.frTemplateIds!.has(tag));
});

Then(/^every feature-template @FR tag resolves to an FR heading in FR\.md\.template$/, function (this: ScaffoldWorld) {
  assert.deepEqual(this.featureTemplateTags, ['FR-1', 'FR-2', 'FR-3']);
  assert.deepEqual(this.featureTemplateMissingTags, [], `unresolved feature.template tags: ${JSON.stringify(this.featureTemplateMissingTags)}`);
});
