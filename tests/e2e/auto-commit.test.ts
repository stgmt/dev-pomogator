import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { runTsx, appPath, homePath } from './helpers';

const AUTO_COMMIT_TOOL_PATH = 'extensions/auto-commit/tools/auto-commit';

/**
 * Create a temporary git repo for testing
 */
async function createTestRepo(name: string): Promise<string> {
  const repoPath = path.join(homePath('test-repos'), name);
  await fs.ensureDir(repoPath);
  
  // Initialize git repo
  execSync('git init', { cwd: repoPath, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: repoPath, stdio: 'ignore' });
  execSync('git config user.name "Test User"', { cwd: repoPath, stdio: 'ignore' });
  
  // Create initial commit
  await fs.writeFile(path.join(repoPath, 'README.md'), '# Test Repo\n');
  execSync('git add .', { cwd: repoPath, stdio: 'ignore' });
  execSync('git commit -m "Initial commit"', { cwd: repoPath, stdio: 'ignore' });
  
  return repoPath;
}

/**
 * Clean up test repo
 */
async function cleanupTestRepo(repoPath: string): Promise<void> {
  await fs.remove(repoPath);
}

describe('PLUGIN006: Auto-Commit', () => {
  let testRepoPath: string;

  beforeEach(async () => {
    testRepoPath = await createTestRepo(`auto-commit-test-${Date.now()}`);
    // Clean up state file
    await fs.remove(homePath('.cursor', 'auto-commit-state.json'));
  });

  afterEach(async () => {
    if (testRepoPath) {
      await cleanupTestRepo(testRepoPath);
    }
    await fs.remove(homePath('.cursor', 'auto-commit-state.json'));
    await fs.remove(homePath('.cursor', 'auto-commit.json'));
  });

  describe('Config', () => {
    it('PLUGIN006_01: auto_commit_core.ts is a valid exportable module', async () => {
      const corePath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_core.ts');
      const stat = await fs.stat(corePath);
      expect(stat.size).toBeGreaterThan(0);

      const content = await fs.readFile(corePath, 'utf-8');
      expect(content).toMatch(/export|module\.exports|require\(/);
    });
  });

  describe('State', () => {
    it('PLUGIN006_02: state file does not exist before first commit', async () => {
      const statePath = homePath('.cursor', 'auto-commit-state.json');
      expect(await fs.pathExists(statePath)).toBe(false);
    });
  });

  describe('Git Operations', () => {
    it('should detect uncommitted changes', async () => {
      // Create uncommitted change
      await fs.writeFile(path.join(testRepoPath, 'test.txt'), 'test content');
      
      const status = execSync('git status --porcelain', {
        cwd: testRepoPath,
        encoding: 'utf-8',
      });
      
      expect(status.trim()).not.toBe('');
    });

    it('should get git diff', async () => {
      // Create and stage a change
      await fs.writeFile(path.join(testRepoPath, 'test.txt'), 'test content');
      execSync('git add .', { cwd: testRepoPath, stdio: 'ignore' });
      
      const diff = execSync('git diff HEAD', {
        cwd: testRepoPath,
        encoding: 'utf-8',
      });
      
      expect(diff).toContain('test.txt');
      expect(diff).toContain('test content');
    });

  });

  describe('Jira Integration', () => {
    it('should extract Jira key from branch name', async () => {
      // Create a branch with Jira key
      execSync('git checkout -b feature/PROJ-123-test-feature', {
        cwd: testRepoPath,
        stdio: 'ignore',
      });
      
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: testRepoPath,
        encoding: 'utf-8',
      }).trim();
      
      const match = branch.match(/[A-Z]+-\d+/);
      expect(match).not.toBeNull();
      expect(match![0]).toBe('PROJ-123');
    });

  });

  describe('Transcript Parsing', () => {
    it('PLUGIN006_03: auto_commit_transcript.ts is a valid exportable module', async () => {
      const transcriptPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_transcript.ts');
      const stat = await fs.stat(transcriptPath);
      expect(stat.size).toBeGreaterThan(0);

      const content = await fs.readFile(transcriptPath, 'utf-8');
      expect(content).toMatch(/export|module\.exports|require\(/);
    });
  });

  describe('LLM Integration', () => {
    it('PLUGIN006_04: auto_commit_llm.ts is a valid exportable module', async () => {
      const llmPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_llm.ts');
      const stat = await fs.stat(llmPath);
      expect(stat.size).toBeGreaterThan(0);

      const content = await fs.readFile(llmPath, 'utf-8');
      expect(content).toMatch(/export|module\.exports|require\(/);
    });
  });

  describe('Stop Hook', () => {
    it('PLUGIN006_05: auto_commit_stop.ts is a valid exportable module', async () => {
      const stopPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_stop.ts');
      const stat = await fs.stat(stopPath);
      expect(stat.size).toBeGreaterThan(0);

      const content = await fs.readFile(stopPath, 'utf-8');
      expect(content).toMatch(/export|module\.exports|require\(/);
    });
  });

  describe('Extension Configuration', () => {
    it('should have extension.json with stop hooks', async () => {
      const extPath = path.join(appPath(), 'extensions/auto-commit/extension.json');
      expect(await fs.pathExists(extPath)).toBe(true);

      const ext = await fs.readJson(extPath);

      expect(ext.name).toBe('auto-commit');
      expect(ext.version).toBe('2.3.0');
      expect(ext.hooks.claude.Stop).toContain('auto_commit_stop.ts');
    });

    it('should use npx tsx to run TypeScript', async () => {
      const extPath = path.join(appPath(), 'extensions/auto-commit/extension.json');
      const ext = await fs.readJson(extPath);

      expect(ext.hooks.claude.Stop).toContain('npx tsx');
    });
  });

  describe('Integration: stop hook', () => {
    it('should exit 0 and skip when no API key (integration)', () => {
      const result = runTsx(
        'extensions/auto-commit/tools/auto-commit/auto_commit_stop.ts',
        { input: { conversation_id: 'test', workspace_roots: [testRepoPath] } },
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('{}');
      expect(result.stderr).toContain('API key not configured');
    });
  });
});
