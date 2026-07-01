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
import { checkLinks } from '../../tools/anchor-integrity/check.mjs';
import { marksmanSlug } from '../../tools/anchor-integrity/marksman-slug.mjs';
import { fixSpecDir } from '../../tools/anchor-integrity/fix.mjs';
import { dispatchClaudeFallback } from '../../tools/anchor-integrity/claude-fallback.mjs';
import { buildReminder } from '../../tools/anchor-integrity/anchor_check_post.ts';
import { escapeReason, escapeHonoured } from '../../tools/anchor-integrity/anchor_gate_stop.ts';

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
}
const mkTmp = (w: AnchorWorld) => (w.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f34-')));

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
