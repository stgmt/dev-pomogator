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
      expect(output).toContain('npm cache clean --force');
      expect(output).toContain('npx -y @upstash/context7-mcp@latest --help');
      expect(output).toContain('npx -y octocode-mcp@latest --help');
      expect(output).toContain('context7');
      expect(output).toContain('octocode');
      expect(output).toContain('SAVED');

      const config = await loadMcpConfig(getGlobalMcpConfigPath('cursor'));
      expect(config.mcpServers.context7).toBeDefined();
      expect(config.mcpServers.context7.command).toBe('npx');
      expect(config.mcpServers.context7.args).toEqual(['-y', '@upstash/context7-mcp@latest']);
      expect(config.mcpServers.octocode).toBeDefined();
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

      const projectConfig = await loadMcpConfig(projectConfigPath);
      expect(projectConfig.mcpServers['my-project-mcp']).toBeDefined();
      expect(projectConfig.mcpServers.context7).toBeDefined();
      expect(projectConfig.mcpServers.octocode).toBeDefined();

      const globalConfigAfter = await loadMcpConfig(globalConfigPath);
      expect(globalConfigAfter).toEqual(globalConfigBefore);
    });

    it('should install MCP to claude config', async () => {
      const { output, exitCode } = runMcpSetup('--platform claude');
      
      expect(exitCode).toBe(0);
      expect(output).toContain('npm cache clean --force');
      expect(output).toContain('npx -y @upstash/context7-mcp@latest --help');
      expect(output).toContain('npx -y octocode-mcp@latest --help');

      const config = await loadMcpConfig(getGlobalMcpConfigPath('claude'));
      expect(config.mcpServers.context7).toBeDefined();
      expect(config.mcpServers.octocode).toBeDefined();
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

      const projectConfig = await loadMcpConfig(projectConfigPath);
      expect(projectConfig.mcpServers['my-project-mcp']).toBeDefined();
      expect(projectConfig.mcpServers.context7).toBeDefined();
      expect(projectConfig.mcpServers.octocode).toBeDefined();

      const globalConfigAfter = await loadMcpConfig(globalConfigPath);
      expect(globalConfigAfter).toEqual(globalConfigBefore);
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
      
      expect(output).toContain('npm cache clean --force');
      expect(output).toContain('npx -y @upstash/context7-mcp@latest --help');
      expect(output).toContain('npx -y octocode-mcp@latest --help');
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
      expect(config.mcpServers['my-custom-mcp']).toBeDefined();
      expect(config.mcpServers.context7).toBeDefined();
      expect(config.mcpServers.octocode).toBeDefined();
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
      expect(config.mcpServers.context7).toBeDefined();
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
      expect(config.mcpServers['my-custom-mcp']).toBeDefined();
      expect(config.mcpServers.context7).toBeDefined();
    });
  });

  describe('Both platforms', () => {
    it('should install to both cursor and claude with --platform both', async () => {
      const { exitCode } = runMcpSetup('--platform both');
      
      expect(exitCode).toBe(0);

      const cursorConfig = await loadMcpConfig(getGlobalMcpConfigPath('cursor'));
      const claudeConfig = await loadMcpConfig(getGlobalMcpConfigPath('claude'));

      expect(cursorConfig.mcpServers.context7).toBeDefined();
      expect(cursorConfig.mcpServers.octocode).toBeDefined();
      expect(claudeConfig.mcpServers.context7).toBeDefined();
      expect(claudeConfig.mcpServers.octocode).toBeDefined();
    });
  });
});
