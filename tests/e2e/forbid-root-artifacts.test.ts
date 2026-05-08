import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import os from 'os';
import { createFakeClaudeStub } from './helpers';

const ROOT_DIR = path.join(__dirname, '..', '..');
const PLUGIN_DIR = path.join(ROOT_DIR, 'extensions', 'forbid-root-artifacts');
const TOOLS_DIR = path.join(PLUGIN_DIR, 'tools', 'forbid-root-artifacts');

// Temp directory for test repositories
let tempDir: string;
let testRepoDir: string;

function runCheck(cwd: string): { exitCode: number; output: string } {
  // Use the check.py from the test repo's .dev-pomogator/tools directory
  const checkScript = path.join(cwd, '.dev-pomogator', 'tools', 'forbid-root-artifacts', 'check.py');
  try {
    const output = execSync(`python "${checkScript}"`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, output };
  } catch (error: any) {
    return {
      exitCode: error.status || 1,
      output: error.stdout?.toString() || error.stderr?.toString() || '',
    };
  }
}

function runSetup(cwd: string): { exitCode: number; output: string } {
  const setupScript = path.join(TOOLS_DIR, 'setup.py');
  try {
    const output = execSync(`python "${setupScript}"`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, output };
  } catch (error: any) {
    return {
      exitCode: error.status || 1,
      output: error.stdout?.toString() || error.stderr?.toString() || '',
    };
  }
}

/** Run check.py capturing stdout + stderr separately. Optional extra env (e.g. PATH override). */
function runCheckEx(
  cwd: string,
  extraEnv: NodeJS.ProcessEnv = {},
): { exitCode: number; stdout: string; stderr: string } {
  const checkScript = path.join(cwd, '.dev-pomogator', 'tools', 'forbid-root-artifacts', 'check.py');
  const result = spawnSync('python', [checkScript], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...extraEnv },
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

/** Run configure.py with extra args and optional env. */
function runConfigureEx(
  cwd: string,
  args: string[] = [],
  extraEnv: NodeJS.ProcessEnv = {},
): { exitCode: number; stdout: string; stderr: string } {
  const script = path.join(cwd, '.dev-pomogator', 'tools', 'forbid-root-artifacts', 'configure.py');
  const result = spawnSync('python', [script, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, ...extraEnv },
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
}

describe('PLUGIN004: Forbid Root Artifacts', () => {
  beforeAll(async () => {
    tempDir = path.join(os.tmpdir(), `forbid-root-artifacts-test-${Date.now()}`);
    await fs.ensureDir(tempDir);
  });

  afterAll(async () => {
    await fs.remove(tempDir);
  });

  beforeEach(async () => {
    testRepoDir = path.join(tempDir, `repo-${Date.now()}`);
    await fs.ensureDir(testRepoDir);
    initGitRepo(testRepoDir);
    
    // Copy tools to test repo
    const toolsDest = path.join(testRepoDir, '.dev-pomogator', 'tools', 'forbid-root-artifacts');
    await fs.copy(TOOLS_DIR, toolsDest);
  });

  describe('Plugin Structure', () => {
    it('should have extension.json', async () => {
      const extPath = path.join(PLUGIN_DIR, 'extension.json');
      expect(await fs.pathExists(extPath)).toBe(true);
      
      const ext = await fs.readJson(extPath);
      expect(ext.name).toBe('forbid-root-artifacts');
      expect(ext.platforms).toContain('claude');
    });

    // .claude-plugin removed - marketplace approach deprecated
    // it('should have .claude-plugin/plugin.json', ...)

    it('should have check.py script', async () => {
      const checkPath = path.join(TOOLS_DIR, 'check.py');
      expect(await fs.pathExists(checkPath)).toBe(true);
    });

    it('should have default-whitelist.yaml', async () => {
      const whitelistPath = path.join(TOOLS_DIR, 'default-whitelist.yaml');
      expect(await fs.pathExists(whitelistPath)).toBe(true);
    });

    it('should have configure-root-artifacts command installed', async () => {
      const installedCmd = path.join(ROOT_DIR, '.claude', 'commands', 'configure-root-artifacts.md');
      expect(await fs.pathExists(installedCmd)).toBe(true);
    });
  });

  describe('Default Whitelist', () => {
    it('should block unknown files', async () => {
      await fs.writeFile(path.join(testRepoDir, 'random.txt'), 'test');
      
      const { exitCode, output } = runCheck(testRepoDir);
      
      expect(exitCode).toBe(1);
      expect(output).toContain('random.txt');
    });

    it('should allow README.md', async () => {
      await fs.writeFile(path.join(testRepoDir, 'README.md'), '# Test');
      
      const { exitCode } = runCheck(testRepoDir);
      
      expect(exitCode).toBe(0);
    });

    it('should allow .gitignore', async () => {
      await fs.writeFile(path.join(testRepoDir, '.gitignore'), 'node_modules');
      
      const { exitCode } = runCheck(testRepoDir);
      
      expect(exitCode).toBe(0);
    });

    it('should allow .sln files (pattern)', async () => {
      await fs.writeFile(path.join(testRepoDir, 'MyProject.sln'), 'solution');
      
      const { exitCode } = runCheck(testRepoDir);
      
      expect(exitCode).toBe(0);
    });
  });

  describe('Custom Config - Extend Mode', () => {
    it('should add files to whitelist', async () => {
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\nallow:\n  - custom-file.txt\n'
      );
      await fs.writeFile(path.join(testRepoDir, 'custom-file.txt'), 'test');
      
      const { exitCode } = runCheck(testRepoDir);
      
      expect(exitCode).toBe(0);
    });

    it('should deny files even if in defaults', async () => {
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\ndeny:\n  - README.md\n'
      );
      await fs.writeFile(path.join(testRepoDir, 'README.md'), '# Test');
      
      const { exitCode, output } = runCheck(testRepoDir);
      
      expect(exitCode).toBe(1);
      expect(output.toLowerCase()).toContain('readme.md');
    });
  });

  describe('Custom Config - Replace Mode', () => {
    it('should only allow specified files', async () => {
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: replace\nallow:\n  - only-this.txt\n'
      );
      await fs.writeFile(path.join(testRepoDir, 'only-this.txt'), 'allowed');
      await fs.writeFile(path.join(testRepoDir, 'README.md'), '# Not allowed');
      
      const { exitCode, output } = runCheck(testRepoDir);
      
      expect(exitCode).toBe(1);
      expect(output.toLowerCase()).toContain('readme.md');
    });
  });

  describe('Ignore Patterns', () => {
    it('should ignore files matching patterns', async () => {
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\nignore_patterns:\n  - "*.tmp"\n  - "*.bak"\n'
      );
      await fs.writeFile(path.join(testRepoDir, 'test.tmp'), 'temp');
      await fs.writeFile(path.join(testRepoDir, 'backup.bak'), 'backup');
      
      const { exitCode } = runCheck(testRepoDir);
      
      expect(exitCode).toBe(0);
    });
  });

  describe('Directory Restrictions', () => {
    it('should block directories not in allowed list', async () => {
      // Note: .dev-pomogator/ is created by beforeEach, so we must include it
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\nallowed_directories:\n  - src\n  - docs\n  - .dev-pomogator\n'
      );
      await fs.ensureDir(path.join(testRepoDir, 'random-dir'));

      const { exitCode, output } = runCheck(testRepoDir);

      expect(exitCode).toBe(1);
      expect(output).toContain('random-dir');
    });

    it('should allow directories in allowed list', async () => {
      // Note: .dev-pomogator/ is created by beforeEach, so we must include it
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\nallowed_directories:\n  - src\n  - .dev-pomogator\n'
      );
      await fs.ensureDir(path.join(testRepoDir, 'src'));
      
      const { exitCode } = runCheck(testRepoDir);
      
      expect(exitCode).toBe(0);
    });
  });

  describe('Trash Classification', () => {
    it('should classify .progress.json as trash and block it', async () => {
      await fs.writeFile(path.join(testRepoDir, '.progress.json'), '{"version":1}');

      const { exitCode, output } = runCheck(testRepoDir);

      expect(exitCode).toBe(1);
      expect(output).toContain('.progress.json');
      expect(output).toContain('AUTO-DELETE');
    });
  });

  // ===========================================================================
  // FR-1: Auto-prune stale allow entries
  // ===========================================================================
  describe('Auto-Prune (FR-1)', () => {
    it('PLUGIN004_AUTOPRUNE_01: rewrites yaml + signals modify when stale entries present (explicit enable)', async () => {
      // C3: auto_prune is opt-in (default false) — must explicitly enable
      await fs.writeFile(path.join(testRepoDir, 'README.md'), '# x');
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\nallow:\n  - foo.testsettings\n  - README.md\nauto_prune:\n  enabled: true\n',
      );

      const { exitCode, stderr } = runCheckEx(testRepoDir);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('auto-pruned 1 stale entries');
      expect(stderr).toContain('foo.testsettings');
      expect(stderr).toContain('Run: git add .root-artifacts.yaml && git commit');

      const yamlAfter = await fs.readFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'utf-8',
      );
      expect(yamlAfter).not.toContain('foo.testsettings');
      expect(yamlAfter).toContain('README.md');
    });

    it('PLUGIN004_AUTOPRUNE_DEFAULT_OFF: default config does NOT auto-prune (C3 backward compat)', async () => {
      // No `auto_prune` section → default false → no prune even with stale entries
      await fs.writeFile(path.join(testRepoDir, 'README.md'), '# x');
      const yamlPath = path.join(testRepoDir, '.root-artifacts.yaml');
      await fs.writeFile(yamlPath, 'mode: extend\nallow:\n  - missing.txt\n  - README.md\n');
      const mtimeBefore = (await fs.stat(yamlPath)).mtimeMs;

      const { exitCode, stderr } = runCheckEx(testRepoDir);

      expect(exitCode).toBe(0);
      expect(stderr).not.toContain('auto-pruned');
      const mtimeAfter = (await fs.stat(yamlPath)).mtimeMs;
      expect(mtimeAfter).toBe(mtimeBefore);
      const yamlAfter = await fs.readFile(yamlPath, 'utf-8');
      expect(yamlAfter).toContain('missing.txt');
    });

    it('PLUGIN004_AUTOPRUNE_02: auto_prune.enabled=false leaves yaml untouched', async () => {
      await fs.writeFile(path.join(testRepoDir, 'README.md'), '# x');
      const yamlPath = path.join(testRepoDir, '.root-artifacts.yaml');
      await fs.writeFile(
        yamlPath,
        'mode: extend\nallow:\n  - missing.txt\n  - README.md\nauto_prune:\n  enabled: false\n',
      );
      const mtimeBefore = (await fs.stat(yamlPath)).mtimeMs;

      const { exitCode, stderr } = runCheckEx(testRepoDir);

      expect(exitCode).toBe(0);
      expect(stderr).not.toContain('auto-pruned');
      const mtimeAfter = (await fs.stat(yamlPath)).mtimeMs;
      expect(mtimeAfter).toBe(mtimeBefore);
      const yamlAfter = await fs.readFile(yamlPath, 'utf-8');
      expect(yamlAfter).toContain('missing.txt');
    });

    it('PLUGIN004_AUTOPRUNE_03: path-traversal entries skipped with WARN, not pruned', async () => {
      await fs.writeFile(path.join(testRepoDir, 'valid.txt'), 'x');
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        // Need auto_prune enabled to even reach the path-traversal check
        'mode: extend\nallow:\n  - "../escape.txt"\n  - valid.txt\nauto_prune:\n  enabled: true\n',
      );

      const { stderr } = runCheckEx(testRepoDir);

      expect(stderr).toContain('WARNING: skipping non-basename allow entry: ../escape.txt');
      const yamlAfter = await fs.readFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'utf-8',
      );
      // Path-traversal entry remains (not classified stale, not pruned)
      expect(yamlAfter).toContain('../escape.txt');
    });

    it('PLUGIN004_AUTOPRUNE_HEADER_PRESERVED: custom user header is kept byte-for-byte (C2)', async () => {
      // C2 fix: user-customised yaml headers (license, copyright, team note)
      // must survive auto-prune rewrite.
      await fs.writeFile(path.join(testRepoDir, 'README.md'), '# x');
      const customHeader =
        '# Copyright 2026 Acme Corp\n' +
        '# Owned by team: platform-foundation\n' +
        '# Do not modify without team review\n\n';
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        customHeader + 'mode: extend\nallow:\n  - missing.txt\n  - README.md\nauto_prune:\n  enabled: true\n',
      );

      runCheckEx(testRepoDir);

      const yamlAfter = await fs.readFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'utf-8',
      );
      expect(yamlAfter).toContain('Copyright 2026 Acme Corp');
      expect(yamlAfter).toContain('Owned by team: platform-foundation');
      expect(yamlAfter).toContain('Do not modify without team review');
      // The dev-pomogator default header should NOT have replaced the user header
      expect(yamlAfter).not.toContain('Documentation: https://github.com/stgmt/dev-pomogator');
    });

    it('PLUGIN004_AUTOPRUNE_COMBINED: violations + stale entries report in single run (C1)', async () => {
      // C1 fix: when BOTH violations and stale entries exist, report both in
      // one exit-1 (no split-screen "fix yaml first, then see violations").
      await fs.writeFile(path.join(testRepoDir, 'README.md'), '# x');
      await fs.writeFile(path.join(testRepoDir, 'rogue.txt'), 'x'); // violation
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\nallow:\n  - missing.txt\n  - README.md\nauto_prune:\n  enabled: true\n',
      );

      const { exitCode, stdout, stderr } = runCheckEx(testRepoDir);

      expect(exitCode).toBe(1);
      // Violation report (existing path)
      expect(stdout).toContain('rogue.txt');
      expect(stdout.toLowerCase()).toContain('not in whitelist');
      // Auto-prune report (added by C1 combined path)
      expect(stderr).toContain('also auto-pruned');
      expect(stderr).toContain('missing.txt');
    });
  });

  // ===========================================================================
  // FR-2: User-configurable trash classification
  // ===========================================================================
  describe('Trash Classification (FR-2)', () => {
    it('PLUGIN004_TRASH_01: user trash_patterns filters file from configure.py', async () => {
      // Use *.foo pattern (non-VS) so generic hint fires — not specialized testsettings hint
      await fs.writeFile(path.join(testRepoDir, 'random.foo'), 'x');
      await fs.writeFile(path.join(testRepoDir, 'pyproject.toml'), '[tool.x]');
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\n' +
          'trash_patterns:\n  - "*.foo"\n' +
          'use_default_trash_patterns: false\n' +
          'classifier:\n  mode: config\n',
      );

      const { exitCode, stdout } = runConfigureEx(testRepoDir, ['--non-interactive']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('random.foo');
      expect(stdout).toContain('trash');
      expect(stdout).toContain('add to .gitignore');

      const yamlAfter = await fs.readFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'utf-8',
      );
      expect(yamlAfter).not.toMatch(/^\s*-\s*random\.foo\s*$/m);
    });

    it('PLUGIN004_TRASH_02: use_default_trash_patterns toggle activates plugin defaults', async () => {
      await fs.writeFile(path.join(testRepoDir, 'MyProj.vssscc'), 'x');
      const yamlPath = path.join(testRepoDir, '.root-artifacts.yaml');

      // First: defaults ON → vssscc filtered as trash
      await fs.writeFile(
        yamlPath,
        'mode: extend\nuse_default_trash_patterns: true\nclassifier:\n  mode: config\n',
      );
      const r1 = runConfigureEx(testRepoDir, ['--non-interactive']);
      expect(r1.exitCode).toBe(0);
      const yaml1 = await fs.readFile(yamlPath, 'utf-8');
      expect(yaml1).not.toMatch(/^\s*-\s*MyProj\.vssscc\s*$/m);

      // Second: defaults OFF + no user trash patterns → vssscc not filtered
      await fs.writeFile(
        yamlPath,
        'mode: extend\nuse_default_trash_patterns: false\nclassifier:\n  mode: config\n',
      );
      const r2 = runConfigureEx(testRepoDir, ['--non-interactive']);
      expect(r2.exitCode).toBe(0);
      const yaml2 = await fs.readFile(yamlPath, 'utf-8');
      expect(yaml2).toMatch(/MyProj\.vssscc/);
    });

    it('PLUGIN004_TRASH_03: specialized hint for *.testsettings includes SettingsMigrator URL', async () => {
      await fs.writeFile(path.join(testRepoDir, 'Old.testsettings'), 'x');
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\nuse_default_trash_patterns: true\nclassifier:\n  mode: config\n',
      );

      const { stdout } = runConfigureEx(testRepoDir, ['--non-interactive']);

      expect(stdout).toContain('deprecated VS test settings');
      expect(stdout).toContain(
        'https://learn.microsoft.com/en-us/visualstudio/test/migrate-testsettings-to-runsettings',
      );
    });
  });

  // ===========================================================================
  // FR-3: LLM-driven classification via Claude Code CLI subscription
  // ===========================================================================
  describe('LLM Classification (FR-3)', () => {
    it('PLUGIN004_LLM_01: hybrid mode invokes claude CLI for unmatched files', async () => {
      const { binDir, invocationLogPath } = createFakeClaudeStub(testRepoDir, {
        result: 'trash',
      });

      await fs.writeFile(path.join(testRepoDir, 'weird.unknownext'), 'x');
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\n' +
          'use_default_trash_patterns: false\n' +
          'classifier:\n  mode: hybrid\n',
      );

      const env = { PATH: binDir + path.delimiter + (process.env.PATH || '') };
      const { exitCode, stdout } = runConfigureEx(testRepoDir, ['--non-interactive'], env);

      expect(exitCode).toBe(0);
      // Stub was invoked at least once
      const log = await fs.readFile(invocationLogPath, 'utf-8');
      expect(log.length).toBeGreaterThan(0);
      expect(log).toContain('weird.unknownext');

      // File classified as trash → not in allow list
      const yamlAfter = await fs.readFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'utf-8',
      );
      expect(yamlAfter).not.toMatch(/^\s*-\s*weird\.unknownext\s*$/m);
      // Cache populated
      const cachePath = path.join(testRepoDir, '.dev-pomogator', '.classifier-cache.json');
      expect(await fs.pathExists(cachePath)).toBe(true);
      const cache = await fs.readJson(cachePath);
      expect(cache.entries['weird.unknownext']).toBeDefined();
    });

    it('PLUGIN004_LLM_02: graceful fallback when configured CLI not in PATH', async () => {
      // Configure a binary name that does NOT exist anywhere — avoids PATH override
      // brittleness on Windows (python needs SYSTEM32 in PATH).
      await fs.writeFile(path.join(testRepoDir, 'weird.unknownext'), 'x');
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\n' +
          'use_default_trash_patterns: false\n' +
          'classifier:\n  mode: hybrid\n  llm:\n    cli: definitely_not_a_real_binary_12345\n',
      );

      const { exitCode, stderr } = runConfigureEx(testRepoDir, ['--non-interactive']);

      // Should not crash — graceful 'unknown' classification
      expect(exitCode).toBe(0);
      // One-time WARN about CLI absence (case-insensitive: matches "claude cli not in path"
      // OR "definitely_not_a_real_binary_12345 cli not in path" depending on impl)
      expect(stderr.toLowerCase()).toContain('cli not in path');
    });

    it('PLUGIN004_LLM_03: cache hit avoids subprocess call', async () => {
      const { binDir, invocationLogPath } = createFakeClaudeStub(testRepoDir, {
        result: 'config',
      });

      await fs.writeFile(path.join(testRepoDir, 'cached.unknownext'), 'x');
      // Pre-populate cache with future timestamp (within TTL)
      const cacheDir = path.join(testRepoDir, '.dev-pomogator');
      await fs.ensureDir(cacheDir);
      await fs.writeJson(path.join(cacheDir, '.classifier-cache.json'), {
        schema_version: 1,
        entries: {
          'cached.unknownext': {
            result: 'trash',
            ts: Math.floor(Date.now() / 1000),
          },
        },
      });
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\n' +
          'use_default_trash_patterns: false\n' +
          'classifier:\n  mode: hybrid\n',
      );

      const env = { PATH: binDir + path.delimiter + (process.env.PATH || '') };
      const { exitCode } = runConfigureEx(testRepoDir, ['--non-interactive'], env);

      expect(exitCode).toBe(0);
      // Stub was NOT invoked — cache hit
      const log = await fs.readFile(invocationLogPath, 'utf-8');
      expect(log.trim()).toBe('');
    });
  });

  // ===========================================================================
  // FR-4: Shared classifier module + extended yaml config
  // ===========================================================================
  describe('Shared Classifier (FR-4)', () => {
    it('PLUGIN004_CLASS_01: no hardcoded TRASH_PATTERNS list in *.py source', async () => {
      // Verify all Python source files in the plugin tools dir contain NO
      // top-level `TRASH_PATTERNS = [` assignment (must live in yaml).
      // _FALLBACK_TRASH_PATTERNS is allowed (graceful degradation safety net).
      const pyFiles = ['check.py', 'configure.py', '_classifier.py', 'setup.py', 'deps-install.py'];
      for (const py of pyFiles) {
        const full = path.join(TOOLS_DIR, py);
        if (!(await fs.pathExists(full))) continue;
        const content = await fs.readFile(full, 'utf-8');
        const hardcoded = content.match(/^TRASH_PATTERNS\s*=\s*\[/gm);
        expect(
          hardcoded,
          `${py} contains hardcoded top-level TRASH_PATTERNS assignment`,
        ).toBeNull();
      }

      // _classifier.py exports the API
      const classifierContent = await fs.readFile(path.join(TOOLS_DIR, '_classifier.py'), 'utf-8');
      expect(classifierContent).toContain('def load_classifier_config');
      expect(classifierContent).toContain('def classify_file');
      expect(classifierContent).toContain('def find_stale_allow_entries');

      // check.py + configure.py both import from _classifier
      const checkContent = await fs.readFile(path.join(TOOLS_DIR, 'check.py'), 'utf-8');
      const configureContent = await fs.readFile(path.join(TOOLS_DIR, 'configure.py'), 'utf-8');
      expect(checkContent).toContain('from _classifier import');
      expect(configureContent).toContain('from _classifier import');

      // default-whitelist.yaml has trash_patterns_default section
      const dwl = await fs.readFile(path.join(TOOLS_DIR, 'default-whitelist.yaml'), 'utf-8');
      expect(dwl).toContain('trash_patterns_default:');
    });

    it('PLUGIN004_CLASS_02: new pattern in default-whitelist.yaml applies hot (no code change)', async () => {
      // Patch installed yaml in test repo to add a new trash pattern
      const installedYaml = path.join(
        testRepoDir,
        '.dev-pomogator',
        'tools',
        'forbid-root-artifacts',
        'default-whitelist.yaml',
      );
      const original = await fs.readFile(installedYaml, 'utf-8');
      const patched = original.replace(
        'trash_patterns_default:',
        'trash_patterns_default:\n  - "*.devtest"',
      );
      await fs.writeFile(installedYaml, patched);

      await fs.writeFile(path.join(testRepoDir, 'foo.devtest'), 'x');
      await fs.writeFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'mode: extend\nuse_default_trash_patterns: true\nclassifier:\n  mode: config\n',
      );

      const { exitCode, stdout } = runConfigureEx(testRepoDir, ['--non-interactive']);

      expect(exitCode).toBe(0);
      expect(stdout).toMatch(/foo\.devtest.*trash/);
      const yamlAfter = await fs.readFile(
        path.join(testRepoDir, '.root-artifacts.yaml'),
        'utf-8',
      );
      expect(yamlAfter).not.toMatch(/^\s*-\s*foo\.devtest\s*$/m);
    });

    it('PLUGIN004_CLASS_03: graceful fallback when _classifier.py missing', async () => {
      // Remove _classifier.py to simulate broken upgrade
      const classifierPath = path.join(
        testRepoDir,
        '.dev-pomogator',
        'tools',
        'forbid-root-artifacts',
        '_classifier.py',
      );
      await fs.remove(classifierPath);

      await fs.writeFile(path.join(testRepoDir, 'random.tmp'), 'x');

      const { stderr } = runCheckEx(testRepoDir);

      expect(stderr).toContain('classifier module missing');
      expect(stderr).toContain('using fallback');
    });
  });
});
