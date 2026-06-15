/**
 * Unit: the P21-6 rework helper that makes a loose TASKS.md trackable by the
 * SpecGraph task parser (scripts/add-task-ids.ts). The parser requires both
 * `Status:` AND an explicit `— id:`; this inserts `— id: t<nn>` on `Tnn:`
 * headers that lack it — CRLF-safe, status-preserving, child-safe, idempotent.
 */
import { describe, it, expect } from 'vitest';
import { addTaskIds, addTaskIdsAnyHeader } from '../../scripts/add-task-ids.ts';

describe('addTaskIds (rework loose TASKS.md → strict, parser-trackable)', () => {
  it('inserts — id: t<nn> before — Status: on Tnn headers, derived from the prefix', () => {
    const r = addTaskIds('- [x] T01: MOVE files -- @feature1 — Status: DONE | Est: 60m');
    expect(r.added).toBe(1);
    expect(r.content).toBe('- [x] T01: MOVE files -- @feature1 — id: t01 — Status: DONE | Est: 60m');
  });

  it('does NOT touch Done-When child checkboxes (no Status: → not a header)', () => {
    const src = '- [x] T01: A — Status: DONE | Est: 5m\n  - [x] 9 files copied\n  - [ ] curl returns 200';
    const r = addTaskIds(src);
    expect(r.added).toBe(1);
    expect(r.content).toContain('  - [x] 9 files copied'); // child untouched, no id
    expect(r.content).not.toMatch(/9 files copied — id:/);
  });

  it('preserves CRLF endings (no split/join reflow)', () => {
    const src = '- [x] T01: A — Status: DONE | Est: 5m\r\n  - [x] child\r\n- [ ] T02: B — Status: TODO | Est: 5m\r\n';
    const r = addTaskIds(src);
    expect((r.content.match(/\r\n/g) || []).length).toBe(3); // all three CRLF kept
    expect(r.content).toContain('T01: A — id: t01 — Status: DONE');
    expect(r.content).toContain('T02: B — id: t02 — Status: TODO');
  });

  it('is idempotent — a header that already has id: is left as-is', () => {
    const src = '- [x] T01: A — id: t01 — Status: DONE | Est: 5m';
    const r = addTaskIds(src);
    expect(r.added).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.content).toBe(src);
  });

  it('dedupes colliding Tnn prefixes', () => {
    const r = addTaskIds('- [x] T01: A — Status: DONE | Est: 5m\n- [ ] T01: B — Status: TODO | Est: 5m');
    expect(r.added).toBe(2);
    expect(r.content).toMatch(/A — id: t01 —/);
    expect(r.content).toMatch(/B — id: t01-1 —/);
  });
});

describe('addTaskIdsAnyHeader (general: title-only + phase-dashed loose headers)', () => {
  it('inserts a sequential id on a title-only header (no Tnn prefix)', () => {
    const r = addTaskIdsAnyHeader('- [ ] Создать fixture X -- @feature1 — Status: TODO | Est: 15m');
    expect(r.added).toBe(1);
    expect(r.content).toMatch(/X -- @feature1 — id: t01 — Status: TODO/);
  });

  it('derives the id from a leading T<n>-<n> phase-dashed prefix when present', () => {
    const r = addTaskIdsAnyHeader('- [ ] **T4-33: do thing** — Status: DONE | Est: 30m');
    expect(r.added).toBe(1);
    expect(r.content).toMatch(/— id: t433 — Status: DONE/);
  });

  it('is child-safe (Done-When checkboxes have no Status:) and idempotent', () => {
    const src = '- [ ] Title -- @feature1 — Status: TODO\n  - [ ] a child observable (no status)\n';
    const r1 = addTaskIdsAnyHeader(src);
    expect(r1.added).toBe(1);
    expect(r1.content).toContain('a child observable (no status)');
    expect(r1.content).not.toMatch(/child observable.*id:/);
    expect(addTaskIdsAnyHeader(r1.content).added).toBe(0); // idempotent
  });

  // Property-style (manual generator, no fast-check dep): invariants over many shapes.
  const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];
  function genDoc(seed: number): string {
    const n = (seed % 5) + 1;
    const lines: string[] = [`## Phase ${seed % 3}`];
    for (let i = 0; i < n; i++) {
      const st = STATUSES[(seed + i) % STATUSES.length];
      const prefix = (seed + i) % 2 === 0 ? `T${seed % 4}-${i}: ` : '';
      lines.push(`- [${st === 'DONE' ? 'x' : ' '}] ${prefix}task ${i} -- @feature${i} — Status: ${st} | Est: ${i + 1}0m`);
      lines.push(`  - [ ] child observable ${i} (no status)`); // must never get an id
    }
    return lines.join('\r\n') + '\r\n'; // CRLF on purpose
  }

  it('INVARIANT idempotence: applying twice equals applying once, over many doc shapes', () => {
    for (let seed = 0; seed < 40; seed++) {
      const doc = genDoc(seed);
      const once = addTaskIdsAnyHeader(doc).content;
      const twice = addTaskIdsAnyHeader(once);
      expect(twice.added, `seed=${seed}: 2nd pass must add 0 (idempotent), doc=${JSON.stringify(doc)}`).toBe(0);
      expect(twice.content, `seed=${seed}: 2nd pass must be byte-identical to 1st`).toBe(once);
    }
  });

  it('INVARIANT id-uniqueness + child-safety: every header gets exactly one unique id; no child does', () => {
    for (let seed = 0; seed < 40; seed++) {
      const r = addTaskIdsAnyHeader(genDoc(seed));
      const ids = [...r.content.matchAll(/—\s*id:\s*(\S+)\s*—\s*Status:/g)].map((m) => m[1]);
      const headers = (r.content.match(/^[ \t]*-\s*\[[ xX~]\][^\r\n]*?—\s*Status:/gm) || []).length;
      expect(ids.length, `seed=${seed}: one id per header (${headers} headers)`).toBe(headers);
      expect(new Set(ids).size, `seed=${seed}: ids must be unique — got ${ids.join(',')}`).toBe(ids.length);
      expect(/child observable \d+ \(no status\)[^\n]*id:/.test(r.content), `seed=${seed}: a child line must never receive an id`).toBe(false);
    }
  });

  it('INVARIANT status-preservation: the Status token of every header is byte-unchanged', () => {
    for (let seed = 0; seed < 40; seed++) {
      const doc = genDoc(seed);
      const before = (doc.match(/—\s*Status:\s*\w+/g) || []).sort();
      const after = (addTaskIdsAnyHeader(doc).content.match(/—\s*Status:\s*\w+/g) || []).sort();
      expect(after, `seed=${seed}: id-insertion must not alter any Status token`).toEqual(before);
    }
  });
});
