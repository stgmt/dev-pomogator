import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { killAllChildren } from '../fixtures/pomogator-doctor/child-registry.ts';
import { buildTempHome } from '../fixtures/pomogator-doctor/temp-home-builder.ts';

const HOOK_PATH = path.resolve(
  process.cwd(),
  'extensions/pomogator-doctor/tools/pomogator-doctor/doctor-hook.ts',
);

const NODE_MAJOR = parseInt(process.versions.node.split('.')[0], 10);
const useStripTypes = NODE_MAJOR >= 22;

function runHook(home: { homeDir: string; projectDir: string }): {
  stdout: string;
  stderr: string;
  status: number | null;
} {
  const [cmd, args] = useStripTypes
    ? [process.execPath, ['--experimental-strip-types', HOOK_PATH]]
    : [process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), HOOK_PATH]];
  const result = spawnSync(cmd, args, {
    encoding: 'utf-8',
    timeout: 12_000,
    cwd: home.projectDir,
    env: {
      ...process.env,
      HOME: home.homeDir,
      USERPROFILE: home.homeDir,
    },
    input: JSON.stringify({ sessionId: 'test', reason: 'startup' }),
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

describe('POMOGATORDOCTOR001 — Entry points (FR-15..FR-17)', () => {
  afterEach(async () => {
    await killAllChildren();
  });

  afterAll(async () => {
    await killAllChildren();
  });

  it('POMOGATORDOCTOR001_04: SessionStart hook emits valid JSON with continue=true', async () => {
    const home = buildTempHome();
    try {
      const result = runHook(home);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout.trim()) as {
        continue: boolean;
        suppressOutput?: boolean;
      };
      expect(payload.continue).toBe(true);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_15: Hook error never blocks SessionStart (corrupt config → silent continue)', async () => {
    const home = buildTempHome({ corruptConfig: true });
    try {
      const result = runHook(home);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout.trim()) as {
        continue: boolean;
        suppressOutput?: boolean;
        additionalContext?: string;
      };
      expect(payload.continue).toBe(true);
      expect(typeof payload === 'object').toBe(true);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_05: Hook is silent (no ~/.dev-pomogator/config.json → suppressOutput)', async () => {
    const homeDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'doctor-empty-home-'));
    const projectDir = fs.mkdtempSync(path.join(process.env.TEMP ?? '/tmp', 'doctor-empty-proj-'));
    try {
      const [cmd, args] = useStripTypes
        ? [process.execPath, ['--experimental-strip-types', HOOK_PATH]]
        : [process.execPath, [path.resolve('node_modules/tsx/dist/cli.mjs'), HOOK_PATH]];
      const result = spawnSync(cmd, args, {
        encoding: 'utf-8',
        timeout: 12_000,
        cwd: projectDir,
        env: {
          ...process.env,
          HOME: homeDir,
          USERPROFILE: homeDir,
        },
        input: '{}',
      });
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout.trim()) as {
        continue: boolean;
        suppressOutput?: boolean;
      };
      expect(payload.continue).toBe(true);
      expect(payload.suppressOutput).toBe(true);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
