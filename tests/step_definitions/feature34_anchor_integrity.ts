/**
 * @feature34 step definitions — anchor-integrity (FR-34), bound to the REAL tools
 * (no mocks except an injected spawn to prove non-blocking dispatch). Covers
 * SPECGEN004_80..84, 1:1 with AC-34.1..5:
 *   80 → AC-34.1  checkLinks reports same-file + cross-file breaks with the likely heading
 *   81 → AC-34.2  marksmanSlug == Marksman golden fixture, single shared source
 *   82 → AC-34.3  PostToolUse reminder + bounded Stop-gate escape
 *   83 → AC-34.4  deterministic fixer: id-bearing rewrite, no LLM, idempotent
 *   84 → AC-34.5  ambiguous → background claude dispatch; unavailable → flagged, no guess
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_80..84
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkLinks } from '../../tools/anchor-integrity/check.mjs';
import { marksmanSlug } from '../../tools/anchor-integrity/marksman-slug.mjs';
import { fixSpecDir } from '../../tools/anchor-integrity/fix.mjs';
import { dispatchClaudeFallback } from '../../tools/anchor-integrity/claude-fallback.mjs';
import { buildReminder } from '../../tools/anchor-integrity/anchor_check_post.ts';
import { escapeReason, escapeHonoured } from '../../tools/anchor-integrity/anchor_gate_stop.ts';
import {
  classifySessionSpecChanges,
  type ProvenanceClassification,
} from '../../tools/anchor-integrity/provenance.ts';

interface BrokenLike { file: string; line: number; brokenAnchor: string; targetRaw: string; currentSlug: string | null; linkText: string }
interface AnchorWorld {
  broken?: BrokenLike[];
  slugMismatches?: string[];
  importsOk?: boolean;
  reminder?: string | null;
  tmpDir?: string;
  specDir?: string;
  fixedContent?: string;
  idempotentNoop?: boolean;
  dispatch?: ReturnType<typeof dispatchClaudeFallback>;
  flaggedRun?: ReturnType<typeof dispatchClaudeFallback>;
  spawnCalls?: number;
  sessionAResult?: ProvenanceClassification;
  sessionBResult?: ProvenanceClassification;
  cachedBefore?: string;
  cachedAfter?: string;
  unstagedBefore?: string;
  unstagedAfter?: string;
  stopAReason?: string;
  stopBReason?: string;
}
const mkTmp = (w: AnchorWorld) => (w.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f34-')));
const runAnchorHook = (repo: string, file: string, input: object, args: string[] = []) => {
  const pluginRoot = process.cwd();
  const bootstrap = path.join(pluginRoot, 'tools', '_shared', 'bootstrap.cjs');
  const target = path.join(pluginRoot, 'tools', 'anchor-integrity', file);
  return spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(bootstrap)})`, '--', target, ...args],
    {
      cwd: repo,
      input: JSON.stringify(input),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PROJECT_DIR: repo, ANCHOR_GATE_ENABLED: 'true' },
    },
  );
};

// ── SPECGEN004_80 — AC-34.1: same-file + cross-file detection ────────────────
Given('a heading slug changed, orphaning one same-file and one cross-file inbound anchor', function (this: AnchorWorld) {
  const files = [
    // same-file: heading slug is now fr-7-renamed-title, the link still points at #fr-7-old
    { file: 'FR.md', content: '## FR-7: Renamed Title\n\nbody\n[FR-7](#fr-7-old)\n' },
    // cross-file: AC.md links into FR.md with a stale anchor
    { file: 'AC.md', content: '## AC-1 (FR-7)\n[FR-7](FR.md#fr-7-stale)\n' },
  ];
  this.broken = checkLinks(files) as BrokenLike[];
});
When('the anchor-integrity check runs over the spec files', function () { /* checkLinks already ran in Given */ });
Then('both broken links are reported with their file, line and unresolved anchor', function (this: AnchorWorld) {
  assert.equal(this.broken!.length, 2, JSON.stringify(this.broken));
  for (const b of this.broken!) {
    assert.ok(b.file && b.line > 0 && b.brokenAnchor, `incomplete: ${JSON.stringify(b)}`);
  }
  const sameFile = this.broken!.filter((b) => b.targetRaw === '');
  const crossFile = this.broken!.filter((b) => b.targetRaw === 'FR.md');
  assert.equal(sameFile.length, 1, 'expected exactly one same-file break');
  assert.equal(crossFile.length, 1, 'expected exactly one cross-file break');
});
Then('each one names the heading slug the link most likely meant', function (this: AnchorWorld) {
  for (const b of this.broken!) assert.equal(b.currentSlug, 'fr-7-renamed-title', JSON.stringify(b));
});

// ── SPECGEN004_81 — AC-34.2: golden parity + single source ───────────────────
Given('the captured Marksman golden slug fixture', function (this: AnchorWorld) {
  const fx = JSON.parse(fs.readFileSync('tests/fixtures/marksman/slug-rule.json', 'utf-8'));
  this.slugMismatches = [];
  for (const [input, expected] of Object.entries(fx.slugs as Record<string, string>)) {
    if (marksmanSlug(input) !== expected) this.slugMismatches!.push(`${input} → ${marksmanSlug(input)} ≠ ${expected}`);
  }
});
When('marksmanSlug is computed for every id-shape in the fixture', function () { /* computed in Given */ });
Then('each result equals the slug the real Marksman binary produced', function (this: AnchorWorld) {
  assert.deepEqual(this.slugMismatches, [], `slug divergences: ${this.slugMismatches!.join('; ')}`);
});
Then('both the SpecGraph md parser and the specs-generator core import that one marksmanSlug function', function () {
  const md = fs.readFileSync('tools/spec-graph/parsers/md.ts', 'utf-8');
  const core = fs.readFileSync('tools/specs-generator/specs-generator-core.mjs', 'utf-8');
  const re = /anchor-integrity\/marksman-slug\.mjs/;
  assert.ok(re.test(md), 'md.ts must import the shared marksman-slug.mjs');
  assert.ok(re.test(core), 'specs-generator-core.mjs must import the shared marksman-slug.mjs');
});

// ── SPECGEN004_82 — AC-34.3: PostToolUse reminder + bounded escape ────────────
Given('a spec file edited so an inbound anchor no longer resolves', function (this: AnchorWorld) {
  const dir = mkTmp(this);
  fs.mkdirSync(path.join(dir, '.specs', 's'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.specs', 's', 'FR.md'), '## FR-7: Title\n[FR-7](#fr-7-old)\n');
  this.specDir = path.join(dir, '.specs', 's');
});
When('the PostToolUse anchor hook inspects the edited file', function (this: AnchorWorld) {
  this.reminder = buildReminder(path.join(this.specDir!, 'FR.md'));
});
Then('it returns a system-reminder naming the broken link and its fix', function (this: AnchorWorld) {
  assert.ok(this.reminder, 'expected a reminder');
  assert.match(this.reminder!, /<system-reminder>/);
  assert.match(this.reminder!, /#fr-7-old/);
  assert.match(this.reminder!, /fix to #fr-7-title/);
  fs.rmSync(this.tmpDir!, { recursive: true, force: true });
});
Then('the Stop-gate honours a skip-anchor-fix escape only when the reason is at least 8 characters', function () {
  assert.equal(escapeHonoured(escapeReason('[skip-anchor-fix: deliberate type-only refactor]')), true);
  assert.equal(escapeHonoured(escapeReason('[skip-anchor-fix: no]')), false); // < 8 chars
  assert.equal(escapeHonoured(escapeReason('no marker here')), false);
});

// ── SPECGEN004_83 — AC-34.4: deterministic, no-LLM, idempotent ───────────────
Given('a broken link whose text carries the heading id', function (this: AnchorWorld) {
  const dir = mkTmp(this);
  this.specDir = path.join(dir, '.specs', 's');
  fs.mkdirSync(this.specDir, { recursive: true });
  fs.writeFileSync(path.join(this.specDir, 'FR.md'), '## FR-7: Title\n[FR-7](#fr-7-old)\n');
});
When('the deterministic fixer runs over the spec', function (this: AnchorWorld) {
  const r1 = fixSpecDir(this.specDir!, this.tmpDir!, { apply: true }); // NO claude option → pure, no spawn
  assert.equal(r1.fixable, 1);
  this.fixedContent = fs.readFileSync(path.join(this.specDir!, 'FR.md'), 'utf-8');
  const r2 = fixSpecDir(this.specDir!, this.tmpDir!, { apply: true }); // second pass
  this.idempotentNoop = r2.fixable === 0 && r2.written.length === 0;
  assert.equal(fs.readFileSync(path.join(this.specDir!, 'FR.md'), 'utf-8'), this.fixedContent);
});
Then('it rewrites the anchor to the heading\'s current marksmanSlug without invoking any model', function (this: AnchorWorld) {
  assert.match(this.fixedContent!, /\[FR-7\]\(#fr-7-title\)/);
  assert.ok(!/#fr-7-old/.test(this.fixedContent!), 'stale anchor must be gone');
});
Then('applying the fixer a second time changes nothing', function (this: AnchorWorld) {
  assert.equal(this.idempotentNoop, true);
  fs.rmSync(this.tmpDir!, { recursive: true, force: true });
});

// ── SPECGEN004_84 — AC-34.5: background dispatch / no-guess ───────────────────
Given('a broken link whose text identifies no heading id', function (this: AnchorWorld) {
  (this as any).ambiguous = {
    file: 'FR.md', line: 4, linkText: 'see the design notes', targetFile: '', targetRaw: '',
    brokenAnchor: 'design-old', inferredId: '', currentSlug: null,
  };
});
When('the headless fallback runs with the claude binary available', function (this: AnchorWorld) {
  const cands = new Map([['FR.md', [{ text: 'Design', slug: 'design' }]]]);
  this.spawnCalls = 0;
  const fakeSpawn = () => { this.spawnCalls!++; return { unref() {} }; };
  this.dispatch = dispatchClaudeFallback([(this as any).ambiguous], cands, { claudeBin: '/bin/claude', spawnFn: fakeSpawn as any });
  this.flaggedRun = dispatchClaudeFallback([(this as any).ambiguous], cands, { claudeBin: null, spawnFn: fakeSpawn as any });
});
Then('it dispatches a background claude process for that link without blocking', function (this: AnchorWorld) {
  assert.deepEqual({ available: this.dispatch!.available, dispatched: this.dispatch!.dispatched }, { available: true, dispatched: 1 });
  assert.equal(this.spawnCalls, 1);
});
Then('with the claude binary unavailable the link stays flagged and is never rewritten', function (this: AnchorWorld) {
  assert.deepEqual({ available: this.flaggedRun!.available, dispatched: this.flaggedRun!.dispatched, flagged: this.flaggedRun!.flagged }, { available: false, dispatched: 0, flagged: 1 });
  assert.equal(this.spawnCalls, 1, 'no extra spawn when claude is unavailable');
});

// ── SPECGEN004_563 — issue #147: shared-worktree provenance ──────────────────
Given('two sessions share a Git worktree with pre-existing dirty spec debt and independent anchor provenance baselines', function (this: AnchorWorld) {
  const repo = mkTmp(this);
  const git = (args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  git(['init', '-q']);
  git(['config', 'user.email', 'anchor@example.test']);
  git(['config', 'user.name', 'Anchor Test']);
  for (const slug of ['preexisting', 'session-a', 'session-b']) {
    const dir = path.join(repo, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'FR.md'), '## FR-1: Original\n[FR-1](#fr-1-original)\n');
  }
  git(['add', '--', '.specs/session-a/FR.md', '.specs/session-b/FR.md']);
  git(['add', '--', '.specs/preexisting/FR.md']);
  git(['commit', '-qm', 'fixture baseline']);
  fs.writeFileSync(
    path.join(repo, '.specs', 'preexisting', 'FR.md'),
    '## FR-1: Pre-existing Debt\n[FR-1](#fr-1-stale-before-session)\n',
  );
  const registry = JSON.parse(fs.readFileSync(path.resolve('tools/hook-service/registry.json'), 'utf8'));
  assert.ok(
    Object.values(registry.routes as Record<string, { event: string; target: string; args: string[] }>).some(
      (route) => route.event === 'SessionStart'
        && route.target === 'tools/anchor-integrity/anchor_gate_stop.ts'
        && route.args.includes('--capture-baseline'),
    ),
    'generated hook-service registry must route SessionStart to the anchor baseline capture',
  );
  for (const session_id of ['session-a', 'session-b']) {
    const capture = runAnchorHook(repo, 'anchor_gate_stop.ts', { session_id }, ['--capture-baseline']);
    assert.equal(capture.status, 0, capture.stderr);
  }
});

When('each session touches a different dirty spec and one file has both staged and unstaged changes', function (this: AnchorWorld) {
  const repo = this.tmpDir!;
  const git = (args: string[]) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  const a = path.join(repo, '.specs', 'session-a', 'FR.md');
  const b = path.join(repo, '.specs', 'session-b', 'FR.md');
  fs.writeFileSync(a, '## FR-1: Renamed A\n[FR-1](#fr-1-stale-a)\n');
  assert.equal(runAnchorHook(repo, 'anchor_check_post.ts', { session_id: 'session-a', tool_input: { file_path: a } }).status, 0);
  git(['add', '--', '.specs/session-a/FR.md']);
  fs.writeFileSync(b, '## FR-1: Renamed B\n[FR-1](#fr-1-stale-b)\n');
  assert.equal(runAnchorHook(repo, 'anchor_check_post.ts', { session_id: 'session-b', tool_input: { file_path: b } }).status, 0);
  git(['add', '--', '.specs/session-b/FR.md']);
  fs.appendFileSync(b, '\nunstaged session B note\n');
  this.cachedBefore = git(['diff', '--cached', '--binary']).stdout;
  this.unstagedBefore = git(['diff', '--binary']).stdout;
  this.sessionAResult = classifySessionSpecChanges(repo, 'session-a');
  this.sessionBResult = classifySessionSpecChanges(repo, 'session-b');
  const stopA = runAnchorHook(repo, 'anchor_gate_stop.ts', { session_id: 'session-a' });
  const stopB = runAnchorHook(repo, 'anchor_gate_stop.ts', { session_id: 'session-b' });
  assert.equal(stopA.status, 0, stopA.stderr);
  assert.equal(stopB.status, 0, stopB.stderr);
  this.stopAReason = JSON.parse(stopA.stdout).reason;
  this.stopBReason = JSON.parse(stopB.stdout).reason;
  this.cachedAfter = git(['diff', '--cached', '--binary']).stdout;
  this.unstagedAfter = git(['diff', '--binary']).stdout;
});

Then('each anchor Stop-gate classifies only its own touched spec without mutating the Git index', function (this: AnchorWorld) {
  assert.deepEqual(this.sessionAResult!.currentSlugs, ['session-a']);
  assert.deepEqual(this.sessionBResult!.currentSlugs, ['session-b']);
  assert.deepEqual(this.sessionAResult!.unknownSlugs, ['session-b']);
  assert.deepEqual(this.sessionBResult!.unknownSlugs, ['session-a']);
  assert.deepEqual(this.sessionAResult!.preexistingSlugs, ['preexisting']);
  assert.deepEqual(this.sessionBResult!.preexistingSlugs, ['preexisting']);
  assert.match(this.stopAReason!, /you edited session-a and left 1 broken link anchor/);
  assert.doesNotMatch(this.stopAReason!, /you edited[^\n]*session-b/);
  assert.match(this.stopBReason!, /you edited session-b and left 1 broken link anchor/);
  assert.doesNotMatch(this.stopBReason!, /you edited[^\n]*session-a/);
  assert.equal(this.cachedAfter, this.cachedBefore);
  assert.equal(this.unstagedAfter, this.unstagedBefore);
});

Then('a session without reliable baseline evidence reports provenance unknown and fails open', function (this: AnchorWorld) {
  const run = runAnchorHook(this.tmpDir!, 'anchor_gate_stop.ts', { session_id: 'missing-baseline' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, '', 'unknown provenance must fail open, not emit a block decision');
  assert.match(run.stderr, /provenance unknown/);
  assert.match(run.stderr, /not attributing them to this session and failing open/);
  fs.rmSync(this.tmpDir!, { recursive: true, force: true });
});
