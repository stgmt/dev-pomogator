import fs from 'fs-extra';
import os from 'os';
import path from 'path';

export const FIXTURES_DIR = path.join(
  __dirname,
  '..',
  'fixtures',
  'chrome-devtools-mcp-mux',
);

export interface McpJson {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
  [key: string]: unknown;
}

export function makeFixtureProjectDir(prefix = 'cdmm-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dev-pomogator-${prefix}`));
}

export function copyFixtureMcpJson(fixtureName: 'existing-mcp-json' | 'claude-in-chrome-mcp-json', targetDir: string): string {
  const src = path.join(FIXTURES_DIR, fixtureName, '.mcp.json');
  const dest = path.join(targetDir, '.mcp.json');
  fs.copySync(src, dest, { overwrite: true });
  return dest;
}

export function readMcpJson(targetProject: string): McpJson | null {
  const file = path.join(targetProject, '.mcp.json');
  if (!fs.existsSync(file)) return null;
  return fs.readJsonSync(file) as McpJson;
}

export function findClaudeInChromeEntry(json: McpJson | null): boolean {
  return Boolean(json?.mcpServers && Object.prototype.hasOwnProperty.call(json.mcpServers, 'claude-in-chrome'));
}

export function findMuxEntry(json: McpJson | null): boolean {
  return Boolean(json?.mcpServers && Object.prototype.hasOwnProperty.call(json.mcpServers, 'chrome-devtools-mcp-mux'));
}

export function fakeMuxBinPath(): string {
  return path.join(FIXTURES_DIR, 'fake-cdmcp-mux.mjs');
}

export function cleanupFixture(targetDir: string): void {
  try {
    fs.rmSync(targetDir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}
