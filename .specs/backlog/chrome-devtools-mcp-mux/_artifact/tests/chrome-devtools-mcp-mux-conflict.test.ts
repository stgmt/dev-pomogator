import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectClaudeInChrome,
  formatConflictWarning,
  isNonInteractiveContext,
} from '../../src/installer/mcp-conflicts.ts';
import {
  copyFixtureMcpJson,
  makeFixtureProjectDir,
  cleanupFixture,
} from './chrome-devtools-mcp-mux-helpers';

describe('PLUGIN017: chrome-devtools-mcp-mux — conflict detector (FR-5)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeFixtureProjectDir('conflict-');
  });

  afterEach(() => {
    cleanupFixture(tmpDir);
  });

  // @feature5 — FR-5: detect via .mcp.json
  it('PLUGIN017_07a: detects claude-in-chrome in target .mcp.json', async () => {
    copyFixtureMcpJson('claude-in-chrome-mcp-json', tmpDir);
    const result = await detectClaudeInChrome(tmpDir);
    expect(result.detected).toBe(true);
    expect(result.source === 'mcp.json' || result.source === 'both').toBe(true);
    expect(result.evidence.some((e) => e.includes('.mcp.json') && e.includes('claude-in-chrome'))).toBe(true);
  });

  // @feature5 — FR-5: no detection when neither source has the entry
  it('PLUGIN017_07b: returns detected=false on clean fixture', async () => {
    const result = await detectClaudeInChrome(tmpDir);
    expect(result.detected).toBe(false);
    expect(result.source).toBeNull();
    expect(result.evidence).toEqual([]);
  });

  // @feature5 — FR-5: warning text contains canonical phrases
  it('PLUGIN017_07c: formatConflictWarning contains "mutually exclusive" and "Chrome 136"', () => {
    const text = formatConflictWarning({
      detected: true,
      source: 'mcp.json',
      evidence: ['fake-evidence'],
    });
    expect(text).toContain('mutually exclusive');
    expect(text).toContain('Chrome 136');
    expect(text).toContain('fake-evidence');
    // Three options listed
    expect(text).toContain('(a) skip');
    expect(text).toContain('(b) revert other');
    expect(text).toContain('(c) separate');
  });

  // @feature5 — FR-5: non-interactive context detection
  it('PLUGIN017_07d: isNonInteractiveContext respects CI env', () => {
    const original = process.env.CI;
    process.env.CI = 'true';
    try {
      expect(isNonInteractiveContext()).toBe(true);
    } finally {
      if (original === undefined) delete process.env.CI;
      else process.env.CI = original;
    }
  });
});
