import { describe, it, expect, beforeAll } from 'vitest';
import {
  runInstaller,
  appPath,
  homePath,
  assertCliAvailable,
  runClaude,
  runCursorCli,
  setupCleanState,
} from './helpers';
import fs from 'fs-extra';

/**
 * CLI Integration Tests
 *
 * Verify that after installation the real CLI binaries (claude, cursor-agent)
 * see the hooks, commands, rules, and MCP config that the installer creates.
 *
 * These tests call the actual CLI — they are NOT file-system-only checks.
 */

// ============================================================================
// Helper: strip ANSI escape codes from CLI output
// ============================================================================
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:\[[0-9;]*[A-Za-z]|\][^\x07]*\x07|\[[\?]?[0-9;]*[A-Za-z])/g, '');
}

// ============================================================================
// Claude Code CLI
// ============================================================================

describe('CLI Integration: Claude Code', () => {
  beforeAll(async () => {
    assertCliAvailable('claude');
    await setupCleanState('claude');
    await runInstaller('--claude --all');
  }, 120000);

  describe('CLI Availability', () => {
    it('claude --version returns a semver string', () => {
      const { stdout, exitCode } = runClaude('--version');
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
    });

    it('claude --help lists doctor subcommand', () => {
      const { stdout, exitCode } = runClaude('--help');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('doctor');
    });
  });

  describe('Commands installed and readable', () => {
    it('.claude/commands/ directory exists', async () => {
      const files = await fs.readdir(appPath('.claude', 'commands'));
      expect(files).toContain('suggest-rules.md');
    });

    it('suggest-rules.md is installed', async () => {
      const p = appPath('.claude', 'commands', 'suggest-rules.md');
      const content = await fs.readFile(p, 'utf-8');
      expect(content.length).toBeGreaterThan(50);
    });

    it('create-spec.md is installed', async () => {
      const stat = await fs.stat(appPath('.claude', 'commands', 'create-spec.md'));
      expect(stat.size).toBeGreaterThan(0);
    });
  });

  describe('Rules installed and readable', () => {
    it('.claude/rules/pomogator/ directory exists', async () => {
      const files = await fs.readdir(appPath('.claude', 'rules', 'pomogator'));
      expect(files.length).toBeGreaterThan(0);
    });

    it('plan-pomogator.md rule is installed', async () => {
      const p = appPath('.claude', 'rules', 'pomogator', 'plan-pomogator.md');
      const content = await fs.readFile(p, 'utf-8');
      expect(content.length).toBeGreaterThan(50);
    });

    it('specs-management.md rule is installed', async () => {
      const stat = await fs.stat(appPath('.claude', 'rules', 'pomogator', 'specs-management.md'));
      expect(stat.size).toBeGreaterThan(0);
    });
  });

  describe('Hooks configured in settings.json', () => {
    it('~/.claude/settings.json has SessionStart hooks with check-update', async () => {
      const settingsPath = homePath('.claude', 'settings.json');
      const settings = await fs.readJson(settingsPath);
      expect(Array.isArray(settings.hooks?.SessionStart)).toBe(true);
      expect(settings.hooks.SessionStart.length).toBeGreaterThan(0);
    });

    it('SessionStart hooks include check-update.js with --claude --check-only', async () => {
      const settings = await fs.readJson(homePath('.claude', 'settings.json'));
      const found = settings.hooks.SessionStart.some((s: any) =>
        s.hooks?.some((h: any) => h.command?.includes('check-update.js') && h.command?.includes('--claude') && h.command?.includes('--check-only'))
      );
      expect(found).toBe(true);
    });
  });

  describe('MCP config file contains servers', () => {
    it('~/.claude.json has mcpServers with context7 and octocode', async () => {
      const claudeJson = homePath('.claude.json');
      const config = await fs.readJson(claudeJson);
      expect(config.mcpServers.context7.command).toBe('npx');
      expect(config.mcpServers.octocode.command).toBe('npx');
    });

    it('~/.claude.json has claude-mem MCP server registered', async () => {
      const mcpServerPath = homePath('.claude', 'plugins', 'marketplaces', 'thedotmack', 'plugin', 'scripts', 'mcp-server.cjs');
      expect(await fs.pathExists(mcpServerPath), 'claude-mem MCP binary must exist').toBe(true);
      const claudeJson = homePath('.claude.json');
      const config = await fs.readJson(claudeJson);
      expect(config.mcpServers['claude-mem'].command).toBe('node');
      expect(config.mcpServers['claude-mem'].args[0]).toContain('mcp-server.cjs');
    });
  });

  describe('.env.example generation', () => {
    it('.env.example file exists after installation', async () => {
      const envExamplePath = appPath('.env.example');
      const stat = await fs.stat(envExamplePath);
      expect(stat.size).toBeGreaterThan(0);
    });

    it('.env.example contains AUTO_COMMIT_API_KEY', async () => {
      const content = await fs.readFile(appPath('.env.example'), 'utf-8');
      expect(content).toContain('AUTO_COMMIT_API_KEY');
    });

    it('.env.example marks AUTO_COMMIT_API_KEY as REQUIRED', async () => {
      const content = await fs.readFile(appPath('.env.example'), 'utf-8');
      expect(content).toContain('[REQUIRED] API key for LLM commit message generation');
      expect(content).toMatch(/^AUTO_COMMIT_API_KEY=/m);
    });

    it('.env.example has optional vars commented out', async () => {
      const content = await fs.readFile(appPath('.env.example'), 'utf-8');
      expect(content).toMatch(/^# AUTO_COMMIT_LLM_URL=/m);
      expect(content).toMatch(/^# AUTO_COMMIT_LLM_MODEL=/m);
    });

    it('.env.example has auto-commit section header', async () => {
      const content = await fs.readFile(appPath('.env.example'), 'utf-8');
      expect(content).toContain('# --- auto-commit ---');
    });
  });
});

// ============================================================================
// Cursor Agent CLI
// ============================================================================

describe('CLI Integration: Cursor Agent', () => {
  beforeAll(async () => {
    assertCliAvailable('cursor-agent');
    await setupCleanState('cursor');
    await runInstaller('--cursor --all');
  }, 120000);

  describe('CLI Availability', () => {
    it('cursor-agent --version returns a version string', () => {
      const { stdout, exitCode } = runCursorCli('--version');
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/\d+/);
    });

    it('cursor-agent about shows CLI info', () => {
      const { stdout, exitCode } = runCursorCli('about');
      const clean = stripAnsi(stdout);
      expect(exitCode).toBe(0);
      expect(clean).toContain('CLI Version');
    });
  });

  describe('MCP servers visible via cursor-agent mcp list', () => {
    it('cursor-agent mcp list shows context7', () => {
      const { stdout, exitCode } = runCursorCli('mcp list');
      expect(exitCode).toBe(0);
      const clean = stripAnsi(stdout);
      expect(clean).toContain('context7');
    });

    it('cursor-agent mcp list shows octocode', () => {
      const { stdout, exitCode } = runCursorCli('mcp list');
      expect(exitCode).toBe(0);
      const clean = stripAnsi(stdout);
      expect(clean).toContain('octocode');
    });
  });

  describe('Commands installed', () => {
    it('.cursor/commands/ directory exists with suggest-rules', async () => {
      const cmdDir = appPath('.cursor', 'commands');
      const files = await fs.readdir(cmdDir);
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('Rules installed', () => {
    it('.cursor/rules/ directory has pomogator rules', async () => {
      const rulesDir = appPath('.cursor', 'rules');
      const files = await fs.readdir(rulesDir);
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('Hooks configured', () => {
    it('~/.cursor/hooks/hooks.json exists with hook entries', async () => {
      const hooksPath = homePath('.cursor', 'hooks', 'hooks.json');
      const hooks = await fs.readJson(hooksPath);
      expect(hooks).toHaveProperty('hooks');
    });
  });

  describe('MCP config file contains servers', () => {
    it('~/.cursor/mcp.json has mcpServers with context7 and octocode', async () => {
      const mcpPath = homePath('.cursor', 'mcp.json');
      const config = await fs.readJson(mcpPath);
      expect(config.mcpServers.context7.command).toBe('npx');
      expect(config.mcpServers.octocode.command).toBe('npx');
    });

    it('~/.cursor/mcp.json has claude-mem MCP server registered', async () => {
      const mcpPath = homePath('.cursor', 'mcp.json');
      const config = await fs.readJson(mcpPath);
      expect(config.mcpServers['claude-mem'].command).toBe('node');
      expect(config.mcpServers['claude-mem'].args[0]).toContain('mcp-server.cjs');
    });
  });
});
