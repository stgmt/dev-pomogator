import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { 
  runInstaller, 
  homePath, 
  appPath, 
  initGitRepo,
  getDevPomogatorConfig,
} from './helpers';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

/**
 * CORE003: Claude Code Installer Tests
 * 
 * Tests the Claude Code installation flow:
 * - Commands installed to .claude/commands/
 * - Rules installed to .claude/rules/
 * - Tools installed to tools/
 * - Hooks configured in ~/.claude/settings.json
 * - Auto-update script installed
 */
describe('CORE003: Claude Code Installer', () => {
  beforeAll(async () => {
    // Clean up any existing state
    await fs.remove(homePath('.claude'));
    await fs.remove(homePath('.dev-pomogator'));
    await fs.remove(appPath('.claude'));
    await fs.remove(appPath('tools'));
    
    // Copy fixture
    const fixture = path.join(FIXTURES_DIR, 'fixture');
    const cursorDir = homePath('.cursor');
    await fs.remove(cursorDir);
    await fs.copy(fixture, cursorDir);
    
    // Initialize git repo so findRepoRoot() works correctly
    await initGitRepo();
    
    // Run Claude Code installer
    await runInstaller('--claude');
  });

  describe('Scenario: Clean installation', () => {
    it('should create settings.json with Stop hooks in ~/.claude/', async () => {
      const settingsPath = homePath('.claude', 'settings.json');
      expect(await fs.pathExists(settingsPath)).toBe(true);
      
      const settings = await fs.readJson(settingsPath);
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.Stop).toBeDefined();
      expect(Array.isArray(settings.hooks.Stop)).toBe(true);
    });

    it('should copy check-update.js to ~/.dev-pomogator/scripts/', async () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'check-update.js');
      expect(await fs.pathExists(scriptPath)).toBe(true);
      
      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('checkUpdate');
    });
  });

  describe('Scenario: Commands are installed to project', () => {
    it('should create .claude/commands/ in project', async () => {
      const commandsDir = appPath('.claude', 'commands');
      expect(await fs.pathExists(commandsDir)).toBe(true);
    });

    it('should install suggest-rules.md', async () => {
      const cmdPath = appPath('.claude', 'commands', 'suggest-rules.md');
      expect(await fs.pathExists(cmdPath)).toBe(true);
      
      const content = await fs.readFile(cmdPath, 'utf-8');
      expect(content.length).toBeGreaterThan(100);
    });

    it('should install create-spec.md', async () => {
      const cmdPath = appPath('.claude', 'commands', 'create-spec.md');
      expect(await fs.pathExists(cmdPath)).toBe(true);
    });

    it('should install configure-root-artifacts.md', async () => {
      const cmdPath = appPath('.claude', 'commands', 'configure-root-artifacts.md');
      expect(await fs.pathExists(cmdPath)).toBe(true);
    });
  });

  describe('Scenario: Rules are installed to project', () => {
    it('should create .claude/rules/ in project', async () => {
      const rulesDir = appPath('.claude', 'rules');
      expect(await fs.pathExists(rulesDir)).toBe(true);
    });

    it('should install specs-management.md', async () => {
      const rulePath = appPath('.claude', 'rules', 'specs-management.md');
      expect(await fs.pathExists(rulePath)).toBe(true);
    });

    it('should install dev-plan.md', async () => {
      const rulePath = appPath('.claude', 'rules', 'dev-plan.md');
      expect(await fs.pathExists(rulePath)).toBe(true);
    });

    it('should install research-workflow.md', async () => {
      const rulePath = appPath('.claude', 'rules', 'research-workflow.md');
      expect(await fs.pathExists(rulePath)).toBe(true);
    });
  });

  describe('Scenario: Tools are installed to project', () => {
    it('should create tools/specs-generator/', async () => {
      const toolsPath = appPath('tools', 'specs-generator');
      expect(await fs.pathExists(toolsPath)).toBe(true);
    });

    it('should create tools/forbid-root-artifacts/', async () => {
      const toolsPath = appPath('tools', 'forbid-root-artifacts');
      expect(await fs.pathExists(toolsPath)).toBe(true);
    });

    it('should have check.py in forbid-root-artifacts', async () => {
      const checkPath = appPath('tools', 'forbid-root-artifacts', 'check.py');
      expect(await fs.pathExists(checkPath)).toBe(true);
    });

    it('should have setup.py in forbid-root-artifacts', async () => {
      const setupPath = appPath('tools', 'forbid-root-artifacts', 'setup.py');
      expect(await fs.pathExists(setupPath)).toBe(true);
    });
  });

  describe('Scenario: Settings.json hooks structure is correct', () => {
    it('should have hooks.Stop array', async () => {
      const settingsPath = homePath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);
      
      expect(settings.hooks.Stop).toBeDefined();
      expect(Array.isArray(settings.hooks.Stop)).toBe(true);
      expect(settings.hooks.Stop.length).toBeGreaterThan(0);
    });

    it('should include check-update.js with --claude flag', async () => {
      const settingsPath = homePath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);
      
      // Find hook with check-update.js
      let foundUpdateHook = false;
      for (const stopHook of settings.hooks.Stop) {
        if (stopHook.hooks) {
          for (const hook of stopHook.hooks) {
            if (hook.command && hook.command.includes('check-update.js')) {
              expect(hook.command).toContain('--claude');
              foundUpdateHook = true;
            }
          }
        }
      }
      expect(foundUpdateHook).toBe(true);
    });
  });

  describe('Scenario: Config tracks Claude Code installations', () => {
    it('should create ~/.dev-pomogator/config.json', async () => {
      const configPath = homePath('.dev-pomogator', 'config.json');
      expect(await fs.pathExists(configPath)).toBe(true);
    });

    it('should have installedExtensions with platform "claude"', async () => {
      const config = await getDevPomogatorConfig();
      expect(config).not.toBeNull();
      expect(config?.installedExtensions).toBeDefined();
      expect(Array.isArray(config?.installedExtensions)).toBe(true);
      
      // Check at least one extension has platform 'claude'
      const claudeExtensions = config?.installedExtensions.filter(
        (ext) => ext.platform === 'claude'
      );
      expect(claudeExtensions?.length).toBeGreaterThan(0);
    });

    it('should include project path in projectPaths', async () => {
      const config = await getDevPomogatorConfig();
      const appDir = appPath();
      
      // At least one extension should have this project path
      const hasProjectPath = config?.installedExtensions.some(
        (ext) => ext.projectPaths.includes(appDir)
      );
      expect(hasProjectPath).toBe(true);
    });
  });

  describe('Scenario: Re-installation preserves existing hooks', () => {
    it('should not duplicate check-update.js hook on reinstall', async () => {
      // Run installer again
      await runInstaller('--claude');
      
      const settingsPath = homePath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);
      
      // Count check-update.js hooks
      let updateHookCount = 0;
      for (const stopHook of settings.hooks.Stop) {
        if (stopHook.hooks) {
          for (const hook of stopHook.hooks) {
            if (hook.command && hook.command.includes('check-update.js')) {
              updateHookCount++;
            }
          }
        }
      }
      
      // Should only have 1 update hook, not duplicated
      expect(updateHookCount).toBe(1);
    });
  });
});

/**
 * Claude Code specific plugin tests
 */
describe('PLUGIN001-Claude: Suggest-rules Extension for Claude Code', () => {
  it('should install suggest-rules.md in .claude/commands/', async () => {
    const cmdPath = appPath('.claude', 'commands', 'suggest-rules.md');
    expect(await fs.pathExists(cmdPath)).toBe(true);
  });

  it('should have valid Claude Code command format', async () => {
    const cmdPath = appPath('.claude', 'commands', 'suggest-rules.md');
    const content = await fs.readFile(cmdPath, 'utf-8');
    
    // Should be markdown with headers
    expect(content).toMatch(/^#|^>/m);
  });
});

describe('PLUGIN003-Claude: Specs-workflow Extension for Claude Code', () => {
  it('should install create-spec.md in .claude/commands/', async () => {
    const cmdPath = appPath('.claude', 'commands', 'create-spec.md');
    expect(await fs.pathExists(cmdPath)).toBe(true);
  });

  it('should install specs-management.md rule', async () => {
    const rulePath = appPath('.claude', 'rules', 'specs-management.md');
    expect(await fs.pathExists(rulePath)).toBe(true);
  });

  it('should install specs-generator tools', async () => {
    const toolsPath = appPath('tools', 'specs-generator');
    expect(await fs.pathExists(toolsPath)).toBe(true);
    
    // Check key scripts exist
    expect(await fs.pathExists(path.join(toolsPath, 'scaffold-spec.ps1'))).toBe(true);
    expect(await fs.pathExists(path.join(toolsPath, 'validate-spec.ps1'))).toBe(true);
  });
});

describe('PLUGIN004-Claude: Forbid-root-artifacts Extension for Claude Code', () => {
  it('should install configure-root-artifacts.md in .claude/commands/', async () => {
    const cmdPath = appPath('.claude', 'commands', 'configure-root-artifacts.md');
    expect(await fs.pathExists(cmdPath)).toBe(true);
  });

  it('should install forbid-root-artifacts tools', async () => {
    const toolsPath = appPath('tools', 'forbid-root-artifacts');
    expect(await fs.pathExists(toolsPath)).toBe(true);
    
    // Check key scripts exist
    expect(await fs.pathExists(path.join(toolsPath, 'check.py'))).toBe(true);
    expect(await fs.pathExists(path.join(toolsPath, 'setup.py'))).toBe(true);
    expect(await fs.pathExists(path.join(toolsPath, 'default-whitelist.yaml'))).toBe(true);
  });
});
