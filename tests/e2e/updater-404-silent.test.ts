/**
 * CORE006_05 — 404 manifest fetch is silent.
 *
 * `check-update.js` (SessionStart hook) iterates `installedExtensions[]` and
 * fetches each extension manifest from `raw.githubusercontent.com`. For local
 * or dev-only extensions whose manifest was never pushed upstream, the fetch
 * returns 404 — but the old code would `console.log("⚠ HTTP 404 ...")`,
 * leaking warnings into SessionStart hook output on every session start.
 *
 * Fix (`src/updater/github.ts:fetchWithRetry`): 404 → silent return null.
 * Other status codes (5xx, 403, etc.) still log because they signal real
 * upstream problems.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../..');

describe('CORE006: Updater Reliability', () => {
  // @feature5
  describe('Scenario: CORE006_05 404 manifest fetch is silent, other HTTP errors are logged', () => {
    it('CORE006_05: src/updater/github.ts guards console.log behind status !== 404', async () => {
      const githubSrc = await fs.readFile(path.join(repoRoot, 'src/updater/github.ts'), 'utf-8');

      // The fix: 404 status is checked separately from console.log
      expect(githubSrc).toMatch(/response\.status\s*!==?\s*404/);

      // Structural check: inside fetchWithRetry, the 404 guard must appear
      // BEFORE the console.log call (within the !response.ok branch).
      const fnStart = githubSrc.indexOf('function fetchWithRetry');
      expect(fnStart).toBeGreaterThan(-1);
      const fnSlice = githubSrc.slice(fnStart, fnStart + 1500);
      const notOkIdx = fnSlice.indexOf('!response.ok');
      const status404Idx = fnSlice.indexOf('!== 404', notOkIdx);
      const logIdx = fnSlice.indexOf('console.log', notOkIdx);
      expect(notOkIdx).toBeGreaterThan(-1);
      expect(status404Idx).toBeGreaterThan(notOkIdx);
      expect(logIdx).toBeGreaterThan(status404Idx);
    });

    it('CORE006_05: dist/check-update.bundle.cjs reflects the 404-silent fix (no stale bundle)', async () => {
      const bundlePath = path.join(repoRoot, 'dist/check-update.bundle.cjs');
      if (!await fs.pathExists(bundlePath)) return;
      const bundle = await fs.readFile(bundlePath, 'utf-8');
      // Compiled bundle must contain the same status !== 404 branch.
      expect(bundle).toMatch(/status\s*!==?\s*404/);
    });
  });
});
