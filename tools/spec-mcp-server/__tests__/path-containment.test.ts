// FR-83c "single target repository root" — realpath-based containment for MCP
// handlers. Regression guard for the migrated helper (formerly
// tools/codex-plugin-support/path-containment.ts): a symlinked escape or a
// sibling path with a shared string prefix must be REJECTED, not trusted.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkDeclaredWorktree, isPathWithin, redactedRootIdentity } from '../path-containment.ts';

describe('isPathWithin — single target repo root containment (FR-83c)', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `pc-root-${randomUUID()}`);
    fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('accepts the root and missing descendants', () => {
    expect(isPathWithin(root, root)).toBe(true);
    expect(isPathWithin(root, path.join(root, 'missing-direct-child'))).toBe(true);
    expect(isPathWithin(root, path.join(root, 'sub', 'file.md'))).toBe(true);
  });

  it('rejects a sibling with a shared string prefix (prefix is not containment)', () => {
    const sibling = `${root}-sibling`;
    fs.mkdirSync(sibling, { recursive: true });
    try {
      expect(isPathWithin(root, sibling)).toBe(false);
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('rejects a parent directory', () => {
    expect(isPathWithin(root, path.dirname(root))).toBe(false);
  });

  it('rejects a missing absolute path outside the root', () => {
    expect(isPathWithin(root, path.join(os.tmpdir(), `pc-unrelated-${randomUUID()}`))).toBe(false);
  });

  it('rejects a symlink escape (realpath is followed, not the lexical path)', () => {
    const outside = path.join(os.tmpdir(), `pc-out-${randomUUID()}`);
    fs.mkdirSync(outside, { recursive: true });
    const link = path.join(root, 'escape');
    try {
      if (process.platform === 'win32') {
        fs.symlinkSync(outside, link, 'junction');
      } else {
        fs.symlinkSync(outside, link, 'dir');
      }
      expect(isPathWithin(root, path.join(link, 'x.md'))).toBe(false);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
      fs.rmSync(link, { recursive: true, force: true });
    }
  });
});

describe('worktree identity admission (FR-86d)', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-identity-'));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('allows only the known legacy CLAUDE_PROJECT_DIR literal; other template declarations fail closed', () => {
    expect(checkDeclaredWorktree(root, '${CLAUDE_PROJECT_DIR}')).toMatchObject({ ok: true, declared: null });
    expect(checkDeclaredWorktree(root, '${OTHER_WORKTREE}')).toMatchObject({ ok: false });
  });

  it('preserves POSIX case distinctions while retaining Windows case-insensitive identity', () => {
    const sameLettersDifferentCase = root.toUpperCase();
    const rootId = redactedRootIdentity(root).id;
    const alternateId = redactedRootIdentity(sameLettersDifferentCase).id;

    if (process.platform === 'win32') {
      expect(alternateId).toBe(rootId);
    } else {
      expect(alternateId).not.toBe(rootId);
    }
  });
});
