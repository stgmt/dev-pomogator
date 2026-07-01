/**
 * @feature54 step definitions — TASKS.md task-id rework helper (FR-54).
 *
 * Migrated from tests/e2e/add-task-ids.test.ts (SPECGEN004_460..470). Drives the REAL
 * `scripts/add-task-ids.ts` (addTaskIds for `Tnn:` headers, addTaskIdsAnyHeader for
 * title-only / phase-dashed headers) in-process — pure string functions, no mocks.
 * The three INVARIANT scenarios reproduce the vitest property loops (40 doc shapes).
 *
 * @see .specs/spec-generator-v4/FR.md FR-54
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { addTaskIds, addTaskIdsAnyHeader } from '../../scripts/add-task-ids.ts';
import { V4World } from '../hooks/before-after.ts';

interface TiWorld extends V4World {
  tiInput?: string;
  tiResult?: { added: number; skipped?: number; content: string };
}

// Named loose-TASKS inputs (the exact vitest cases — data, not mocks).
const INPUTS: Record<string, string> = {
  'a Tnn header missing its id': '- [x] T01: MOVE files -- @feature1 — Status: DONE | Est: 60m',
  'a Tnn header with a Done-When child checkbox': '- [x] T01: A — Status: DONE | Est: 5m\n  - [x] 9 files copied\n  - [ ] curl returns 200',
  'a CRLF document with two Tnn headers and a child': '- [x] T01: A — Status: DONE | Est: 5m\r\n  - [x] child\r\n- [ ] T02: B — Status: TODO | Est: 5m\r\n',
  'a Tnn header that already carries an id': '- [x] T01: A — id: t01 — Status: DONE | Est: 5m',
  'two headers with the same Tnn prefix': '- [x] T01: A — Status: DONE | Est: 5m\n- [ ] T01: B — Status: TODO | Est: 5m',
  'a title-only header with no Tnn prefix': '- [ ] Создать fixture X -- @feature1 — Status: TODO | Est: 15m',
  'a header with a phase-dashed prefix': '- [ ] **T4-33: do thing** — Status: DONE | Est: 30m',
  'a title-only header with a no-status child': '- [ ] Title -- @feature1 — Status: TODO\n  - [ ] a child observable (no status)\n',
};

Given(/^a loose TASKS line — `([^`]+)`$/, function (this: TiWorld, name: string) {
  this.tiInput = INPUTS[name];
  assert.ok(this.tiInput !== undefined, `unknown loose-TASKS input: "${name}"`);
});

When(/^the (addTaskIds|addTaskIdsAnyHeader) rework runs over it$/, function (this: TiWorld, fn: string) {
  this.tiResult = fn === 'addTaskIds' ? addTaskIds(this.tiInput!) : addTaskIdsAnyHeader(this.tiInput!);
});

Then(/^the rework adds (\d+) ids?$/, function (this: TiWorld, n: string) {
  assert.equal(this.tiResult!.added, Number(n), `added mismatch: ${JSON.stringify(this.tiResult)}`);
});

Then(/^the rework skips (\d+) header$/, function (this: TiWorld, n: string) {
  assert.equal(this.tiResult!.skipped, Number(n), `skipped mismatch: ${JSON.stringify(this.tiResult)}`);
});

Then(/^the reworked content contains `([^`]+)`$/, function (this: TiWorld, frag: string) {
  assert.ok(this.tiResult!.content.includes(frag), `content must contain "${frag}"; got: ${this.tiResult!.content}`);
});

Then(/^the reworked content does not match \/([^/]+)\/$/, function (this: TiWorld, re: string) {
  assert.ok(!new RegExp(re).test(this.tiResult!.content), `content must NOT match /${re}/; got: ${this.tiResult!.content}`);
});

Then(/^the reworked content matches \/([^/]+)\/$/, function (this: TiWorld, re: string) {
  assert.ok(new RegExp(re).test(this.tiResult!.content), `content must match /${re}/; got: ${this.tiResult!.content}`);
});

Then(/^the reworked content is byte-identical to the input$/, function (this: TiWorld) {
  assert.equal(this.tiResult!.content, this.tiInput);
});

Then(/^the reworked content preserves all (\d+) CRLF endings$/, function (this: TiWorld, n: string) {
  assert.equal((this.tiResult!.content.match(/\r\n/g) || []).length, Number(n));
});

// ── Property invariants (40 doc shapes) — reproduce the vitest generator ─────
const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
function genDoc(seed: number): string {
  const n = (seed % 5) + 1;
  const lines: string[] = [`## Phase ${seed % 3}`];
  for (let i = 0; i < n; i++) {
    const st = STATUSES[(seed + i) % STATUSES.length];
    const prefix = (seed + i) % 2 === 0 ? `T${seed % 4}-${i}: ` : '';
    lines.push(`- [${st === 'DONE' ? 'x' : ' '}] ${prefix}task ${i} -- @feature${i} — Status: ${st} | Est: ${i + 1}0m`);
    lines.push(`  - [ ] child observable ${i} (no status)`);
  }
  return lines.join('\r\n') + '\r\n';
}

Then(/^addTaskIdsAnyHeader is idempotent across 40 generated docs$/, function () {
  for (let seed = 0; seed < 40; seed++) {
    const once = addTaskIdsAnyHeader(genDoc(seed)).content;
    const twice = addTaskIdsAnyHeader(once);
    assert.equal(twice.added, 0, `seed=${seed}: 2nd pass must add 0`);
    assert.equal(twice.content, once, `seed=${seed}: 2nd pass must be byte-identical`);
  }
});

Then(/^every header gets exactly one unique id and no child does across 40 generated docs$/, function () {
  for (let seed = 0; seed < 40; seed++) {
    const r = addTaskIdsAnyHeader(genDoc(seed));
    const ids = [...r.content.matchAll(/—\s*id:\s*(\S+)\s*—\s*Status:/g)].map((m) => m[1]);
    const headers = (r.content.match(/^[ \t]*-\s*\[[ xX~]\][^\r\n]*?—\s*Status:/gm) || []).length;
    assert.equal(ids.length, headers, `seed=${seed}: one id per header`);
    assert.equal(new Set(ids).size, ids.length, `seed=${seed}: ids must be unique — ${ids.join(',')}`);
    assert.equal(/child observable \d+ \(no status\)[^\n]*id:/.test(r.content), false, `seed=${seed}: child must never get an id`);
  }
});

Then(/^every Status token is byte-unchanged across 40 generated docs$/, function () {
  for (let seed = 0; seed < 40; seed++) {
    const doc = genDoc(seed);
    const before = (doc.match(/—\s*Status:\s*\w+/g) || []).sort();
    const after = (addTaskIdsAnyHeader(doc).content.match(/—\s*Status:\s*\w+/g) || []).sort();
    assert.deepEqual(after, before, `seed=${seed}: Status tokens must be unchanged`);
  }
});
