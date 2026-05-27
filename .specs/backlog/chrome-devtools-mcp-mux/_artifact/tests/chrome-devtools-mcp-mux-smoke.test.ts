import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appPath } from './helpers';
import { fakeMuxBinPath } from './chrome-devtools-mcp-mux-helpers';

describe('PLUGIN017: chrome-devtools-mcp-mux — smoke test (FR-8)', () => {
  // @feature8 — FR-8: handshake against fake stub on the host platform
  it('PLUGIN017_11: smoke-test.mjs completes initialize + tools/list against fake stub', () => {
    const smokeScript = appPath('extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/smoke-test.mjs');
    const fakeBin = fakeMuxBinPath();

    const result = spawnSync('node', [smokeScript], {
      encoding: 'utf-8',
      timeout: 15_000,
      env: {
        ...process.env,
        CDMM_SMOKE_BIN: 'node',
        CDMM_SMOKE_BIN_ARGS: fakeBin,
        CDMM_SMOKE_TIMEOUT_MS: '8000',
      },
    });

    expect(result.status, `stderr: ${result.stderr}`).toBe(0);

    // Last stdout line should be JSON ok-payload
    const lines = (result.stdout || '').trim().split(/\r?\n/);
    const last = lines[lines.length - 1];
    let payload: unknown;
    try {
      payload = JSON.parse(last);
    } catch {
      throw new Error(`smoke-test stdout not JSON: ${result.stdout}`);
    }
    expect(payload).toEqual(
      expect.objectContaining({
        ok: true,
        protocolVersion: '2024-11-05',
        matchedTools: expect.arrayContaining(['navigate_page']),
      }),
    );
  });

  // @feature8 — FR-8: graceful failure when binary doesn't exist (sanity)
  it('PLUGIN017_11b: smoke-test exits non-zero when fake binary path is bogus', () => {
    const smokeScript = appPath('extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/smoke-test.mjs');
    const result = spawnSync('node', [smokeScript], {
      encoding: 'utf-8',
      timeout: 8_000,
      env: {
        ...process.env,
        CDMM_SMOKE_BIN: 'node',
        CDMM_SMOKE_BIN_ARGS: path.join(appPath(), 'tests', 'fixtures', 'chrome-devtools-mcp-mux', '__nonexistent__.mjs'),
        CDMM_SMOKE_TIMEOUT_MS: '4000',
      },
    });
    expect(result.status).not.toBe(0);
  });
});
