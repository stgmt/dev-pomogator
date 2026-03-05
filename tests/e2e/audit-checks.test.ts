import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  checkPartialImpl,
  checkTaskAtomicity,
  checkFrSplitConsistency,
  checkBddScenarioScope,
  runAllChecks,
} from '../../extensions/specs-workflow/tools/specs-validator/audit-checks';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeSpecFile(name: string, content: string): void {
  fs.writeFileSync(path.join(tmpDir, name), content, 'utf-8');
}

describe('checkPartialImpl', () => {
  it('detects task [x] with FR marker "НЕ РЕАЛИЗОВАНО"', () => {
    writeSpecFile('FR.md', '## FR-5: Something\n\n**НЕ РЕАЛИЗОВАНО**\n');
    writeSpecFile('TASKS.md', '- [x] implement FR-5 stuff\n');
    const findings = checkPartialImpl(tmpDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('ERROR');
    expect(findings[0].check).toBe('PARTIAL_IMPL_DETECTION');
    expect(findings[0].message).toContain('FR-5');
  });

  it('allows task [ ] with FR marker (known gap)', () => {
    writeSpecFile('FR.md', '## FR-5: Something\n\n**НЕ РЕАЛИЗОВАНО**\n');
    writeSpecFile('TASKS.md', '- [ ] implement FR-5 stuff\n');
    const findings = checkPartialImpl(tmpDir);
    expect(findings).toHaveLength(0);
  });

  it('allows task [x] without FR marker', () => {
    writeSpecFile('FR.md', '## FR-5: Something\n\nFully implemented.\n');
    writeSpecFile('TASKS.md', '- [x] implement FR-5 stuff\n');
    const findings = checkPartialImpl(tmpDir);
    expect(findings).toHaveLength(0);
  });

  it('detects English marker "NOT IMPLEMENTED"', () => {
    writeSpecFile('FR.md', '## FR-3: Thing\n\nNOT IMPLEMENTED yet\n');
    writeSpecFile('TASKS.md', '- [x] do FR-3\n');
    const findings = checkPartialImpl(tmpDir);
    expect(findings).toHaveLength(1);
  });

  it('returns empty when FR.md missing', () => {
    writeSpecFile('TASKS.md', '- [x] do FR-3\n');
    expect(checkPartialImpl(tmpDir)).toHaveLength(0);
  });
});

describe('checkTaskAtomicity', () => {
  it('warns when task covers multiple FRs', () => {
    writeSpecFile('TASKS.md', '- [x] implement FR-4 and FR-5 together\n');
    const findings = checkTaskAtomicity(tmpDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('WARNING');
    expect(findings[0].message).toContain('FR-4');
    expect(findings[0].message).toContain('FR-5');
  });

  it('allows task with single FR', () => {
    writeSpecFile('TASKS.md', '- [x] implement FR-4 only\n');
    expect(checkTaskAtomicity(tmpDir)).toHaveLength(0);
  });

  it('allows task without FR references', () => {
    writeSpecFile('TASKS.md', '- [x] setup environment\n');
    expect(checkTaskAtomicity(tmpDir)).toHaveLength(0);
  });

  it('handles sub-variants as distinct FRs', () => {
    writeSpecFile('TASKS.md', '- [x] implement FR-4 and FR-4a\n');
    const findings = checkTaskAtomicity(tmpDir);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('FR-4a');
  });
});

describe('checkFrSplitConsistency', () => {
  it('flags when adjacent FR lacks sub-variants', () => {
    writeSpecFile('FR.md', [
      '## FR-4: Batch\n\nBatch impl\n',
      '## FR-4a: Serial\n\nSerial impl\n',
      '## FR-5: Another\n\nNo split\n',
    ].join('\n'));
    const findings = checkFrSplitConsistency(tmpDir);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].severity).toBe('INFO');
    expect(findings[0].message).toContain('FR-5');
  });

  it('no findings when no sub-variants exist', () => {
    writeSpecFile('FR.md', '## FR-1: One\n\n## FR-2: Two\n');
    expect(checkFrSplitConsistency(tmpDir)).toHaveLength(0);
  });

  it('no findings when both adjacent FRs have sub-variants', () => {
    writeSpecFile('FR.md', [
      '## FR-4: Base\n',
      '## FR-4a: Variant\n',
      '## FR-5: Base\n',
      '## FR-5a: Variant\n',
    ].join('\n'));
    expect(checkFrSplitConsistency(tmpDir)).toHaveLength(0);
  });
});

describe('checkBddScenarioScope', () => {
  it('warns when FR mentions serial but scenario only has batch', () => {
    writeSpecFile('FR.md', '## FR-5: Adjustment @feature5\n\nHandles batch and serial items\n');
    writeSpecFile('test.feature', [
      'Feature: Test',
      '',
      '# @feature5',
      'Scenario: Batch adjustment',
      '  Given a batch item',
      '  When adjusted',
      '  Then batch storages updated',
    ].join('\n'));
    const findings = checkBddScenarioScope(tmpDir);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].message).toContain('serial');
  });

  it('no findings when scenario covers all FR terms', () => {
    writeSpecFile('FR.md', '## FR-5: Adjustment @feature5\n\nHandles batch items\n');
    writeSpecFile('test.feature', [
      'Feature: Test',
      '',
      '# @feature5',
      'Scenario: Batch adjustment',
      '  Given a batch item',
      '  When adjusted',
      '  Then batch storages updated',
    ].join('\n'));
    expect(checkBddScenarioScope(tmpDir)).toHaveLength(0);
  });

  it('returns empty when no .feature file', () => {
    writeSpecFile('FR.md', '## FR-5: Something @feature5\n\nBatch and serial\n');
    expect(checkBddScenarioScope(tmpDir)).toHaveLength(0);
  });
});

describe('runAllChecks', () => {
  it('runs all checks and returns combined findings', () => {
    writeSpecFile('FR.md', '## FR-5: Thing\n\n**НЕ РЕАЛИЗОВАНО**\n');
    writeSpecFile('TASKS.md', '- [x] do FR-5 and FR-6\n');
    const findings = runAllChecks(tmpDir);
    // PARTIAL_IMPL for FR-5 + TASK_ATOMICITY for FR-5+FR-6
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty for clean spec', () => {
    writeSpecFile('FR.md', '## FR-1: Clean\n\nImplemented.\n');
    writeSpecFile('TASKS.md', '- [x] do FR-1\n');
    expect(runAllChecks(tmpDir)).toHaveLength(0);
  });
});
