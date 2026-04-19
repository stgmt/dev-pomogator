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

async function drainStdin(): Promise<void> {
  if (process.stdin.isTTY) return;
  for await (const _ of process.stdin) {
    // consume input; we do not use payload
    void _;
  }
}

async function main(): Promise<void> {
  try {
    await drainStdin();

    const devPomHome = path.join(os.homedir(), '.dev-pomogator');
    if (!fs.existsSync(path.join(devPomHome, 'config.json'))) {
      writeOutput({ continue: true, suppressOutput: true });
      return;
    }

    const doctorPath = path.join(
      devPomHome,
      'tools',
      'pomogator-doctor',
      'doctor-entry.mjs',
    );

    if (fs.existsSync(doctorPath)) {
      const mod = (await import(doctorPath)) as {
        runQuiet?: () => Promise<HookOutput>;
      };
      if (typeof mod.runQuiet === 'function') {
        const payload = await Promise.race<HookOutput>([
          mod.runQuiet(),
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
