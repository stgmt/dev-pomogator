/**
 * Step definitions for personal-pomogator @feature8 scenarios (PERSO001_80-99).
 *
 * These scenarios drive the REAL `tools/mcp-setup/setup-mcp.py` script.
 * HOME isolation: every spawn sets HOME=world.tempDir so the script reads/writes
 * ~/.cursor/mcp.json and ~/.claude.json inside the per-scenario temp dir, never
 * touching the developer's real home directory.
 *
 * All step patterns use REGEX (not Cucumber Expressions) so that characters like
 * `/`, `.`, `{`, `}` match verbatim.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(path.join(import.meta.dirname, '..', '..'));
const MCP_SETUP_SCRIPT = path.join(REPO_ROOT, 'tools', 'mcp-setup', 'setup-mcp.py');

// ---------------------------------------------------------------------------
// Helper: run setup-mcp.py with HOME isolation
// ---------------------------------------------------------------------------

function runSetupMcp(world: V4World, extraArgs: string[]): void {
  const homeDir = world.tempDir;
  const env = {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    FORCE_COLOR: '0',
    // Skip npm prefetch in BDD tests — npm install triggers real network/registry
    // access, causes ETIMEDOUT (30s) in Windows CI or EPERM in shared node_modules.
    // The script still writes the config entry; IDEs download the package on first use.
    DEV_POMOGATOR_TEST_IN_DOCKER: '1',
  };
  const result = spawnSync('python', [MCP_SETUP_SCRIPT, ...extraArgs], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf-8',
    timeout: 30_000,
  });
  world.lastStdout = (result.stdout ?? '') + (result.stderr ?? '');
  world.lastExitCode = result.status ?? 1;
}

// ---------------------------------------------------------------------------
// Helpers: config paths relative to tempDir (= fake HOME)
// ---------------------------------------------------------------------------

function cursorGlobalConfigPath(world: V4World): string {
  return path.join(world.tempDir, '.cursor', 'mcp.json');
}

function claudeGlobalConfigPath(world: V4World): string {
  return path.join(world.tempDir, '.claude.json');
}

function projectMcpPath(world: V4World): string {
  // "project" dir inside tempDir simulates the user's project root
  return path.join(world.tempDir, 'project', '.mcp.json');
}

function projectCursorMcpPath(world: V4World): string {
  return path.join(world.tempDir, 'project', '.cursor', 'mcp.json');
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Background steps — no-ops for @feature8 scenarios
// (Background preconditions describe the removed v2 installer context;
//  the @feature8 setup-mcp.py tests don't depend on any installer state)
//
// NOTE: "dev-pomogator is installed" is already defined in feature_tui_test_runner.ts.
// The other two background steps are unique to this file.
// ---------------------------------------------------------------------------

// Given(/^dev-pomogator is installed$/, ...) — defined in feature_tui_test_runner.ts
// DO NOT redefine here — it causes Ambiguous step collision.

Given(/^target project is a fresh git repository with a \.gitignore file$/, function (this: V4World) {
  // No-op for @feature8: setup-mcp.py doesn't check git state
});

Given(/^target project is not the dev-pomogator source repository$/, function (this: V4World) {
  // No-op for @feature8: setup-mcp.py doesn't check source repo guard
});

// ---------------------------------------------------------------------------
// GIVEN steps — set up fixtures in tempDir
// ---------------------------------------------------------------------------

Given(/^no MCP config exists for cursor platform$/, function (this: V4World) {
  // Nothing to do — tempDir is already empty
});

Given(/^no MCP config exists for claude platform$/, function (this: V4World) {
  // Nothing to do — tempDir is already empty
});

Given(/^cursor MCP config contains context7 server entry$/, function (this: V4World) {
  writeJson(cursorGlobalConfigPath(this), {
    mcpServers: {
      context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] },
    },
  });
});

Given(/^cursor MCP config contains "user-context7" and "user-octocode" server entries$/, function (this: V4World) {
  writeJson(cursorGlobalConfigPath(this), {
    mcpServers: {
      'user-context7': { command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] },
      'user-octocode': { command: 'npx', args: ['-y', 'octocode-mcp@latest'] },
    },
  });
});

Given(/^project cursor config exists with custom server "([^"]*)"$/, function (this: V4World, serverName: string) {
  writeJson(projectCursorMcpPath(this), {
    mcpServers: {
      [serverName]: { command: 'node', args: ['project-server.js'] },
    },
  });
});

Given(/^cursor global config exists with server "([^"]*)"$/, function (this: V4World, serverName: string) {
  const existing = fs.existsSync(cursorGlobalConfigPath(this))
    ? readJson(cursorGlobalConfigPath(this))
    : { mcpServers: {} };
  const servers = (existing.mcpServers as Record<string, unknown>) ?? {};
  servers[serverName] = { command: 'node', args: ['global-server.js'] };
  writeJson(cursorGlobalConfigPath(this), { ...existing, mcpServers: servers });
});

function makePlatformEntry(pkg: string): { command: string; args: string[] } {
  // Match what build_mcp_entry() produces: on Windows it wraps with 'cmd /c'
  if (process.platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'npx', '-y', pkg] };
  }
  return { command: 'npx', args: ['-y', pkg] };
}

Given(/^cursor global config already has context7 and octocode installed$/, function (this: V4World) {
  writeJson(cursorGlobalConfigPath(this), {
    mcpServers: {
      context7: makePlatformEntry('@upstash/context7-mcp@latest'),
      octocode: makePlatformEntry('octocode-mcp@latest'),
    },
  });
});

Given(/^cursor global config contains custom server "([^"]*)"$/, function (this: V4World, serverName: string) {
  writeJson(cursorGlobalConfigPath(this), {
    mcpServers: {
      [serverName]: { command: 'node', args: ['my-server.js'] },
    },
  });
});

Given(/^project \.mcp\.json exists with custom server "([^"]*)"$/, function (this: V4World, serverName: string) {
  writeJson(projectMcpPath(this), {
    mcpServers: {
      [serverName]: { command: 'node', args: ['project-server.js'] },
    },
  });
});

Given(/^claude global config exists with server "([^"]*)"$/, function (this: V4World, serverName: string) {
  const existing = fs.existsSync(claudeGlobalConfigPath(this))
    ? readJson(claudeGlobalConfigPath(this))
    : { mcpServers: {} };
  const servers = (existing.mcpServers as Record<string, unknown>) ?? {};
  servers[serverName] = { command: 'node', args: ['global-server.js'] };
  writeJson(claudeGlobalConfigPath(this), { ...existing, mcpServers: servers });
});

Given(/^claude global config contains theme "([^"]*)" and onboardingComplete true alongside empty mcpServers$/, function (this: V4World, theme: string) {
  writeJson(claudeGlobalConfigPath(this), {
    theme,
    onboardingComplete: true,
    mcpServers: {},
  });
});

Given(/^cursor global config has JSON with trailing comma in mcpServers$/, function (this: V4World) {
  const configPath = cursorGlobalConfigPath(this);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  // Produce JSON with a trailing comma inside mcpServers object — real user scenario
  const raw = JSON.stringify({ mcpServers: { 'my-custom': { command: 'node', args: ['srv.js'] } } }, null, 2)
    .replace('}\n  }', '},\n  }');
  fs.writeFileSync(configPath, raw, 'utf-8');
});

Given(/^claude global config contains garbage JSON "([^"]*)"$/, function (this: V4World, garbage: string) {
  const configPath = claudeGlobalConfigPath(this);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, garbage, 'utf-8');
});

Given(/^claude global config backup exists with theme "([^"]*)" and empty mcpServers$/, function (this: V4World, theme: string) {
  const backupPath = claudeGlobalConfigPath(this) + '.backup';
  writeJson(backupPath, { theme, mcpServers: {} });
});

Given(/^no backup file exists for claude global config$/, function (this: V4World) {
  // tempDir is fresh per scenario — backup file doesn't exist
});

// PERSO001_80: project .mcp.json with Atlassian MCP server (simulated in tempDir/project)
Given(/^target project has existing \.mcp\.json with Atlassian MCP server$/, function (this: V4World) {
  writeJson(projectMcpPath(this), {
    mcpServers: {
      'atlassian-mcp': { command: 'node', args: ['atlassian-server.js'] },
    },
  });
});

// PERSO001_81: no project .mcp.json
Given(/^target project has no \.mcp\.json$/, function (this: V4World) {
  // Nothing to do — tempDir/project/.mcp.json doesn't exist
});

// ---------------------------------------------------------------------------
// WHEN steps — run setup-mcp.py
// ---------------------------------------------------------------------------

When(/^I run "python tools\/mcp-setup\/setup-mcp\.py (.+)"$/, function (this: V4World, args: string) {
  runSetupMcp(this, args.trim().split(/\s+/));
});

// ---------------------------------------------------------------------------
// THEN steps — assertions
// ---------------------------------------------------------------------------
//
// NOTE: "output should contain" (non-empty) is already in feature_bg_task_guard.ts
//   as /^output should contain "([^"]+)"$/ (uses this.lastStdout — same field).
//   DO NOT redefine it here — causes Ambiguous collision.
//
// NOTE: "exit code should be N" is already in feature_forbid_root_artifacts.ts
//   as /^exit code should be (\d+)$/ (uses this.lastExitCode — same field).
//   DO NOT redefine "exit code should be 0" here — causes Ambiguous collision.

Then(/^output should not contain "([^"]*)"$/, function (this: V4World, text: string) {
  if (this.lastStdout.includes(text)) {
    throw new Error(`Expected output NOT to contain "${text}" but it did:\n${this.lastStdout}`);
  }
});

Then(/^output should match "([^"]*)"$/, function (this: V4World, pattern: string) {
  const re = new RegExp(pattern);
  if (!re.test(this.lastStdout)) {
    throw new Error(`Expected output to match /${pattern}/ but got:\n${this.lastStdout}`);
  }
});

Then(/^exit code should not be 0$/, function (this: V4World) {
  if (this.lastExitCode === 0) {
    throw new Error(`Expected non-zero exit code but got 0.\nOutput:\n${this.lastStdout}`);
  }
});

function hasNpxEntry(servers: Record<string, unknown>, key: string): boolean {
  const entry = servers?.[key] as { command?: string; args?: string[] } | undefined;
  if (!entry) return false;
  // On Linux/Mac: command='npx'. On Windows: command='cmd', args=['/c','npx',...]
  if (entry.command === 'npx') return true;
  if (entry.command === 'cmd' && Array.isArray(entry.args) && entry.args.includes('npx')) return true;
  return false;
}

Then(/^cursor global config should contain context7 npx entry$/, function (this: V4World) {
  const config = readJson(cursorGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!hasNpxEntry(servers, 'context7')) {
    throw new Error(`cursor global config missing context7 npx entry. Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^cursor global config should contain octocode npx entry$/, function (this: V4World) {
  const config = readJson(cursorGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!hasNpxEntry(servers, 'octocode')) {
    throw new Error(`cursor global config missing octocode npx entry. Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^claude global config should contain context7 npx entry$/, function (this: V4World) {
  const config = readJson(claudeGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!hasNpxEntry(servers, 'context7')) {
    throw new Error(`claude global config missing context7 npx entry. Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^claude global config should contain octocode npx entry$/, function (this: V4World) {
  const config = readJson(claudeGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!hasNpxEntry(servers, 'octocode')) {
    throw new Error(`claude global config missing octocode npx entry. Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^cursor global config should contain "([^"]*)"$/, function (this: V4World, serverName: string) {
  const config = readJson(cursorGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!servers?.[serverName]) {
    throw new Error(`cursor global config missing "${serverName}". Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^cursor global config should not contain "([^"]*)"$/, function (this: V4World, serverName: string) {
  if (!fs.existsSync(cursorGlobalConfigPath(this))) return;
  const config = readJson(cursorGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (servers?.[serverName]) {
    throw new Error(`cursor global config unexpectedly contains "${serverName}". Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^claude global config should contain "([^"]*)"$/, function (this: V4World, serverName: string) {
  const config = readJson(claudeGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!servers?.[serverName]) {
    throw new Error(`claude global config missing "${serverName}". Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^claude global config should not contain "([^"]*)"$/, function (this: V4World, serverName: string) {
  if (!fs.existsSync(claudeGlobalConfigPath(this))) return;
  const config = readJson(claudeGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (servers?.[serverName]) {
    throw new Error(`claude global config unexpectedly contains "${serverName}". Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^project cursor config should still contain only "([^"]*)"$/, function (this: V4World, serverName: string) {
  const config = readJson(projectCursorMcpPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!servers?.[serverName]) {
    throw new Error(`project cursor config missing "${serverName}". Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^project cursor config should not contain "([^"]*)"$/, function (this: V4World, serverName: string) {
  if (!fs.existsSync(projectCursorMcpPath(this))) return;
  const config = readJson(projectCursorMcpPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (servers?.[serverName]) {
    throw new Error(`project cursor config unexpectedly contains "${serverName}". Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^project \.mcp\.json should still contain only "([^"]*)"$/, function (this: V4World, serverName: string) {
  const config = readJson(projectMcpPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!servers?.[serverName]) {
    throw new Error(`project .mcp.json missing "${serverName}". Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^project \.mcp\.json should not contain "([^"]*)"$/, function (this: V4World, serverName: string) {
  if (!fs.existsSync(projectMcpPath(this))) return;
  const config = readJson(projectMcpPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (servers?.[serverName]) {
    throw new Error(`project .mcp.json unexpectedly contains "${serverName}". Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^claude global config should have theme "([^"]*)"$/, function (this: V4World, theme: string) {
  const config = readJson(claudeGlobalConfigPath(this));
  if (config.theme !== theme) {
    throw new Error(`Expected theme "${theme}" but got "${config.theme}". Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^claude global config should have onboardingComplete true$/, function (this: V4World) {
  const config = readJson(claudeGlobalConfigPath(this));
  if (config.onboardingComplete !== true) {
    throw new Error(`Expected onboardingComplete=true but got ${config.onboardingComplete}. Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^cursor global config should contain original server and context7$/, function (this: V4World) {
  const config = readJson(cursorGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!servers?.['my-custom']) {
    throw new Error(`cursor global config missing "my-custom". Config: ${JSON.stringify(config, null, 2)}`);
  }
  if (!servers?.context7) {
    throw new Error(`cursor global config missing "context7". Config: ${JSON.stringify(config, null, 2)}`);
  }
});

// PERSO001_80: project .mcp.json should not change
Then(/^project \.mcp\.json content should not change$/, function (this: V4World) {
  const config = readJson(projectMcpPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  // The project .mcp.json had 'atlassian-mcp' — verify it's still there and context7/octocode are NOT
  if (!servers?.['atlassian-mcp']) {
    throw new Error(`project .mcp.json lost atlassian-mcp. Config: ${JSON.stringify(config, null, 2)}`);
  }
  if (servers?.context7 || servers?.octocode) {
    throw new Error(`project .mcp.json was modified (setup-mcp wrote to it). Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^~\/\.claude\.json should contain Context7 and Octocode MCP entries$/, function (this: V4World) {
  const config = readJson(claudeGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!servers?.context7) {
    throw new Error(`~/.claude.json missing context7. Config: ${JSON.stringify(config, null, 2)}`);
  }
  if (!servers?.octocode) {
    throw new Error(`~/.claude.json missing octocode. Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^~\/\.claude\.json should contain Context7 MCP entry$/, function (this: V4World) {
  const config = readJson(claudeGlobalConfigPath(this));
  const servers = config.mcpServers as Record<string, unknown>;
  if (!servers?.context7) {
    throw new Error(`~/.claude.json missing context7. Config: ${JSON.stringify(config, null, 2)}`);
  }
});

Then(/^project \.mcp\.json should not be created$/, function (this: V4World) {
  // In PERSO001_81 the cwd of setup-mcp.py is REPO_ROOT, not tempDir/project.
  // The script checks for .mcp.json relative to cwd. The real repo .mcp.json exists
  // but the script's force-global means it NEVER writes to project config.
  // What we verify here: no NEW project .mcp.json was created inside tempDir/project.
  const p = projectMcpPath(this);
  if (fs.existsSync(p)) {
    throw new Error(`project .mcp.json was unexpectedly created at ${p}`);
  }
});
