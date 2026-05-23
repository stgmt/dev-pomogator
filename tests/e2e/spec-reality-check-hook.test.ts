import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { extractSpecRefs } from '../../.claude/skills/spec-reality-check/scripts/verify-hook';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const HOOK_TS = path.join(REPO_ROOT, '.claude', 'skills', 'spec-reality-check', 'scripts', 'verify-hook.ts');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'spec-reality-check');

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-reality-check-hook-test-'));
});

afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

function copyFixtureToTmp(name: string): string {
  const dest = path.join(tmpRoot, '.specs', name);
  fs.copySync(path.join(FIXTURES, name), dest);
  return dest;
}

function runHookWithStdin(input: object, cwd?: string): { code: number; stdout: string; stderr: string } {
  const result = spawnSync('npx', ['tsx', HOOK_TS], {
    cwd: cwd || tmpRoot,
    encoding: 'utf-8',
    input: JSON.stringify(input),
    windowsHide: true,
  });
  return { code: result.status ?? -1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

describe('SRCHOOK001 — verify-hook.ts integration', () => {
  it('SRCHOOK001_01: denies ExitPlanMode when plan references spec with ERROR drift', () => {
    copyFixtureToTmp('missing-edit');
    const input = {
      hook_event_name: 'PreToolUse',
      tool_name: 'ExitPlanMode',
      cwd: tmpRoot,
      tool_input: {
        plan: 'I will implement features in .specs/missing-edit/ and modify code.',
      },
    };
    const result = runHookWithStdin(input);
    expect(result.code).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('FC_EDIT_MISSING');
  });

  it('SRCHOOK001_02: permits ExitPlanMode when no spec refs in plan', () => {
    const input = {
      hook_event_name: 'PreToolUse',
      tool_name: 'ExitPlanMode',
      cwd: tmpRoot,
      tool_input: {
        plan: 'Generic plan without any spec references.',
      },
    };
    const result = runHookWithStdin(input);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });

  it('SRCHOOK001_03: fail-open — invalid stdin permits ExitPlanMode', () => {
    const result = spawnSync('npx', ['tsx', HOOK_TS], {
      cwd: tmpRoot,
      encoding: 'utf-8',
      input: '!!! not json !!!',
      windowsHide: true,
    });
    expect(result.status).toBe(0);
    expect((result.stdout || '').trim()).toBe('');
  });
});

describe('SRCHOOK002 — extractSpecRefs invariants', () => {
  it('SRCHOOK002_01: uniqueness — duplicate refs collapse', () => {
    const text = 'foo .specs/a/ bar .specs/a/ baz .specs/b/';
    const refs = extractSpecRefs(text);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.length).toBe(2);
  });

  it('SRCHOOK002_02: cardinality — empty text returns empty array', () => {
    expect(extractSpecRefs('')).toEqual([]);
  });

  it('SRCHOOK002_03: backlog/ subpath is captured (does not duplicate as separate ref)', () => {
    const refs = extractSpecRefs('see .specs/backlog/archived-spec/ for details');
    expect(refs.length).toBe(1);
    expect(refs[0]).toContain('archived-spec');
  });

  it('SRCHOOK002_04: filters out file paths (.md / .json / .feature)', () => {
    const text = '.specs/foo/FR.md and .specs/bar.json and .specs/baz/';
    const refs = extractSpecRefs(text);
    expect(refs.some((r) => r.endsWith('FR.md'))).toBe(false);
    expect(refs.some((r) => r.endsWith('.json'))).toBe(false);
    expect(refs.some((r) => r.includes('baz'))).toBe(true);
  });
});
