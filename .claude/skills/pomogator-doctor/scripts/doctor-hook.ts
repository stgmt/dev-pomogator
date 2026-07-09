#!/usr/bin/env npx tsx
/**
 * pomogator-doctor SessionStart hook (FR-17).
 *
 * Drains stdin (hook protocol), runs Doctor in quiet mode, emits a single-line
 * JSON payload: `{continue, suppressOutput?, additionalContext?}`. Silent when
 * all checks pass; short banner (<=100 chars) when problems detected.
 *
 * Fail-soft per NFR-R-2: any error emits `{continue:true, suppressOutput:true}`
 * and logs to ~/.dev-pomogator/logs/doctor.log.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LOG_FILE = path.join(os.homedir(), '.dev-pomogator', 'logs', 'doctor.log');
const HOOK_TIMEOUT_MS = 10_000;

interface HookOutput {
  continue: true;
  suppressOutput?: boolean;
  additionalContext?: string;
}

function writeOutput(output: HookOutput): void {
  process.stdout.write(JSON.stringify(output) + '\n');
}

function logError(message: string): void {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const line = `[${new Date().toISOString()}] [pomogator-doctor] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // ignore
  }
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  let input = '';
  for await (const chunk of process.stdin) {
    input += String(chunk);
  }
  return input;
}

function projectRootFromHookInput(input: string): string {
  try {
    const parsed = JSON.parse(input) as { cwd?: unknown };
    if (typeof parsed.cwd === 'string' && parsed.cwd.trim()) {
      return path.resolve(parsed.cwd);
    }
  } catch {
    // Hook payload is best-effort; fall back below.
  }
  return path.resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd());
}

function hookHomeDir(): string {
  return path.resolve(process.env.HOME || process.env.USERPROFILE || os.homedir());
}

function pluginRootFromScriptsDir(scriptsDir: string): string {
  return path.resolve(process.env.CLAUDE_PLUGIN_ROOT || path.join(scriptsDir, '..', '..', '..', '..'));
}

async function runCarlPreflight(scriptsDir: string, projectRoot: string): Promise<void> {
  const pluginRoot = pluginRootFromScriptsDir(scriptsDir);
  const installPath = path.join(pluginRoot, 'tools', 'carl', 'install.ts');
  if (!fs.existsSync(installPath)) return;

  const mod = (await import(pathToFileURL(installPath).href)) as {
    install?: (options: { project: string; platform: 'claude-code'; repair: boolean }) => unknown;
  };
  if (typeof mod.install !== 'function') return;

  await Promise.race([
    Promise.resolve(mod.install({ project: projectRoot, platform: 'claude-code', repair: true })),
    new Promise<void>((resolve) => setTimeout(resolve, 8_000)),
  ]);
}

async function main(): Promise<void> {
  try {
    const hookInput = await readStdin();

    // Canonical plugin location: engine/index.ts is co-located in same skill scripts/ dir.
    // Resolves relative к __dirname (этот script). Works в plugin cache (~/.claude/plugins/cache/.../scripts/)
    // и dogfood (.claude/skills/pomogator-doctor/scripts/) одинаково.
    const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const projectRoot = projectRootFromHookInput(hookInput);
    const homeDir = hookHomeDir();
    const doctorPath = path.join(__dirname, 'engine', 'index.ts');

    try {
      await runCarlPreflight(__dirname, projectRoot);
    } catch (error) {
      logError(`CARL preflight failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (fs.existsSync(doctorPath)) {
      const mod = (await import(pathToFileURL(doctorPath).href)) as {
        runQuiet?: (options?: { projectRoot?: string }) => Promise<HookOutput>;
      };
      if (typeof mod.runQuiet === 'function') {
        const payload = await Promise.race<HookOutput>([
          mod.runQuiet({ homeDir, projectRoot }),
          new Promise<HookOutput>((resolve) =>
            setTimeout(
              () => resolve({ continue: true, suppressOutput: true }),
              HOOK_TIMEOUT_MS,
            ),
          ),
        ]);
        writeOutput(payload);
        return;
      }
    }

    writeOutput({ continue: true, suppressOutput: true });
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    writeOutput({ continue: true, suppressOutput: true });
  }
}

main();
