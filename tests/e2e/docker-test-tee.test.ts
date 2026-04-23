import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { appPath } from './helpers.ts';

// FBOL001 — Fix Background Output Loss
// Integration tests for scripts/docker-test.sh tee persistence + rule update.
// Uses mock-docker.sh via PATH override to avoid real Docker daemon dependency.
// See tests/fixtures/docker-test-tee/README.md for fixture details.

let tmpDir: string;
let mockBinDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbol-'));

  mockBinDir = path.join(tmpDir, 'mock-bin');
  fs.ensureDirSync(mockBinDir);

  const mockDockerSrc = fs.readFileSync(
    appPath('tests/fixtures/docker-test-tee/mock-docker.sh'),
    'utf-8',
  );
  const mockDockerDst = path.join(mockBinDir, 'docker');
  fs.writeFileSync(mockDockerDst, mockDockerSrc);
  fs.chmodSync(mockDockerDst, 0o755);

  fs.ensureDirSync(path.join(tmpDir, 'scripts'));
  fs.copyFileSync(
    appPath('scripts/docker-test.sh'),
    path.join(tmpDir, 'scripts/docker-test.sh'),
  );
  fs.chmodSync(path.join(tmpDir, 'scripts/docker-test.sh'), 0o755);

  fs.copyFileSync(
    appPath('tests/fixtures/docker-test-tee/stub-compose.yml'),
    path.join(tmpDir, 'docker-compose.test.yml'),
  );
});

afterEach(() => {
  fs.removeSync(tmpDir);
});

function runScript(extraEnv: Record<string, string> = {}): SpawnSyncReturns<string> {
  return spawnSync('bash', ['scripts/docker-test.sh', 'echo', 'stub-args'], {
    cwd: tmpDir,
    env: {
      ...process.env,
      PATH: `${mockBinDir}${path.delimiter}${process.env.PATH || ''}`,
      SKIP_BUILD: '1',
      TEST_STATUSLINE_SESSION: 'fbol-test-session',
      ...extraEnv,
    },
    encoding: 'utf-8',
    timeout: 15000,
  });
}

function listLogFiles(): string[] {
  const logDir = path.join(tmpDir, '.dev-pomogator', '.docker-status');
  if (!fs.existsSync(logDir)) return [];
  return fs.readdirSync(logDir).filter((f) => /^test-run-\d+\.log$/.test(f));
}

function readLogFile(): string {
  const logs = listLogFiles();
  if (logs.length === 0) throw new Error('no log file found');
  const logDir = path.join(tmpDir, '.dev-pomogator', '.docker-status');
  return fs.readFileSync(path.join(logDir, logs[0]), 'utf-8');
}

describe('FBOL001: Fix Background Output Loss', () => {
  // @feature1
  it('FBOL001_01: docker-test.sh creates persistent log file at known path', () => {
    const result = runScript();
    expect(result.status).toBe(0);

    const logDir = path.join(tmpDir, '.dev-pomogator', '.docker-status');
    expect(fs.existsSync(logDir)).toBe(true);

    const logs = listLogFiles();
    expect(logs.length).toBeGreaterThan(0);
    expect(readLogFile()).toContain('stub-docker-stdout-line-1');
  });

  // @feature1
  it('FBOL001_02: output appears in both parent stdout and persistent log', () => {
    const result = runScript();
    const combined = (result.stdout || '') + (result.stderr || '');
    expect(combined).toContain('stub-docker-stdout-line-1');
    expect(combined).toContain('stub-docker-stderr-line-2');

    const logContent = readLogFile();
    expect(logContent).toContain('stub-docker-stdout-line-1');
    expect(logContent).toContain('stub-docker-stderr-line-2');
  });

  // @feature1
  it('FBOL001_03: mkdir -p creates missing log directory idempotently', () => {
    const logDir = path.join(tmpDir, '.dev-pomogator', '.docker-status');
    expect(fs.existsSync(logDir)).toBe(false);

    const r1 = runScript();
    expect(r1.status).toBe(0);
    expect(fs.existsSync(logDir)).toBe(true);

    const r2 = runScript();
    expect(r2.status).toBe(0);
  });

  // @feature1
  it('FBOL001_04: exit code is preserved when stub command exits non-zero', () => {
    const result = runScript({ DOCKER_MOCK_EXIT_CODE: '3' });
    expect(result.status).toBe(3);
    expect(readLogFile()).toContain('stub-docker-stdout-line-1');
  });

  // @feature2
  it('FBOL001_05: no-blocking-on-tests rule documents anti-pattern and safe replacement', () => {
    const rulePath = appPath('.claude/rules/pomogator/no-blocking-on-tests.md');
    const content = fs.readFileSync(rulePath, 'utf-8');
    expect(content.toLowerCase()).toContain('anti-pattern');
    expect(content).toContain('| tail');
    expect(content.toLowerCase()).toContain('run_in_background');
    expect(content).toContain('tee');
  });

  // @feature3
  it('FBOL001_06: persistent log files are ignored by git', () => {
    const gitignore = fs.readFileSync(appPath('.gitignore'), 'utf-8');
    expect(gitignore).toMatch(/^\.dev-pomogator\/?$/m);
  });
});
