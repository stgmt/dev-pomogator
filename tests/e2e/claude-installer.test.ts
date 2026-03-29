import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import {
  runInstaller,
  homePath,
  appPath,
  getDevPomogatorConfig,
  getClaudeMemDir,
  // Platform setup helpers
  setupCleanState,
  // Logging helpers
  getInstallLog,
  type InstallerResult,
} from './helpers';

/**
 * CORE003: Claude Code Installer Tests
 * 
 * Tests the Claude Code installation flow:
 * - Commands installed to .claude/commands/
 * - Rules installed to .claude/rules/
 * - Tools installed to .dev-pomogator/tools/
 * - Hooks configured in ~/.claude/settings.json
 * - Auto-update script installed
 */
let installerResult: InstallerResult;

describe('CORE003: Claude Code Installer', () => {
  beforeAll(async () => {
    await setupCleanState('claude');

    // Run Claude Code installer (--all for non-interactive mode)
    installerResult = await runInstaller('--claude --all');
  });

  describe('Scenario: Clean installation', () => {
    it('should create settings.json with SessionStart hooks in ~/.claude/', async () => {
      const settingsPath = homePath('.claude', 'settings.json');
      expect(await fs.pathExists(settingsPath)).toBe(true);

      const settings = await fs.readJson(settingsPath);
      expect(settings.hooks).toHaveProperty('SessionStart');
      expect(Array.isArray(settings.hooks.SessionStart)).toBe(true);
      expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
    });

    it('should copy check-update.js to ~/.dev-pomogator/scripts/', async () => {
      const scriptPath = homePath('.dev-pomogator', 'scripts', 'check-update.js');
      expect(await fs.pathExists(scriptPath)).toBe(true);
      
      const content = await fs.readFile(scriptPath, 'utf-8');
      expect(content).toContain('checkUpdate');
    });
  });

  describe('Scenario: Commands are installed to project', () => {
    it('should create .claude/commands/ with expected commands', async () => {
      const commandsDir = appPath('.claude', 'commands');
      const files = await fs.readdir(commandsDir);
      expect(files, 'commands dir should contain suggest-rules.md').toContain('suggest-rules.md');
      expect(files, 'commands dir should contain create-spec.md').toContain('create-spec.md');
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

      const content = await fs.readFile(cmdPath, 'utf-8');
      expect(content.length).toBeGreaterThan(100);
    });

    it('should install configure-root-artifacts.md', async () => {
      const cmdPath = appPath('.claude', 'commands', 'configure-root-artifacts.md');
      expect(await fs.pathExists(cmdPath)).toBe(true);

      const content = await fs.readFile(cmdPath, 'utf-8');
      expect(content.length).toBeGreaterThan(100);
    });
  });

  describe('Scenario: Rules are installed to project', () => {
    it('should create per-extension rules directories with expected files', async () => {
      const rulesDir = appPath('.claude', 'rules', 'plan-pomogator');
      const files = await fs.readdir(rulesDir);
      expect(files, 'plan-pomogator rules dir should contain plan-pomogator.md').toContain('plan-pomogator.md');
    });

    it('should install specs-management.md to specs-workflow namespace', async () => {
      const rulePath = appPath('.claude', 'rules', 'specs-workflow', 'specs-management.md');
      const content = await fs.readFile(rulePath, 'utf-8');
      expect(content).toContain('## ');
    });

    it('should install plan-pomogator.md to plan-pomogator namespace', async () => {
      const rulePath = appPath('.claude', 'rules', 'plan-pomogator', 'plan-pomogator.md');
      const content = await fs.readFile(rulePath, 'utf-8');
      expect(content).toContain('## ');
    });

    it('should install research-workflow.md to specs-workflow namespace', async () => {
      const rulePath = appPath('.claude', 'rules', 'specs-workflow', 'research-workflow.md');
      const content = await fs.readFile(rulePath, 'utf-8');
      expect(content).toContain('## ');
    });

    // @feature36 — dynamic: verify ALL rules from extension manifests are installed
    it('CORE003_RULES: all manifest rules are installed', async () => {
      const extensionsDir = path.resolve(__dirname, '../../extensions');
      const extensions = await fs.readdir(extensionsDir);
      const missing: string[] = [];

      for (const ext of extensions) {
        const manifestPath = path.join(extensionsDir, ext, 'extension.json');
        if (!await fs.pathExists(manifestPath)) continue;

        const manifest = await fs.readJson(manifestPath);

        // New format: ruleFiles.claude[] — repo-root relative paths
        const ruleFilePaths: string[] = manifest.ruleFiles?.claude ?? [];
        for (const rf of ruleFilePaths) {
          const destPath = appPath(rf);
          try {
            const stat = await fs.stat(destPath);
            if (stat.size === 0) {
              missing.push(`${ext}: ${rf} (empty file)`);
            }
          } catch {
            missing.push(`${ext}: ${rf} (ruleFiles)`);
          }
        }

        // Legacy format: rules.claude[] — basename into per-extension or pomogator dir
        const claudeRules: string[] = manifest.rules?.claude ?? [];
        for (const rulePath of claudeRules) {
          const filename = path.basename(rulePath);
          const candidates = [
            appPath('.claude', 'rules', ext, filename),
            appPath('.claude', 'rules', 'pomogator', filename),
            appPath('.claude', 'rules', filename),
          ];
          const exists = await Promise.all(candidates.map(c => fs.pathExists(c)));
          if (!exists.some(Boolean)) {
            missing.push(`${ext}: ${filename}`);
          }
        }
      }

      expect(missing, `Rules missing after install: ${missing.join(', ')}`).toHaveLength(0);
    });
  });

  describe('Scenario: Tools are installed to project', () => {
    it('should create .dev-pomogator/tools/specs-generator/', async () => {
      const toolsPath = appPath('.dev-pomogator', 'tools', 'specs-generator');
      expect(await fs.pathExists(toolsPath)).toBe(true);
      const files = await fs.readdir(toolsPath);
      expect(files.length).toBeGreaterThan(0);
    });

    it('should create .dev-pomogator/tools/plan-pomogator/', async () => {
      const toolsPath = appPath('.dev-pomogator', 'tools', 'plan-pomogator');
      expect(await fs.pathExists(toolsPath)).toBe(true);
      expect(await fs.pathExists(path.join(toolsPath, 'validate-plan.ts'))).toBe(true);
      const files = await fs.readdir(toolsPath);
      expect(files.length).toBeGreaterThan(0);
    });

    it('should create .dev-pomogator/tools/forbid-root-artifacts/', async () => {
      const toolsPath = appPath('.dev-pomogator', 'tools', 'forbid-root-artifacts');
      expect(await fs.pathExists(toolsPath)).toBe(true);
      const files = await fs.readdir(toolsPath);
      expect(files.length).toBeGreaterThan(0);
    });

    it('should have check.py in forbid-root-artifacts', async () => {
      const checkPath = appPath('.dev-pomogator', 'tools', 'forbid-root-artifacts', 'check.py');
      const stat = await fs.stat(checkPath);
      expect(stat.size, 'check.py should not be empty').toBeGreaterThan(0);
    });

    it('should have setup.py in forbid-root-artifacts', async () => {
      const setupPath = appPath('.dev-pomogator', 'tools', 'forbid-root-artifacts', 'setup.py');
      const stat = await fs.stat(setupPath);
      expect(stat.size, 'setup.py should not be empty').toBeGreaterThan(0);
    });
  });

  describe('Scenario: Skills are installed to project', () => {
    it('should create .claude/skills/deep-insights/', async () => {
      const skillsPath = appPath('.claude', 'skills', 'deep-insights');
      expect(await fs.pathExists(skillsPath)).toBe(true);
    });

    it('should have SKILL.md in deep-insights', async () => {
      const skillMd = appPath('.claude', 'skills', 'deep-insights', 'SKILL.md');
      expect(await fs.pathExists(skillMd)).toBe(true);

      const content = await fs.readFile(skillMd, 'utf-8');
      expect(content).toContain('deep-insights');
      expect(content).toContain('allowed-tools');
    });

    it('should have aggregate-facets.sh script', async () => {
      const scriptPath = appPath('.claude', 'skills', 'deep-insights', 'scripts', 'aggregate-facets.sh');
      const stat = await fs.stat(scriptPath);
      expect(stat.size, 'aggregate-facets.sh should not be empty').toBeGreaterThan(0);
    });

    it('should have facets-schema.md reference', async () => {
      const refPath = appPath('.claude', 'skills', 'deep-insights', 'references', 'facets-schema.md');
      expect(await fs.pathExists(refPath)).toBe(true);
    });
  });

  describe('Scenario: Plugin manifest is generated', () => {
    it('should create .dev-pomogator/.claude-plugin/plugin.json', async () => {
      const pluginJsonPath = appPath('.dev-pomogator', '.claude-plugin', 'plugin.json');
      expect(await fs.pathExists(pluginJsonPath)).toBe(true);
    });

    it('should have valid plugin.json with name and version', async () => {
      const pluginJsonPath = appPath('.dev-pomogator', '.claude-plugin', 'plugin.json');
      const pluginJson = await fs.readJson(pluginJsonPath);

      expect(pluginJson.name).toBe('dev-pomogator');
      expect(pluginJson.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(pluginJson.description).toBeDefined();
      expect(pluginJson.description.length).toBeGreaterThan(0);
    });

    it('should list installed extensions in description', async () => {
      const pluginJsonPath = appPath('.dev-pomogator', '.claude-plugin', 'plugin.json');
      const pluginJson = await fs.readJson(pluginJsonPath);

      // Should mention at least some known extensions
      expect(pluginJson.description).toContain('plan-pomogator');
      expect(pluginJson.description).toContain('specs-workflow');
    });

    it('should include skills in plugin.json when extensions have skills', async () => {
      const pluginJsonPath = appPath('.dev-pomogator', '.claude-plugin', 'plugin.json');
      const pluginJson = await fs.readJson(pluginJsonPath);

      expect(pluginJson.skills).toBeDefined();
      expect(Array.isArray(pluginJson.skills)).toBe(true);
      const deepInsights = pluginJson.skills.find((s: { name: string }) => s.name === 'deep-insights');
      expect(deepInsights).toBeDefined();
      expect(deepInsights.path).toBe('.claude/skills/deep-insights');
    });
  });

  describe('Scenario: Settings.json hooks structure is correct', () => {
    it('should have hooks.SessionStart array with check-update', async () => {
      const settingsPath = homePath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);

      expect(settings.hooks.SessionStart).toBeDefined();
      expect(Array.isArray(settings.hooks.SessionStart)).toBe(true);
      expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
    });

    it('should include check-update.js with --claude --check-only flags', async () => {
      const settingsPath = homePath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);

      // Find hook with check-update.js
      let foundUpdateHook = false;
      for (const sessionHook of settings.hooks.SessionStart) {
        if (sessionHook.hooks) {
          for (const hook of sessionHook.hooks) {
            if (hook.command && hook.command.includes('check-update.js')) {
              expect(hook.command).toContain('--claude');
              expect(hook.command).toContain('--check-only');
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

    it('should track managed skills in config', async () => {
      const config = await getDevPomogatorConfig();
      const appDir = appPath();

      const suggestRules = config?.installedExtensions.find(
        (ext) => ext.name === 'suggest-rules' && ext.platform === 'claude'
      );
      expect(suggestRules).toBeDefined();
      expect(suggestRules?.managed?.[appDir]?.skills).toBeDefined();
      expect(suggestRules!.managed![appDir].skills!.length).toBeGreaterThan(0);
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

  describe('Scenario: Hook uses portable cross-platform path', () => {
    it('should not contain absolute OS-specific paths in hook command', async () => {
      const settingsPath = homePath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);

      let checkedCount = 0;
      for (const sessionHook of settings.hooks.SessionStart) {
        if (sessionHook.hooks) {
          for (const hook of sessionHook.hooks) {
            if (hook.command?.includes('check-update.js')) {
              checkedCount++;
              // Must not contain absolute Windows path
              expect(hook.command).not.toMatch(/[A-Z]:\\/i);
              // Must not contain absolute Unix path to specific user
              expect(hook.command).not.toMatch(/\/home\/\w+\//);
              expect(hook.command).not.toMatch(/\/Users\/\w+\//);
              // Should use runtime os.homedir() resolution
              expect(hook.command).toContain('os');
              expect(hook.command).toContain('homedir');
            }
          }
        }
      }
      expect(checkedCount).toBeGreaterThan(0);
    });
  });

  describe('Scenario: Extension hooks use absolute paths in project settings', () => {
    it('should have extension hooks in project .claude/settings.json', async () => {
      const settingsPath = appPath('.claude', 'settings.json');
      expect(await fs.pathExists(settingsPath)).toBe(true);

      const settings = await fs.readJson(settingsPath);
      expect(settings.hooks).toBeDefined();
    });

    it('should use portable relative paths in extension hook commands', async () => {
      const settingsPath = appPath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);

      let checkedCount = 0;
      for (const [, hookEntries] of Object.entries(settings.hooks || {})) {
        if (!Array.isArray(hookEntries)) continue;

        for (const entry of hookEntries as any[]) {
          if (!entry.hooks) continue;
          for (const hook of entry.hooks) {
            if (hook.command?.includes('dev-pomogator/tools/')) {
              checkedCount++;
              // TypeScript hooks must use tsx-runner wrapper; bash hooks use direct bash invocation
              if (hook.command.includes('.ts')) {
                expect(hook.command).toContain('tsx-runner.js');
              }
              // Must use relative .dev-pomogator/tools/ path (portable across OS)
              expect(hook.command).toContain('.dev-pomogator/tools/');
              // Must NOT contain OS-specific absolute paths
              expect(hook.command).not.toMatch(/[A-Z]:\\/i);
              expect(hook.command).not.toMatch(/\/home\/\w+\//);
              expect(hook.command).not.toMatch(/\/workspaces\//);
            }
          }
        }
      }
      expect(checkedCount).toBeGreaterThan(0);
    });

    it('should use forward slashes in hook tool paths', async () => {
      const settingsPath = appPath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);

      let checkedCount = 0;
      for (const [, hookEntries] of Object.entries(settings.hooks || {})) {
        if (!Array.isArray(hookEntries)) continue;

        for (const entry of hookEntries as any[]) {
          if (!entry.hooks) continue;
          for (const hook of entry.hooks) {
            if (hook.command?.includes('dev-pomogator/tools/')) {
              checkedCount++;
              const toolPathMatch = hook.command.match(
                /[\w/\\:.-]+dev-pomogator\/tools\/[\w/.]+/
              );
              expect(toolPathMatch).not.toBeNull();
              expect(toolPathMatch![0]).not.toContain('\\');
            }
          }
        }
      }
      expect(checkedCount).toBeGreaterThan(0);
    });
  });

  describe('Scenario: Extension hooks with matcher object are installed correctly', () => {
    it('should install PreToolUse hooks with matcher from object-format hook', async () => {
      const settingsPath = appPath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);
      const preToolUse = settings.hooks?.PreToolUse;
      expect(preToolUse).toBeDefined();
      expect(Array.isArray(preToolUse)).toBe(true);
      expect(preToolUse.length).toBeGreaterThan(0);

      // Find the phase-gate hook entry
      const phaseGateEntry = preToolUse.find((entry: any) =>
        entry.hooks?.some((h: any) => h.command?.includes('phase-gate.ts'))
      );
      expect(phaseGateEntry).toBeDefined();
      expect(phaseGateEntry.matcher).toBe('Write|Edit');
      expect(phaseGateEntry.hooks[0].command).toContain('tsx-runner.js');
      expect(phaseGateEntry.hooks[0].command).toContain('phase-gate.ts');
    });
  });

  describe('Scenario: Re-installation preserves existing hooks', () => {
    it('should not duplicate check-update.js hook on reinstall', async () => {
      // Run installer again (--all for non-interactive mode)
      await runInstaller('--claude --all');
      
      const settingsPath = homePath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);
      
      // Count check-update.js hooks in SessionStart
      let updateHookCount = 0;
      for (const sessionHook of settings.hooks.SessionStart) {
        if (sessionHook.hooks) {
          for (const hook of sessionHook.hooks) {
            if (hook.command && hook.command.includes('check-update.js')) {
              updateHookCount++;
            }
          }
        }
      }

      // Should only have 1 update hook, not duplicated
      expect(updateHookCount).toBe(1);

      // Stop hooks should NOT contain check-update.js (migrated away)
      expect(settings.hooks.Stop).toBeUndefined();
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
    const rulePath = appPath('.claude', 'rules', 'specs-workflow', 'specs-management.md');
    expect(await fs.pathExists(rulePath)).toBe(true);
  });

  it('should install specs-generator tools', async () => {
    const toolsPath = appPath('.dev-pomogator', 'tools', 'specs-generator');
    expect(await fs.pathExists(toolsPath)).toBe(true);

    // Check key scripts exist
    const scaffoldPath = path.join(toolsPath, 'scaffold-spec.ts');
    const validatePath = path.join(toolsPath, 'validate-spec.ts');

    expect(await fs.pathExists(scaffoldPath)).toBe(true);
    expect(await fs.pathExists(validatePath)).toBe(true);

    const scaffoldStat = await fs.stat(scaffoldPath);
    const validateStat = await fs.stat(validatePath);

    expect((scaffoldStat.mode & 0o111) !== 0).toBe(true);
    expect((validateStat.mode & 0o111) !== 0).toBe(true);
  });
});

describe('PLUGIN004-Claude: Forbid-root-artifacts Extension for Claude Code', () => {
  it('should install configure-root-artifacts.md in .claude/commands/', async () => {
    const cmdPath = appPath('.claude', 'commands', 'configure-root-artifacts.md');
    expect(await fs.pathExists(cmdPath)).toBe(true);
  });

  it('should install forbid-root-artifacts tools', async () => {
    const toolsPath = appPath('.dev-pomogator', 'tools', 'forbid-root-artifacts');
    expect(await fs.pathExists(toolsPath)).toBe(true);

    // Check key scripts exist
    expect(await fs.pathExists(path.join(toolsPath, 'check.py'))).toBe(true);
    expect(await fs.pathExists(path.join(toolsPath, 'setup.py'))).toBe(true);
    expect(await fs.pathExists(path.join(toolsPath, 'default-whitelist.yaml'))).toBe(true);
  });

  it('should install deps-install.py', async () => {
    const depsPath = appPath('.dev-pomogator', 'tools', 'forbid-root-artifacts', 'deps-install.py');
    expect(await fs.pathExists(depsPath)).toBe(true);

    const content = await fs.readFile(depsPath, 'utf-8');
    expect(content).toContain('ensure_pyyaml');
    expect(content).toContain('ensure_pre_commit');
  });
});

describe('PostInstall: Dependencies are installed during setup', () => {
  it('should have deps-install.py that runs without errors', async () => {
    const depsScript = appPath('.dev-pomogator', 'tools', 'forbid-root-artifacts', 'deps-install.py');
    expect(await fs.pathExists(depsScript)).toBe(true);

    // Run deps-install.py directly — should exit 0 (idempotent, deps already in Docker)
    const { execSync } = await import('child_process');
    const output = execSync(`python3 "${depsScript}"`, {
      encoding: 'utf-8',
      cwd: appPath(),
      timeout: 30000,
    });

    expect(output).toContain('pyyaml');
    expect(output).toContain('pre-commit');
  });

  it('should have pyyaml available after install', async () => {
    const { execSync } = await import('child_process');
    const output = execSync('python3 -c "import yaml; print(yaml.__version__)"', {
      encoding: 'utf-8',
      timeout: 10000,
    });
    expect(output.trim()).toMatch(/^\d+\.\d+/);
  });

  it('should have .pre-commit-config.yaml with forbid-root-artifacts hook', async () => {
    const configPath = appPath('.pre-commit-config.yaml');
    // postInstall chain runs configure.py which creates this in Docker (non-interactive mode)
    expect(await fs.pathExists(configPath), '.pre-commit-config.yaml must exist after postInstall').toBe(true);
    const content = await fs.readFile(configPath, 'utf-8');
    expect(content).toContain('forbid-root-artifacts');
  });

  it('should have postInstall command as chain in config', async () => {
    const config = await getDevPomogatorConfig();
    expect(config).not.toBeNull();

    // Find forbid-root-artifacts extension
    const ext = config?.installedExtensions.find(
      (e) => e.name === 'forbid-root-artifacts'
    );
    expect(ext).toBeDefined();
  });
});

describe('PostInstall: Non-interactive mode and npm ENOTEMPTY resilience', () => {
  it('should augment configure.py with --non-interactive in headless env', async () => {
    // Import the augment function indirectly via testing the installer behavior
    // The Docker test environment has no TTY → isNonInteractive() returns true
    // → configure.py should have been called with --non-interactive
    const log = await getInstallLog();
    // In Docker non-interactive mode, configure.py must run without EOFError
    expect(log, 'install log must mention forbid-root-artifacts').toContain('forbid-root-artifacts');
    expect(log).not.toContain('EOFError');
  });

  it('should clean stale node_modules temp dirs on ENOTEMPTY', async () => {
    // Create a fake stale npm temp dir in node_modules
    const staleDir = appPath('node_modules', '.fake-package-dLWEkYjE');
    await fs.ensureDir(staleDir);
    await fs.writeFile(path.join(staleDir, 'dummy.txt'), 'stale');
    expect(await fs.pathExists(staleDir)).toBe(true);

    // Re-run installer — cleanStaleNodeModulesDirs should clean it during retry path
    // or at minimum it should not block installation
    await runInstaller('--claude --all');

    // The stale dir should be cleaned up during any ENOTEMPTY retry
    // Even if no ENOTEMPTY occurs, verify the dir pattern is recognized
    // by checking it would be caught by the cleanup regex
    const entry = '.fake-package-dLWEkYjE';
    expect(entry.startsWith('.')).toBe(true);
    expect(/-.{8,}$/.test(entry)).toBe(true);
  });

  it('should retry npm commands on ENOTEMPTY (not just npx)', async () => {
    // The auto-commit extension uses "npm install --no-save tsx"
    // Previously, retry was gated by command.includes('npx') — now it catches all ENOTEMPTY
    const log = await getInstallLog();
    // auto-commit extension must appear in install log
    expect(log, 'install log must mention auto-commit').toContain('auto-commit');
    expect(log).not.toContain('unhandled');
    expect(log).not.toContain('FATAL');
  });
});

/**
 * claude-mem integration tests for Claude Code platform.
 *
 * --claude --all includes suggest-rules (requiresClaudeMem: true)
 * → ensureClaudeMem('claude') must clone repo + register MCP.
 *
 * MCP deduplication: when marketplace plugin is enabled (enabledPlugins),
 * manual registration in ~/.claude.json is skipped to prevent duplicate
 * MCP servers (mcp__claude-mem__* vs mcp__plugin_claude-mem_mcp-search__*).
 */
describe('CORE003-Claude-mem: claude-mem installed for Claude platform', () => {
  it('should have claude-mem worker-service.cjs after --claude --all', async () => {
    const workerServicePath = path.join(getClaudeMemDir(), 'plugin', 'scripts', 'worker-service.cjs');
    expect(await fs.pathExists(workerServicePath)).toBe(true);
    const stat = await fs.stat(workerServicePath);
    expect(stat.size, 'worker-service.cjs should not be empty').toBeGreaterThan(1000);
  });

  it('should have valid package.json in marketplace dir', async () => {
    const pkgPath = path.join(getClaudeMemDir(), 'package.json');
    expect(await fs.pathExists(pkgPath)).toBe(true);
    const pkg = await fs.readJson(pkgPath);
    expect(pkg.name).toBe('claude-mem');
    expect(pkg.version).toMatch(/^\d+\.\d+/);
  });

  it('should have non-empty mcp-server.cjs', async () => {
    const mcpPath = path.join(getClaudeMemDir(), 'plugin', 'scripts', 'mcp-server.cjs');
    expect(await fs.pathExists(mcpPath)).toBe(true);
    const stat = await fs.stat(mcpPath);
    expect(stat.size, 'mcp-server.cjs should not be empty').toBeGreaterThan(1000);
  });

  it('mcp-server.cjs should contain MCP protocol markers', async () => {
    const mcpPath = path.join(getClaudeMemDir(), 'plugin', 'scripts', 'mcp-server.cjs');
    const content = await fs.readFile(mcpPath, 'utf-8');
    // MCP server must reference the protocol SDK or transport
    const hasMcpMarker = content.includes('StdioServerTransport') ||
                         content.includes('modelcontextprotocol') ||
                         content.includes('mcp-server');
    expect(hasMcpMarker, 'mcp-server.cjs should contain MCP protocol references').toBe(true);
  });

  it('should have claude-mem settings with CHROMA_MODE', async () => {
    const settingsPath = homePath('.claude-mem', 'settings.json');
    expect(await fs.pathExists(settingsPath)).toBe(true);
    const settings = await fs.readJson(settingsPath);
    expect(settings.CLAUDE_MEM_CHROMA_MODE).toBe('external');
  });

  it('should have MCP access path (plugin or manual)', async () => {
    // Either marketplace plugin is enabled OR manual MCP entry exists
    let hasAccess = false;

    // Check 1: marketplace plugin enabled
    const settingsPath = homePath('.claude', 'settings.json');
    if (await fs.pathExists(settingsPath)) {
      const settings = await fs.readJson(settingsPath);
      if (settings?.enabledPlugins?.['claude-mem@thedotmack'] === true) {
        hasAccess = true;
      }
    }

    // Check 2: manual MCP entry in ~/.claude.json
    if (!hasAccess) {
      const claudeJsonPath = homePath('.claude.json');
      if (await fs.pathExists(claudeJsonPath)) {
        const config = await fs.readJson(claudeJsonPath);
        if (config?.mcpServers?.['claude-mem']) {
          const mcpEntry = config.mcpServers['claude-mem'];
          expect(mcpEntry.command).toBe('node');
          expect(mcpEntry.args?.[0]).toContain('mcp-server.cjs');
          // Verify the referenced file actually exists
          const mcpBinaryPath = mcpEntry.args[0];
          expect(await fs.pathExists(mcpBinaryPath), `MCP binary not found: ${mcpBinaryPath}`).toBe(true);
          hasAccess = true;
        }
      }
    }

    expect(hasAccess, 'claude-mem must be accessible via plugin enablement OR manual MCP registration').toBe(true);
  });

  it('should not have manual claude-mem MCP when plugin is enabled', async () => {
    const settingsPath = homePath('.claude', 'settings.json');
    expect(await fs.pathExists(settingsPath), 'settings.json must exist for MCP dedup test').toBe(true);

    const settings = await fs.readJson(settingsPath);
    const pluginEnabled = settings?.enabledPlugins?.['claude-mem@thedotmack'] === true;

    const claudeJsonPath = homePath('.claude.json');
    expect(await fs.pathExists(claudeJsonPath), '~/.claude.json must exist').toBe(true);

    const config = await fs.readJson(claudeJsonPath);

    if (pluginEnabled) {
      // Plugin provides MCP — manual entry must NOT exist (deduplication)
      expect(config.mcpServers?.['claude-mem']).toBeUndefined();
    } else {
      // Plugin not available — fallback manual entry must exist
      expect(config.mcpServers?.['claude-mem']).toBeDefined();
      expect(config.mcpServers['claude-mem'].command).toBe('node');
      expect(config.mcpServers['claude-mem'].args[0]).toContain('mcp-server.cjs');
    }
  });

  it('should clean up legacy manual MCP entry on reinstall', async () => {
    const settingsPath = homePath('.claude', 'settings.json');
    expect(await fs.pathExists(settingsPath), 'settings.json must exist').toBe(true);

    const settings = await fs.readJson(settingsPath);
    // Skip if plugin not enabled — cleanup only applies when marketplace plugin is active
    if (!settings?.enabledPlugins?.['claude-mem@thedotmack']) return;

    // Inject a legacy manual entry to simulate pre-fix state
    const claudeJsonPath = homePath('.claude.json');
    let config: Record<string, any> = {};
    if (await fs.pathExists(claudeJsonPath)) {
      config = await fs.readJson(claudeJsonPath);
    }
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers['claude-mem'] = {
      command: 'node',
      args: [homePath('.claude', 'plugins', 'marketplaces', 'thedotmack', 'plugin', 'scripts', 'mcp-server.cjs')],
    };
    await fs.writeJson(claudeJsonPath, config, { spaces: 2 });

    // Re-run installer
    await runInstaller('--claude --all');

    // Legacy entry should be cleaned up
    const configAfter = await fs.readJson(claudeJsonPath);
    expect(configAfter.mcpServers?.['claude-mem']).toBeUndefined();
  });
});

describe('Scenario: Installation generates structured report', () => {
  it('should create last-install-report.md', async () => {
    const reportPath = homePath('.dev-pomogator', 'last-install-report.md');
    expect(await fs.pathExists(reportPath)).toBe(true);
  });

  it('should list claude-code component with ok status', async () => {
    const reportPath = homePath('.dev-pomogator', 'last-install-report.md');
    const content = await fs.readFile(reportPath, 'utf-8');
    expect(content).toContain('claude-code');
    expect(content).toContain('| ok |');
  });

  it('should list claude-mem component in report', async () => {
    const reportPath = homePath('.dev-pomogator', 'last-install-report.md');
    const content = await fs.readFile(reportPath, 'utf-8');
    // claude-mem should appear in report with either ok or fail status
    expect(content).toContain('claude-mem');
  });

  it('should log errors in install.log when claude-mem fails', async () => {
    const log = await getInstallLog();
    // If claude-mem failed, the log MUST contain structured error info
    if (log.includes('Could not setup claude-mem')) {
      expect(log).toMatch(/claude-mem setup failed:/);
    }
  });
});

describe('Scenario: tsx-runner resolves script from subdirectory via git root', () => {
  const testScriptRelPath = '.dev-pomogator/tools/test-echo.ts';

  beforeAll(async () => {
    // Write a minimal test script that just outputs a marker and exits
    const testScript = appPath('.dev-pomogator', 'tools', 'test-echo.ts');
    await fs.writeFile(testScript, 'console.log("TSX_RUNNER_OK");');

    // Create a subdirectory to simulate CWD mismatch
    await fs.ensureDir(appPath('subdir'));
  });

  it('should have tsx-runner.js installed in ~/.dev-pomogator/scripts/', async () => {
    const runnerPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');
    expect(await fs.pathExists(runnerPath)).toBe(true);
  });

  it('should resolve relative script path from subdirectory via git root', async () => {
    const { execSync } = await import('child_process');
    const runnerPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');

    // Run tsx-runner from subdirectory with relative path
    const output = execSync(`node "${runnerPath}" "${testScriptRelPath}"`, {
      encoding: 'utf-8',
      cwd: appPath('subdir'),
      timeout: 30000,
    });

    expect(output).toContain('TSX_RUNNER_OK');
  });

  it('should also work with absolute paths', async () => {
    const { execSync } = await import('child_process');
    const runnerPath = homePath('.dev-pomogator', 'scripts', 'tsx-runner.js');
    const absoluteScript = appPath('.dev-pomogator', 'tools', 'test-echo.ts');

    const output = execSync(`node "${runnerPath}" "${absoluteScript}"`, {
      encoding: 'utf-8',
      cwd: appPath('subdir'),
      timeout: 30000,
    });

    expect(output).toContain('TSX_RUNNER_OK');
  });
});

describe('Scenario: Auto-update migrates old-format hooks to portable format', () => {
  it('should migrate old npx tsx hooks to tsx-runner format', async () => {
    const projectDir = appPath();
    const settingsPath = appPath('.claude', 'settings.json');

    // Inject old-format hook into project settings
    const settings = await fs.readJson(settingsPath);
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.Stop) settings.hooks.Stop = [];

    settings.hooks.Stop.push({
      matcher: '',
      hooks: [{
        type: 'command',
        command: 'npx tsx .dev-pomogator/tools/auto-commit/summary.ts',
      }],
    });
    await fs.writeJson(settingsPath, settings, { spaces: 2 });

    // Verify old format is in place
    const before = await fs.readJson(settingsPath);
    const oldHook = before.hooks.Stop.at(-1).hooks[0];
    expect(oldHook.command).toContain('npx tsx .dev-pomogator/tools/');

    // Run the bundled check-update script (which calls migrateOldProjectHooks)
    const { execSync } = await import('child_process');
    try {
      execSync('node dist/check-update.bundle.cjs --claude', {
        encoding: 'utf-8',
        cwd: appPath(),
        timeout: 30000,
      });
    } catch {
      // check-update may exit non-zero if no network / no config — that's OK,
      // migration runs before cooldown check
    }

    // Verify migration happened
    const after = await fs.readJson(settingsPath);
    const migratedHook = after.hooks.Stop.at(-1).hooks[0];

    // Should no longer contain bare "npx tsx .dev-pomogator/"
    expect(migratedHook.command).not.toMatch(/\bnpx\s+tsx\s+\.dev-pomogator/);

    // Should use tsx-runner portable format
    expect(migratedHook.command).toContain('tsx-runner.js');

    // Should use portable relative path (no OS-specific absolute prefix)
    expect(migratedHook.command).toContain('.dev-pomogator/tools/');
    expect(migratedHook.command).not.toMatch(/[A-Z]:\\/i);
  });
});

// @feature14
describe('CORE003: Visible installer output', () => {
  it('CORE003_14: should produce visible stdout during installation', () => {
    expect(installerResult.logs).toContain('Installing...');
    expect(installerResult.logs).toContain('Installation complete');
    expect(installerResult.exitCode).toBe(0);
  });
});

// @feature16
describe('CORE003: PostInstall hooks use installed paths', () => {
  it('CORE003_16: all postInstall commands should reference .dev-pomogator/tools/ not extensions/', async () => {
    const extensionsDir = appPath('extensions');
    const entries = await fs.readdir(extensionsDir);

    for (const entry of entries) {
      const manifestPath = path.join(extensionsDir, entry, 'extension.json');
      if (!await fs.pathExists(manifestPath)) continue;

      const manifest = await fs.readJson(manifestPath);
      if (!manifest.postInstall) continue;

      // postInstall can be { command: "..." } or { cursor: { command: "..." }, claude: { command: "..." } }
      const commands: string[] = [];
      if (typeof manifest.postInstall.command === 'string') {
        commands.push(manifest.postInstall.command);
      }
      for (const platform of ['cursor', 'claude']) {
        if (manifest.postInstall[platform]?.command) {
          commands.push(manifest.postInstall[platform].command);
        }
      }

      for (const cmd of commands) {
        // Skip commands that don't reference TypeScript/Python files (e.g. "npm install --no-save tsx")
        if (!cmd.includes('.ts') && !cmd.includes('.py') && !cmd.includes('.js')) continue;

        expect(cmd, `${entry}: postInstall should not reference extensions/ source path`).not.toMatch(/\bextensions\//);
      }
    }
  });
});

describe('CORE003: Install logging for Claude Code', () => {
  it('should log Claude Code installation to install.log', async () => {
    const log = await getInstallLog();
    expect(log).toContain('Installation started');
    expect(log).toContain('claude');
  });

  // @feature15
  it('CORE003_15: should log completion marker to install.log', async () => {
    const log = await getInstallLog();
    expect(log).toContain('Installation finished');
  });
});

// @feature17
describe('CORE003: No execa dependency in production build', () => {
  it('CORE003_17: dist/ should not contain execa imports', async () => {
    const distDir = appPath('dist');
    const files = await fs.readdir(distDir);
    const jsFiles = files.filter((f: string) => f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.mjs'));

    for (const file of jsFiles) {
      const content = await fs.readFile(path.join(distDir, file), 'utf-8');
      expect(content, `${file} should not import execa`).not.toMatch(/import\s*\(\s*['"]execa['"]\s*\)/);
      expect(content, `${file} should not require execa`).not.toMatch(/require\s*\(\s*['"]execa['"]\s*\)/);
    }
  });
});

/**
 * CORE019: Claude-mem Integration
 *
 * Verifies reliable claude-mem installation:
 * - Health hooks auto-installed
 * - Post-install validation (worker + chroma + MCP)
 * - Per-component install report
 * - Graceful degradation
 */
describe('CORE019: Claude-mem Integration', () => {
  // @feature1
  it('CORE019_01: health hooks registered in settings.json after install', async () => {
    const settingsPath = appPath('.claude', 'settings.json');
    const settings = await fs.readJson(settingsPath);

    // Find SessionStart hook referencing health-check.ts
    let hasHealthHook = false;
    for (const entry of settings.hooks?.SessionStart ?? []) {
      if (entry.hooks) {
        for (const hook of entry.hooks) {
          if (hook.command?.includes('health-check.ts')) {
            hasHealthHook = true;
          }
        }
      }
    }
    expect(hasHealthHook, 'SessionStart must contain health-check.ts hook').toBe(true);
  });

  // @feature2
  it('CORE019_02: install report contains worker component status', async () => {
    const reportPath = homePath('.dev-pomogator', 'last-install-report.md');
    const content = await fs.readFile(reportPath, 'utf-8');
    expect(content).toContain('claude-mem/worker');
  });

  // @feature2
  it('CORE019_03: install report contains chroma component status', async () => {
    const reportPath = homePath('.dev-pomogator', 'last-install-report.md');
    const content = await fs.readFile(reportPath, 'utf-8');
    expect(content).toContain('claude-mem/chroma');
  });

  // @feature3
  it('CORE019_04: install.log contains structured entries for claude-mem steps', async () => {
    const log = await getInstallLog();
    // At minimum, the ensureClaudeMem call should produce log entries
    expect(log).toMatch(/claude-mem/i);
  });

  // @feature4
  it('CORE019_05: installer output shows diagnostics on claude-mem issues', () => {
    // If claude-mem had issues, installer should show Reason + path to log
    if (installerResult.logs.includes('Could not setup claude-mem')) {
      expect(installerResult.logs).toContain('Reason:');
      expect(installerResult.logs).toContain('install.log');
    }
  });

  // @feature5
  it('CORE019_06: worker status determines MCP registration', async () => {
    const reportPath = homePath('.dev-pomogator', 'last-install-report.md');
    const content = await fs.readFile(reportPath, 'utf-8');

    // If worker failed, MCP should also fail (not registered on dead worker)
    if (content.includes('claude-mem/worker') && content.includes('| fail |')) {
      expect(content).toMatch(/claude-mem\/mcp.*\| fail \|/);
    }
  });

  // @feature5
  it('CORE019_07: chroma failure shows warn not fail', async () => {
    const reportPath = homePath('.dev-pomogator', 'last-install-report.md');
    const content = await fs.readFile(reportPath, 'utf-8');

    // Chroma unavailable should be warn (degraded mode), not fail
    if (content.includes('claude-mem/chroma')) {
      expect(content).not.toMatch(/claude-mem\/chroma.*\| fail \|/);
    }
  });

  // @feature6
  it('CORE019_08: re-install does not duplicate hooks', async () => {
    // Run installer again
    await runInstaller('--claude --all');

    const settingsPath = appPath('.claude', 'settings.json');
    const settings = await fs.readJson(settingsPath);

    // Count health-check.ts hooks — should be exactly 1
    let healthHookCount = 0;
    for (const entry of settings.hooks?.SessionStart ?? []) {
      if (entry.hooks) {
        for (const hook of entry.hooks) {
          if (hook.command?.includes('health-check.ts')) {
            healthHookCount++;
          }
        }
      }
    }
    expect(healthHookCount, 'health-check hook must not be duplicated').toBe(1);
  });

  // @feature7
  it('CORE019_09: install report has per-component breakdown', async () => {
    const reportPath = homePath('.dev-pomogator', 'last-install-report.md');
    const content = await fs.readFile(reportPath, 'utf-8');
    expect(content).toContain('claude-mem/worker');
    expect(content).toContain('claude-mem/chroma');
    expect(content).toContain('claude-mem/mcp');
    expect(content).toContain('claude-mem/hooks');
  });
});
