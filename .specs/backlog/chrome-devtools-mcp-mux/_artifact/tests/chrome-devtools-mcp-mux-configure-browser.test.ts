import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appPath } from './helpers';
import { makeFixtureProjectDir, cleanupFixture } from './chrome-devtools-mcp-mux-helpers';

const HELPER = appPath(
  'extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/configure-browser.mjs',
);

interface HelperResult {
  status: number;
  stdout: string;
  stderr: string;
  parsed: any | null;
}

function runHelper(args: string[], fakeHome: string): HelperResult {
  const result = spawnSync('node', [HELPER, ...args], {
    encoding: 'utf-8',
    timeout: 10_000,
    env: {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
    },
  });
  let parsed: any = null;
  try {
    parsed = JSON.parse((result.stdout || '').trim());
  } catch {
    // not JSON
  }
  return {
    status: result.status ?? -1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    parsed,
  };
}

function writeMcpJson(projectDir: string, withEnv: boolean) {
  const data = {
    mcpServers: {
      'chrome-devtools-mcp-mux': {
        command: 'npx',
        args: ['-y', 'chrome-devtools-mcp-mux@0.2.2'],
        ...(withEnv
          ? {
              env: {
                CDMCP_MUX_CHROMIUM:
                  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
              },
            }
          : {}),
      },
    },
  };
  fs.writeFileSync(path.join(projectDir, '.mcp.json'), JSON.stringify(data, null, 2), 'utf-8');
}

describe('PLUGIN017: chrome-devtools-mcp-mux — configure-browser helper (FR-9)', () => {
  let projectDir: string;
  let fakeHome: string;

  beforeEach(() => {
    projectDir = makeFixtureProjectDir('cdmm-cb-');
    fakeHome = path.join(projectDir, '__fake_home__');
    fs.mkdirSync(fakeHome, { recursive: true });
  });

  afterEach(() => {
    cleanupFixture(projectDir);
  });

  // @feature9 — FR-9 / AC-9: bundled removes env key; marker created with dismissed=false
  it('PLUGIN017_12: configure-browser bundled deletes CDMCP_MUX_CHROMIUM and writes marker', () => {
    writeMcpJson(projectDir, true);

    const result = runHelper(['bundled', '--project', projectDir], fakeHome);
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed).not.toBeNull();
    expect(result.parsed.ok).toBe(true);
    expect(result.parsed.choice).toBe('bundled');
    expect(result.parsed.binary).toBeNull();
    expect(result.parsed.dismissed).toBe(false);

    // .mcp.json: env.CDMCP_MUX_CHROMIUM absent (env key entirely removed when empty)
    const mcp = JSON.parse(fs.readFileSync(path.join(projectDir, '.mcp.json'), 'utf-8'));
    const muxEntry = mcp.mcpServers['chrome-devtools-mcp-mux'];
    expect(muxEntry).toBeDefined();
    expect(muxEntry.env?.CDMCP_MUX_CHROMIUM).toBeUndefined();
    // command + args preserved
    expect(muxEntry.command).toBe('npx');
    expect(muxEntry.args).toEqual(['-y', 'chrome-devtools-mcp-mux@0.2.2']);

    // Marker file exists with expected shape
    const markerPath = path.join(fakeHome, '.dev-pomogator', '.cdmm-browser-choice.json');
    expect(fs.existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
    expect(marker.choice).toBe('bundled');
    expect(marker.dismissed).toBe(false);
    expect(marker.path).toBeUndefined(); // bundled has no binary path
    expect(marker.timestampISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  // @feature9 — FR-9 / AC-9: --dismiss writes dismissed=true marker
  it('PLUGIN017_13: configure-browser <choice> --dismiss writes dismissed=true', () => {
    writeMcpJson(projectDir, true);

    // Use 'edge' so auto-detect resolves on Windows; on non-Windows hosts we
    // use 'custom' with a synthetic path to avoid environment dependency.
    const args = process.platform === 'win32'
      ? ['edge', '--dismiss', '--project', projectDir]
      : ['custom', HELPER /* any existing file */, '--dismiss', '--project', projectDir];

    const result = runHelper(args, fakeHome);
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed.dismissed).toBe(true);

    const markerPath = path.join(fakeHome, '.dev-pomogator', '.cdmm-browser-choice.json');
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
    expect(marker.dismissed).toBe(true);
    expect(marker.path).toBeDefined();
  });

  // Edge case: missing mux entry → bail with exit non-zero
  it('PLUGIN017: helper bails when .mcp.json has no chrome-devtools-mcp-mux entry', () => {
    fs.writeFileSync(path.join(projectDir, '.mcp.json'), '{"mcpServers":{}}', 'utf-8');

    const result = runHelper(['bundled', '--project', projectDir], fakeHome);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('chrome-devtools-mcp-mux');
  });

  // Edge case: invalid choice
  it('PLUGIN017: helper rejects unknown choice', () => {
    writeMcpJson(projectDir, true);
    const result = runHelper(['firefox', '--project', projectDir], fakeHome);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('invalid choice');
  });

  // Edge case: custom without path
  it('PLUGIN017: helper rejects custom choice without explicit path', () => {
    writeMcpJson(projectDir, true);
    const result = runHelper(['custom', '--project', projectDir], fakeHome);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('explicit <path>');
  });

  // Edge case: bundled with extraneous path
  it('PLUGIN017: helper rejects bundled with path argument', () => {
    writeMcpJson(projectDir, true);
    const result = runHelper(['bundled', '/some/path', '--project', projectDir], fakeHome);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('must not have a path');
  });

  // Edge case: custom with non-existent path
  it('PLUGIN017: helper rejects custom path that does not exist', () => {
    writeMcpJson(projectDir, true);
    const result = runHelper(
      ['custom', path.join(projectDir, '__nope__.exe'), '--project', projectDir],
      fakeHome,
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not exist');
  });

  // Smart-merge: preserve other mcpServer keys
  it('PLUGIN017: helper preserves other mcpServers keys when changing browser', () => {
    const data = {
      mcpServers: {
        'chrome-devtools-mcp-mux': {
          command: 'npx',
          args: ['-y', 'chrome-devtools-mcp-mux@0.2.2'],
        },
        'user-server-foo': {
          command: 'echo',
          args: ['preserved'],
        },
      },
    };
    fs.writeFileSync(path.join(projectDir, '.mcp.json'), JSON.stringify(data), 'utf-8');

    const result = runHelper(['bundled', '--project', projectDir], fakeHome);
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);

    const after = JSON.parse(fs.readFileSync(path.join(projectDir, '.mcp.json'), 'utf-8'));
    expect(Object.keys(after.mcpServers).sort()).toEqual([
      'chrome-devtools-mcp-mux',
      'user-server-foo',
    ]);
    expect(after.mcpServers['user-server-foo']).toEqual({ command: 'echo', args: ['preserved'] });
  });
});
