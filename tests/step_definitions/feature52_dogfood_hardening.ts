// @feature52 — FR-52 (Session dogfood hardening) + the STRICT host-bdd block (owner directive
// 2026-06-24: "буквально ничего на машине, всё в Docker"). Drives the REAL
// tools/tui-test-runner/test_guard.ts by spawning it exactly the way the PreToolUse hook does
// (bootstrap.cjs -> tsx) and asserting the allow/deny matrix. No mock.
//
// Contract: EVERY host cucumber/run-bdd invocation — full, --name, --tags batch, --dry-run, and
// `node scripts/run-bdd.mjs` (any form) — is DENIED (exit 2) and routed to docker-bdd.sh. Only a
// docker-wrapped run (docker-bdd.sh / docker compose) and PROSE that merely mentions cucumber are
// allowed. (Supersedes the earlier full-vs-filtered clobber matrix: under "nothing on host" the
// clobber-vs-full distinction is moot — the guard's clobber branch was removed.)
//
// Mutation gutcheck (revert in .dev-pomogator/.tmp/guard-check.mjs): break the guard's cucumber
// detection and the deny legs redden; break the docker ALLOWED_PATTERNS and the docker-bdd allow
// leg reddens.
import { Given, When, Then } from '@cucumber/cucumber';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildGraph } from '../../tools/spec-graph/builder.ts';
import { buildToolRegistry } from '../../tools/spec-mcp-server/tools.ts';
import { buildReminder } from '../../tools/anchor-integrity/anchor_check_post.ts';
import { buildBlockReason } from '../../tools/anchor-integrity/anchor_gate_stop.ts';
import { checkSpecDir } from '../../tools/anchor-integrity/check.mjs';
import { runChecks } from '../../.claude/skills/spec-reality-check/scripts/verify.ts';
import type { AuditFinding } from '../../.claude/skills/spec-reality-check/scripts/verify.ts';

const GUARD_ARGS = [
  '-e',
  "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT || '.', 'tools', '_shared', 'bootstrap.cjs'))",
  '--',
  'tools/tui-test-runner/test_guard.ts',
];

function runGuard(command: string): { status: number | null; stdout: string } {
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  const r = spawnSync(process.execPath, GUARD_ARGS, {
    input: payload,
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: process.cwd() },
  });
  return { status: r.status, stdout: r.stdout ?? '' };
}

const CUKE = 'node --import tsx node_modules/@cucumber/cucumber/bin/cucumber.js';

interface GuardWorld {
  tempDir: string;
  lastResult?: { status: number | null; stdout: string };
  packageBddScript?: string;
  dockerBddSource?: string;
  bddMigratorSkill?: string;
  runTestsSkill?: string;
  validateAnchorTool?: ReturnType<typeof buildToolRegistry>[number];
  compactAnchorResult?: any;
  headingSlugResult?: any;
  missingHeadingSlugResult?: any;
  anchorRepo?: string;
  anchorSpecDir?: string;
  anchorDoorStdout?: string;
  anchorDoorStatus?: number | null;
  anchorDoorRepeatStdout?: string;
  anchorDoorRepeatStatus?: number | null;
  anchorReminder?: string | null;
  anchorGateReason?: string;
  v1LayoutRepo?: string;
  genericV1LayoutRepo?: string;
  v1LayoutFindings?: AuditFinding[];
  genericV1LayoutFindings?: AuditFinding[];
}

Given(/^the test-guard PreToolUse hook is the canonical Bash guard$/, function () {
  assert.ok(
    fs.existsSync('tools/tui-test-runner/test_guard.ts'),
    'the test-guard hook source must exist (it is the registered PreToolUse Bash guard)',
  );
});

// ─── DENY legs: every host cucumber/run-bdd form → exit 2 + docker-bdd ────────────────

When(/^a full host cucumber run hits the default config$/, function (this: GuardWorld) {
  this.lastResult = runGuard(CUKE);
});
When(/^a host cucumber run is filtered by name$/, function (this: GuardWorld) {
  this.lastResult = runGuard(`${CUKE} --name "SPECGEN004_15"`);
});
When(/^a host cucumber run is filtered by tag as a batch$/, function (this: GuardWorld) {
  this.lastResult = runGuard(`${CUKE} --tags "@feature7"`);
});
When(/^a full host run-bdd invocation has no filter$/, function (this: GuardWorld) {
  this.lastResult = runGuard('node scripts/run-bdd.mjs');
});
When(/^a host run-bdd invocation is filtered by name$/, function (this: GuardWorld) {
  this.lastResult = runGuard('node scripts/run-bdd.mjs --name "SPECGEN004_15"');
});
When(/^a dry-run host cucumber pass hits the default config$/, function (this: GuardWorld) {
  this.lastResult = runGuard(`${CUKE} --dry-run`);
});

Then(/^the guard denies it with exit 2 and routes to docker-bdd$/, function (this: GuardWorld) {
  assert.equal(this.lastResult?.status, 2, `host BDD run must be denied (exit 2); got ${this.lastResult?.status}`);
  assert.ok(
    /docker-bdd\.sh/.test(this.lastResult?.stdout ?? ''),
    `deny remediation must point at scripts/docker-bdd.sh; got: ${this.lastResult?.stdout}`,
  );
});

// ─── ALLOW legs: docker-wrapped run + prose that only mentions cucumber ────────────────

When(/^a docker-bdd\.sh invocation runs the suite in Docker$/, function (this: GuardWorld) {
  this.lastResult = runGuard('bash scripts/docker-bdd.sh --tags "@feature7"');
});
When(/^an npm test:bdd invocation reaches the guard$/, function (this: GuardWorld) {
  this.lastResult = runGuard('npm run test:bdd');
});
When(/^a git commit message merely mentions a cucumber run$/, function (this: GuardWorld) {
  this.lastResult = runGuard('git commit -m "fix: cucumber --name X clobbers .last-test-run.ndjson"');
});

Then(/^the guard allows it with exit 0$/, function (this: GuardWorld) {
  assert.equal(this.lastResult?.status, 0, `must be allowed (exit 0); got ${this.lastResult?.status}`);
});

When(/^the package BDD script is inspected$/, function (this: GuardWorld) {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')) as { scripts?: Record<string, string> };
  this.packageBddScript = pkg.scripts?.['test:bdd'];
});

Then(/^test:bdd routes to docker-bdd$/, function (this: GuardWorld) {
  assert.equal(this.packageBddScript, 'bash scripts/docker-bdd.sh');
});

When(/^the docker-bdd runner is inspected$/, function (this: GuardWorld) {
  this.dockerBddSource = fs.readFileSync('scripts/docker-bdd.sh', 'utf8');
});

Then(/^docker-bdd invokes run-bdd inside Docker instead of raw cucumber$/, function (this: GuardWorld) {
  assert.match(
    this.dockerBddSource ?? '',
    /test\s+scripts\/run-bdd\.mjs\s+"\$\{CUCUMBER_ARGS\[@\]\}"/,
    'docker-bdd must route the in-container run through scripts/run-bdd.mjs',
  );
  assert.doesNotMatch(
    this.dockerBddSource ?? '',
    /test\s+--import\s+tsx\s+node_modules\/@cucumber\/cucumber\/bin\/cucumber\.js\s+-c/,
    'docker-bdd must not invoke raw cucumber.js as the sanctioned in-container path',
  );
});

When(/^the BDD runner instructions are inspected$/, function (this: GuardWorld) {
  this.bddMigratorSkill = fs.readFileSync('.claude/skills/bdd-migrator/SKILL.md', 'utf8');
  this.runTestsSkill = fs.readFileSync('.claude/skills/run-tests/SKILL.md', 'utf8');
});

Then(/^they route filtered BDD diagnostics through docker-bdd and not host cucumber$/, function (this: GuardWorld) {
  assert.match(this.bddMigratorSkill ?? '', /bash scripts\/docker-bdd\.sh --name "<id>"/);
  assert.match(this.bddMigratorSkill ?? '', /bash scripts\/docker-bdd\.sh -c \.dev-pomogator\/\.tmp\/cuke-<slug>\.json/);
  assert.match(this.runTestsSkill ?? '', /bash scripts\/docker-bdd\.sh --name "SPECGEN004_513"/);
  assert.doesNotMatch(
    this.bddMigratorSkill ?? '',
    /Run:\n\s+`node --import tsx node_modules\/@cucumber\/cucumber\/bin\/cucumber\.js/,
    'bdd-migrator must not prescribe host raw cucumber as the validation command',
  );
});

Given(/^a validate_anchor tool over a spec containing a punctuation-heavy Marksman heading$/, function (this: GuardWorld) {
  const specDir = path.join(process.cwd(), '.dev-pomogator', '.tmp', `validate-anchor-${process.pid}`);
  fs.rmSync(specDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(specDir, '.specs', 'auth'), { recursive: true });
  fs.writeFileSync(
    path.join(specDir, '.specs', 'auth', 'FR.md'),
    '## FR-34: Marksman v2.0 anchors!\n\nBody.\n',
  );
  const graph = buildGraph({ repoRoot: specDir, skipNdjson: true });
  const registry = buildToolRegistry(() => graph);
  this.validateAnchorTool = registry.find((tool) => tool.name === 'validate_anchor');
  assert.ok(this.validateAnchorTool, 'validate_anchor must be registered');
});

When(/^validate_anchor checks both a compact id and DOC\.md#heading-slug$/, async function (this: GuardWorld) {
  const parse = async (args: Record<string, unknown>) => JSON.parse(
    (await this.validateAnchorTool!.handler(args as never)).content[0].text,
  );
  this.compactAnchorResult = await parse({ anchor: 'FR-34' });
  this.headingSlugResult = await parse({ anchor: 'FR.md#fr-34-marksman-v20-anchors', spec: 'auth' });
  this.missingHeadingSlugResult = await parse({ anchor: 'FR.md#fr-34-marksman-v2-0-anchors', spec: 'auth' });
});

Then(/^the tool description separates the alias registry from Marksman heading slugs$/, function (this: GuardWorld) {
  const description = this.validateAnchorTool?.description ?? '';
  assert.match(description, /spec-graph compact-id\/alias registry/);
  assert.match(description, /DOC\.md#heading-slug/);
  assert.match(description, /Marksman heading slug/);
  assert.match(description, /not a compact-id alias lookup/);
});

Then(/^the compact id and Marksman heading slug resolve while a non-Marksman slug does not$/, function (this: GuardWorld) {
  assert.equal(this.compactAnchorResult?.registered, true, JSON.stringify(this.compactAnchorResult));
  assert.equal(this.compactAnchorResult?.kind, 'spec-graph-alias');
  assert.equal(this.headingSlugResult?.registered, true, JSON.stringify(this.headingSlugResult));
  assert.equal(this.headingSlugResult?.kind, 'marksman-heading-slug');
  assert.equal(this.headingSlugResult?.location?.file, '.specs/auth/FR.md');
  assert.equal(this.headingSlugResult?.location?.line, 1);
  assert.equal(this.missingHeadingSlugResult?.registered, false, JSON.stringify(this.missingHeadingSlugResult));
  assert.equal(this.missingHeadingSlugResult?.kind, 'marksman-heading-slug');
});

Given(/^a spec with a broken id-bearing anchor while spec-access enforce is on$/, function (this: GuardWorld) {
  this.anchorRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-door-bdd-'));
  this.anchorSpecDir = path.join(this.anchorRepo, '.specs', 'auth');
  fs.mkdirSync(this.anchorSpecDir, { recursive: true });
  fs.writeFileSync(path.join(this.anchorSpecDir, 'FR.md'), '## FR-7: Login flow\n\nsee [FR-7](#fr-7-old)\n');
  const broken = checkSpecDir(this.anchorSpecDir, this.anchorRepo);
  assert.equal(broken.length, 1, `fixture must start broken: ${JSON.stringify(broken)}`);
  assert.equal(broken[0].currentSlug, 'fr-7-login-flow');
});

When(/^anchor-fix runs in door mode$/, function (this: GuardWorld) {
  assert.ok(this.anchorRepo, 'anchor repo fixture must be initialized');
  assert.ok(this.anchorSpecDir, 'anchor spec fixture must be initialized');
  const repoRoot = process.cwd();
  const fixer = path.join(repoRoot, 'tools', 'anchor-integrity', 'fix.mjs');
  const args = [
    fixer,
    '--spec',
    path.join(this.anchorRepo, '.specs', 'auth'),
    '--apply',
    '--door',
  ];
  const options = {
    cwd: repoRoot,
    env: {
      ...process.env,
      DEV_POMOGATOR_REPO_ROOT: this.anchorRepo,
      CLAUDE_PLUGIN_ROOT: repoRoot,
      SPEC_ACCESS_ENFORCE: 'true',
      NODE_PATH: path.join(repoRoot, 'node_modules'),
    },
    encoding: 'utf-8' as BufferEncoding,
  };
  const r = spawnSync(
    process.execPath,
    args,
    options,
  );
  this.anchorDoorStatus = r.status;
  this.anchorDoorStdout = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const repeat = spawnSync(process.execPath, args, options);
  this.anchorDoorRepeatStatus = repeat.status;
  this.anchorDoorRepeatStdout = `${repeat.stdout ?? ''}\n${repeat.stderr ?? ''}`;
  this.anchorReminder = buildReminder(path.join(this.anchorSpecDir, 'FR.md'));
  this.anchorGateReason = buildBlockReason(['auth'], [{
    file: '.specs/auth/FR.md',
    line: 3,
    linkText: 'FR-7',
    targetFile: '',
    targetRaw: '',
    brokenAnchor: 'fr-7-old',
    inferredId: 'FR-7',
    currentSlug: 'fr-7-login-flow',
  }]);
});

Then(/^the anchor is fixed through the spec door and enforce hints never prescribe a raw write$/, function (this: GuardWorld) {
  assert.equal(this.anchorDoorStatus, 0, `real anchor-fix CLI must pass; output:\n${this.anchorDoorStdout}`);
  assert.match(this.anchorDoorStdout ?? '', /APPLIED via door: 1 deterministic fixes/);
  assert.match(this.anchorDoorStdout ?? '', /written=1 via-door/);
  assert.doesNotMatch(this.anchorDoorStdout ?? '', /tsx-runner.*FAIL|native:fail\(2\)/);
  assert.equal(this.anchorDoorRepeatStatus, 0, `repeat fixer scan must pass; output:\n${this.anchorDoorRepeatStdout}`);
  assert.match(this.anchorDoorRepeatStdout ?? '', /fixable=0/);
  assert.match(this.anchorDoorRepeatStdout ?? '', /written=0/);
  assert.deepEqual(checkSpecDir(this.anchorSpecDir!, this.anchorRepo!), []);
  const content = fs.readFileSync(path.join(this.anchorSpecDir!, 'FR.md'), 'utf-8');
  assert.match(content, /\[FR-7\]\(#fr-7-login-flow\)/);
  assert.doesNotMatch(content, /#fr-7-old/);
  assert.equal(this.anchorReminder, null, 'post-edit reminder must clear after the door write fixes the link');
  assert.match(this.anchorGateReason ?? '', /--apply --door/);
  assert.match(this.anchorGateReason ?? '', /door-safe under SPEC_ACCESS_ENFORCE/);
  assert.doesNotMatch(this.anchorGateReason ?? '', /fix\.mjs --spec \.specs\/auth --apply\s+\(/, 'Stop hint must not prescribe the old raw-write command without --door');
});

function initEmptyGit(repoRoot: string): void {
  const init = spawnSync('git', ['init', '-q'], { cwd: repoRoot, encoding: 'utf-8' });
  assert.equal(init.status, 0, `git init must succeed: ${init.stderr}`);
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoRoot });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: repoRoot });
}

function writeV1LayoutSpec(repoRoot: string, rows: string): string {
  const specDir = path.join(repoRoot, '.specs', 'v1-layout-drift');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '# FR\n\n## FR-1: v1 layout drift\n\nNo narrative repo paths here.\n');
  fs.writeFileSync(
    path.join(specDir, 'FILE_CHANGES.md'),
    '# File Changes\n\n| Path | Action | Reason |\n|------|--------|--------|\n' + rows,
  );
  return specDir;
}

Given(/^a canonical plugin repo fixture with FILE_CHANGES edit rows under removed v1 prefixes$/, function (this: GuardWorld) {
  this.v1LayoutRepo = path.join(this.tempDir, 'v1-layout-plugin');
  fs.mkdirSync(path.join(this.v1LayoutRepo, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(this.v1LayoutRepo, '.claude-plugin', 'plugin.json'), '{"name":"fixture"}\n');
  writeV1LayoutSpec(
    this.v1LayoutRepo,
    '| `src/old_v1_module.ts` | edit | removed v1 source path |\n' +
      '| `extensions/legacy/extension.json` | edit | removed v1 extension path |\n',
  );
  initEmptyGit(this.v1LayoutRepo);
});

When(/^the spec-reality checker runs on the v1 layout drift fixture$/, function (this: GuardWorld) {
  assert.ok(this.v1LayoutRepo, 'v1 layout repo fixture must be initialized');
  this.v1LayoutFindings = runChecks(path.join(this.v1LayoutRepo, '.specs', 'v1-layout-drift'), this.v1LayoutRepo).findings;
});

Then(/^it emits FC_V1_LAYOUT_DRIFT instead of generic FC_EDIT_MISSING$/, function (this: GuardWorld) {
  const drift = (this.v1LayoutFindings ?? []).filter((f) => f.check === 'FC_V1_LAYOUT_DRIFT');
  assert.equal(drift.length, 2, `both removed v1 prefixes must be classified specifically: ${JSON.stringify(this.v1LayoutFindings)}`);
  assert.deepEqual(drift.map((f) => f.file).sort(), ['extensions/legacy/extension.json', 'src/old_v1_module.ts']);
  assert.ok(drift.every((f) => f.severity === 'ERROR'), 'v1 layout drift is an ERROR audit finding');
  assert.ok(
    drift.every((f) => /\.claude\/skills|\.claude-plugin\/plugin\.json/.test(f.details ?? '')),
    `finding details must point at the v2 canonical remap; got ${JSON.stringify(drift.map((f) => f.details))}`,
  );
  assert.equal(
    (this.v1LayoutFindings ?? []).filter((f) => f.check === 'FC_EDIT_MISSING').length,
    0,
    `canonical-plugin removed-prefix rows must not fall back to generic FC_EDIT_MISSING: ${JSON.stringify(this.v1LayoutFindings)}`,
  );
});

Then(/^the same missing src edit path stays generic when the src directory exists$/, function (this: GuardWorld) {
  this.genericV1LayoutRepo = path.join(this.tempDir, 'v1-layout-src-present');
  fs.mkdirSync(path.join(this.genericV1LayoutRepo, '.claude-plugin'), { recursive: true });
  fs.mkdirSync(path.join(this.genericV1LayoutRepo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(this.genericV1LayoutRepo, '.claude-plugin', 'plugin.json'), '{"name":"fixture"}\n');
  writeV1LayoutSpec(
    this.genericV1LayoutRepo,
    '| `src/old_v1_module.ts` | edit | src dir exists, file is missing |\n',
  );
  initEmptyGit(this.genericV1LayoutRepo);

  this.genericV1LayoutFindings = runChecks(
    path.join(this.genericV1LayoutRepo, '.specs', 'v1-layout-drift'),
    this.genericV1LayoutRepo,
  ).findings;

  assert.equal(
    (this.genericV1LayoutFindings ?? []).filter((f) => f.check === 'FC_V1_LAYOUT_DRIFT').length,
    0,
    `present src/ dir must suppress the repo-specific v1-layout classifier: ${JSON.stringify(this.genericV1LayoutFindings)}`,
  );
  const generic = (this.genericV1LayoutFindings ?? []).filter((f) => f.check === 'FC_EDIT_MISSING');
  assert.equal(generic.length, 1, `missing src file with src/ present remains generic FC_EDIT_MISSING: ${JSON.stringify(this.genericV1LayoutFindings)}`);
  assert.equal(generic[0].file, 'src/old_v1_module.ts');
});
