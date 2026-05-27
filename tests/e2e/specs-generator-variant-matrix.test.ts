import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  detectPolymorphicFRs,
} from '../../tools/specs-generator/variant-matrix/trigger-phrases.ts';
import {
  parseDecisionTable,
  parseExamplesTable,
  parseVariantTasks,
} from '../../tools/specs-generator/variant-matrix/parsers.ts';
import { checkVariantCoverage } from '../../tools/specs-generator/variant-matrix/audit.ts';
import { appendEscapeLog } from '../../tools/specs-generator/variant-matrix/escape-log.ts';

const FIXTURES_ROOT = path.join(
  __dirname,
  '..',
  'fixtures',
  'specs-generator',
  'variant-matrix',
);

function readFR(fixture: string): string {
  return fs.readFileSync(path.join(FIXTURES_ROOT, fixture, 'FR.md'), 'utf-8');
}

function readAC(fixture: string): string {
  return fs.readFileSync(
    path.join(FIXTURES_ROOT, fixture, 'ACCEPTANCE_CRITERIA.md'),
    'utf-8',
  );
}

function readFeature(fixture: string): string {
  const dir = path.join(FIXTURES_ROOT, fixture);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.feature'));
  return fs.readFileSync(path.join(dir, files[0]), 'utf-8');
}

describe('SVM_DETECT: Polymorphic trigger detection', () => {
  it('SVM_DETECT_01: EN polymorphic trigger flags FR', () => {
    const content = readFR('polymorphic-fr-no-matrix');
    const result = detectPolymorphicFRs(content);
    expect(result).toHaveLength(1);
    expect(result[0].frId).toBe('FR-1');
    expect(result[0].hardOut).toBe(false);
    expect(result[0].triggers.length).toBeGreaterThanOrEqual(2);
  });

  it('SVM_DETECT_02: RU polymorphic trigger flags FR', () => {
    const content = readFR('polymorphic-fr-ru-mixed');
    const result = detectPolymorphicFRs(content);
    expect(result).toHaveLength(1);
    expect(result[0].hardOut).toBe(false);
    const ruMatched = result[0].triggers.some((t) =>
      /для каждого|переиспользуем|общая/i.test(t.phrase),
    );
    expect(ruMatched).toBe(true);
  });

  it('SVM_DETECT_03: Hard-OUT signal skips polymorphic FR (H1 regression)', () => {
    const content = readFR('polymorphic-fr-hard-out');
    const result = detectPolymorphicFRs(content);
    expect(result.every((r) => r.hardOut === true)).toBe(true);
  });

  it('SVM_DETECT_04: Escape hatch is detected in FR text', () => {
    const content = readFR('escape-hatch-short-reason');
    expect(content).toMatch(/\[skip-variant-matrix:\s*[^\]]+\]/);
  });
});

describe('SVM_PARSERS: parseDecisionTable / parseExamplesTable / parseVariantTasks', () => {
  it('SVM_PARSERS_01: parseDecisionTable extracts rows from valid AC', () => {
    const content = readAC('polymorphic-fr-complete');
    const rows = parseDecisionTable(content, 'FR-1');
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows[0].variant).toBe('inbound');
  });

  it('SVM_PARSERS_02: parseDecisionTable returns empty for AC без table', () => {
    const content = readAC('polymorphic-fr-no-matrix');
    const rows = parseDecisionTable(content, 'FR-1');
    expect(rows).toEqual([]);
  });

  it('SVM_PARSERS_03: parseDecisionTable identifies excluded rows', () => {
    const content = readAC('polymorphic-fr-complete');
    const rows = parseDecisionTable(content, 'FR-1');
    const excluded = rows.find((r) => r.coverage === 'excluded');
    expect(excluded).toBeDefined();
    expect(excluded!.outOfScopeReason).toMatch(/server-generated/);
  });

  it('SVM_PARSERS_04: parseExamplesTable extracts rows from Scenario Outline', () => {
    const content = readFeature('polymorphic-fr-complete');
    const rows = parseExamplesTable(content, '@feature1');
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it('SVM_PARSERS_05: parseExamplesTable returns empty when feature has no Scenario Outline', () => {
    const content = `Feature: NoOutline\n\n  Scenario: just one\n    Given x\n    When y\n    Then z\n`;
    const rows = parseExamplesTable(content, '@feature1');
    expect(rows).toEqual([]);
  });

  it('SVM_PARSERS_06: parseVariantTasks extracts tasks с tracer line', () => {
    const tasks = `## Phase 1\n\n- [ ] T1 -- @feature1 — Status: TODO | Est: 30m\n  _Variant: doctype=IN_\n- [ ] T2 -- @feature1 — Status: TODO | Est: 30m\n  _Variant: doctype=OUT_\n`;
    const result = parseVariantTasks(tasks, '@feature1');
    expect(result.length).toBe(2);
    expect(result[0].axis).toBe('doctype');
    expect(result[0].value).toBe('IN');
  });
});

describe('SVM_AUDIT: checkVariantCoverage integration', () => {
  it('SVM_AUDIT_01: complete spec → MATRIX_COMPLETE INFO (positive signal, no WARNINGs)', () => {
    const findings = checkVariantCoverage(
      path.join(FIXTURES_ROOT, 'polymorphic-fr-complete'),
    );
    expect(findings.filter((f) => f.severity === 'WARNING')).toEqual([]);
    const complete = findings.find((f) => f.code === 'MATRIX_COMPLETE');
    expect(complete).toBeDefined();
    expect(complete!.severity).toBe('INFO');
  });

  it('SVM_AUDIT_02: no-matrix spec → AC_DECISION_TABLE_MISSING', () => {
    const findings = checkVariantCoverage(
      path.join(FIXTURES_ROOT, 'polymorphic-fr-no-matrix'),
    );
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].category).toBe('VARIANT_COVERAGE');
    expect(findings[0].code).toBe('AC_DECISION_TABLE_MISSING');
    expect(findings[0].severity).toBe('WARNING');
  });

  it('SVM_AUDIT_03: hard-out spec → zero findings (H1 critical)', () => {
    const findings = checkVariantCoverage(
      path.join(FIXTURES_ROOT, 'polymorphic-fr-hard-out'),
    );
    expect(findings.filter((f) => f.severity === 'WARNING')).toEqual([]);
  });

  it('SVM_AUDIT_04: short escape reason → INFO finding', () => {
    const findings = checkVariantCoverage(
      path.join(FIXTURES_ROOT, 'escape-hatch-short-reason'),
    );
    const short = findings.find((f) => f.code === 'WARNING_REASON_TOO_SHORT');
    expect(short).toBeDefined();
    expect(short!.severity).toBe('INFO');
  });

  it('SVM_AUDIT_05: RU mixed FR → flagged as polymorphic', () => {
    const findings = checkVariantCoverage(
      path.join(FIXTURES_ROOT, 'polymorphic-fr-ru-mixed'),
    );
    const acFinding = findings.find(
      (f) => f.code === 'AC_DECISION_TABLE_MISSING',
    );
    expect(acFinding).toBeDefined();
  });
});

describe('SVM_ESCAPE_LOG: appendEscapeLog atomicity', () => {
  it('SVM_ESCAPE_01: single append creates JSONL file with one row', async () => {
    const tmpDir = fs.mkdtempSync(path.join(__dirname, '..', '..', '.tmp-svm-'));
    try {
      await appendEscapeLog(tmpDir, {
        ts: '2026-04-29T00:00:00Z',
        spec: 'spec-x',
        fr: 'FR-1',
        reason: 'covered by parametrized helper at runner.ts',
        session_id: 'abc',
      });
      const logPath = path.join(
        tmpDir,
        '.claude',
        'logs',
        'spec-variant-matrix-escapes.jsonl',
      );
      expect(fs.existsSync(logPath)).toBe(true);
      const lines = fs
        .readFileSync(logPath, 'utf-8')
        .split('\n')
        .filter(Boolean);
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]);
      expect(parsed.spec).toBe('spec-x');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('SVM_ESCAPE_02: dual append produces 2 rows (idempotent O_APPEND)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(__dirname, '..', '..', '.tmp-svm-'));
    try {
      const entry = {
        ts: '2026-04-29T00:00:00Z',
        spec: 'spec-x',
        fr: 'FR-1',
        reason: 'covered by parametrized helper at runner.ts',
        session_id: 'abc',
      };
      await appendEscapeLog(tmpDir, entry);
      await appendEscapeLog(tmpDir, { ...entry, fr: 'FR-2' });
      const logPath = path.join(
        tmpDir,
        '.claude',
        'logs',
        'spec-variant-matrix-escapes.jsonl',
      );
      const lines = fs
        .readFileSync(logPath, 'utf-8')
        .split('\n')
        .filter(Boolean);
      expect(lines).toHaveLength(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
