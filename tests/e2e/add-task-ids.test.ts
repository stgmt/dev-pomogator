/**
 * Unit: the P21-6 rework helper that makes a loose TASKS.md trackable by the
 * SpecGraph task parser (scripts/add-task-ids.ts). The parser requires both
 * `Status:` AND an explicit `— id:`; this inserts `— id: t<nn>` on `Tnn:`
 * headers that lack it — CRLF-safe, status-preserving, child-safe, idempotent.
 */
import { describe, it, expect } from 'vitest';
import { addTaskIds } from '../../scripts/add-task-ids.ts';

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
