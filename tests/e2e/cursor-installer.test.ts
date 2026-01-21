import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { 
  runInstaller, 
  homePath, 
  appPath, 
  startWorker, 
  stopWorker, 
  runHook, 
  isWorkerRunning, 
  initGitRepo,
  // Auto-update helpers
  hoursAgo,
  setupConfigForUpdate,
  getDevPomogatorConfig,
  getConfigLastCheck,
  runCheckUpdate,
  ensureCheckUpdateScript,
} from './helpers';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

describe('Scenario 1: Clean Install', () => {
  beforeAll(async () => {
    // Copy fixture (base Cursor structure without our hooks)
    const fixture = path.join(FIXTURES_DIR, 'fixture');
    const cursorDir = homePath('.cursor');
    
    // Clean up any existing state
    await fs.remove(cursorDir);
    await fs.remove(homePath('.claude'));
    await fs.remove(homePath('.dev-pomogator'));
    
    // Copy fixture
    await fs.copy(fixture, cursorDir);
    
    // Initialize git repo so findRepoRoot() works correctly
    await initGitRepo();
  });

  it('should clone claude-mem to marketplace directory', async () => {
    const { logs, exitCode } = await runInstaller();
    
    expect(exitCode).toBe(0);
    expect(logs).toContain('Cloning claude-mem');
    
    const workerPath = homePath('.claude', 'plugins', 'marketplaces', 'thedotmack', 'plugin', 'scripts', 'worker-service.cjs');
    expect(await fs.pathExists(workerPath)).toBe(true);
  });

  it('should create hooks.json with all required hooks', async () => {
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    expect(await fs.pathExists(hooksPath)).toBe(true);
    
    const hooks = await fs.readJson(hooksPath);
    
    // Check structure
    expect(hooks.version).toBe(1);
    expect(hooks.hooks).toBeDefined();
    
    // Check claude-mem hooks
    expect(hooks.hooks.beforeSubmitPrompt).toBeDefined();
    expect(hooks.hooks.beforeSubmitPrompt.length).toBeGreaterThan(0);
    
    // Check stop hooks (claude-mem summarize + dev-pomogator updater)
    expect(hooks.hooks.stop).toBeDefined();
    expect(hooks.hooks.stop.length).toBeGreaterThanOrEqual(2);
    
    // Verify dev-pomogator updater is in stop hooks
    const stopCommands = hooks.hooks.stop.map((h: any) => h.command);
    expect(stopCommands.some((cmd: string) => cmd.includes('check-update.js'))).toBe(true);
  });

  it('should install suggest-rules command', async () => {
    // Commands are installed in project directory, not global HOME
    const cmdPath = appPath('.cursor', 'commands', 'suggest-rules.md');
    expect(await fs.pathExists(cmdPath)).toBe(true);
    
    const content = await fs.readFile(cmdPath, 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('should copy check-update.js script', async () => {
    const scriptPath = homePath('.dev-pomogator', 'scripts', 'check-update.js');
    expect(await fs.pathExists(scriptPath)).toBe(true);
    
    const content = await fs.readFile(scriptPath, 'utf-8');
    // Bundled script contains the auto-update logic
    expect(content).toContain('checkUpdate');
  });
});

// PLUGIN001: Suggest-rules extension verification
describe('PLUGIN001: Suggest-rules Extension', () => {
  // State from Scenario 1 - suggest-rules already installed
  
  it('should install suggest-rules.md in project directory', async () => {
    const cmdPath = appPath('.cursor', 'commands', 'suggest-rules.md');
    expect(await fs.pathExists(cmdPath)).toBe(true);
  });

  it('should have non-empty content', async () => {
    const cmdPath = appPath('.cursor', 'commands', 'suggest-rules.md');
    const content = await fs.readFile(cmdPath, 'utf-8');
    expect(content.length).toBeGreaterThan(100); // At least 100 chars
  });

  it('should NOT install in global ~/.cursor/commands/', async () => {
    const globalCmdPath = homePath('.cursor', 'commands', 'suggest-rules.md');
    // Should NOT exist in global location
    expect(await fs.pathExists(globalCmdPath)).toBe(false);
  });

  it('should contain valid Cursor command format', async () => {
    const cmdPath = appPath('.cursor', 'commands', 'suggest-rules.md');
    const content = await fs.readFile(cmdPath, 'utf-8');
    
    // Cursor commands typically start with description or have specific format
    // Check for markdown content
    expect(content).toMatch(/^#|^>/m); // Should have headers or blockquotes
  });

  it('should describe rules suggestion functionality', async () => {
    const cmdPath = appPath('.cursor', 'commands', 'suggest-rules.md');
    const content = await fs.readFile(cmdPath, 'utf-8');
    
    // Should mention rules or cursorrules
    expect(content.toLowerCase()).toMatch(/rule|cursor/);
  });
});

// PLUGIN002: Claude-mem hooks verification
describe('PLUGIN002: Claude-mem Hooks', () => {
  // State from Scenario 1 - hooks.json already created
  
  it('should configure session-init hook in beforeSubmitPrompt', async () => {
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    
    const commands = hooks.hooks.beforeSubmitPrompt.map((h: any) => h.command);
    expect(commands.some((cmd: string) => cmd.includes('session-init'))).toBe(true);
  });

  it('should configure context hook in beforeSubmitPrompt', async () => {
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    
    const commands = hooks.hooks.beforeSubmitPrompt.map((h: any) => h.command);
    expect(commands.some((cmd: string) => cmd.includes('context'))).toBe(true);
  });

  it('should configure observation hook in afterMCPExecution', async () => {
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    
    expect(hooks.hooks.afterMCPExecution).toBeDefined();
    const commands = hooks.hooks.afterMCPExecution.map((h: any) => h.command);
    expect(commands.some((cmd: string) => cmd.includes('observation'))).toBe(true);
  });

  it('should configure observation hook in afterShellExecution', async () => {
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    
    expect(hooks.hooks.afterShellExecution).toBeDefined();
    const commands = hooks.hooks.afterShellExecution.map((h: any) => h.command);
    expect(commands.some((cmd: string) => cmd.includes('observation'))).toBe(true);
  });

  it('should configure file-edit hook in afterFileEdit', async () => {
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    
    expect(hooks.hooks.afterFileEdit).toBeDefined();
    const commands = hooks.hooks.afterFileEdit.map((h: any) => h.command);
    expect(commands.some((cmd: string) => cmd.includes('file-edit'))).toBe(true);
  });

  it('should configure summarize hook in stop', async () => {
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    
    const commands = hooks.hooks.stop.map((h: any) => h.command);
    expect(commands.some((cmd: string) => cmd.includes('summarize'))).toBe(true);
  });

  it('should use bun to execute all claude-mem hooks', async () => {
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    
    // Collect all hook commands
    const allCommands: string[] = [];
    for (const [_event, hookList] of Object.entries(hooks.hooks)) {
      if (Array.isArray(hookList)) {
        for (const hook of hookList as any[]) {
          if (hook.command && hook.command.includes('worker-service.cjs')) {
            allCommands.push(hook.command);
          }
        }
      }
    }
    
    // All claude-mem hooks should use bun
    expect(allCommands.length).toBeGreaterThan(0);
    for (const cmd of allCommands) {
      expect(cmd.startsWith('bun ')).toBe(true);
    }
  });

  it('should reference worker-service.cjs in all claude-mem hooks', async () => {
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    
    // Count claude-mem hooks (those with worker-service.cjs)
    let claudeMemHooksCount = 0;
    for (const [_event, hookList] of Object.entries(hooks.hooks)) {
      if (Array.isArray(hookList)) {
        for (const hook of hookList as any[]) {
          if (hook.command && hook.command.includes('worker-service.cjs')) {
            claudeMemHooksCount++;
          }
        }
      }
    }
    
    // Should have at least 5 claude-mem hooks using worker-service.cjs
    // (session-init, context, observation x2, file-edit)
    // Note: summarize now uses cursor-summarize.ts wrapper instead of worker-service.cjs
    expect(claudeMemHooksCount).toBeGreaterThanOrEqual(5);
  });
});

// PLUGIN002-RUNTIME: Claude-mem Worker runtime tests
describe('PLUGIN002-RUNTIME: Claude-mem Worker', () => {
  // Start worker before runtime tests
  beforeAll(async () => {
    await startWorker();
  });

  // Stop worker after runtime tests
  afterAll(async () => {
    await stopWorker();
  });

  it('worker should respond to readiness check', async () => {
    const running = await isWorkerRunning();
    expect(running).toBe(true);
  });

  it('worker should respond to /api/readiness endpoint', async () => {
    const res = await fetch('http://127.0.0.1:37777/api/readiness');
    expect(res.ok).toBe(true);
  });

  it('session-init hook should execute without error', async () => {
    const output = runHook('session-init');
    // Hook may return empty string or some output, but should not throw
    expect(typeof output).toBe('string');
  });

  it('context hook should execute without error', async () => {
    const output = runHook('context');
    // May be empty on first run, but should not throw
    expect(typeof output).toBe('string');
  });

  it('observation hook should execute without error', async () => {
    const output = runHook('observation');
    expect(typeof output).toBe('string');
  });

  it('file-edit hook should execute without error', async () => {
    const output = runHook('file-edit');
    expect(typeof output).toBe('string');
  });

  it('summarize hook should execute without error', async () => {
    const output = runHook('summarize');
    expect(typeof output).toBe('string');
  });
});

describe('Scenario 2: Re-install (after Scenario 1)', () => {
  // State is preserved from Scenario 1
  
  it('should NOT clone claude-mem again', async () => {
    const { logs, exitCode } = await runInstaller();
    
    expect(exitCode).toBe(0);
    // Should report hooks already configured (not reinstalling)
    expect(logs).toContain('Cursor hooks already configured');
    expect(logs).not.toContain('Cloning claude-mem');
  });

  it('should report hooks already configured', async () => {
    const { logs } = await runInstaller();
    
    expect(logs).toContain('Cursor hooks already configured');
  });

  it('should keep hooks.json valid', async () => {
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    
    expect(hooks.version).toBe(1);
    expect(hooks.hooks).toBeDefined();
    expect(hooks.hooks.beforeSubmitPrompt).toBeDefined();
    expect(hooks.hooks.stop).toBeDefined();
  });

  it('should keep all artifacts in place', async () => {
    // Check all artifacts still exist
    // Global artifacts in HOME
    expect(await fs.pathExists(homePath('.cursor', 'hooks', 'hooks.json'))).toBe(true);
    expect(await fs.pathExists(homePath('.dev-pomogator', 'scripts', 'check-update.js'))).toBe(true);
    expect(await fs.pathExists(homePath('.claude', 'plugins', 'marketplaces', 'thedotmack', 'plugin', 'scripts', 'worker-service.cjs'))).toBe(true);
    // Project-level artifacts in APP_DIR
    expect(await fs.pathExists(appPath('.cursor', 'commands', 'suggest-rules.md'))).toBe(true);
  });
});

// ============================================================================
// CORE002: Auto-update tests
// ============================================================================
describe('CORE002: Auto-update', () => {
  // Ensure check-update script is installed before running any auto-update tests
  beforeAll(async () => {
    await ensureCheckUpdateScript();
  });

  // Scenario 3: Cooldown prevents frequent checks
  describe('Cooldown Logic', () => {
    it('should skip update if cooldown not expired (2 hours ago)', async () => {
      // Given: lastCheck = 2 hours ago, cooldownHours = 24
      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(2),
        installedExtensions: [],
      });
      
      const before = await getConfigLastCheck();
      
      // When: run check-update.js
      await runCheckUpdate();
      
      // Then: lastCheck should NOT change (update was skipped)
      const after = await getConfigLastCheck();
      expect(after).toBe(before);
    });

    // Scenario 4: Update check runs after cooldown expires
    it('should run update check if cooldown expired (25 hours ago)', async () => {
      // Given: lastCheck = 25 hours ago, cooldownHours = 24
      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [],
      });
      
      const before = await getConfigLastCheck();
      
      // When: run check-update.js
      await runCheckUpdate();
      
      // Then: lastCheck should be updated (update check ran)
      const after = await getConfigLastCheck();
      expect(after).not.toBe(before);
      expect(new Date(after!).getTime()).toBeGreaterThan(new Date(before!).getTime());
    });

    it('should run update on first check (no lastCheck)', async () => {
      // Given: no lastCheck set
      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        installedExtensions: [],
      });
      
      // When: run check-update.js
      await runCheckUpdate();
      
      // Then: lastCheck should be set
      const after = await getConfigLastCheck();
      expect(after).not.toBeNull();
    });

    it('should skip update if autoUpdate is disabled', async () => {
      // Given: autoUpdate = false
      await setupConfigForUpdate({
        autoUpdate: false,
        cooldownHours: 24,
        lastCheck: hoursAgo(100), // Very old, would trigger if enabled
        installedExtensions: [],
      });
      
      const before = await getConfigLastCheck();
      
      // When: run check-update.js
      await runCheckUpdate();
      
      // Then: lastCheck should NOT change
      const after = await getConfigLastCheck();
      expect(after).toBe(before);
    });
  });

  // Scenario 5: Extension files are updated when new version available
  describe('File Update', () => {
    it('should update files when new version available on GitHub', async () => {
      // Setup: create a test project directory
      const testProjectPath = appPath('test-update-project');
      const commandsDir = path.join(testProjectPath, '.cursor', 'commands');
      await fs.ensureDir(commandsDir);
      
      // Create an old version of the file
      const oldFilePath = path.join(commandsDir, 'suggest-rules.md');
      await fs.writeFile(oldFilePath, '# OLD VERSION v0.0.1\nThis should be replaced.');
      
      // Setup config with old version (0.0.1) - GitHub has 1.2.0
      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25), // Cooldown expired
        installedExtensions: [{
          name: 'suggest-rules',
          version: '0.0.1', // Old version, GitHub has 1.2.0
          platform: 'cursor',
          projectPaths: [testProjectPath],
        }],
      });
      
      // When: run check-update.js
      await runCheckUpdate();
      
      // Then: file should be updated from GitHub
      const newContent = await fs.readFile(oldFilePath, 'utf-8');
      expect(newContent).not.toContain('OLD VERSION');
      expect(newContent.length).toBeGreaterThan(100); // Real content from GitHub
      
      // And: config version should be updated
      const config = await getDevPomogatorConfig();
      expect(config?.installedExtensions[0]?.version).not.toBe('0.0.1');
    });

    it('should not update files when version is same', async () => {
      // Setup: create a test project directory
      const testProjectPath = appPath('test-no-update-project');
      const commandsDir = path.join(testProjectPath, '.cursor', 'commands');
      await fs.ensureDir(commandsDir);
      
      // Create a file with custom content
      const filePath = path.join(commandsDir, 'suggest-rules.md');
      const customContent = '# CUSTOM CONTENT - should remain\nThis is custom content.';
      await fs.writeFile(filePath, customContent);
      
      // Setup config with SAME version as GitHub (1.2.0)
      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25), // Cooldown expired
        installedExtensions: [{
          name: 'suggest-rules',
          version: '1.2.0', // Same version as GitHub
          platform: 'cursor',
          projectPaths: [testProjectPath],
        }],
      });
      
      // When: run check-update.js
      await runCheckUpdate();
      
      // Then: file should NOT be changed (version is same)
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe(customContent);
    });
  });
});
