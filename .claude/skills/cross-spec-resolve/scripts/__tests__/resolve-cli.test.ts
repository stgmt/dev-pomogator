/**
 * Tests for the cross-spec-resolve CLI precondition (SPECGEN004_47).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolveCli } from '../resolve-cli.ts';

describe('resolveCli', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `rcli-${randomUUID()}`);
    fs.mkdirSync(path.join(root, '.specs', 'auth'), { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('exits non-zero with the actionable hint when the report is missing (SPECGEN004_47)', () => {
    const r = resolveCli('auth', root);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/Run \/cross-spec-reconcile first/);
  });

  it('exits 0 and reports the plan size when a report exists', () => {
    fs.writeFileSync(
      path.join(root, '.specs', 'auth', 'consistency-report.yaml'),
      'findings: []\n',
    );
    const r = resolveCli('auth', root);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/finding\(s\) to resolve/);
  });

  it('exits 2 on a usage error (no slug)', () => {
    expect(resolveCli(undefined, root).exitCode).toBe(2);
  });
});
