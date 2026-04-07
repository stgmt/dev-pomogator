import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import {
  runInstaller,
  homePath,
  appPath,
  setupCleanState,
  type InstallerResult,
} from './helpers';

/**
 * CORE007: Bundled Scripts Installation
 *
 * Verifies that check-update.bundle.cjs and tsx-runner.js are reliably
 * installed to ~/.dev-pomogator/scripts/ after installation, and that
 * both scripts are executable by Node.js without MODULE_NOT_FOUND errors.
 */
let installerResult: InstallerResult;

describe('CORE007: Bundled Scripts Installation', () => {
  beforeAll(async () => {
    await setupCleanState('claude');
    installerResult = await runInstaller('--claude --all');
  }, 120_000);

  // @feature1
  describe('Scenario: CORE007_01 check-update.js is installed to global scripts', () => {
    it('CORE007_01: should install check-update.js with bundled content', async () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'check-update.js');
      expect(await fs.pathExists(scriptPath)).toBe(true);

      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('checkUpdate');

      const stat = await fs.stat(scriptPath);
      expect(stat.size).toBeGreaterThan(100 * 1024); // >100KB bundled
    });
  });

  // @feature2
  describe('Scenario: CORE007_02 tsx-runner.js is installed to global scripts', () => {
    it('CORE007_02: should install tsx-runner.js with runner content', async () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');
      expect(await fs.pathExists(scriptPath)).toBe(true);

      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('resolveScriptPath');

      const stat = await fs.stat(scriptPath);
      expect(stat.size).toBeGreaterThan(5 * 1024); // >5KB
    });
  });

  // @feature3
  describe('Scenario: CORE007_03 check-update.js is executable by node', () => {
    it('CORE007_03: should run without MODULE_NOT_FOUND error', () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'check-update.js');

      try {
        execSync(`node "${scriptPath}" --check-only`, {
          encoding: 'utf-8',
          timeout: 15_000,
          cwd: appPath(),
        });
      } catch (err: any) {
        // Script may exit non-zero (no config, no network) — that's OK.
        // But it must NOT fail with MODULE_NOT_FOUND (broken bundle).
        const output = (err.stderr || '') + (err.stdout || '') + (err.message || '');
        expect(output).not.toContain('MODULE_NOT_FOUND');
        expect(output).not.toContain('Cannot find module');
      }
    });
  });

  // @feature4
  describe('Scenario: CORE007_04 tsx-runner.js is executable by node', () => {
    it('CORE007_04: should run a TypeScript file successfully', async () => {
      const runnerPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');

      // Create a minimal test TypeScript file
      const testScript = appPath('test-bundled-echo.ts');
      await fs.writeFile(testScript, 'console.log("BUNDLED_SCRIPTS_OK");');

      try {
        const output = execSync(`node "${runnerPath}" "${testScript}"`, {
          encoding: 'utf-8',
          timeout: 30_000,
          cwd: appPath(),
        });
        expect(output).toContain('BUNDLED_SCRIPTS_OK');
      } finally {
        await fs.remove(testScript);
      }
    });
  });

  // @feature5
  describe('Scenario: CORE007_05 dist files are included in npm pack output', () => {
    it('CORE007_05: npm pack --dry-run should include all bundled scripts', () => {
      const output = execSync('npm pack --dry-run 2>&1', {
        encoding: 'utf-8',
        timeout: 60_000,
        cwd: appPath(),
      });

      expect(output).toContain('dist/check-update.bundle.cjs');
      expect(output).toContain('dist/tsx-runner.js');
      expect(output).toContain('dist/launch-claude-tui.ps1');
    });
  });

  // @feature6
  describe('Scenario: CORE007_06 launch-claude-tui.ps1 is installed to global scripts', () => {
    it('CORE007_06: should install launch-claude-tui.ps1', async () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'launch-claude-tui.ps1');
      expect(await fs.pathExists(scriptPath)).toBe(true);

      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('-ProjectDir');
    });
  });

  // @feature8
  describe('Scenario: CORE007_08 tsx-runner.js executes scripts with local .js imports', () => {
    it('CORE007_08: should resolve .js imports to .ts files via tsx fallback', async () => {
      const runnerPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');

      // Create a helper module (.ts) and a main script importing it with .js extension
      const helperScript = appPath('test-bundled-helper.ts');
      const mainScript = appPath('test-bundled-import.ts');
      await fs.writeFile(helperScript, 'export function greet(): string { return "IMPORT_RESOLVED"; }');
      await fs.writeFile(mainScript, [
        'import { greet } from "./test-bundled-helper.js";',
        'console.log(greet());',
      ].join('\n'));

      try {
        const output = execSync(`node "${runnerPath}" "${mainScript}"`, {
          encoding: 'utf-8',
          timeout: 30_000,
          cwd: appPath(),
        });
        expect(output).toContain('IMPORT_RESOLVED');
      } catch (err: any) {
        const stderr = err.stderr || err.message || '';
        // Must NOT fail with ERR_MODULE_NOT_FOUND — tsx should handle .js→.ts resolution
        expect(stderr).not.toContain('ERR_MODULE_NOT_FOUND');
        // If it failed for some other reason, re-throw
        throw err;
      } finally {
        await fs.remove(helperScript);
        await fs.remove(mainScript);
      }
    });
  });

  // @feature9
  describe('Scenario: CORE007_09 tsx-runner Strategy 0 falls through on ERR_MODULE_NOT_FOUND', () => {
    it('CORE007_09: should contain ERR_MODULE_NOT_FOUND in fallthrough condition', async () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');
      const content = await fs.readFile(scriptPath, 'utf-8');

      // Strategy 0 catch block must include ERR_MODULE_NOT_FOUND in fallthrough list
      // so it doesn't treat unresolved imports as fatal script errors
      expect(content).toContain('ERR_MODULE_NOT_FOUND');

      // Verify it's in the Strategy 0 catch block (near 'ERR_UNSUPPORTED_NODE_OPTION').
      // Note: `ERR_MODULE_NOT_FOUND` appears earlier in isNpxCacheError, so use
      // lastIndexOf to find the Strategy 0 occurrence specifically.
      const unsupportedIdx = content.indexOf('ERR_UNSUPPORTED_NODE_OPTION');
      const moduleNotFoundIdx = content.lastIndexOf('ERR_MODULE_NOT_FOUND');
      // Both should be in the same condition block (within ~200 chars of each other)
      expect(Math.abs(moduleNotFoundIdx - unsupportedIdx)).toBeLessThan(200);
    });
  });

  // @feature10
  describe('Scenario: CORE007_10 tsx-runner uses loader-aware strategy table', () => {
    it('CORE007_10: STRATEGIES table + isResolverError exist; broken import fails without redundant same-loader retries', async () => {
      const runnerPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');
      const content = await fs.readFile(runnerPath, 'utf-8');

      // 1. Strategy table is the single source of truth — no duplicated try/catch per strategy.
      expect(content).toContain('const STRATEGIES = [');
      expect(content).toMatch(/loader:\s*'node-strip'/);
      expect(content).toMatch(/loader:\s*'tsx'/);

      // 2. Classifier function exists and uses a token array (not inverted &&-!includes chain).
      expect(content).toContain('function isResolverError(');
      expect(content).toContain('RESOLVER_ERROR_TOKENS');

      // 3. Old per-strategy duplicated try/catch blocks must be gone.
      // Count occurrences of `runLocalTsx()` invocation — should appear once inside table, not in a try.
      const runLocalTsxCalls = (content.match(/runLocalTsx\b/g) || []).length;
      // Definition + table reference = 2; tolerate 3 for inline doc.
      expect(runLocalTsxCalls).toBeLessThanOrEqual(3);

      // 4. Smoke: run a temp .ts with a broken relative import. tsx (Strategy 1) will fail
      //    with module-not-found; runner must NOT fall through to Strategy 1.25 (same loader)
      //    and must propagate non-zero exit. strategyLog must contain `1:local:fail` (not :fallthrough).
      const brokenScript = appPath('test-broken-import.ts');
      await fs.writeFile(brokenScript, "import './does-not-exist.js';\nconsole.log('unreachable');\n");
      try {
        let exitCode = 0;
        let combined = '';
        try {
          combined = execSync(`node "${runnerPath}" "${brokenScript}"`, {
            encoding: 'utf-8',
            timeout: 30_000,
            cwd: appPath(),
            stdio: ['pipe', 'pipe', 'pipe'],
          });
        } catch (err: any) {
          exitCode = err.status || 1;
          combined = String(err.stdout || '') + String(err.stderr || '');
        }
        expect(exitCode).not.toBe(0);
        // Must show fail at a tsx strategy, not fall-through across same-loader strategies.
        expect(combined).toMatch(/1:local:fail|1\.25:home:fail|1\.5:global:fail|2:npx:fail/);
        expect(combined).not.toMatch(/1:local:fallthrough.*1\.25:home/);
      } finally {
        await fs.remove(brokenScript);
      }
    });
  });

  // @feature11
  describe('Scenario: CORE007_11 extensions/**/*.ts have no .js relative imports', () => {
    it('CORE007_11: zero relative imports use .js specifier in extensions/', async () => {
      // Walk extensions/ recursively, find every .ts file (skip .d.ts), grep for
      // `from '<relative>.js'` and `import('<relative>.js')` patterns. Any match
      // would re-introduce the Node 22.6+ strip-types ERR_MODULE_NOT_FOUND bug
      // that ts-import-extensions.md rule prohibits.
      const repoRoot = path.resolve(__dirname, '../..');
      const extensionsDir = path.join(repoRoot, 'extensions');

      const offenders: string[] = [];
      const importRe = /(?:from|import)\s*\(?\s*['"](\.\.?\/[^'"]+)\.js['"]/g;

      async function walk(dir: string): Promise<void> {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) {
            if (e.name === 'node_modules') continue;
            await walk(p);
          } else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
            const content = await fs.readFile(p, 'utf-8');
            const matches = content.matchAll(importRe);
            for (const m of matches) {
              offenders.push(`${path.relative(repoRoot, p)}: from '${m[1]}.js'`);
            }
          }
        }
      }

      await walk(extensionsDir);

      if (offenders.length > 0) {
        throw new Error(
          `Found ${offenders.length} relative imports using .js specifier in extensions/ — ` +
          `ts-import-extensions rule requires .ts:\n  ` + offenders.slice(0, 20).join('\n  ') +
          (offenders.length > 20 ? `\n  ... and ${offenders.length - 20} more` : '')
        );
      }
      expect(offenders).toEqual([]);
    });
  });

  // @feature7
  describe('Scenario: CORE007_07 tsx-runner.js uses execCmd for .cmd files on Windows', () => {
    it('CORE007_07: should use execCmd wrapper instead of direct execFileSync on .cmd', async () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');
      const content = await fs.readFile(scriptPath, 'utf-8');

      // Must contain execCmd function (CVE-2024-27980 fix for Node 20.12+)
      expect(content).toContain('function execCmd(');
      // Must route .cmd through COMSPEC (cmd.exe) on Windows
      expect(content).toContain('COMSPEC');

      // All strategy functions must use execCmd, not raw execFileSync for .cmd binaries
      // Extract function bodies for runLocalTsx, runHomeTsx, runGlobalTsx, runNpxTsx, repairNpmSync
      const strategyFunctions = ['runLocalTsx', 'runHomeTsx', 'runGlobalTsx', 'runNpxTsx', 'repairNpmSync'];
      for (const fnName of strategyFunctions) {
        const fnStart = content.indexOf(`function ${fnName}(`);
        if (fnStart === -1) continue;
        // Extract ~500 chars of function body
        const fnBody = content.slice(fnStart, fnStart + 500);
        expect(fnBody, `${fnName} should use execCmd, not execFileSync`)
          .not.toMatch(/execFileSync\s*\(/);
      }
    });
  });
});
