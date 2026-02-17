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
  // Auto-update helpers
  hoursAgo,
  setupConfigForUpdate,
  getDevPomogatorConfig,
  getConfigLastCheck,
  runCheckUpdate,
  ensureCheckUpdateScript,
  // Platform setup helpers
  setupCleanState,
  setupInstalledState,
} from './helpers';

describe('Scenario 1: Clean Install', () => {
  beforeAll(async () => {
    await setupCleanState('cursor');
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
    // Bundled script should include standalone logger messages
    expect(content).toContain('Update check completed');
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

// PLUGIN003: Specs-workflow extension verification
describe('PLUGIN003: Specs-workflow Extension', () => {
  it('should install create-spec.md in project directory', async () => {
    const cmdPath = appPath('.cursor', 'commands', 'create-spec.md');
    expect(await fs.pathExists(cmdPath)).toBe(true);
  });

  it('should have non-empty content', async () => {
    const cmdPath = appPath('.cursor', 'commands', 'create-spec.md');
    const content = await fs.readFile(cmdPath, 'utf-8');
    expect(content.length).toBeGreaterThan(100);
  });

  it('should install specs-management rule', async () => {
    const rulePath = appPath('.cursor', 'rules', 'pomogator', 'specs-management.mdc');
    expect(await fs.pathExists(rulePath)).toBe(true);
  });

  it('should install no-mocks-fallbacks rule', async () => {
    const rulePath = appPath('.cursor', 'rules', 'pomogator', 'no-mocks-fallbacks.mdc');
    expect(await fs.pathExists(rulePath)).toBe(true);
  });

  it('should install research-workflow rule', async () => {
    const rulePath = appPath('.cursor', 'rules', 'pomogator', 'research-workflow.mdc');
    expect(await fs.pathExists(rulePath)).toBe(true);
  });

  it('should install specs-generator tools', async () => {
    const toolsPath = appPath('.dev-pomogator', 'tools', 'specs-generator');
    expect(await fs.pathExists(toolsPath)).toBe(true);

    // Check key scripts exist
    expect(await fs.pathExists(path.join(toolsPath, 'scaffold-spec.ps1'))).toBe(true);
    expect(await fs.pathExists(path.join(toolsPath, 'validate-spec.ps1'))).toBe(true);
    expect(await fs.pathExists(path.join(toolsPath, 'list-specs.ps1'))).toBe(true);
  });

  it('should install templates', async () => {
    const templatesPath = appPath('.dev-pomogator', 'tools', 'specs-generator', 'templates');
    expect(await fs.pathExists(templatesPath)).toBe(true);
    
    // Check some key templates
    expect(await fs.pathExists(path.join(templatesPath, 'FR.md.template'))).toBe(true);
    expect(await fs.pathExists(path.join(templatesPath, 'DESIGN.md.template'))).toBe(true);
    expect(await fs.pathExists(path.join(templatesPath, 'TASKS.md.template'))).toBe(true);
  });
});

// PLUGIN007: Plan-pomogator extension verification
describe('PLUGIN007: Plan-pomogator Extension', () => {
  it('should install plan-pomogator rule', async () => {
    const rulePath = appPath('.cursor', 'rules', 'pomogator', 'plan-pomogator.mdc');
    expect(await fs.pathExists(rulePath)).toBe(true);
  });

  it('should install plan-pomogator tools', async () => {
    const toolsPath = appPath('.dev-pomogator', 'tools', 'plan-pomogator');
    expect(await fs.pathExists(toolsPath)).toBe(true);
    expect(await fs.pathExists(path.join(toolsPath, 'validate-plan.ts'))).toBe(true);
    expect(await fs.pathExists(path.join(toolsPath, 'requirements.md'))).toBe(true);
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

describe('Scenario 2: Re-install (isolated)', () => {
  beforeAll(async () => {
    // Set up a fully installed state from scratch (isolated from Scenario 1)
    await setupInstalledState('cursor');
  });

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

  it('should install extension hooks from extension.json', async () => {
    // Run installer with --all to include auto-commit
    const { exitCode } = await runInstaller('--cursor --all');
    expect(exitCode).toBe(0);
    
    const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
    const hooks = await fs.readJson(hooksPath);
    
    // Check that auto-commit hook is installed in stop event (defined in extensions/auto-commit/extension.json)
    // auto-commit v2.0.0 uses TypeScript with npx tsx on stop hook
    const stopCommands = hooks.hooks.stop?.map((h: any) => h.command) ?? [];
    const hasAutoCommitHook = stopCommands.some((cmd: string) => 
      cmd.includes('tsx') && cmd.includes('auto_commit_stop.ts')
    );
    
    expect(hasAutoCommitHook).toBe(true);
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
      
      // Setup config with version >= GitHub — no update should occur
      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25), // Cooldown expired
        installedExtensions: [{
          name: 'suggest-rules',
          version: '999.0.0', // Higher than any GitHub version → semver.gt() = false → no update
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

  // Scenario 6: Stale managed files are removed on update
  describe('Stale File Cleanup', () => {
    let testProjectPath: string;

    afterEach(async () => {
      if (testProjectPath) {
        await fs.remove(testProjectPath);
      }
    });

    it('should remove stale command when updating extension', async () => {
      testProjectPath = appPath('test-stale-cmd');
      const commandsDir = path.join(testProjectPath, '.cursor', 'commands');
      await fs.ensureDir(commandsDir);

      // Create real + stale command files
      await fs.writeFile(path.join(commandsDir, 'suggest-rules.md'), '# OLD');
      await fs.writeFile(path.join(commandsDir, 'fake-old-command.md'), '# STALE');

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'suggest-rules',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              commands: [
                '.cursor/commands/suggest-rules.md',
                '.cursor/commands/fake-old-command.md',
              ],
            },
          },
        }],
      });

      await runCheckUpdate();

      // Stale file should be deleted
      expect(await fs.pathExists(path.join(commandsDir, 'fake-old-command.md'))).toBe(false);
      // Real file should be updated (not deleted)
      expect(await fs.pathExists(path.join(commandsDir, 'suggest-rules.md'))).toBe(true);
      const content = await fs.readFile(path.join(commandsDir, 'suggest-rules.md'), 'utf-8');
      expect(content).not.toBe('# OLD');
    });

    it('should remove stale rule when updating extension', async () => {
      testProjectPath = appPath('test-stale-rule');
      const rulesDir = path.join(testProjectPath, '.cursor', 'rules', 'pomogator');
      await fs.ensureDir(rulesDir);

      // Create real + stale rule files
      await fs.writeFile(path.join(rulesDir, 'specs-management.mdc'), '# OLD');
      await fs.writeFile(path.join(rulesDir, 'obsolete-rule.mdc'), '# STALE');

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'specs-workflow',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              rules: [
                '.cursor/rules/pomogator/specs-management.mdc',
                '.cursor/rules/pomogator/obsolete-rule.mdc',
              ],
            },
          },
        }],
      });

      await runCheckUpdate();

      // Stale rule should be deleted
      expect(await fs.pathExists(path.join(rulesDir, 'obsolete-rule.mdc'))).toBe(false);
      // Real rule should exist (updated from GitHub)
      expect(await fs.pathExists(path.join(rulesDir, 'specs-management.mdc'))).toBe(true);
    });

    it('should remove stale tool when updating extension', async () => {
      testProjectPath = appPath('test-stale-tool');
      const toolsDir = path.join(testProjectPath, '.dev-pomogator', 'tools', 'specs-generator');
      await fs.ensureDir(toolsDir);

      // Create real + stale tool files
      await fs.writeFile(path.join(toolsDir, 'scaffold-spec.ps1'), '# OLD');
      await fs.writeFile(path.join(toolsDir, 'old-tool.ps1'), '# STALE');

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'specs-workflow',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              tools: [
                '.dev-pomogator/tools/specs-generator/scaffold-spec.ps1',
                '.dev-pomogator/tools/specs-generator/old-tool.ps1',
              ],
            },
          },
        }],
      });

      await runCheckUpdate();

      // Stale tool should be deleted
      expect(await fs.pathExists(path.join(toolsDir, 'old-tool.ps1'))).toBe(false);
      // Real tool should exist (updated from GitHub)
      expect(await fs.pathExists(path.join(toolsDir, 'scaffold-spec.ps1'))).toBe(true);
    });

    it('should update managed state in config after update', async () => {
      testProjectPath = appPath('test-managed-state');
      const commandsDir = path.join(testProjectPath, '.cursor', 'commands');
      await fs.ensureDir(commandsDir);

      await fs.writeFile(path.join(commandsDir, 'suggest-rules.md'), '# OLD');
      await fs.writeFile(path.join(commandsDir, 'removed-command.md'), '# STALE');

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'suggest-rules',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              commands: [
                '.cursor/commands/suggest-rules.md',
                '.cursor/commands/removed-command.md',
              ],
            },
          },
        }],
      });

      await runCheckUpdate();

      // Re-read config
      const config = await getDevPomogatorConfig();
      const ext = config?.installedExtensions.find((e: any) => e.name === 'suggest-rules');
      expect(ext).toBeDefined();
      expect(ext!.version).not.toBe('0.0.1');

      // Managed commands should contain only real files, not stale ones
      const managed = (ext as any)?.managed?.[testProjectPath];
      expect(managed).toBeDefined();
      expect(managed.commands).toBeDefined();
      const commandPaths = managed.commands.map((c: any) => typeof c === 'string' ? c : c.path);
      expect(commandPaths).toContain('.cursor/commands/suggest-rules.md');
      expect(commandPaths).not.toContain('.cursor/commands/removed-command.md');
    });

    it('should remove stale Cursor hook from hooks.json', async () => {
      testProjectPath = appPath('test-stale-hook');
      // Ensure tools dir exists (updater resolves hooks with projectPath)
      await fs.ensureDir(path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit'));
      await fs.writeFile(
        path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'auto_commit_stop.ts'),
        '// placeholder'
      );

      const hooksFile = homePath('.cursor', 'hooks', 'hooks.json');
      const realCommand = `npx tsx ${path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'auto_commit_stop.ts').replace(/\\/g, '/')}`.replace(/\\/g, '\\\\');
      const staleCommand = `npx tsx ${path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'old_hook.ts').replace(/\\/g, '/')}`.replace(/\\/g, '\\\\');

      // Write hooks.json with both real and stale hook
      await fs.ensureDir(path.dirname(hooksFile));
      await fs.writeJson(hooksFile, {
        version: 1,
        hooks: {
          stop: [
            { command: realCommand },
            { command: staleCommand },
          ],
        },
      }, { spaces: 2 });

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'auto-commit',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              hooks: {
                stop: [
                  'npx tsx .dev-pomogator/tools/auto-commit/auto_commit_stop.ts',
                  'npx tsx .dev-pomogator/tools/auto-commit/old_hook.ts',
                ],
              },
            },
          },
        }],
      });

      await runCheckUpdate();

      // Read hooks.json
      const hooks = await fs.readJson(hooksFile);
      const stopCommands = (hooks.hooks?.stop ?? []).map((h: any) => h.command);

      // Real hook should still exist
      expect(stopCommands.some((cmd: string) => cmd.includes('auto_commit_stop.ts'))).toBe(true);
      // Stale hook should be removed
      expect(stopCommands.some((cmd: string) => cmd.includes('old_hook.ts'))).toBe(false);
    });

    it('should preserve user hooks when removing stale managed hooks', async () => {
      testProjectPath = appPath('test-user-hooks');
      await fs.ensureDir(path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit'));
      await fs.writeFile(
        path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'auto_commit_stop.ts'),
        '// placeholder'
      );

      const hooksFile = homePath('.cursor', 'hooks', 'hooks.json');
      const realCommand = `npx tsx ${path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'auto_commit_stop.ts').replace(/\\/g, '/')}`.replace(/\\/g, '\\\\');
      const staleCommand = `npx tsx ${path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'old_hook.ts').replace(/\\/g, '/')}`.replace(/\\/g, '\\\\');
      const userCommand = 'bash /home/testuser/my-custom-lint-hook.sh';

      // Write hooks.json with managed hooks + user's own hook
      await fs.ensureDir(path.dirname(hooksFile));
      await fs.writeJson(hooksFile, {
        version: 1,
        hooks: {
          stop: [
            { command: realCommand },
            { command: staleCommand },
            { command: userCommand },
          ],
        },
      }, { spaces: 2 });

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'auto-commit',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              hooks: {
                stop: [
                  'npx tsx .dev-pomogator/tools/auto-commit/auto_commit_stop.ts',
                  'npx tsx .dev-pomogator/tools/auto-commit/old_hook.ts',
                ],
              },
            },
          },
        }],
      });

      await runCheckUpdate();

      const hooks = await fs.readJson(hooksFile);
      const stopCommands = (hooks.hooks?.stop ?? []).map((h: any) => h.command);

      // Stale managed hook should be removed
      expect(stopCommands.some((cmd: string) => cmd.includes('old_hook.ts'))).toBe(false);
      // Current managed hook should remain
      expect(stopCommands.some((cmd: string) => cmd.includes('auto_commit_stop.ts'))).toBe(true);
      // User's custom hook should be preserved (NOT in managed, never touched)
      expect(stopCommands).toContain(userCommand);
    });

    it('should preserve hooks.json structure (version, other events) during cleanup', async () => {
      testProjectPath = appPath('test-hooks-structure');
      await fs.ensureDir(path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit'));
      await fs.writeFile(
        path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'auto_commit_stop.ts'),
        '// placeholder'
      );

      const hooksFile = homePath('.cursor', 'hooks', 'hooks.json');
      const realCommand = `npx tsx ${path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'auto_commit_stop.ts').replace(/\\/g, '/')}`.replace(/\\/g, '\\\\');
      const staleCommand = `npx tsx ${path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'old_hook.ts').replace(/\\/g, '/')}`.replace(/\\/g, '\\\\');

      // Write hooks.json with version, multiple events, and extra fields
      await fs.ensureDir(path.dirname(hooksFile));
      await fs.writeJson(hooksFile, {
        version: 1,
        hooks: {
          stop: [
            { command: realCommand },
            { command: staleCommand },
          ],
          beforeSubmitPrompt: [
            { command: 'bun run /home/testuser/my-context-hook.js' },
          ],
        },
      }, { spaces: 2 });

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'auto-commit',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              hooks: {
                stop: [
                  'npx tsx .dev-pomogator/tools/auto-commit/auto_commit_stop.ts',
                  'npx tsx .dev-pomogator/tools/auto-commit/old_hook.ts',
                ],
              },
            },
          },
        }],
      });

      await runCheckUpdate();

      const hooks = await fs.readJson(hooksFile);

      // version field should be preserved
      expect(hooks.version).toBe(1);

      // beforeSubmitPrompt event (not managed) should be untouched
      expect(hooks.hooks.beforeSubmitPrompt).toBeDefined();
      expect(hooks.hooks.beforeSubmitPrompt.length).toBe(1);
      expect(hooks.hooks.beforeSubmitPrompt[0].command).toBe('bun run /home/testuser/my-context-hook.js');

      // stop event: stale removed, real kept
      const stopCommands = hooks.hooks.stop.map((h: any) => h.command);
      expect(stopCommands.some((cmd: string) => cmd.includes('auto_commit_stop.ts'))).toBe(true);
      expect(stopCommands.some((cmd: string) => cmd.includes('old_hook.ts'))).toBe(false);
    });

    it('should remove stale Claude hook from settings.json and preserve user hooks', async () => {
      testProjectPath = appPath('test-claude-hooks');
      await fs.ensureDir(path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit'));
      await fs.writeFile(
        path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'auto_commit_stop.ts'),
        '// placeholder'
      );

      const settingsPath = path.join(testProjectPath, '.claude', 'settings.json');

      // Pre-populate settings.json with managed hooks + user hook
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, {
        hooks: {
          Stop: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'npx tsx .dev-pomogator/tools/auto-commit/auto_commit_stop.ts', timeout: 60 }],
            },
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'npx tsx .dev-pomogator/tools/auto-commit/old_claude_hook.ts', timeout: 60 }],
            },
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'python3 /home/testuser/my-user-hook.py', timeout: 30 }],
            },
          ],
        },
      }, { spaces: 2 });

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'auto-commit',
          version: '0.0.1',
          platform: 'claude',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              hooks: {
                Stop: [
                  'npx tsx .dev-pomogator/tools/auto-commit/auto_commit_stop.ts',
                  'npx tsx .dev-pomogator/tools/auto-commit/old_claude_hook.ts',
                ],
              },
            },
          },
        }],
      });

      await runCheckUpdate('--claude');

      const settings = await fs.readJson(settingsPath);
      const stopEntries = settings.hooks?.Stop ?? [];
      const allCommands = stopEntries.flatMap((entry: any) =>
        (entry.hooks ?? []).map((h: any) => h.command)
      );

      // Stale managed hook should be removed
      expect(allCommands).not.toContain('npx tsx .dev-pomogator/tools/auto-commit/old_claude_hook.ts');
      // Current managed hook should remain
      expect(allCommands.some((cmd: string) => cmd.includes('auto_commit_stop.ts'))).toBe(true);
      // User's custom hook should be preserved
      expect(allCommands).toContain('python3 /home/testuser/my-user-hook.py');
    });

    it('should preserve non-hook settings in Claude settings.json during update', async () => {
      testProjectPath = appPath('test-claude-settings-integrity');
      await fs.ensureDir(path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit'));
      await fs.writeFile(
        path.join(testProjectPath, '.dev-pomogator', 'tools', 'auto-commit', 'auto_commit_stop.ts'),
        '// placeholder'
      );

      const settingsPath = path.join(testProjectPath, '.claude', 'settings.json');

      // Pre-populate settings.json with hooks AND other user settings
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, {
        permissions: {
          allow: ['Read', 'Write'],
          deny: ['WebFetch'],
        },
        model: 'claude-sonnet-4-20250514',
        customInstructions: 'Always respond in Russian',
        hooks: {
          Stop: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'npx tsx .dev-pomogator/tools/auto-commit/auto_commit_stop.ts', timeout: 60 }],
            },
          ],
        },
      }, { spaces: 2 });

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'auto-commit',
          version: '0.0.1',
          platform: 'claude',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              hooks: {
                Stop: [
                  'npx tsx .dev-pomogator/tools/auto-commit/auto_commit_stop.ts',
                ],
              },
            },
          },
        }],
      });

      await runCheckUpdate('--claude');

      const settings = await fs.readJson(settingsPath);

      // Non-hook settings should be fully preserved
      expect(settings.permissions).toEqual({
        allow: ['Read', 'Write'],
        deny: ['WebFetch'],
      });
      expect(settings.model).toBe('claude-sonnet-4-20250514');
      expect(settings.customInstructions).toBe('Always respond in Russian');

      // Hooks should still work
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.Stop).toBeDefined();
      expect(settings.hooks.Stop.length).toBeGreaterThan(0);
    });

    it('should not delete files outside project (path traversal protection)', async () => {
      testProjectPath = appPath('test-path-traversal');
      const toolsDir = path.join(testProjectPath, '.dev-pomogator', 'tools', 'specs-generator');
      await fs.ensureDir(toolsDir);
      await fs.writeFile(path.join(toolsDir, 'scaffold-spec.ps1'), '# OLD');

      // Create a sentinel file outside the project
      const sentinelPath = appPath('sentinel-do-not-delete.txt');
      await fs.writeFile(sentinelPath, 'SENTINEL');

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'specs-workflow',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              tools: [
                '.dev-pomogator/tools/specs-generator/scaffold-spec.ps1',
                '../sentinel-do-not-delete.txt',
              ],
            },
          },
        }],
      });

      await runCheckUpdate();

      // Sentinel file outside project should NOT be deleted
      expect(await fs.pathExists(sentinelPath)).toBe(true);

      // Cleanup sentinel
      await fs.remove(sentinelPath);
    });

    it('should not delete any files on first update (managed = undefined)', async () => {
      testProjectPath = appPath('test-first-update');
      const commandsDir = path.join(testProjectPath, '.cursor', 'commands');
      await fs.ensureDir(commandsDir);

      // Create an unrelated file that should survive (not in managed list)
      const unrelatedFile = path.join(commandsDir, 'user-custom-command.md');
      await fs.writeFile(unrelatedFile, '# User custom command');
      await fs.writeFile(path.join(commandsDir, 'suggest-rules.md'), '# OLD');

      // No managed field — simulates first update
      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'suggest-rules',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          // No managed field
        }],
      });

      await runCheckUpdate();

      // User's custom file should NOT be deleted (empty previous list = nothing to remove)
      expect(await fs.pathExists(unrelatedFile)).toBe(true);

      // Config should now have managed field populated
      const config = await getDevPomogatorConfig();
      const ext = config?.installedExtensions.find((e: any) => e.name === 'suggest-rules');
      const managed = (ext as any)?.managed?.[testProjectPath];
      expect(managed).toBeDefined();
      expect(managed.commands).toBeDefined();
      expect(managed.commands.length).toBeGreaterThan(0);
    });

    it('should store hashes in managed entries after update', async () => {
      testProjectPath = appPath('test-hash-storage');
      const commandsDir = path.join(testProjectPath, '.cursor', 'commands');
      await fs.ensureDir(commandsDir);

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'suggest-rules',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
        }],
      });

      await runCheckUpdate();

      const config = await getDevPomogatorConfig();
      const ext = config?.installedExtensions.find((e: any) => e.name === 'suggest-rules');
      const managed = (ext as any)?.managed?.[testProjectPath];
      expect(managed).toBeDefined();
      expect(managed.commands).toBeDefined();
      expect(managed.commands.length).toBeGreaterThan(0);

      // Each entry should be { path, hash } with a non-empty hash
      for (const entry of managed.commands) {
        expect(typeof entry).toBe('object');
        expect(entry.path).toBeDefined();
        expect(typeof entry.path).toBe('string');
        expect(entry.hash).toBeDefined();
        expect(typeof entry.hash).toBe('string');
        expect(entry.hash.length).toBe(64); // SHA-256 hex = 64 chars
      }
    });

    it('should backup user-modified rule to .dev-pomogator/.user-overrides/ and overwrite with upstream', async () => {
      testProjectPath = appPath('test-user-modified-rule');
      const rulesDir = path.join(testProjectPath, '.cursor', 'rules', 'pomogator');
      await fs.ensureDir(rulesDir);

      const ruleFile = path.join(rulesDir, 'specs-management.mdc');
      const originalContent = '# Original rule from extension';
      const userModifiedContent = '# Original rule from extension\n\n## My custom additions\n- Custom rule 1';

      // Write the original file
      await fs.writeFile(ruleFile, originalContent, 'utf-8');

      // Compute hash of original content (simulates what updater stored)
      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256').update(originalContent, 'utf-8').digest('hex');

      // Setup config with managed entry including the hash
      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'specs-workflow',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              rules: [
                { path: '.cursor/rules/pomogator/specs-management.mdc', hash: originalHash },
              ],
            },
          },
        }],
      });

      // User modifies the rule file
      await fs.writeFile(ruleFile, userModifiedContent, 'utf-8');

      await runCheckUpdate();

      // 1. Backup should exist in .dev-pomogator/.user-overrides/
      const backupPath = path.join(testProjectPath, '.dev-pomogator', '.user-overrides', '.cursor', 'rules', 'pomogator', 'specs-management.mdc');
      expect(await fs.pathExists(backupPath)).toBe(true);

      // 2. Backup should contain user's modified content
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      expect(backupContent).toBe(userModifiedContent);

      // 3. Rule file should be overwritten with upstream (new version from GitHub)
      const updatedContent = await fs.readFile(ruleFile, 'utf-8');
      expect(updatedContent).not.toBe(userModifiedContent);
    });

    it('should NOT backup unmodified files during update', async () => {
      testProjectPath = appPath('test-unmodified-no-backup');
      const commandsDir = path.join(testProjectPath, '.cursor', 'commands');
      await fs.ensureDir(commandsDir);

      const cmdFile = path.join(commandsDir, 'suggest-rules.md');
      const originalContent = '# Suggest rules command';

      // Write the original file
      await fs.writeFile(cmdFile, originalContent, 'utf-8');

      // Compute hash of original content
      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256').update(originalContent, 'utf-8').digest('hex');

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'suggest-rules',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              commands: [
                { path: '.cursor/commands/suggest-rules.md', hash: originalHash },
              ],
            },
          },
        }],
      });

      // Do NOT modify the file — it stays at original content

      await runCheckUpdate();

      // No .dev-pomogator/.user-overrides/ directory should be created
      const overridesDir = path.join(testProjectPath, '.dev-pomogator', '.user-overrides');
      expect(await fs.pathExists(overridesDir)).toBe(false);
    });

    it('should backup user-modified file when migrating from old schema (no hashes)', async () => {
      testProjectPath = appPath('test-migration-backup');
      const rulesDir = path.join(testProjectPath, '.cursor', 'rules', 'pomogator');
      await fs.ensureDir(rulesDir);

      const ruleFile = path.join(rulesDir, 'specs-management.mdc');
      const userContent = '# My custom rule content that differs from upstream';
      await fs.writeFile(ruleFile, userContent, 'utf-8');

      // Old config format: managed entries are plain strings (no hashes)
      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'specs-workflow',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              rules: ['.cursor/rules/pomogator/specs-management.mdc'],
            },
          },
        }],
      });

      await runCheckUpdate();

      // Since no hash was stored (migration), and file exists with content,
      // it should be treated as potentially modified and backed up
      const backupPath = path.join(testProjectPath, '.dev-pomogator', '.user-overrides', '.cursor', 'rules', 'pomogator', 'specs-management.mdc');
      expect(await fs.pathExists(backupPath)).toBe(true);

      const backupContent = await fs.readFile(backupPath, 'utf-8');
      expect(backupContent).toBe(userContent);
    });

    it('should create update report when files are backed up', async () => {
      // Clean previous report to ensure isolation
      const reportPath = homePath('.dev-pomogator', 'last-update-report.md');
      await fs.remove(reportPath);

      testProjectPath = appPath('test-update-report');
      const rulesDir = path.join(testProjectPath, '.cursor', 'rules', 'pomogator');
      await fs.ensureDir(rulesDir);

      const ruleFile = path.join(rulesDir, 'specs-management.mdc');
      const originalContent = '# Original';
      await fs.writeFile(ruleFile, originalContent, 'utf-8');

      const crypto = await import('crypto');
      const originalHash = crypto.createHash('sha256').update(originalContent, 'utf-8').digest('hex');

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'specs-workflow',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              rules: [
                { path: '.cursor/rules/pomogator/specs-management.mdc', hash: originalHash },
              ],
            },
          },
        }],
      });

      // User modifies the file
      await fs.writeFile(ruleFile, '# Modified by user', 'utf-8');

      await runCheckUpdate();

      // Report should exist (reportPath already declared above for cleanup)
      expect(await fs.pathExists(reportPath)).toBe(true);

      const reportContent = await fs.readFile(reportPath, 'utf-8');
      expect(reportContent).toContain('Update Report');
      expect(reportContent).toContain('.cursor/rules/pomogator/specs-management.mdc');
      expect(reportContent).toContain('specs-workflow');
      expect(reportContent).toContain('.dev-pomogator/.user-overrides');
    });

    it('should mirror .dev-pomogator/.user-overrides/ structure to match original file paths', async () => {
      testProjectPath = appPath('test-overrides-structure');
      const rulesDir = path.join(testProjectPath, '.cursor', 'rules', 'pomogator');
      const toolsDir = path.join(testProjectPath, '.dev-pomogator', 'tools', 'specs-generator');
      await fs.ensureDir(rulesDir);
      await fs.ensureDir(toolsDir);

      const ruleFile = path.join(rulesDir, 'specs-management.mdc');
      const toolFile = path.join(toolsDir, 'scaffold-spec.ps1');
      const ruleContent = '# Rule original';
      const toolContent = '# Tool original';
      await fs.writeFile(ruleFile, ruleContent, 'utf-8');
      await fs.writeFile(toolFile, toolContent, 'utf-8');

      const crypto = await import('crypto');
      const ruleHash = crypto.createHash('sha256').update(ruleContent, 'utf-8').digest('hex');
      const toolHash = crypto.createHash('sha256').update(toolContent, 'utf-8').digest('hex');

      await setupConfigForUpdate({
        autoUpdate: true,
        cooldownHours: 24,
        lastCheck: hoursAgo(25),
        installedExtensions: [{
          name: 'specs-workflow',
          version: '0.0.1',
          platform: 'cursor',
          projectPaths: [testProjectPath],
          managed: {
            [testProjectPath]: {
              rules: [
                { path: '.cursor/rules/pomogator/specs-management.mdc', hash: ruleHash },
              ],
              tools: [
                { path: '.dev-pomogator/tools/specs-generator/scaffold-spec.ps1', hash: toolHash },
              ],
            },
          },
        }],
      });

      // User modifies both files
      await fs.writeFile(ruleFile, '# User modified rule', 'utf-8');
      await fs.writeFile(toolFile, '# User modified tool', 'utf-8');

      await runCheckUpdate();

      // Check .dev-pomogator/.user-overrides/ mirrors the exact directory structure
      const ruleBackup = path.join(testProjectPath, '.dev-pomogator', '.user-overrides', '.cursor', 'rules', 'pomogator', 'specs-management.mdc');
      const toolBackup = path.join(testProjectPath, '.dev-pomogator', '.user-overrides', '.dev-pomogator', 'tools', 'specs-generator', 'scaffold-spec.ps1');

      expect(await fs.pathExists(ruleBackup)).toBe(true);
      expect(await fs.pathExists(toolBackup)).toBe(true);

      expect(await fs.readFile(ruleBackup, 'utf-8')).toBe('# User modified rule');
      expect(await fs.readFile(toolBackup, 'utf-8')).toBe('# User modified tool');
    });
  });
});
