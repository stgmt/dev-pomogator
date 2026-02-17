import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

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
      expect(ext.platforms).toContain('cursor');
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

    it('should have commands for Cursor and Claude', async () => {
      const cursorCmd = path.join(PLUGIN_DIR, 'cursor', 'commands', 'configure-root-artifacts.md');
      const claudeCmd = path.join(PLUGIN_DIR, 'claude', 'commands', 'configure-root-artifacts.md');
      
      expect(await fs.pathExists(cursorCmd)).toBe(true);
      expect(await fs.pathExists(claudeCmd)).toBe(true);
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
});
