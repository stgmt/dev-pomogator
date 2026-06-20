/**
 * @feature7 step-definitions for the launch-marksman.cjs shim resolution policy
 * (SPECGEN004_324 – SPECGEN004_331).
 *
 * The shim is CJS (spawned by Claude Code as the LSP `command`), so it is
 * loaded via createRequire rather than a native ESM import.  All scenarios are
 * in-process — the shim exports pure, dependency-injectable functions; no
 * CLI spawn is needed.
 *
 * Resolution priority (FR-7, mirrored from resolve-binary.ts):
 *   env override → PATH marksman → managed download → null
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { V4World } from '../hooks/before-after.ts';

// ─── load the CJS shim ────────────────────────────────────────────────────────

const _require = createRequire(import.meta.url);
const SHIM_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../tools/marksman-installer/launch-marksman.cjs',
);
const shim = _require(SHIM_PATH) as {
  whichOnPath: (
    cmd: string,
    env: NodeJS.ProcessEnv,
    platform: NodeJS.Platform,
    existsFn: (p: string) => boolean,
  ) => string | null;
  managedBinaryPath: (repoRoot: string, platform: NodeJS.Platform) => string;
  resolveMarksmanBinary: (opts: {
    repoRoot: string;
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    whichFn?: (c: string) => string | null;
    existsFn?: (p: string) => boolean;
  }) => { source: string; binaryPath: string } | null;
  repoRootFromEnv: (env: NodeJS.ProcessEnv) => string;
};

// ─── World ────────────────────────────────────────────────────────────────────

interface ShimWorld extends V4World {
  _shimResult?: { source: string; binaryPath: string } | null;
  _managedPath?: string;
  _whichResult?: string | null;
  _repoRootResult?: string;
}

// ─── SPECGEN004_324  env override beats PATH and managed ─────────────────────

Given(
  /^the launch-marksman shim is called with DEV_POMOGATOR_MARKSMAN_BIN set to `\/custom\/marksman`$/,
  function (this: ShimWorld) {
    this._shimResult = shim.resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      env: { DEV_POMOGATOR_MARKSMAN_BIN: '/custom/marksman' },
      whichFn: () => '/usr/bin/marksman', // PATH would match — env must still win
      existsFn: () => true,
    });
  },
);

Then(
  /^resolveMarksmanBinary returns source `env` and binaryPath `\/custom\/marksman`$/,
  function (this: ShimWorld) {
    assert.deepStrictEqual(this._shimResult, {
      source: 'env',
      binaryPath: '/custom/marksman',
    });
  },
);

// ─── SPECGEN004_325  PATH beats managed when no env override ─────────────────

Given(
  /^the launch-marksman shim is called with no env override and marksman found on PATH at `\/usr\/bin\/marksman`$/,
  function (this: ShimWorld) {
    this._shimResult = shim.resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      env: {}, // no DEV_POMOGATOR_MARKSMAN_BIN
      whichFn: () => '/usr/bin/marksman',
      existsFn: () => true, // managed would also exist — PATH must still win
    });
  },
);

Then(
  /^resolveMarksmanBinary returns source `path` and binaryPath `\/usr\/bin\/marksman`$/,
  function (this: ShimWorld) {
    assert.deepStrictEqual(this._shimResult, {
      source: 'path',
      binaryPath: '/usr/bin/marksman',
    });
  },
);

// ─── SPECGEN004_326  managed download beats null when PATH absent ─────────────

Given(
  /^the launch-marksman shim is called with no env override and marksman absent from PATH but present at the managed path$/,
  function (this: ShimWorld) {
    const managed = shim.managedBinaryPath('/repo', 'linux');
    this._managedPath = managed;
    this._shimResult = shim.resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      env: {},
      whichFn: () => null, // nothing on PATH
      existsFn: (p) => p === managed,
    });
  },
);

Then(
  /^resolveMarksmanBinary returns source `managed` and the managed binary path for linux$/,
  function (this: ShimWorld) {
    assert.deepStrictEqual(this._shimResult, {
      source: 'managed',
      binaryPath: this._managedPath,
    });
  },
);

// ─── SPECGEN004_327  null when nothing available (FR-7a no-fallback exit) ─────

Given(
  /^the launch-marksman shim is called with no env override, marksman absent from PATH, and no managed binary on disk$/,
  function (this: ShimWorld) {
    this._shimResult = shim.resolveMarksmanBinary({
      repoRoot: '/repo',
      platform: 'linux',
      env: {},
      whichFn: () => null,
      existsFn: () => false,
    });
  },
);

Then(
  /^resolveMarksmanBinary returns null$/,
  function (this: ShimWorld) {
    assert.strictEqual(this._shimResult, null);
  },
);

// ─── SPECGEN004_328  Windows managed path carries .exe ───────────────────────

When(
  /^managedBinaryPath is called with repoRoot `D:\\repo` and platform `win32`$/,
  function (this: ShimWorld) {
    this._managedPath = shim.managedBinaryPath('D:\\repo', 'win32');
  },
);

Then(
  /^the result is the win32 path `D:\\repo\\\.dev-pomogator\\bin\\marksman\.exe`$/,
  function (this: ShimWorld) {
    const expected = path.win32.join('D:\\repo', '.dev-pomogator', 'bin', 'marksman.exe');
    assert.strictEqual(this._managedPath, expected);
  },
);

// ─── SPECGEN004_329  POSIX managed path has no extension ─────────────────────

When(
  /^managedBinaryPath is called with repoRoot `\/repo` and platform `linux`$/,
  function (this: ShimWorld) {
    this._managedPath = shim.managedBinaryPath('/repo', 'linux');
  },
);

Then(
  /^the result is the POSIX path `\/repo\/\.dev-pomogator\/bin\/marksman`$/,
  function (this: ShimWorld) {
    assert.strictEqual(this._managedPath, '/repo/.dev-pomogator/bin/marksman');
  },
);

// ─── SPECGEN004_330  whichOnPath honours Windows .exe extension ──────────────

When(
  /^whichOnPath is called for `marksman` on `win32` with PATH `C:\\tools` where `marksman\.exe` exists$/,
  function (this: ShimWorld) {
    const found = path.win32.join('C:\\tools', 'marksman.exe');
    this._whichResult = shim.whichOnPath(
      'marksman',
      { PATH: 'C:\\tools' },
      'win32',
      (p) => p === found,
    );
  },
);

Then(
  /^whichOnPath returns `C:\\tools\\marksman\.exe`$/,
  function (this: ShimWorld) {
    const expected = path.win32.join('C:\\tools', 'marksman.exe');
    assert.strictEqual(this._whichResult, expected);
  },
);

// ─── SPECGEN004_331  repoRootFromEnv prefers CLAUDE_PROJECT_DIR ──────────────

When(
  /^repoRootFromEnv is called with both CLAUDE_PROJECT_DIR `\/proj` and DEV_POMOGATOR_REPO_ROOT `\/x`$/,
  function (this: ShimWorld) {
    this._repoRootResult = shim.repoRootFromEnv({
      CLAUDE_PROJECT_DIR: '/proj',
      DEV_POMOGATOR_REPO_ROOT: '/x',
    });
  },
);

Then(
  /^repoRootFromEnv returns `\/proj`$/,
  function (this: ShimWorld) {
    assert.strictEqual(this._repoRootResult, '/proj');
  },
);

When(
  /^repoRootFromEnv is called with only DEV_POMOGATOR_REPO_ROOT `\/x`$/,
  function (this: ShimWorld) {
    this._repoRootResult = shim.repoRootFromEnv({ DEV_POMOGATOR_REPO_ROOT: '/x' });
  },
);

Then(
  /^repoRootFromEnv returns `\/x`$/,
  function (this: ShimWorld) {
    assert.strictEqual(this._repoRootResult, '/x');
  },
);
