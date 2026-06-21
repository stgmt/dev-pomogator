/**
 * Step definitions for `fix-bg-output-loss` (FBOL001) — migrated from
 * tests/e2e/docker-test-tee.test.ts. Drives the REAL `scripts/docker-test.sh`
 * tee-persistence behaviour using the committed mock-docker fixture (PATH override
 * → no real Docker daemon). Per-scenario isolation via the V4World Before hook's
 * fresh `tempDir`. REGEX step patterns scoped to FBOL001 vocabulary.
 *
 * Runs in Docker/Linux (the canonical env): there `_docker-wsl.sh` is a no-op so
 * `docker-test.sh` executes locally and the mock `docker` on PATH answers its
 * `docker compose` calls. (On a Windows host `_docker-wsl.sh` would re-exec into
 * WSL — which is exactly why the whole e2e suite is Docker-gated.)
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = process.cwd();
const appPath = (...s: string[]): string => path.join(REPO_ROOT, ...s);

interface FbolWorld extends V4World {
  fbolMockBin?: string;
  fbolRun?: SpawnSyncReturns<string>;
  content?: string;
}

/** Copy docker-test.sh + its WSL helper + the mock docker + a stub compose file into
 *  the scenario's tempDir, mirroring the published layout. */
function stageScript(this: FbolWorld): void {
  const mockBinDir = path.join(this.tempDir, 'mock-bin');
  fs.mkdirSync(mockBinDir, { recursive: true });
  const mockDocker = path.join(mockBinDir, 'docker');
  fs.writeFileSync(mockDocker, fs.readFileSync(appPath('tests/fixtures/docker-test-tee/mock-docker.sh'), 'utf-8'));
  fs.chmodSync(mockDocker, 0o755);
  this.fbolMockBin = mockBinDir;

  fs.mkdirSync(path.join(this.tempDir, 'scripts'), { recursive: true });
  for (const rel of ['scripts/docker-test.sh', 'scripts/_docker-wsl.sh']) {
    fs.copyFileSync(appPath(rel), path.join(this.tempDir, rel));
  }
  fs.chmodSync(path.join(this.tempDir, 'scripts/docker-test.sh'), 0o755);
  fs.copyFileSync(
    appPath('tests/fixtures/docker-test-tee/stub-compose.yml'),
    path.join(this.tempDir, 'docker-compose.test.yml'),
  );
}

function runScript(this: FbolWorld, extraEnv: Record<string, string> = {}): SpawnSyncReturns<string> {
  return spawnSync('bash', ['scripts/docker-test.sh', 'echo', 'stub-args'], {
    cwd: this.tempDir,
    env: {
      ...process.env,
      PATH: `${this.fbolMockBin}${path.delimiter}${process.env.PATH || ''}`,
      SKIP_BUILD: '1',
      // Run docker-test.sh in-place (no WSL re-exec): _docker-wsl.sh treats a set
      // DEV_POMOGATOR_WSL_SHIM as "already inside WSL/Linux" → no-op. In the canonical
      // Docker/Linux run this is moot (uname=Linux is already a no-op); on a Windows host
      // it keeps the mock `docker` (on PATH) in play instead of bouncing into WSL.
      DEV_POMOGATOR_WSL_SHIM: '1',
      TEST_STATUSLINE_SESSION: 'fbol-test-session',
      ...extraEnv,
    },
    encoding: 'utf-8',
    timeout: 20000,
  });
}

function logDir(this: FbolWorld): string {
  return path.join(this.tempDir, '.dev-pomogator', '.docker-status');
}
function listLogFiles(this: FbolWorld): string[] {
  const dir = logDir.call(this);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^test-run-\d+\.log$/.test(f)) : [];
}
function readLogFile(this: FbolWorld): string {
  const logs = listLogFiles.call(this);
  assert.ok(logs.length > 0, 'no persistent test-run-<epoch>.log file found');
  return fs.readFileSync(path.join(logDir.call(this), logs[0]), 'utf-8');
}

// ── Background ───────────────────────────────────────────────────────────────
Given(/^dev-pomogator source code is available$/, function (this: FbolWorld) {
  assert.ok(fs.existsSync(REPO_ROOT), 'repo root must exist');
});
Given(/^scripts\/docker-test\.sh exists$/, function (this: FbolWorld) {
  assert.ok(fs.existsSync(appPath('scripts/docker-test.sh')), 'scripts/docker-test.sh must exist');
});

// ── FBOL001_01 ───────────────────────────────────────────────────────────────
Given(/^directory "\.dev-pomogator\/\.docker-status\/" does not exist yet$/, function (this: FbolWorld) {
  stageScript.call(this);
  assert.ok(!fs.existsSync(logDir.call(this)), 'log dir must not exist before the run');
});
When(/^scripts\/docker-test\.sh is invoked with a stub docker compose command$/, function (this: FbolWorld) {
  this.fbolRun = runScript.call(this);
});
Then(/^file "\.dev-pomogator\/\.docker-status\/test-run-<epoch>\.log" exists on disk$/, function (this: FbolWorld) {
  assert.equal(this.fbolRun!.status, 0, `script must exit 0; stderr: ${this.fbolRun!.stderr}`);
  assert.ok(listLogFiles.call(this).length > 0, 'a test-run-<epoch>.log must exist');
});
Then(/^the log file contains stdout produced by the stub command$/, function (this: FbolWorld) {
  assert.match(readLogFile.call(this), /stub-docker-stdout-line-1/, 'log must capture the stub stdout');
});

// ── FBOL001_02 ───────────────────────────────────────────────────────────────
Given(/^scripts\/docker-test\.sh is patched with tee into persistent log$/, function (this: FbolWorld) {
  stageScript.call(this); // the shipped docker-test.sh already tees — no patch needed
});
When(/^the script is run with a stub command that prints "hello\\nworld"$/, function (this: FbolWorld) {
  this.fbolRun = runScript.call(this);
});
Then(/^captured parent stdout contains "hello" and "world"$/, function (this: FbolWorld) {
  const combined = (this.fbolRun!.stdout || '') + (this.fbolRun!.stderr || '');
  assert.match(combined, /stub-docker-stdout-line-1/, 'parent stdout must contain the stub stdout');
  assert.match(combined, /stub-docker-stderr-line-2/, 'parent stream must contain the stub stderr');
});
Then(/^the persistent log file also contains "hello" and "world"$/, function (this: FbolWorld) {
  const log = readLogFile.call(this);
  assert.match(log, /stub-docker-stdout-line-1/, 'log must contain stub stdout');
  assert.match(log, /stub-docker-stderr-line-2/, 'log must contain stub stderr');
});

// ── FBOL001_03 ───────────────────────────────────────────────────────────────
Given(/^directory "\.dev-pomogator\/\.docker-status\/" has been deleted beforehand$/, function (this: FbolWorld) {
  stageScript.call(this);
  fs.rmSync(logDir.call(this), { recursive: true, force: true });
});
When(/^scripts\/docker-test\.sh starts execution$/, function (this: FbolWorld) {
  this.fbolRun = runScript.call(this);
});
Then(/^the directory is created before the first log write$/, function (this: FbolWorld) {
  assert.equal(this.fbolRun!.status, 0, `first run must exit 0; stderr: ${this.fbolRun!.stderr}`);
  assert.ok(fs.existsSync(logDir.call(this)), 'log dir must be created');
});
Then(/^re-running the script does not fail when the directory already exists$/, function (this: FbolWorld) {
  const r2 = runScript.call(this);
  assert.equal(r2.status, 0, `re-run must exit 0 (idempotent mkdir -p); stderr: ${r2.stderr}`);
});

// ── FBOL001_04 ───────────────────────────────────────────────────────────────
Given(/^scripts\/docker-test\.sh uses set -o pipefail and tee in pipeline$/, function (this: FbolWorld) {
  stageScript.call(this);
});
When(/^the stub command exits with code 3$/, function (this: FbolWorld) {
  this.fbolRun = runScript.call(this, { DOCKER_MOCK_EXIT_CODE: '3' });
});
Then(/^bash scripts\/docker-test\.sh exits with code 3$/, function (this: FbolWorld) {
  assert.equal(this.fbolRun!.status, 3, `pipefail must preserve exit 3, got ${this.fbolRun!.status}`);
});
Then(/^the persistent log file contains output produced before failure$/, function (this: FbolWorld) {
  assert.match(readLogFile.call(this), /stub-docker-stdout-line-1/, 'log must capture output before the non-zero exit');
});

// ── FBOL001_05 (artifact: rule content) ──────────────────────────────────────
Given(/^file "\.claude\/rules\/pomogator\/no-blocking-on-tests\.md" exists$/, function (this: FbolWorld) {
  assert.ok(fs.existsSync(appPath('.claude/rules/pomogator/no-blocking-on-tests.md')), 'rule file must exist');
});
When(/^the rule file is read$/, function (this: FbolWorld) {
  this.content = fs.readFileSync(appPath('.claude/rules/pomogator/no-blocking-on-tests.md'), 'utf-8');
});
Then(/^the content contains a section titled "Anti-pattern" with the pattern "\| tail" at run_in_background mode$/, function (this: FbolWorld) {
  const c = (this.content || '').toLowerCase();
  assert.match(c, /anti-pattern/, 'rule must document an anti-pattern section');
  assert.match(this.content || '', /\| tail/, 'rule must name the `| tail` anti-pattern');
  assert.match(c, /run_in_background/, 'rule must mention run_in_background');
});
Then(/^the content contains a safe replacement example using "tee"$/, function (this: FbolWorld) {
  assert.match(this.content || '', /tee/, 'rule must show a tee-based safe replacement');
});

// ── FBOL001_06 (artifact: gitignore) ─────────────────────────────────────────
Given(/^"\.gitignore" already contains "\.dev-pomogator\/" entry$/, function (this: FbolWorld) {
  const gi = fs.readFileSync(appPath('.gitignore'), 'utf-8');
  assert.match(gi, /^\.dev-pomogator\/?$/m, '.gitignore must ignore .dev-pomogator/');
});
When(/^a new log file is created at "\.dev-pomogator\/\.docker-status\/test-run-1745000000\.log"$/, function () {
  // No-op: the assertion below checks the gitignore rule that would cover such a path.
});
Then(/^git status does not report the new log file as untracked$/, function (this: FbolWorld) {
  const gi = fs.readFileSync(appPath('.gitignore'), 'utf-8');
  assert.match(gi, /^\.dev-pomogator\/?$/m, '.dev-pomogator/ must be gitignored so its logs are never untracked');
});
