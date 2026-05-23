import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import {
  runChecks,
  parseFileChangesTable,
  extractInlineCodePaths,
  extractFrIds,
  extractTaskPaths,
} from '../../.claude/skills/spec-reality-check/scripts/verify';
import type { AuditFinding } from '../../.claude/skills/spec-reality-check/scripts/verify';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'spec-reality-check');
const VERIFY_TS = path.join(REPO_ROOT, '.claude', 'skills', 'spec-reality-check', 'scripts', 'verify.ts');

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-reality-check-test-'));
});

afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

function copyFixture(name: string): { specDir: string; repoRoot: string } {
  const repoRoot = tmpRoot;
  const specDir = path.join(repoRoot, '.specs', name);
  fs.copySync(path.join(FIXTURES, name), specDir);
  return { specDir, repoRoot };
}

function bySeverity(findings: AuditFinding[]) {
  return {
    ERROR: findings.filter((f) => f.severity === 'ERROR'),
    WARNING: findings.filter((f) => f.severity === 'WARNING'),
    INFO: findings.filter((f) => f.severity === 'INFO'),
  };
}

describe('SRC001 — verify.ts checks', () => {
  it('SRC001_01: FC_CREATE_EXISTS — action=create on existing file emits ERROR', () => {
    const { specDir, repoRoot } = copyFixture('stale-create');
    fs.writeFileSync(path.join(repoRoot, 'EXISTING_FILE.txt'), 'pre-existing');
    const { findings } = runChecks(specDir, repoRoot);
    const sev = bySeverity(findings);
    const createExists = sev.ERROR.filter((f) => f.check === 'FC_CREATE_EXISTS');
    expect(createExists.length).toBe(1);
    expect(createExists[0].file).toBe('EXISTING_FILE.txt');
  });

  it('SRC001_02: FC_EDIT_MISSING — action=edit on missing file emits ERROR', () => {
    const { specDir, repoRoot } = copyFixture('missing-edit');
    const { findings } = runChecks(specDir, repoRoot);
    const editMissing = findings.filter((f) => f.check === 'FC_EDIT_MISSING');
    expect(editMissing.length).toBe(1);
    expect(editMissing[0].severity).toBe('ERROR');
    expect(editMissing[0].file).toBe('nonexistent/file_that_should_not_exist.ts');
  });

  it('SRC001_03: FC_DELETE_MISSING — action=delete on missing file emits ERROR', () => {
    const { specDir, repoRoot } = copyFixture('missing-edit');
    const { findings } = runChecks(specDir, repoRoot);
    const deleteMissing = findings.filter((f) => f.check === 'FC_DELETE_MISSING');
    expect(deleteMissing.length).toBe(1);
    expect(deleteMissing[0].severity).toBe('ERROR');
    expect(deleteMissing[0].file).toBe('another/missing.ts');
  });

  it('SRC001_04: NARRATIVE_PATH_MISSING — inline backtick path on missing file emits WARNING', () => {
    const { specDir, repoRoot } = copyFixture('narrative-drift');
    const { findings } = runChecks(specDir, repoRoot);
    const narrative = findings.filter((f) => f.check === 'NARRATIVE_PATH_MISSING');
    expect(narrative.length).toBeGreaterThanOrEqual(1);
    expect(narrative.every((f) => f.severity === 'WARNING')).toBe(true);
  });

  it('SRC001_05: CODE_DRIFT_FR_ALREADY_DONE — emits WARNING when git log finds FR-N commits', () => {
    const { specDir, repoRoot } = copyFixture('code-drift');
    execSync('git init -q', { cwd: repoRoot });
    execSync('git config user.email test@test.com', { cwd: repoRoot });
    execSync('git config user.name "Test"', { cwd: repoRoot });
    const featureFile = path.join(repoRoot, 'src', 'feature.ts');
    fs.ensureDirSync(path.dirname(featureFile));
    fs.writeFileSync(featureFile, '// FR-1 implementation marker\nexport const foo = 1;');
    execSync('git add -A', { cwd: repoRoot });
    execSync('git commit -q -m "FR-1: implement feature"', { cwd: repoRoot });
    const { findings } = runChecks(specDir, repoRoot);
    const codeDrift = findings.filter((f) => f.check === 'CODE_DRIFT_FR_ALREADY_DONE');
    expect(codeDrift.length).toBeGreaterThanOrEqual(1);
    expect(codeDrift[0].severity).toBe('WARNING');
  });

  it('SRC001_05b: CODE_DRIFT_SKIPPED — emits INFO when .git missing', () => {
    const { specDir, repoRoot } = copyFixture('code-drift');
    const { findings } = runChecks(specDir, repoRoot);
    const skipped = findings.filter((f) => f.check === 'CODE_DRIFT_SKIPPED');
    expect(skipped.length).toBe(1);
    expect(skipped[0].severity).toBe('INFO');
    const codeDrift = findings.filter((f) => f.check === 'CODE_DRIFT_FR_ALREADY_DONE');
    expect(codeDrift.length).toBe(0);
  });

  it('SRC001_06: TASKS_FC_CONSISTENCY — orphan TASK file emits WARNING', () => {
    const { specDir, repoRoot } = copyFixture('task-orphan');
    const { findings } = runChecks(specDir, repoRoot);
    const consistency = findings.filter((f) => f.check === 'TASKS_FC_CONSISTENCY');
    const orphanTask = consistency.find(
      (f) => f.severity === 'WARNING' && f.message.includes('src/orphan_not_in_fc.ts'),
    );
    expect(orphanTask).toBeDefined();
  });

  it('SRC001_07: clean shipped spec emits 0 ERRORs', () => {
    const cleanSpec = path.join(REPO_ROOT, '.specs', 'spec-workflow-md-validation');
    if (!fs.existsSync(cleanSpec)) {
      return;
    }
    const { findings } = runChecks(cleanSpec, REPO_ROOT);
    const sev = bySeverity(findings);
    expect(sev.ERROR.length).toBe(0);
  });

  it('SRC001_08: --format json outputs valid JSON via spawn', () => {
    const { specDir, repoRoot } = copyFixture('missing-edit');
    const result = spawnSync('npx', ['tsx', VERIFY_TS, specDir, '--format', 'json'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      windowsHide: true,
    });
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toHaveProperty('findings');
    expect(parsed).toHaveProperty('summary');
    expect(Array.isArray(parsed.findings)).toBe(true);
  });

  it('SRC001_09: --format human outputs ANSI / readable text via spawn', () => {
    const { specDir, repoRoot } = copyFixture('missing-edit');
    const result = spawnSync('npx', ['tsx', VERIFY_TS, specDir, '--format', 'human'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      windowsHide: true,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Reality check:');
    expect(result.stdout).toContain('FC_EDIT_MISSING');
  });

  it('SRC001_10: --format markdown outputs valid markdown table via spawn', () => {
    const { specDir, repoRoot } = copyFixture('missing-edit');
    const result = spawnSync('npx', ['tsx', VERIFY_TS, specDir, '--format', 'markdown'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      windowsHide: true,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('| Check | Severity | File | Message');
    expect(result.stdout).toContain('| FC_EDIT_MISSING |');
  });
});

describe('SRC002 — collection invariants', () => {
  it('SRC002_01: runChecks output severity counts equal sum of finding[].severity (conservation)', () => {
    const { specDir, repoRoot } = copyFixture('missing-edit');
    const { findings, summary } = runChecks(specDir, repoRoot);
    const counted = {
      ERROR: findings.filter((f) => f.severity === 'ERROR').length,
      WARNING: findings.filter((f) => f.severity === 'WARNING').length,
      INFO: findings.filter((f) => f.severity === 'INFO').length,
    };
    expect(summary.by_severity).toEqual(counted);
    expect(summary.total).toBe(findings.length);
  });

  it('SRC002_02: parseFileChangesTable cardinality — N table rows produce ≤N rows + INFO findings for skipped', () => {
    const md = `# File Changes

| Path | Action | Reason |
|------|--------|--------|
| \`a.ts\` | edit | r1 |
| \`b.ts\` | create | r2 |
| \`c.ts\` | delete | r3 |
`;
    const { rows, findings } = parseFileChangesTable(md);
    expect(rows.length).toBe(3);
    expect(rows.length + findings.length).toBeLessThanOrEqual(3 + 1); // at most rows + optional empty-info
    const paths = rows.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length); // uniqueness
  });

  it('SRC002_03: extractInlineCodePaths uniqueness within line is not enforced but extension filter conserves', () => {
    const md = `Paths: \`src/a.ts\`, \`src/b.ts\`, \`README.md\`, \`weird.xyz123\` and \`https://example.com\``;
    const paths = extractInlineCodePaths(md);
    const values = paths.map((p) => p.value);
    expect(values).toContain('src/a.ts');
    expect(values).toContain('src/b.ts');
    expect(values).toContain('README.md');
    expect(values).not.toContain('weird.xyz123');
    expect(values.every((v) => !v.includes('://'))).toBe(true);
  });

  it('SRC002_04: extractFrIds uniqueness — duplicates collapse', () => {
    const md = 'FR-1, FR-2, FR-1, FR-10, FR-1';
    const ids = extractFrIds(md);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['FR-1', 'FR-10', 'FR-2']);
  });

  it('SRC002_05: extractTaskPaths skips OUT_OF_SCOPE and strikethrough markers', () => {
    const md = `- task A
  - **files:** \`a.ts\`
- task B [OUT_OF_SCOPE: future]
  - **files:** \`b.ts\`
- task C
  - **files:** ~~\`c.ts\`~~`;
    const paths = extractTaskPaths(md);
    expect(paths).toContain('a.ts');
    expect(paths).not.toContain('b.ts');
    expect(paths).not.toContain('c.ts');
  });

  it('SRC002_06: runChecks idempotent — second call returns same severity counts', () => {
    const { specDir, repoRoot } = copyFixture('missing-edit');
    const r1 = runChecks(specDir, repoRoot);
    const r2 = runChecks(specDir, repoRoot);
    expect(r1.summary.by_severity).toEqual(r2.summary.by_severity);
    expect(r1.summary.total).toBe(r2.summary.total);
  });
});
