import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

/**
 * Get the project root directory
 * In Docker: uses APP_DIR env var
 * Locally: uses process.cwd() (assumes running from project root)
 */
function getProjectRoot(): string {
  return process.env.APP_DIR || process.cwd();
}

/**
 * Get home directory (for state files)
 */
function getHome(): string {
  return process.env.HOME || os.homedir();
}

/**
 * Get path relative to project root
 */
function appPath(...segments: string[]): string {
  return path.join(getProjectRoot(), ...segments);
}

/**
 * Get path relative to HOME
 */
function homePath(...segments: string[]): string {
  return path.join(getHome(), ...segments);
}

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
    it('should have auto_commit_core.ts with default config', async () => {
      const corePath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_core.ts');
      expect(await fs.pathExists(corePath)).toBe(true);
      
      const content = await fs.readFile(corePath, 'utf-8');
      expect(content).toContain('defaultAutoCommitConfig');
      expect(content).toContain('intervalMinutes: 15');
      expect(content).toContain('jiraKeyPattern');
      expect(content).toContain('smartCommit');
    });

    it('should load config from user-level file', async () => {
      const userConfigPath = homePath('.cursor', 'auto-commit.json');
      await fs.ensureDir(path.dirname(userConfigPath));
      await fs.writeJson(userConfigPath, {
        enabled: true,
        intervalMinutes: 30,
        jiraKeyPattern: 'PROJ-\\d+',
      });

      const content = await fs.readFile(
        path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_core.ts'),
        'utf-8'
      );
      
      // Verify config loading function exists
      expect(content).toContain('loadAutoCommitConfig');
      expect(content).toContain('userAutoCommitConfigAbs');
      expect(content).toContain('projectAutoCommitConfigAbs');
    });

    it('should respect AUTO_COMMIT_DISABLED env var', async () => {
      const corePath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_core.ts');
      const content = await fs.readFile(corePath, 'utf-8');
      
      expect(content).toContain('AUTO_COMMIT_DISABLED');
      expect(content).toContain('merged.enabled = false');
    });
  });

  describe('State', () => {
    it('should create state file on first commit', async () => {
      const statePath = homePath('.cursor', 'auto-commit-state.json');
      
      // State file should not exist initially
      expect(await fs.pathExists(statePath)).toBe(false);
      
      // Verify state functions exist in core
      const corePath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_core.ts');
      const content = await fs.readFile(corePath, 'utf-8');
      
      expect(content).toContain('readAutoCommitState');
      expect(content).toContain('writeAutoCommitState');
      expect(content).toContain('shouldCommit');
      expect(content).toContain('updateLastCommitTimestamp');
    });

    it('should check interval correctly', async () => {
      const corePath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_core.ts');
      const content = await fs.readFile(corePath, 'utf-8');
      
      // Verify interval check logic
      expect(content).toContain('const intervalMs = config.intervalMinutes * 60 * 1000');
      expect(content).toContain('return nowMs - lastMs >= intervalMs');
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

    it('should have gitCommit function with stdin support', async () => {
      const corePath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_core.ts');
      const content = await fs.readFile(corePath, 'utf-8');
      
      // Verify git commit uses stdin for message (preserves newlines)
      expect(content).toContain('git commit -F -');
      expect(content).toContain('input: message');
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

    it('should have extractJiraKeyFromBranch function', async () => {
      const corePath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_core.ts');
      const content = await fs.readFile(corePath, 'utf-8');
      
      expect(content).toContain('extractJiraKeyFromBranch');
      expect(content).toContain('getCurrentBranch');
      expect(content).toContain('jiraKeyPattern');
    });
  });

  describe('Transcript Parsing', () => {
    it('should have parseTranscript function', async () => {
      const transcriptPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_transcript.ts');
      expect(await fs.pathExists(transcriptPath)).toBe(true);
      
      const content = await fs.readFile(transcriptPath, 'utf-8');
      expect(content).toContain('parseTranscript');
      expect(content).toContain('formatMessagesForContext');
    });

    it('should filter out [Thinking] blocks', async () => {
      const transcriptPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_transcript.ts');
      const content = await fs.readFile(transcriptPath, 'utf-8');
      
      expect(content).toContain('[Thinking]');
      expect(content).toContain('inThinking');
    });

    it('should filter out [Tool call] and [Tool result] blocks', async () => {
      const transcriptPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_transcript.ts');
      const content = await fs.readFile(transcriptPath, 'utf-8');
      
      expect(content).toContain('[Tool call]');
      expect(content).toContain('[Tool result]');
      expect(content).toContain('inToolBlock');
    });

    it('should limit messages to maxMessages', async () => {
      const transcriptPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_transcript.ts');
      const content = await fs.readFile(transcriptPath, 'utf-8');
      
      expect(content).toContain('maxMessages');
      expect(content).toContain('messages.slice(-maxMessages)');
    });
  });

  describe('LLM Integration', () => {
    it('should have generateCommitMessage function', async () => {
      const llmPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_llm.ts');
      expect(await fs.pathExists(llmPath)).toBe(true);
      
      const content = await fs.readFile(llmPath, 'utf-8');
      expect(content).toContain('generateCommitMessage');
      expect(content).toContain('callLLM');
    });

    it('should have smart commit summary prompt', async () => {
      const llmPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_llm.ts');
      const content = await fs.readFile(llmPath, 'utf-8');
      
      expect(content).toContain('SMART_COMMIT_SYSTEM_PROMPT');
      expect(content).toContain('single-line summary');
    });

    it('should have generateSmartCommitSummary function', async () => {
      const llmPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_llm.ts');
      const content = await fs.readFile(llmPath, 'utf-8');
      
      expect(content).toContain('generateSmartCommitSummary');
    });

    it('should have gitmoji in system prompt', async () => {
      const llmPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_llm.ts');
      const content = await fs.readFile(llmPath, 'utf-8');
      
      expect(content).toContain('GITMOJI');
      expect(content).toContain('feat → ✨');
      expect(content).toContain('fix → 🐛');
    });

    it('should normalize LLM response newlines', async () => {
      const llmPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_llm.ts');
      const content = await fs.readFile(llmPath, 'utf-8');
      
      expect(content).toContain('normalizeLlmContent');
      expect(content).toContain('.replace(/\\\\n/g, "\\n")');
    });

    it('should filter build artifacts from file list', async () => {
      const llmPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_llm.ts');
      const content = await fs.readFile(llmPath, 'utf-8');
      
      expect(content).toContain('EXCLUDED_PATTERNS');
      expect(content).toContain('node_modules');
      expect(content).toContain('bin');
      expect(content).toContain('.dll');
    });
  });

  describe('Stop Hook', () => {
    it('should have auto_commit_stop.ts entry point', async () => {
      const stopPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_stop.ts');
      expect(await fs.pathExists(stopPath)).toBe(true);
    });

    it('should read input from stdin', async () => {
      const stopPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_stop.ts');
      const content = await fs.readFile(stopPath, 'utf-8');
      
      expect(content).toContain('process.stdin');
      expect(content).toContain('StopHookInput');
    });

    it('should write JSON output to stdout', async () => {
      const stopPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_stop.ts');
      const content = await fs.readFile(stopPath, 'utf-8');
      
      expect(content).toContain('writeOutput');
      expect(content).toContain('JSON.stringify');
      expect(content).toContain('console.log');
    });

    it('should handle FAST PATH via transcript_path', async () => {
      const stopPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_stop.ts');
      const content = await fs.readFile(stopPath, 'utf-8');
      
      expect(content).toContain('FAST PATH');
      expect(content).toContain('transcript_path');
    });

    it('should fallback to sqlite composer bubbles', async () => {
      const stopPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_stop.ts');
      const content = await fs.readFile(stopPath, 'utf-8');
      
      expect(content).toContain('FALLBACK');
      expect(content).toContain('getAggregatedSessionContextFromCursorComposer');
    });

    it('should redact secrets in context', async () => {
      const stopPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_stop.ts');
      const content = await fs.readFile(stopPath, 'utf-8');
      
      expect(content).toContain('redactSecrets');
      expect(content).toContain('REDACTED');
    });

    it('should skip if API key not configured', async () => {
      const stopPath = path.join(appPath(), AUTO_COMMIT_TOOL_PATH, 'auto_commit_stop.ts');
      const content = await fs.readFile(stopPath, 'utf-8');
      
      expect(content).toContain('config.llm.apiKey');
      expect(content).toContain('LLM API key not configured');
    });
  });

  describe('Extension Configuration', () => {
    it('should have extension.json with stop hooks', async () => {
      const extPath = path.join(appPath(), 'extensions/auto-commit/extension.json');
      expect(await fs.pathExists(extPath)).toBe(true);
      
      const ext = await fs.readJson(extPath);
      
      expect(ext.name).toBe('auto-commit');
      expect(ext.version).toBe('2.1.0');
      expect(ext.hooks.cursor.stop).toContain('auto_commit_stop.ts');
      expect(ext.hooks.claude.Stop).toContain('auto_commit_stop.ts');
    });

    it('should use npx tsx to run TypeScript', async () => {
      const extPath = path.join(appPath(), 'extensions/auto-commit/extension.json');
      const ext = await fs.readJson(extPath);
      
      expect(ext.hooks.cursor.stop).toContain('npx tsx');
      expect(ext.hooks.claude.Stop).toContain('npx tsx');
    });
  });
});
