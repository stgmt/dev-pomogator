/**
 * Step definitions for the Microsoft Store execution-alias guard scenarios
 * in the `tui-test-runner` spec (@feature9, FR-9 TUI Launcher).
 *
 * Folds `tools/tui-test-runner/__tests__/launcher-store-alias.test.ts` into
 * the BDD graph. Every step drives the REAL exported pure predicate
 * `everyPathIsStoreAlias` from `tools/tui-test-runner/launcher.ts` in-process
 * — no mocks, no inline copies of production logic.
 *
 * Background steps (`dev-pomogator is installed`, `tui-test-runner extension
 * is enabled`) are defined in feature_tui_test_runner.ts. This file must NOT
 * redefine them.
 *
 * Regex step patterns (NOT Cucumber Expressions) so literal `\`, `/`,
 * backticks and the spec's punctuation match verbatim. Every pattern is scoped
 * to THIS spec's vocabulary (Microsoft Store / WindowsApps / alias-guard) so
 * the file — loaded by the whole BDD suite — never hijacks another feature's
 * step.
 *
 * @see .specs/tui-test-runner/tui-test-runner.feature
 * @see tools/tui-test-runner/launcher.ts
 * @see .claude/skills/bdd-migrator/SKILL.md
 */
import { Given, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

const REPO_ROOT = process.cwd();

function appPath(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}

/** Lazy-import the real launcher module (ESM-safe dynamic import). */
async function getLauncher(): Promise<{ everyPathIsStoreAlias: (paths: readonly string[]) => boolean }> {
  return import(pathToFileURL(appPath('tools/tui-test-runner/launcher.ts')).href);
}

interface StoreAliasWorld extends V4World {
  resolvedPaths?: readonly string[];
  aliasResult?: boolean;
}

// ============================================================================
// Given — set up the resolved-paths under test
// ============================================================================

Given(
  /^the resolved python paths are only WindowsApps stubs$/,
  function (this: StoreAliasWorld) {
    this.resolvedPaths = ['C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe'];
  },
);

Given(
  /^the resolved python paths are multiple WindowsApps stubs$/,
  function (this: StoreAliasWorld) {
    this.resolvedPaths = [
      'C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe',
      'C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe',
    ];
  },
);

Given(
  /^the resolved python paths include a real interpreter before the WindowsApps stub$/,
  function (this: StoreAliasWorld) {
    this.resolvedPaths = [
      'C:\\Users\\u\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
      'C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe',
    ];
  },
);

Given(
  /^the resolved python paths are a single forward-slash real interpreter$/,
  function (this: StoreAliasWorld) {
    this.resolvedPaths = ['/usr/bin/python3'];
  },
);

Given(
  /^the resolved python paths are empty or whitespace-only$/,
  function (this: StoreAliasWorld) {
    // Cover both sub-cases from the vitest twin: [] and ['', '   '].
    // We assert on both in the Then step via two calls.
    this.resolvedPaths = [];
  },
);

// ============================================================================
// Then — call everyPathIsStoreAlias and assert the result
// ============================================================================

Then(
  /^the Store alias guard should flag all paths as alias-only$/,
  async function (this: StoreAliasWorld) {
    const { everyPathIsStoreAlias } = await getLauncher();
    const result = everyPathIsStoreAlias(this.resolvedPaths!);
    assert.equal(result, true, `expected everyPathIsStoreAlias(${JSON.stringify(this.resolvedPaths)}) to be true`);
  },
);

Then(
  /^the Store alias guard should not flag the paths as alias-only$/,
  async function (this: StoreAliasWorld) {
    const { everyPathIsStoreAlias } = await getLauncher();
    // For the empty/whitespace-only scenario, also verify the ['', '   '] case.
    const paths = this.resolvedPaths!;
    const result = everyPathIsStoreAlias(paths);
    assert.equal(result, false, `expected everyPathIsStoreAlias(${JSON.stringify(paths)}) to be false`);
    if (paths.length === 0) {
      // Second sub-case from the vitest twin: whitespace-only entries.
      const wsResult = everyPathIsStoreAlias(['', '   ']);
      assert.equal(wsResult, false, `expected everyPathIsStoreAlias(['', '   ']) to be false`);
    }
  },
);
