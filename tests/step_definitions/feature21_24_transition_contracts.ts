/**
 * @feature21 / @feature24 step definitions — v3-transition contract scenarios
 * (T-Trans.3 / T-Trans.6), bound to the REAL CLI + REAL hook subprocesses:
 *   107 → FR-21  task-table CLI byte-matches the frozen committed baseline
 *   108 → FR-24  meta-guard denies protected-registration removal (v4 scope)
 *
 * Both spawn the production artifacts — no mocks, no re-implementation
 * (the vitest twins live in tools/specs-generator/__tests__/ and
 * tools/specs-validator/__tests__/; these scenarios pin the same contracts
 * into the spec graph so the FR-32 honesty gate sees them).
 *
 * @see .specs/spec-generator-v4/FR.md FR-21, FR-24
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = path.resolve(import.meta.dirname ?? __dirname, '..', '..');
const CORE = path.join(REPO_ROOT, 'tools', 'specs-generator', 'specs-generator-core.mjs');
const VALIDATE_SPECS = path.join(REPO_ROOT, 'tools', 'specs-validator', 'validate-specs.ts');
const BASELINE = path.join(REPO_ROOT, 'tools', 'specs-generator', '__fixtures__', 'task-table.baseline.md');
const FIXTURE_INPUT = path.join(REPO_ROOT, 'tools', 'specs-generator', '__fixtures__', 'task-table-input', 'TASKS.md');
const META_GUARD = path.join(REPO_ROOT, 'tools', 'specs-validator', 'extension-json-meta-guard.ts');

// ── SPECGEN004_107 — FR-21: task-table byte contract ───────────────────────

interface F21World extends V4World {
  corpusRoot?: string;
  tableOut?: string;
  tableOut2?: string;
}

function runTaskTable(corpusRoot: string): { stdout: string; status: number | null; stderr: string } {
  const r = spawnSync(
    process.execPath,
    [CORE, 'spec-status', '-Path', '.specs/task-table-fixture', '-Format', 'task-table'],
    { encoding: 'utf-8', env: { ...process.env, SPECS_GENERATOR_ROOT: corpusRoot }, timeout: 60_000 },
  );
  return { stdout: r.stdout ?? '', status: r.status, stderr: r.stderr ?? '' };
}

Given('the frozen task-table input spec fixture', function (this: F21World) {
  const specDir = path.join(this.tempDir, '.specs', 'task-table-fixture');
  fs.mkdirSync(specDir, { recursive: true });
  fs.copyFileSync(FIXTURE_INPUT, path.join(specDir, 'TASKS.md'));
  this.corpusRoot = this.tempDir;
});

When('spec-status runs with the task-table format on it', function (this: F21World) {
  const r = runTaskTable(this.corpusRoot!);
  assert.equal(r.status, 0, `CLI must exit 0; stderr: ${r.stderr}`);
  this.tableOut = r.stdout;
});

Then('the output byte-matches the committed task-table baseline', function (this: F21World) {
  const baseline = fs.readFileSync(BASELINE, 'utf-8').replace(/\r\n/g, '\n').trimEnd();
  assert.equal(
    this.tableOut!.replace(/\r\n/g, '\n').trimEnd(),
    baseline,
    'FR-21: the task-table shape is a stable public contract — regen the baseline only on a deliberate change',
  );
});

Then('a second run produces identical bytes without any MCP server', function (this: F21World) {
  // No MCP server is spawned anywhere in this scenario — direct-MD-parse
  // degraded mode (NFR-Reliability-7 pattern) plus determinism.
  const r2 = runTaskTable(this.corpusRoot!);
  assert.equal(r2.status, 0);
  assert.equal(r2.stdout, this.tableOut, 'task-table output must be idempotent');
});

// ── SPECGEN004_108 — FR-24: meta-guard removal-denied (v4 manifests) ────────

interface F24World extends V4World {
  manifestPath?: string;
  manifestText?: string;
  denyResult?: { status: number | null; stdout: string };
}

function hooksManifest(entries: string[]): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Write|Edit', hooks: entries.map((command) => ({ type: 'command', command })) },
      ],
    },
  }, null, 2);
}

function runMetaGuard(filePath: string, newContent: string): { status: number | null; stdout: string } {
  const stdin = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath, content: newContent } });
  const r = spawnSync(process.execPath, ['--import', 'tsx', META_GUARD], {
    encoding: 'utf-8',
    input: stdin,
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '' };
}

Given('a canonical hooks manifest carrying the spec-conformance-guard registration', function (this: F24World) {
  const dir = path.join(this.tempDir, '.claude-plugin');
  fs.mkdirSync(dir, { recursive: true });
  this.manifestPath = path.join(dir, 'hooks.json');
  this.manifestText = hooksManifest([
    'node spawn spec-conformance-guard.bundle.mjs',
    'node bootstrap -- tools/specs-validator/extension-json-meta-guard.ts',
  ]);
  fs.writeFileSync(this.manifestPath, this.manifestText);
});

When('an agent write removes that registration', function (this: F24World) {
  const without = hooksManifest(['node bootstrap -- tools/specs-validator/extension-json-meta-guard.ts']);
  this.denyResult = runMetaGuard(this.manifestPath!, without);
});

Then('the meta-guard denies the write naming spec-conformance-guard', function (this: F24World) {
  assert.equal(this.denyResult!.status, 2, 'protected-registration removal must deny (exit 2)');
  const out = JSON.parse(this.denyResult!.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /spec-conformance-guard/);
});

Then('removing the meta-guard own registration is denied too', function (this: F24World) {
  // Self-protection invariant (FR-24): the guard may not be disarmed by
  // removing its own registration.
  const without = hooksManifest(['node spawn spec-conformance-guard.bundle.mjs']);
  const r = runMetaGuard(this.manifestPath!, without);
  assert.equal(r.status, 2, 'self-removal must deny (exit 2)');
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /extension-json-meta-guard/);
});

// ── SPECGEN004_294 — FR-21: absent TASKS.md → exit 1 + error ───────────────

interface F21AbsentWorld extends V4World {
  emptySpecDir?: string;
  absentResult?: { status: number | null; stderr: string };
}

Given('a spec directory with no TASKS.md file', function (this: F21AbsentWorld) {
  this.emptySpecDir = path.join(this.tempDir, '.specs', 'empty-spec');
  fs.mkdirSync(this.emptySpecDir, { recursive: true });
  // Deliberately no TASKS.md
});

When('spec-status runs with the task-table format on that empty spec', function (this: F21AbsentWorld) {
  const r = spawnSync(
    process.execPath,
    [CORE, 'spec-status', '-Path', '.specs/empty-spec', '-Format', 'task-table'],
    { encoding: 'utf-8', env: { ...process.env, SPECS_GENERATOR_ROOT: this.tempDir }, timeout: 60_000 },
  );
  this.absentResult = { status: r.status, stderr: r.stderr ?? '' };
});

Then(/the CLI exits with status 1 and stderr contains "TASKS\.md not found"/, function (this: F21AbsentWorld) {
  assert.equal(this.absentResult!.status, 1, `Expected exit 1; got ${this.absentResult!.status}`);
  assert.match(this.absentResult!.stderr, /TASKS\.md not found/, `Expected "TASKS.md not found" in stderr; got: ${this.absentResult!.stderr}`);
});

// ── SPECGEN004_511 — P16-7: .progress.json engine writer contract ───────────

interface ProgressPhaseState {
  completedAt: string | null;
  stopConfirmed: boolean;
  stopConfirmedAt: string | null;
}

interface ProgressState {
  version: number;
  featureSlug: string;
  currentPhase: string;
  phases: Record<'Discovery' | 'Context' | 'Requirements' | 'Finalization', ProgressPhaseState>;
}

interface ScaffoldPayload {
  success: boolean;
  path: string;
  created_files: string[];
  next_step: string;
}

interface FProgressWriterWorld extends V4World {
  scaffoldResult?: { status: number | null; stdout: string; stderr: string };
  statusResult?: { status: number | null; stdout: string; stderr: string };
  scaffoldPayload?: ScaffoldPayload;
  freshProgress?: ProgressState;
  repairedProgress?: ProgressState;
  documentationBodies?: Record<'claude' | 'agent' | 'rule', string>;
}

function runCoreCommand(corpusRoot: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CORE, ...args], {
    encoding: 'utf-8',
    env: { ...process.env, SPECS_GENERATOR_ROOT: corpusRoot },
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function seedCompleteDiscoverySpec(root: string, slug: string): void {
  const specDir = path.join(root, '.specs', slug);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, 'USER_STORIES.md'),
    '# User Stories\n\n## US-1: Existing user story\n\nA complete story body with enough text for status detection.\n',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(specDir, 'USE_CASES.md'),
    '# Use Cases\n\n## UC-1: Existing use case\n\nA complete use-case body with enough text for status detection.\n',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(specDir, 'RESEARCH.md'),
    '# Research\n\n## Findings\n\nA complete research body with enough text and no open questions.\n',
    'utf-8',
  );
}

Given(
  /^a temp spec corpus for the progress writer contract$/,
  function (this: FProgressWriterWorld) {
    fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
    seedCompleteDiscoverySpec(this.tempDir, 'status-existing');
  },
);

When(
  /^scaffold-spec creates a fresh spec and spec-status repairs a pre-existing spec$/,
  function (this: FProgressWriterWorld) {
    this.scaffoldResult = runCoreCommand(this.tempDir, ['scaffold-spec', '-Name', 'fresh-progress', '-Format', 'json']);
    assert.equal(this.scaffoldResult.status, 0, `scaffold-spec must exit 0; stderr: ${this.scaffoldResult.stderr}`);

    this.statusResult = runCoreCommand(this.tempDir, [
      'spec-status',
      '-Path',
      '.specs/status-existing',
      '-ConfirmStop',
      'Discovery',
      '-Format',
      'json',
    ]);
    assert.equal(this.statusResult.status, 0, `spec-status must exit 0; stderr: ${this.statusResult.stderr}`);

    this.scaffoldPayload = JSON.parse(this.scaffoldResult.stdout) as ScaffoldPayload;
    this.freshProgress = JSON.parse(fs.readFileSync(path.join(this.tempDir, '.specs', 'fresh-progress', '.progress.json'), 'utf-8')) as ProgressState;
    this.repairedProgress = JSON.parse(fs.readFileSync(path.join(this.tempDir, '.specs', 'status-existing', '.progress.json'), 'utf-8')) as ProgressState;
    this.documentationBodies = {
      claude: fs.readFileSync(path.join(REPO_ROOT, '.claude', 'skills', 'create-spec', 'SKILL.md'), 'utf-8'),
      agent: fs.readFileSync(path.join(REPO_ROOT, '.agents', 'skills', 'create-spec', 'SKILL.md'), 'utf-8'),
      rule: fs.readFileSync(path.join(REPO_ROOT, '.claude', 'rules', 'specs-workflow', 'specs-management.md'), 'utf-8'),
    };
  },
);

Then(
  /^scaffold-spec is the bootstrap writer for initial \.progress\.json state$/,
  function (this: FProgressWriterWorld) {
    assert.deepEqual(this.scaffoldPayload, {
      success: true,
      path: '.specs/fresh-progress',
      created_files: [
        'USER_STORIES.md',
        'USE_CASES.md',
        'RESEARCH.md',
        'REQUIREMENTS.md',
        'FR.md',
        'NFR.md',
        'ACCEPTANCE_CRITERIA.md',
        'DESIGN.md',
        'TASKS.md',
        'FILE_CHANGES.md',
        'README.md',
        'CHANGELOG.md',
        'fresh-progress.feature',
        'fresh-progress_SCHEMA.md',
        'FIXTURES.md',
      ],
      next_step: 'Fill USER_STORIES.md first',
    });
    assert.equal(this.freshProgress!.version, 4, 'fresh scaffold must stamp v4 progress state');
    assert.equal(this.freshProgress!.featureSlug, 'fresh-progress');
    assert.equal(this.freshProgress!.currentPhase, 'Discovery');
    assert.equal(this.freshProgress!.phases.Discovery.stopConfirmed, false);
  },
);

Then(
  /^spec-status is the state-transition writer for existing specs$/,
  function (this: FProgressWriterWorld) {
    assert.equal(this.repairedProgress!.version, 4, 'spec-status must repair missing progress with v4 state');
    assert.equal(this.repairedProgress!.featureSlug, 'status-existing');
    assert.equal(this.repairedProgress!.phases.Discovery.stopConfirmed, true);
    assert.match(this.repairedProgress!.phases.Discovery.stopConfirmedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(this.repairedProgress!.phases.Discovery.completedAt, /^\d{4}-\d{2}-\d{2}T/);
  },
);

Then(
  /^create-spec documentation forbids manual or MCP mutation of \.progress\.json while naming both engine writers$/,
  function (this: FProgressWriterWorld) {
    for (const [name, body] of Object.entries(this.documentationBodies!)) {
      assert.ok(body.includes('scaffold-spec.ts'), `${name} documentation must name scaffold-spec.ts as the bootstrap writer`);
      assert.ok(body.includes('spec-status.ts'), `${name} documentation must name spec-status.ts as the state writer`);
      assert.ok(body.includes('Write/Edit/MCP'), `${name} documentation must explicitly forbid manual/MCP mutation`);
      assert.ok(!body.includes('`.progress.json` создаётся ТОЛЬКО через `spec-status.ts`'), `${name} documentation must not keep the stale single-writer claim`);
    }
  },
);

// ── SPECGEN004_512 — P16-8: active-spec STOP signal, no corpus nag ─────────

interface FStopDisciplineWorld extends V4World {
  stopHookResult?: { status: number | null; stdout: string; stderr: string };
  verboseStopHookResult?: { status: number | null; stdout: string; stderr: string };
}

function progressWithUnconfirmedStop(featureSlug: string): ProgressState {
  return {
    version: 4,
    featureSlug,
    createdAt: '2026-07-08T00:00:00.000Z',
    currentPhase: 'Requirements',
    phases: {
      Discovery: { completedAt: '2026-07-08T00:00:00.000Z', stopConfirmed: false, stopConfirmedAt: null },
      Context: { completedAt: null, stopConfirmed: false, stopConfirmedAt: null },
      Requirements: { completedAt: null, stopConfirmed: false, stopConfirmedAt: null },
      Finalization: { completedAt: null, stopConfirmed: false, stopConfirmedAt: null },
    },
  };
}

function seedProgressOnlySpec(root: string, slug: string): void {
  const specDir = path.join(root, '.specs', slug);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, '.progress.json'),
    `${JSON.stringify(progressWithUnconfirmedStop(slug), null, 2)}\n`,
    'utf-8',
  );
}

function runValidateSpecsHook(corpusRoot: string, prompt: string, extraEnv: NodeJS.ProcessEnv = {}): { status: number | null; stdout: string; stderr: string } {
  const input = JSON.stringify({
    conversation_id: 'bdd-stop-discipline',
    cwd: corpusRoot,
    workspace_roots: [corpusRoot],
    prompt,
  });
  const r = spawnSync(process.execPath, ['--import', 'tsx', VALIDATE_SPECS], {
    encoding: 'utf-8',
    input,
    env: {
      ...process.env,
      SPEC_CONFORMANCE_REPO_ROOT: corpusRoot,
      ...extraEnv,
    },
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

Given(
  /^a temp spec corpus with active and legacy specs that both have unconfirmed STOPs$/,
  function (this: FStopDisciplineWorld) {
    fs.mkdirSync(path.join(this.tempDir, '.specs'), { recursive: true });
    seedProgressOnlySpec(this.tempDir, 'active-spec');
    seedProgressOnlySpec(this.tempDir, 'legacy-spec');
  },
);

When(
  /^the specs-validator prompt hook receives a prompt about the active spec$/,
  function (this: FStopDisciplineWorld) {
    this.stopHookResult = runValidateSpecsHook(
      this.tempDir,
      'Continue .specs/active-spec/DESIGN.md after checking the active spec phase state.',
    );
    assert.equal(this.stopHookResult.status, 0, `validate-specs hook must exit 0; stderr: ${this.stopHookResult.stderr}`);

    this.verboseStopHookResult = runValidateSpecsHook(
      this.tempDir,
      'Continue .specs/active-spec/DESIGN.md after checking the active spec phase state.',
      { SPECS_VALIDATOR_VERBOSE: '1' },
    );
    assert.equal(this.verboseStopHookResult.status, 0, `verbose validate-specs hook must exit 0; stderr: ${this.verboseStopHookResult.stderr}`);
  },
);

Then(
  /^the hook output surfaces the active spec unconfirmed STOP with the exact confirm command$/,
  function (this: FStopDisciplineWorld) {
    assert.match(this.stopHookResult!.stdout, /\[specs-validator\] ACTIVE SPEC STOP "active-spec" \| Phase: Requirements \| STOP #1 not confirmed/);
    assert.match(this.stopHookResult!.stdout, /Confirm: spec-status\.ts -Path "\.specs\/active-spec" -ConfirmStop Discovery/);
  },
);

Then(
  /^the hook output does not emit a corpus-wide unconfirmed STOP count$/,
  function (this: FStopDisciplineWorld) {
    assert.doesNotMatch(this.stopHookResult!.stdout, /\d+ specs with unconfirmed STOP/);
  },
);

Then(
  /^the unrelated legacy spec stays quiet unless verbose mode is enabled$/,
  function (this: FStopDisciplineWorld) {
    assert.doesNotMatch(this.stopHookResult!.stdout, /legacy-spec/);
    assert.match(this.verboseStopHookResult!.stdout, /SPEC STOP \(verbose\) "legacy-spec"/);
  },
);
