/**
 * CORE022 — Hook E2E Lifecycle Tests.
 *
 * Tests the FULL CHAIN: install → hooks written to settings.json → hook
 * script is executable with realistic stdin → produces valid output.
 *
 * This bridges the gap between:
 *   - CORE003 (hooks are WRITTEN to settings.json)
 *   - CORE020 (hook modules RESOLVE without MODULE_NOT_FOUND)
 *   - GUARD002/build-guard (individual hook BUSINESS LOGIC)
 *
 * CORE022 tests:
 *   1. Extract real hook commands from installed settings.json (not from manifests)
 *   2. Execute each hook with event-appropriate stdin
 *   3. Verify stdout format, exit codes, fail-open behavior
 *   4. Regression: deduplication, user hook preservation, file existence
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SettingsHookEntry {
  matcher?: string;
  hooks?: Array<{
    type?: string;
    command?: string;
    timeout?: number;
  }>;
}

interface ExtractedHook {
  eventName: string;
  command: string;
  matcher?: string;
  /** Source: 'project' or 'global' */
  source: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPO_ROOT = process.env.APP_DIR || process.cwd();
const EXTENSIONS_DIR = path.join(REPO_ROOT, 'extensions');

/**
 * Extract all hook commands from an installed settings.json file.
 * Returns flat list with event name, command, and optional matcher.
 */
function extractHooksFromSettings(settingsPath: string): ExtractedHook[] {
  if (!fs.existsSync(settingsPath)) return [];
  const settings = fs.readJsonSync(settingsPath);
  const hooks = settings.hooks || {};
  const result: ExtractedHook[] = [];
  const source = settingsPath.includes('.claude/settings.json') ? 'project' : 'global';

  for (const [eventName, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries as SettingsHookEntry[]) {
      if (!entry.hooks) continue;
      for (const hook of entry.hooks) {
        if (hook.command) {
          result.push({
            eventName,
            command: hook.command,
            matcher: entry.matcher,
            source,
          });
        }
      }
    }
  }
  return result;
}

/**
 * Build realistic stdin payload for a given hook event type.
 */
function makeStdinForEvent(eventName: string): Record<string, unknown> {
  const base = {
    session_id: 'test-e2e-session-core022',
    transcript_path: '/tmp/core022-fake-transcript.jsonl',
    cwd: appPath(),
    hook_event_name: eventName,
  };

  switch (eventName) {
    case 'PreToolUse':
      return {
        ...base,
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' },
      };
    case 'PostToolUse':
      return {
        ...base,
        tool_name: 'Bash',
        tool_use_id: 'toolu_core022_01',
        tool_input: { command: 'echo hello' },
        tool_response: {
          stdout: 'hello\n',
          stderr: '',
          interrupted: false,
        },
      };
    case 'Stop':
      return {
        ...base,
        conversation_id: 'conv-core022',
        workspace_roots: [appPath()],
      };
    case 'UserPromptSubmit':
      return {
        ...base,
        user_prompt: 'fix the bug in auth.ts',
      };
    case 'SessionStart':
      return {
        ...base,
        workspace_roots: [appPath()],
      };
    default:
      return base;
  }
}

/**
 * Execute a hook command string with given stdin, return result.
 * Resolves .dev-pomogator/tools/ paths to the real installed location.
 */
function executeHook(
  command: string,
  stdinJson: Record<string, unknown>,
  timeoutMs = 15000,
): { stdout: string; stderr: string; status: number | null; timedOut: boolean } {
  // Resolve relative paths to installed location
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
      FORCE_COLOR: '0',
    },
    input: JSON.stringify(stdinJson),
    encoding: 'utf-8',
    timeout: timeoutMs,
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
    timedOut: result.signal === 'SIGTERM',
  };
}

/**
 * Check if stdout is valid hook output: either empty or valid JSON.
 */
function isValidHookOutput(stdout: string): boolean {
  const trimmed = stdout.trim();
  if (trimmed === '') return true;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract script file path from a hook command string.
 * Returns the .dev-pomogator/tools/... path portion.
 */
function extractScriptPath(command: string): string | null {
  // Match .dev-pomogator/tools/<ext>/<script>
  const match = command.match(/\.dev-pomogator\/tools\/[\w/._-]+\.\w+/);
  return match ? match[0] : null;
}

/**
 * Collect hook event names from all extension.json manifests.
 */
function collectManifestHookEvents(): Map<string, string[]> {
  const result = new Map<string, string[]>();
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

    // hooks.claude is the Claude Code hook section
    const claudeHooks = (manifest.hooks as Record<string, unknown>)?.claude as Record<string, unknown> | undefined;
    if (!claudeHooks || typeof claudeHooks !== 'object') continue;

    for (const eventName of Object.keys(claudeHooks)) {
      const existing = result.get(eventName) || [];
      existing.push(dir);
      result.set(eventName, existing);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CORE022: Hook E2E Lifecycle', () => {
  let projectHooks: ExtractedHook[];
  let globalHooks: ExtractedHook[];

  beforeAll(async () => {
    await setupCleanState('claude');
    const result = await runInstaller('--claude --all');
    if (result.exitCode !== 0) {
      throw new Error(`Installer failed: ${result.logs}`);
    }

    projectHooks = extractHooksFromSettings(appPath('.claude', 'settings.json'));
    globalHooks = extractHooksFromSettings(homePath('.claude', 'settings.json'));
  });

  // =========================================================================
  // @feature1 — Full chain: install → settings → execute
  // =========================================================================
  describe('Full chain: install → settings → execute', () => {
    it('CORE022_01: project settings.json has hooks after installation', () => {
      expect(projectHooks.length).toBeGreaterThan(0);
    });

    it('CORE022_02: every project hook executes without MODULE_NOT_FOUND', () => {
      for (const hook of projectHooks) {
        const stdin = makeStdinForEvent(hook.eventName);
        const result = executeHook(hook.command, stdin);

        const stderr = result.stderr;
        expect(
          stderr,
          `${hook.eventName} hook stderr contains module error:\n${stderr}\nCommand: ${hook.command}`,
        ).not.toContain('MODULE_NOT_FOUND');
        expect(stderr).not.toContain('ERR_MODULE_NOT_FOUND');
        expect(stderr).not.toContain('Cannot find module');
      }
    });

    it('CORE022_03: every project hook produces valid output (JSON or empty)', () => {
      for (const hook of projectHooks) {
        const stdin = makeStdinForEvent(hook.eventName);
        const result = executeHook(hook.command, stdin);

        expect(
          isValidHookOutput(result.stdout),
          `${hook.eventName} hook stdout is not valid JSON or empty:\n${result.stdout.substring(0, 200)}\nCommand: ${hook.command}`,
        ).toBe(true);
      }
    });

    it('CORE022_04: no hook hangs (all complete within timeout)', () => {
      for (const hook of projectHooks) {
        const stdin = makeStdinForEvent(hook.eventName);
        const result = executeHook(hook.command, stdin);

        expect(
          result.timedOut,
          `${hook.eventName} hook timed out.\nCommand: ${hook.command}`,
        ).toBe(false);
      }
    });
  });

  // =========================================================================
  // @feature2 — PreToolUse hooks with matcher
  // =========================================================================
  describe('PreToolUse hooks with different tool_name inputs', () => {
    it('CORE022_05: PreToolUse hook processes Bash tool_name cleanly', () => {
      const preToolUseHooks = projectHooks.filter(h => h.eventName === 'PreToolUse');
      if (preToolUseHooks.length === 0) return; // skip if no PreToolUse hooks

      for (const hook of preToolUseHooks) {
        const stdin = makeStdinForEvent('PreToolUse');
        const result = executeHook(hook.command, stdin);

        // Should exit 0 (allow) or 2 (deny) — both are valid decisions
        expect(
          [0, 2],
          `PreToolUse hook exited with unexpected code ${result.status}.\nCommand: ${hook.command}\nStderr: ${result.stderr.substring(0, 200)}`,
        ).toContain(result.status);
      }
    });

    it('CORE022_06: PreToolUse hook handles Write tool_name without crash', () => {
      const preToolUseHooks = projectHooks.filter(h => h.eventName === 'PreToolUse');
      if (preToolUseHooks.length === 0) return;

      for (const hook of preToolUseHooks) {
        const stdin = {
          session_id: 'test-e2e-session-core022',
          transcript_path: '/tmp/core022-fake-transcript.jsonl',
          cwd: appPath(),
          hook_event_name: 'PreToolUse',
          tool_name: 'Write',
          tool_input: { file_path: '/tmp/test.txt', content: 'hello' },
        };
        const result = executeHook(hook.command, stdin);

        // Hook should not crash — exit 0 or 2
        expect(
          [0, 2],
          `PreToolUse hook crashed on Write input (exit ${result.status}).\nCommand: ${hook.command}\nStderr: ${result.stderr.substring(0, 200)}`,
        ).toContain(result.status);
        expect(result.stderr).not.toContain('MODULE_NOT_FOUND');
      }
    });
  });

  // =========================================================================
  // @feature3 — Stop hooks produce valid decision
  // =========================================================================
  describe('Stop hook decision format', () => {
    it('CORE022_07: Stop hooks return empty (allow) or JSON with decision key', () => {
      const stopHooks = projectHooks.filter(h => h.eventName === 'Stop');
      if (stopHooks.length === 0) return;

      for (const hook of stopHooks) {
        const stdin = makeStdinForEvent('Stop');
        const result = executeHook(hook.command, stdin);

        const trimmed = result.stdout.trim();
        if (trimmed === '') {
          // Empty = allow, valid
          expect(result.status).toBe(0);
        } else {
          // Non-empty must be valid JSON
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            throw new Error(
              `Stop hook stdout is not valid JSON:\n${trimmed.substring(0, 200)}\nCommand: ${hook.command}`,
            );
          }
          // If it has a decision, it should be 'block', 'approve', or 'allow'
          // Claude Code protocol uses 'approve' (not 'allow') as the positive decision.
          if ('decision' in parsed) {
            expect(['block', 'approve', 'allow']).toContain(parsed.decision);
          }
        }
      }
    });
  });

  // =========================================================================
  // @feature4 — UserPromptSubmit hooks
  // =========================================================================
  describe('UserPromptSubmit hook processing', () => {
    it('CORE022_08: UserPromptSubmit hooks exit 0 on valid input', () => {
      const upsHooks = projectHooks.filter(h => h.eventName === 'UserPromptSubmit');
      if (upsHooks.length === 0) return;

      for (const hook of upsHooks) {
        const stdin = makeStdinForEvent('UserPromptSubmit');
        const result = executeHook(hook.command, stdin);

        expect(
          result.status,
          `UserPromptSubmit hook exited non-zero (${result.status}).\nCommand: ${hook.command}\nStderr: ${result.stderr.substring(0, 200)}`,
        ).toBe(0);
        expect(result.stderr).not.toContain('MODULE_NOT_FOUND');
      }
    });
  });

  // =========================================================================
  // @feature5 — Fail-open on malformed stdin
  // =========================================================================
  describe('Fail-open behavior', () => {
    it('CORE022_09: hooks exit 0 on malformed JSON stdin (fail-open)', () => {
      // Test a representative subset (one per event type) to keep test fast
      const seen = new Set<string>();
      const eventTypes: string[] = [];
      for (const h of projectHooks) {
        if (!seen.has(h.eventName)) {
          seen.add(h.eventName);
          eventTypes.push(h.eventName);
        }
      }
      for (const eventName of eventTypes) {
        const hook = projectHooks.find(h => h.eventName === eventName)!;
        const resolvedCommand = hook.command
          .replace(/\.dev-pomogator\/tools\//g, appPath('.dev-pomogator/tools/').replace(/\\/g, '/') + '/')
          .replace(/~\//g, homePath().replace(/\\/g, '/') + '/')
          .replace(/\$HOME\//g, homePath().replace(/\\/g, '/') + '/');

        const result = spawnSync('bash', ['-c', resolvedCommand], {
          cwd: appPath(),
          env: {
            ...process.env,
            HOME: homePath(),
            USERPROFILE: homePath(),
            FORCE_COLOR: '0',
          },
          input: 'NOT VALID JSON {{{}}}}',
          encoding: 'utf-8',
          timeout: 15000,
        });

        expect(
          result.status,
          `${eventName} hook crashed on malformed stdin (exit ${result.status}).\nCommand: ${hook.command}\nStderr: ${(result.stderr || '').substring(0, 200)}`,
        ).toBe(0);

        const stderr = (result.stderr || '').toLowerCase();
        expect(stderr).not.toContain('unhandledrejection');
        expect(stderr).not.toContain('uncaughtexception');
      }
    });

    // @feature6
    it('CORE022_10: hooks exit 0 on empty stdin (fail-open)', () => {
      const seen2 = new Set<string>();
      const eventTypes: string[] = [];
      for (const h of projectHooks) {
        if (!seen2.has(h.eventName)) {
          seen2.add(h.eventName);
          eventTypes.push(h.eventName);
        }
      }
      for (const eventName of eventTypes) {
        const hook = projectHooks.find(h => h.eventName === eventName)!;
        const resolvedCommand = hook.command
          .replace(/\.dev-pomogator\/tools\//g, appPath('.dev-pomogator/tools/').replace(/\\/g, '/') + '/')
          .replace(/~\//g, homePath().replace(/\\/g, '/') + '/')
          .replace(/\$HOME\//g, homePath().replace(/\\/g, '/') + '/');

        const result = spawnSync('bash', ['-c', resolvedCommand], {
          cwd: appPath(),
          env: {
            ...process.env,
            HOME: homePath(),
            USERPROFILE: homePath(),
            FORCE_COLOR: '0',
          },
          input: '',
          encoding: 'utf-8',
          timeout: 15000,
        });

        expect(
          result.status,
          `${eventName} hook crashed on empty stdin (exit ${result.status}).\nCommand: ${hook.command}\nStderr: ${(result.stderr || '').substring(0, 200)}`,
        ).toBe(0);
      }
    });
  });

  // =========================================================================
  // @feature7 — Manifest hooks ↔ settings.json parity
  // =========================================================================
  describe('Manifest ↔ settings.json parity', () => {
    it('CORE022_11: every manifest hook event type exists in project settings.json', () => {
      const manifestEvents = collectManifestHookEvents();
      const settingsEventNames: Record<string, boolean> = {};
      for (const h of projectHooks) {
        settingsEventNames[h.eventName] = true;
      }

      manifestEvents.forEach((extensions, eventName) => {
        expect(
          settingsEventNames[eventName] === true,
          `Event "${eventName}" from extensions [${extensions.join(', ')}] missing in settings.json. ` +
          `Settings has: [${Object.keys(settingsEventNames).join(', ')}]`,
        ).toBe(true);
      });
    });

    it('CORE022_12: every project hook command references .dev-pomogator/tools/ path', () => {
      // Global hooks (SessionStart check-update) use homedir path, skip those
      for (const hook of projectHooks) {
        expect(
          hook.command,
          `${hook.eventName} hook command does not reference .dev-pomogator/tools/:\n${hook.command}`,
        ).toContain('.dev-pomogator/tools/');
      }
    });
  });

  // =========================================================================
  // @feature8 — Regression: reinstall deduplication
  // =========================================================================
  describe('Regression: reinstall deduplication', () => {
    it('CORE022_13: reinstall produces identical hook count (no duplicates)', async () => {
      // Capture hook count per event before reinstall
      const beforeCounts = new Map<string, number>();
      for (const hook of projectHooks) {
        beforeCounts.set(hook.eventName, (beforeCounts.get(hook.eventName) || 0) + 1);
      }

      // Reinstall
      const result = await runInstaller('--claude --all');
      expect(result.exitCode).toBe(0);

      // Capture after
      const afterHooks = extractHooksFromSettings(appPath('.claude', 'settings.json'));
      const afterCounts = new Map<string, number>();
      for (const hook of afterHooks) {
        afterCounts.set(hook.eventName, (afterCounts.get(hook.eventName) || 0) + 1);
      }

      // Compare
      beforeCounts.forEach((beforeCount, eventName) => {
        const afterCount = afterCounts.get(eventName) || 0;
        expect(
          afterCount,
          `${eventName} hook count changed after reinstall: ${beforeCount} → ${afterCount}`,
        ).toBe(beforeCount);
      });
    });
  });

  // =========================================================================
  // @feature9 — Regression: user hooks survive reinstall
  // =========================================================================
  describe('Regression: user hooks survive reinstall', () => {
    it('CORE022_14: custom user hook in Stop survives reinstall', async () => {
      const settingsPath = appPath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);

      // Inject a user hook
      if (!settings.hooks.Stop) settings.hooks.Stop = [];
      const userHookEntry = {
        matcher: '',
        hooks: [{
          type: 'command',
          command: 'echo "CORE022-user-sentinel-hook"',
          timeout: 5,
        }],
      };
      settings.hooks.Stop.push(userHookEntry);
      await fs.writeJson(settingsPath, settings, { spaces: 2 });

      // Reinstall
      const result = await runInstaller('--claude --all');
      expect(result.exitCode).toBe(0);

      // Verify user hook survived
      const updated = await fs.readJson(settingsPath);
      const found = (updated.hooks.Stop || []).some(
        (entry: SettingsHookEntry) =>
          entry.hooks?.some(h => h.command === 'echo "CORE022-user-sentinel-hook"'),
      );
      expect(found, 'User hook was clobbered during reinstall').toBe(true);

      // Verify managed hooks also present
      const managedFound = (updated.hooks.Stop || []).some(
        (entry: SettingsHookEntry) =>
          entry.hooks?.some(h => h.command?.includes('.dev-pomogator/tools/')),
      );
      // Stop hooks may or may not have managed entries — only assert if they existed before
      const hadManagedStop = projectHooks.some(h => h.eventName === 'Stop');
      if (hadManagedStop) {
        expect(managedFound, 'Managed Stop hooks disappeared during reinstall').toBe(true);
      }
    });
  });

  // =========================================================================
  // @feature10 — Hook command → file on disk
  // =========================================================================
  describe('Hook commands reference existing files', () => {
    it('CORE022_15: every hook script path resolves to a file on disk', () => {
      for (const hook of projectHooks) {
        const scriptPath = extractScriptPath(hook.command);
        if (!scriptPath) continue; // skip hooks without .dev-pomogator/tools/ path

        const fullPath = appPath(scriptPath);
        expect(
          fs.existsSync(fullPath),
          `${hook.eventName} hook references non-existent file: ${scriptPath}\nFull path: ${fullPath}\nCommand: ${hook.command}`,
        ).toBe(true);
      }
    });
  });

  // =========================================================================
  // Global hooks (SessionStart check-update)
  // =========================================================================
  describe('Global hooks lifecycle', () => {
    it('CORE022_16: global settings.json has SessionStart hooks', () => {
      const sessionStartHooks = globalHooks.filter(h => h.eventName === 'SessionStart');
      expect(sessionStartHooks.length).toBeGreaterThan(0);
    });

    it('CORE022_17: global SessionStart hook script exists on disk', () => {
      const sessionStartHooks = globalHooks.filter(h => h.eventName === 'SessionStart');
      for (const hook of sessionStartHooks) {
        // Global hooks use os.homedir() resolution — check for check-update.js
        if (hook.command.includes('check-update.js')) {
          const scriptPath = homePath('.dev-pomogator', 'scripts', 'check-update.js');
          expect(
            fs.existsSync(scriptPath),
            `check-update.js not found at ${scriptPath}`,
          ).toBe(true);
        }
      }
    });
  });
});
