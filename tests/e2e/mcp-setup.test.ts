import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { homePath, appPath } from './helpers';

const MCP_SETUP_SCRIPT = 'extensions/specs-workflow/tools/mcp-setup/setup-mcp.py';

/**
 * Run the MCP setup script
 */
function runMcpSetup(args: string = ''): { output: string; exitCode: number } {
  try {
    const output = execSync(`python ${MCP_SETUP_SCRIPT} ${args}`, {
      encoding: 'utf-8',
      cwd: appPath(),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
    });
    return { output, exitCode: 0 };
  } catch (error: any) {
    return {
      output: error.stdout || error.stderr || error.message,
      exitCode: error.status || 1,
    };
  }
}

/**
 * Get global MCP config path for platform
 */
function getGlobalMcpConfigPath(platform: 'cursor' | 'claude'): string {
  if (platform === 'cursor') {
    return homePath('.cursor', 'mcp.json');
  }
  return homePath('.claude.json');
}

/**
 * Get project MCP config path for platform
 */
function getProjectMcpConfigPath(platform: 'cursor' | 'claude'): string {
  if (platform === 'cursor') {
    return appPath('.cursor', 'mcp.json');
  }
  return appPath('.mcp.json');
}

/**
 * Load MCP config
 */
async function loadMcpConfig(configPath: string): Promise<any> {
  if (await fs.pathExists(configPath)) {
    return await fs.readJson(configPath);
  }
  return { mcpServers: {} };
}

describe('PLUGIN005: MCP Setup', () => {
  beforeEach(async () => {
    // Clean up MCP configs before each test
    await fs.remove(homePath('.cursor', 'mcp.json'));
    await fs.remove(homePath('.cursor', 'mcp.json.backup'));
    await fs.remove(homePath('.claude.json'));
    await fs.remove(homePath('.claude.json.backup'));
    await fs.remove(appPath('.cursor', 'mcp.json'));
    await fs.remove(appPath('.cursor', 'mcp.json.backup'));
    await fs.remove(appPath('.mcp.json'));
    await fs.remove(appPath('.mcp.json.backup'));
  });

  afterAll(async () => {
    // Clean up after all tests
    await fs.remove(homePath('.cursor', 'mcp.json'));
    await fs.remove(homePath('.cursor', 'mcp.json.backup'));
    await fs.remove(homePath('.claude.json'));
    await fs.remove(homePath('.claude.json.backup'));
    await fs.remove(appPath('.cursor', 'mcp.json'));
    await fs.remove(appPath('.cursor', 'mcp.json.backup'));
    await fs.remove(appPath('.mcp.json'));
    await fs.remove(appPath('.mcp.json.backup'));
  });

  describe('Check mode', () => {
    it('should detect missing MCP servers', async () => {
      const { output } = runMcpSetup('--platform cursor --check');
      
      expect(output).toContain('MISSING');
      expect(output).toContain('context7');
      expect(output).toContain('octocode');
    });

    it('should detect installed MCP servers', async () => {
      // Pre-install context7
      const configPath = getGlobalMcpConfigPath('cursor');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, {
        mcpServers: {
          context7: {
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp@latest']
          }
        }
      });

      const { output } = runMcpSetup('--platform cursor --check');
      
      expect(output).toContain('[OK] context7');
      expect(output).toContain('[MISSING] octocode');
    });

    it('should detect prefixed MCP servers (user-context7)', async () => {
      // Pre-install with "user-" prefix (common in Cursor)
      const configPath = getGlobalMcpConfigPath('cursor');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, {
        mcpServers: {
          'user-context7': {
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp@latest']
          },
          'user-octocode': {
            command: 'npx',
            args: ['-y', 'octocode-mcp@latest']
          }
        }
      });

      const { output } = runMcpSetup('--platform cursor --check');
      
      // Should detect as already installed (prefixed variant)
      expect(output).toContain('[OK] context7');
      expect(output).toContain('[OK] octocode');
      expect(output).not.toContain('[MISSING]');
    });
  });

  describe('Install mode', () => {
    it('should install context7 and octocode to cursor config', async () => {
      const { output, exitCode } = runMcpSetup('--platform cursor');
      
      expect(exitCode).toBe(0);
      expect(output).toContain('[NPX]');
      expect(output).toContain('@upstash/context7-mcp@latest');
      expect(output).toContain('octocode-mcp@latest');
      expect(output).toContain('context7');
      expect(output).toContain('octocode');
      expect(output).toContain('SAVED');

      const config = await loadMcpConfig(getGlobalMcpConfigPath('cursor'));
      expect(config.mcpServers.context7.command).toBe('npx');
      expect(config.mcpServers.context7.args).toEqual(['-y', '@upstash/context7-mcp@latest']);
      expect(config.mcpServers.octocode.command).toBe('npx');
      expect(config.mcpServers.octocode.args).toEqual(['-y', 'octocode-mcp@latest']);
    });

    it('should install to project cursor config when present', async () => {
      const projectConfigPath = getProjectMcpConfigPath('cursor');
      await fs.ensureDir(path.dirname(projectConfigPath));
      await fs.writeJson(projectConfigPath, {
        mcpServers: {
          'my-project-mcp': {
            command: 'node',
            args: ['project-server.js']
          }
        }
      });

      const globalConfigPath = getGlobalMcpConfigPath('cursor');
      await fs.ensureDir(path.dirname(globalConfigPath));
      const globalConfigBefore = {
        mcpServers: {
          'global-only': {
            command: 'node',
            args: ['global-server.js']
          }
        }
      };
      await fs.writeJson(globalConfigPath, globalConfigBefore);

      runMcpSetup('--platform cursor');

      // Personal-pomogator FR-9: setup-mcp ALWAYS writes to global, never to project.
      // Project config stays untouched; global config gets our servers alongside existing ones.
      const projectConfig = await loadMcpConfig(projectConfigPath);
      expect(projectConfig.mcpServers).toHaveProperty('my-project-mcp');
      expect(projectConfig.mcpServers).not.toHaveProperty('context7');
      expect(projectConfig.mcpServers).not.toHaveProperty('octocode');

      const globalConfigAfter = await loadMcpConfig(globalConfigPath);
      expect(globalConfigAfter.mcpServers).toHaveProperty('global-only');
      expect(globalConfigAfter.mcpServers).toHaveProperty('context7');
      expect(globalConfigAfter.mcpServers).toHaveProperty('octocode');
    });

    it('should install MCP to claude config', async () => {
      const { output, exitCode } = runMcpSetup('--platform claude');
      
      expect(exitCode).toBe(0);
      expect(output).toContain('[NPX]');
      expect(output).toContain('@upstash/context7-mcp@latest');
      expect(output).toContain('octocode-mcp@latest');

      const config = await loadMcpConfig(getGlobalMcpConfigPath('claude'));
      expect(config.mcpServers.context7.command).toBe('npx');
      expect(config.mcpServers.context7.args).toEqual(['-y', '@upstash/context7-mcp@latest']);
      expect(config.mcpServers.octocode.command).toBe('npx');
      expect(config.mcpServers.octocode.args).toEqual(['-y', 'octocode-mcp@latest']);
    });

    it('should install to project .mcp.json when present for Claude Code', async () => {
      const projectConfigPath = getProjectMcpConfigPath('claude');
      await fs.writeJson(projectConfigPath, {
        mcpServers: {
          'my-project-mcp': {
            command: 'node',
            args: ['project-server.js']
          }
        }
      });

      const globalConfigPath = getGlobalMcpConfigPath('claude');
      const globalConfigBefore = {
        mcpServers: {
          'global-only': {
            command: 'node',
            args: ['global-server.js']
          }
        }
      };
      await fs.writeJson(globalConfigPath, globalConfigBefore);

      runMcpSetup('--platform claude');

      // Personal-pomogator FR-9: setup-mcp ALWAYS writes to global, never to project.
      // Project config stays untouched; global config gets our servers alongside existing ones.
      const projectConfig = await loadMcpConfig(projectConfigPath);
      expect(projectConfig.mcpServers).toHaveProperty('my-project-mcp');
      expect(projectConfig.mcpServers).not.toHaveProperty('context7');
      expect(projectConfig.mcpServers).not.toHaveProperty('octocode');

      const globalConfigAfter = await loadMcpConfig(globalConfigPath);
      expect(globalConfigAfter.mcpServers).toHaveProperty('global-only');
      expect(globalConfigAfter.mcpServers).toHaveProperty('context7');
      expect(globalConfigAfter.mcpServers).toHaveProperty('octocode');
    });

    it('should skip already installed MCP servers', async () => {
      // First install
      runMcpSetup('--platform cursor');
      
      // Second install
      const { output } = runMcpSetup('--platform cursor');
      
      expect(output).toContain('[OK] context7: already installed');
      expect(output).toContain('[OK] octocode: already installed');
    });

    it('should force reinstall with --force flag', async () => {
      // First install
      runMcpSetup('--platform cursor');
      
      // Force reinstall
      const { output } = runMcpSetup('--platform cursor --force');
      
      expect(output).toContain('[NPX]');
      expect(output).toContain('@upstash/context7-mcp@latest');
      expect(output).toContain('octocode-mcp@latest');
      expect(output).toContain('[FORCE] context7');
      expect(output).toContain('[FORCE] octocode');
    });
  });

  describe('Merge with existing config', () => {
    it('should preserve existing MCP servers when adding new ones', async () => {
      // Create existing config with custom server
      const configPath = getGlobalMcpConfigPath('cursor');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, {
        mcpServers: {
          'my-custom-mcp': {
            command: 'node',
            args: ['my-server.js']
          }
        }
      });

      // Run install
      runMcpSetup('--platform cursor');

      // Check that both servers exist
      const config = await loadMcpConfig(getGlobalMcpConfigPath('cursor'));
      expect(config.mcpServers).toHaveProperty('my-custom-mcp');
      expect(config.mcpServers).toHaveProperty('context7');
      expect(config.mcpServers).toHaveProperty('octocode');
    });

    it('should preserve other properties in .claude.json', async () => {
      // .claude.json has other properties besides mcpServers
      const configPath = getGlobalMcpConfigPath('claude');
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, {
        theme: 'dark',
        onboardingComplete: true,
        mcpServers: {}
      });

      // Run install
      runMcpSetup('--platform claude');

      // Check that other properties are preserved
      const config = await loadMcpConfig(getGlobalMcpConfigPath('claude'));
      expect(config.theme).toBe('dark');
      expect(config.onboardingComplete).toBe(true);
      expect(config.mcpServers).toHaveProperty('context7');
    });

    it('should restore .claude.json from backup when missing', async () => {
      const backupPath = homePath('.claude.json.backup');
      await fs.ensureDir(path.dirname(backupPath));
      await fs.writeJson(backupPath, {
        theme: 'dark',
        mcpServers: {
          'my-custom-mcp': {
            command: 'node',
            args: ['my-server.js']
          }
        }
      });

      await fs.remove(homePath('.claude.json'));

      const { output, exitCode } = runMcpSetup('--platform claude');
      expect(exitCode).toBe(0);
      expect(output).toContain('[RESTORE]');

      const config = await loadMcpConfig(getGlobalMcpConfigPath('claude'));
      expect(config.theme).toBe('dark');
      expect(config.mcpServers).toHaveProperty('my-custom-mcp');
      expect(config.mcpServers).toHaveProperty('context7');
    });
  });

  describe('Both platforms', () => {
    it('should install to both cursor and claude with --platform both', async () => {
      const { exitCode } = runMcpSetup('--platform both');

      expect(exitCode).toBe(0);

      const cursorConfig = await loadMcpConfig(getGlobalMcpConfigPath('cursor'));
      const claudeConfig = await loadMcpConfig(getGlobalMcpConfigPath('claude'));

      expect(cursorConfig.mcpServers).toHaveProperty('context7');
      expect(cursorConfig.mcpServers).toHaveProperty('octocode');
      expect(claudeConfig.mcpServers).toHaveProperty('context7');
      expect(claudeConfig.mcpServers).toHaveProperty('octocode');
    });
  });

  describe('Invalid JSON recovery', () => {
    it('should auto-fix trailing comma without needing backup', async () => {
      const configPath = getGlobalMcpConfigPath('cursor');
      await fs.ensureDir(path.dirname(configPath));

      // Write JSON with trailing comma (real user scenario)
      await fs.writeFile(configPath, JSON.stringify({
        mcpServers: {
          'my-custom': { command: 'node', args: ['srv.js'] }
        }
      }, null, 2).replace('}\n  }', '},\n  }'), 'utf-8');

      const { output, exitCode } = runMcpSetup('--platform cursor');

      expect(exitCode).toBe(0);
      expect(output).toContain('[WARN] Fixed trailing commas');
      expect(output).not.toContain('[RESTORE]');

      const config = await loadMcpConfig(configPath);
      expect(config.mcpServers).toHaveProperty('my-custom');
      expect(config.mcpServers).toHaveProperty('context7');
      expect(config.mcpServers).toHaveProperty('octocode');
    });

    // Obsolete under personal-pomogator FR-9: setup-mcp no longer reads or writes
    // project config at all (force-global). Project file is untouched, so there's
    // nothing for setup-mcp to recover. Kept as documentation of removed behavior.
    it.skip('should auto-fix trailing comma in project config [obsolete: FR-9 force-global]', async () => {
      // Intentionally empty — FR-9 removed project-first read/write path.
    });

    it('should restore from backup when config is completely broken', async () => {
      const configPath = getGlobalMcpConfigPath('claude');
      const backupPath = configPath + '.backup';
      await fs.ensureDir(path.dirname(configPath));

      // Write garbage content
      await fs.writeFile(configPath, 'not json at all {{{', 'utf-8');

      // Write valid backup
      await fs.writeJson(backupPath, {
        theme: 'dark',
        mcpServers: {}
      });

      const { output, exitCode } = runMcpSetup('--platform claude');

      expect(exitCode).toBe(0);
      expect(output).toContain('[WARN]');
      expect(output).toContain('[RESTORE]');

      const config = await loadMcpConfig(configPath);
      expect(config.theme).toBe('dark');
      expect(config.mcpServers).toHaveProperty('context7');
    });

    it('should fail gracefully when config is garbage and no backup exists', async () => {
      const configPath = getGlobalMcpConfigPath('claude');
      await fs.ensureDir(path.dirname(configPath));

      // Write garbage content, no backup
      await fs.writeFile(configPath, 'not json at all', 'utf-8');

      const { output, exitCode } = runMcpSetup('--platform claude');

      expect(exitCode).not.toBe(0);
      // Post personal-pomogator FR-9: [INFO] print precedes the load; either message
      // indicates the expected error path (runtime error bubbles up).
      expect(output).toMatch(/Failed to read MCP config|personal mode/);
    });
  });
});
