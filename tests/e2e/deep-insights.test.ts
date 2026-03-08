import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

const ROOT_DIR = path.join(__dirname, '..', '..');
const SCRIPT_PATH = path.join(
  ROOT_DIR,
  '.claude',
  'skills',
  'deep-insights',
  'scripts',
  'aggregate-facets.sh'
);

let tempHome: string;
let facetsDir: string;

function runScript(env?: Record<string, string>): { exitCode: number; stdout: string } {
  try {
    const stdout = execSync(`bash "${SCRIPT_PATH}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { exitCode: 0, stdout };
  } catch (error: any) {
    return {
      exitCode: error.status || 1,
      stdout: error.stdout?.toString() || '',
    };
  }
}

function writeFacet(filename: string, data: Record<string, any>): void {
  fs.writeFileSync(path.join(facetsDir, filename), JSON.stringify(data, null, 2));
}

function makeSampleFacet(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    session_id: `test-${Date.now()}`,
    outcome: 'fully_achieved',
    session_type: 'single_task',
    friction_counts: { wrong_approach: 1 },
    friction_detail: 'some string not array',
    goal_categories: { feature_implementation: 1 },
    claude_helpfulness: 'very_helpful',
    primary_success: 'multi_file_changes',
    user_satisfaction_counts: { happy: 1, satisfied: 0, frustrated: 0 },
    brief_summary: 'User implemented a feature and ran tests successfully.',
    underlying_goal: 'Implement feature X with tests',
    ...overrides,
  };
}

function makeObserverFacet(overrides: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    session_id: `test-observer-${Date.now()}`,
    outcome: 'partially_achieved',
    session_type: 'exploration',
    friction_counts: {},
    friction_detail: '',
    goal_categories: { warmup_minimal: 1 },
    claude_helpfulness: 'slightly_helpful',
    primary_success: 'none',
    user_satisfaction_counts: { likely_satisfied: 1 },
    brief_summary: 'Memory observer agent watched the primary session reading files.',
    underlying_goal: 'Observe and record the primary Claude session progress',
    ...overrides,
  };
}

describe('PLUGIN008: Deep Insights Aggregation Script', () => {
  beforeAll(() => {
    tempHome = path.join(os.tmpdir(), `deep-insights-test-${Date.now()}`);
    facetsDir = path.join(tempHome, '.claude', 'usage-data', 'facets');
  });

  beforeEach(async () => {
    await fs.remove(tempHome);
  });

  afterAll(async () => {
    await fs.remove(tempHome);
  });

  // @feature1
  it('should have LF line endings (no CRLF)', async () => {
    const content = await fs.readFile(SCRIPT_PATH, 'utf-8');
    expect(content).not.toContain('\r\n');
    expect(content).toContain('\n');
  });

  // @feature2
  it('should be executable', async () => {
    const stat = await fs.stat(SCRIPT_PATH);
    const isExecutable = (stat.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  // @feature3
  it('should return missing status when facets directory does not exist', () => {
    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout);
    expect(json.status).toBe('missing');
    expect(json.facets_count).toBe(0);
  });

  // @feature4
  it('should return missing status when facets directory is empty', async () => {
    await fs.ensureDir(facetsDir);
    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);
    const json = JSON.parse(stdout);
    expect(json.status).toBe('missing');
    expect(json.facets_count).toBe(0);
  });

  // @feature5
  it('should aggregate valid facets data', async () => {
    await fs.ensureDir(facetsDir);
    writeFacet('session-1.json', makeSampleFacet({
      session_id: 'aaa-session-1',
      outcome: 'fully_achieved',
    }));
    writeFacet('session-2.json', makeSampleFacet({
      session_id: 'bbb-session-2',
      outcome: 'partially_achieved',
      friction_counts: { buggy_code: 2 },
    }));
    writeFacet('session-3.json', makeSampleFacet({
      session_id: 'ccc-session-3',
      outcome: 'mostly_achieved',
    }));

    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    expect(json.status).toBe('ok');
    expect(json.facets_count).toBe(3);
    expect(Array.isArray(json.outcomes)).toBe(true);
    expect(json.outcomes.length).toBeGreaterThan(0);
    expect(Array.isArray(json.friction_summary)).toBe(true);
    expect(Array.isArray(json.helpfulness)).toBe(true);
    expect(typeof json.success_rate).toBe('number');
    expect(json.success_rate).toBeGreaterThanOrEqual(0);
    expect(json.success_rate).toBeLessThanOrEqual(100);
  });

  // @feature6
  it('should handle string friction_detail gracefully', async () => {
    await fs.ensureDir(facetsDir);
    writeFacet('string-friction.json', makeSampleFacet({
      friction_detail: 'this is a string not an array',
    }));

    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    expect(json.status).toBe('ok');
    expect(json.facets_count).toBe(1);
  });

  // @feature7
  it('should handle object goal_categories gracefully', async () => {
    await fs.ensureDir(facetsDir);
    writeFacet('object-goals.json', makeSampleFacet({
      goal_categories: { feature_implementation: 1, bug_fix: 2 },
    }));

    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    expect(json.status).toBe('ok');
    expect(Array.isArray(json.goal_categories)).toBe(true);
    expect(json.goal_categories.length).toBeGreaterThan(0);
  });

  // @feature8
  it('should handle string claude_helpfulness gracefully', async () => {
    await fs.ensureDir(facetsDir);
    writeFacet('string-helpfulness.json', makeSampleFacet({
      claude_helpfulness: 'slightly_helpful',
    }));

    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    expect(json.status).toBe('ok');
    expect(Array.isArray(json.helpfulness)).toBe(true);
    expect(json.helpfulness[0]).toHaveProperty('level');
    expect(json.helpfulness[0]).toHaveProperty('count');
  });

  // @feature5 — additional: success_rate calculation
  it('should calculate correct success_rate', async () => {
    await fs.ensureDir(facetsDir);
    writeFacet('s1.json', makeSampleFacet({ outcome: 'fully_achieved' }));
    writeFacet('s2.json', makeSampleFacet({ outcome: 'mostly_achieved' }));
    writeFacet('s3.json', makeSampleFacet({ outcome: 'partially_achieved' }));
    writeFacet('s4.json', makeSampleFacet({ outcome: 'not_achieved' }));

    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    // 2 out of 4 = 50%
    expect(json.success_rate).toBe(50);
  });

  // @feature5 — additional: date_range
  it('should extract date range from session_ids', async () => {
    await fs.ensureDir(facetsDir);
    writeFacet('s1.json', makeSampleFacet({ session_id: 'aaa-first' }));
    writeFacet('s2.json', makeSampleFacet({ session_id: 'zzz-last' }));

    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    expect(json.date_range.earliest).toBe('aaa-first');
    expect(json.date_range.latest).toBe('zzz-last');
  });

  // @feature9
  it('should exclude observer sessions from main metrics by text marker', async () => {
    await fs.ensureDir(facetsDir);
    writeFacet('work-1.json', makeSampleFacet({
      session_id: 'work-1',
      outcome: 'fully_achieved',
    }));
    writeFacet('work-2.json', makeSampleFacet({
      session_id: 'work-2',
      outcome: 'partially_achieved',
    }));
    writeFacet('observer-1.json', makeObserverFacet({
      session_id: 'observer-1',
    }));

    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    expect(json.total_facets_count).toBe(3);
    expect(json.facets_count).toBe(2);
    expect(json.observer_count).toBe(1);
    // success_rate based on work sessions only (1 fully / 2 work = 50%)
    expect(json.success_rate).toBe(50);
    expect(json.observer_summary.count).toBe(1);
  });

  // @feature10
  it('should detect observer by goal_categories marker', async () => {
    await fs.ensureDir(facetsDir);
    writeFacet('work-1.json', makeSampleFacet({ session_id: 'work-1' }));
    writeFacet('goal-observer.json', makeObserverFacet({
      session_id: 'goal-observer',
      brief_summary: 'Regular session doing work.',
      underlying_goal: 'Do regular work',
      goal_categories: { memory_observation_creation: 1 },
    }));

    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    expect(json.facets_count).toBe(1);
    expect(json.observer_count).toBe(1);
  });

  // @feature11
  it('should NOT filter warmup_minimal sessions without observer markers', async () => {
    await fs.ensureDir(facetsDir);
    writeFacet('warmup-real.json', makeSampleFacet({
      session_id: 'warmup-real',
      outcome: 'fully_achieved',
      goal_categories: { warmup_minimal: 1 },
      brief_summary: 'User checked Docker test results.',
      underlying_goal: 'Check test results from previous session',
    }));
    writeFacet('work-1.json', makeSampleFacet({ session_id: 'work-1' }));

    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    // warmup_minimal without observer text should be counted as work
    expect(json.facets_count).toBe(2);
    expect(json.observer_count).toBe(0);
    expect(json.success_rate).toBe(100);
  });

  // @feature5 — additional: friction aggregation
  it('should aggregate friction counts across sessions', async () => {
    await fs.ensureDir(facetsDir);
    writeFacet('s1.json', makeSampleFacet({
      friction_counts: { wrong_approach: 2, buggy_code: 1 },
    }));
    writeFacet('s2.json', makeSampleFacet({
      friction_counts: { wrong_approach: 3 },
    }));

    const { exitCode, stdout } = runScript({ HOME: tempHome });
    expect(exitCode).toBe(0);

    const json = JSON.parse(stdout);
    const wrongApproach = json.friction_summary.find((f: any) => f.type === 'wrong_approach');
    expect(wrongApproach).toBeDefined();
    expect(wrongApproach.total).toBe(5);
    expect(wrongApproach.sessions).toBe(2);
  });
});
