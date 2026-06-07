/**
 * form-guards-dispatch — the live carrier of the five v3 form-guards
 * (creation-pipeline review 2026-06-07: the guards existed + were tested but
 * were registered NOWHERE — dead enforcement). Real subprocess + stdin, no
 * mocks: the dispatcher must route a `.specs/<slug>/<TARGET>.md` Write to the
 * one matching guard and propagate its verdict verbatim.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DISPATCH = path.resolve(__dirname, '..', 'form-guards-dispatch.ts');

let root: string;

function run(filePath: string, content: string) {
  const stdin = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: filePath, content } });
  const r = spawnSync(process.execPath, ['--import', 'tsx', DISPATCH], {
    encoding: 'utf-8',
    input: stdin,
    timeout: 60_000,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fgd-'));
  const spec = path.join(root, '.specs', 'probe');
  fs.mkdirSync(spec, { recursive: true });
  // v3+ spec → guards enforce (isV3Spec gate).
  fs.writeFileSync(path.join(spec, '.progress.json'), JSON.stringify({ version: 3, featureSlug: 'probe' }));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('form-guards-dispatch routes Writes to the canonical v3 guards', () => {
  it('routes a violating TASKS.md to task-form-guard → deny exit 2, verdict propagated', () => {
    const r = run(path.join(root, '.specs', 'probe', 'TASKS.md'), '## Phase 0: x\n\n- [ ] bad task\n');
    expect(r.status, r.stderr).toBe(2);
    const out = JSON.parse(r.stdout.slice(0, r.stdout.indexOf('}}') + 2));
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('task-form-guard');
  });

  it('lets a guard-clean TASKS.md through (allow exit 0)', () => {
    const ok = '## Phase 0: x\n\n- [x] good — Status: DONE | Est: 30m\n  **Done When:**\n  - [ ] check\n';
    const r = run(path.join(root, '.specs', 'probe', 'TASKS.md'), ok);
    expect(r.status, r.stderr).toBe(0);
  });

  it('routes a violating USER_STORIES.md to user-story-form-guard → deny', () => {
    const r = run(
      path.join(root, '.specs', 'probe', 'USER_STORIES.md'),
      '### User Story 1: no priority no why\n\nSome text.\n',
    );
    expect(r.status, r.stderr).toBe(2);
    expect(r.stdout).toContain('user-story-form-guard');
  });

  it('ignores non-spec paths and non-target basenames (fast exit 0, no spawn)', () => {
    const outside = run(path.join(root, 'src', 'TASKS.md'), 'x'); // not under .specs/
    expect(outside.status).toBe(0);
    expect(outside.stdout).toBe('');
    const nonTarget = run(path.join(root, '.specs', 'probe', 'NOTES.md'), 'x');
    expect(nonTarget.status).toBe(0);
    expect(nonTarget.stdout).toBe('');
  });
});
