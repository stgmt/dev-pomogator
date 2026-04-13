/**
 * CORE020 — Hook smoke tests.
 *
 * Dynamically loads every hook command from every extension manifest
 * and verifies the underlying script can be loaded by Node without
 * MODULE_NOT_FOUND. Catches the dkidyaev incident class:
 *
 *   - Sibling .ts files missing from `toolFiles[]`
 *   - `_shared/` not synced (would fail at import time)
 *   - Hook script renamed but manifest stale
 *   - tsx-runner.js missing
 *
 * The test does NOT execute hook business logic — it just verifies the
 * tsx-runner-bootstrap → tsx-runner → script chain RESOLVES the entry
 * file. Hooks may exit non-zero from validation errors against the empty
 * stdin payload — that's acceptable. The ONLY failure mode this test
 * catches is module resolution.
 *
 * Per `.claude/rules/checklists/manifest-test-coverage.md`: dynamic
 * iteration so new hooks added to manifests are covered automatically.
 *
 * Per `.claude/rules/gotchas/installer-hook-formats.md`: handles all
 * 3 hook formats (string, object with matcher, array with nested hooks).
 */

import { describe, it, beforeAll, expect } from 'vitest';
import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import {
  runInstaller,
  appPath,
  homePath,
  setupCleanState,
} from './helpers';

interface ManifestHook {
  extension: string;
  hookName: string;
  command: string;
  matcher?: string;
}

const REPO_ROOT = process.env.APP_DIR || process.cwd();
const EXTENSIONS_DIR = path.join(REPO_ROOT, 'extensions');

/**
 * Walk every extension manifest and produce a flat list of hook commands.
 * Handles all 3 hook formats from installer-hook-formats.md.
 */
function collectAllManifestHooks(): ManifestHook[] {
  const result: ManifestHook[] = [];
  if (!fs.existsSync(EXTENSIONS_DIR)) return result;

  for (const dir of fs.readdirSync(EXTENSIONS_DIR)) {
    const manifestPath = path.join(EXTENSIONS_DIR, dir, 'extension.json');
    if (!fs.existsSync(manifestPath)) continue;

    let manifest: { hooks?: Record<string, unknown> };
    try {
      manifest = fs.readJsonSync(manifestPath);
    } catch {
      continue;
    }

    const hooks = manifest.hooks ?? {};
    for (const [hookName, raw] of Object.entries(hooks)) {
      // Format 1: string
      if (typeof raw === 'string') {
        result.push({ extension: dir, hookName, command: raw });
        continue;
      }
      // Format 3: array with nested hooks (PostToolUse pattern)
      if (Array.isArray(raw)) {
        for (const group of raw) {
          if (!group || typeof group !== 'object') continue;
          const matcher = (group as { matcher?: string }).matcher;
          const nested = (group as { hooks?: Array<{ command?: string }> }).hooks;
          if (Array.isArray(nested)) {
            for (const h of nested) {
              if (h?.command) {
                result.push({ extension: dir, hookName, command: h.command, matcher });
              }
            }
          }
        }
        continue;
      }
      // Format 2: object with matcher/command/timeout
      if (raw && typeof raw === 'object' && 'command' in raw) {
        const obj = raw as { command: string; matcher?: string };
        if (obj.command) {
          result.push({ extension: dir, hookName, command: obj.command, matcher: obj.matcher });
        }
      }
    }
  }

  return result;
}

describe('CORE020: Hook scripts loadable smoke test', () => {
  beforeAll(async () => {
    await setupCleanState('claude');
    const result = await runInstaller('--claude --all');
    if (result.exitCode !== 0) {
      throw new Error(`Installer failed: ${result.logs}`);
    }
  });

  const allHooks = collectAllManifestHooks();

  it('CORE020_00: at least one hook is collected from manifests (sanity)', () => {
    expect(allHooks.length).toBeGreaterThan(0);
  });

  // One test per hook entry — dynamic generation per manifest-test-coverage rule.
  // Test name encodes extension+hookName+matcher so failures clearly identify the source.
  for (const { extension, hookName, command, matcher } of allHooks) {
    const safeName = `${extension}_${hookName}${matcher ? '_' + matcher : ''}`
      .replace(/[^a-zA-Z0-9_]/g, '_');

    it(`CORE020_05_${safeName}: hook command resolves modules without MODULE_NOT_FOUND`, () => {
      // Replace `npx tsx` with the bootstrap pattern that the installer would emit.
      // We resolve hook tool paths to the project's installed location so node can
      // load them. Note: tests run inside the dev-pomogator repo so .dev-pomogator/tools/
      // contains the installed copy.
      const resolvedCommand = command
        .replace(/\.dev-pomogator\/tools\//g, appPath('.dev-pomogator/tools/').replace(/\\/g, '/') + '/')
        .replace(/~\//g, homePath().replace(/\\/g, '/') + '/')
        .replace(/\$HOME\//g, homePath().replace(/\\/g, '/') + '/');

      const result = spawnSync('bash', ['-c', resolvedCommand], {
        cwd: appPath(),
        env: {
          ...process.env,
          HOME: homePath(),
          USERPROFILE: homePath(),
          // Provide minimal valid stdin so hooks don't hang waiting for input
        },
        input: JSON.stringify({
          session_id: 'test-session',
          transcript_path: '/tmp/fake-transcript.jsonl',
          cwd: appPath(),
          hook_event_name: hookName,
        }),
        encoding: 'utf-8',
        timeout: 15000,
      });

      const stderr = result.stderr ?? '';
      // Module resolution failures are the ONLY thing this test catches.
      // Validation errors / business-logic exits are accepted.
      expect(stderr, `${extension}/${hookName} stderr:\n${stderr}`).not.toContain('MODULE_NOT_FOUND');
      expect(stderr, `${extension}/${hookName} stderr:\n${stderr}`).not.toContain('ERR_MODULE_NOT_FOUND');
      expect(stderr, `${extension}/${hookName} stderr:\n${stderr}`).not.toContain('Cannot find module');
    });
  }
});
