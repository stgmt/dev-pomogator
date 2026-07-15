import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { RuntimeProbe } from './plan.ts';

export function detectRuntimeProbe(): RuntimeProbe {
  return {
    dockerHost: commandExists('docker'),
    dockerWsl: commandExists('wsl.exe'),
    pipx: commandExists('pipx'),
    wslIp: process.env.WSL_IP ?? detectWslIp(),
  };
}

export function detectWslIp(): string | undefined {
  if (!commandExists('wsl.exe')) return undefined;
  try {
    const output = execFileSync('wsl.exe', ['hostname', '-I'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5_000,
    });
    return output
      .split(/\s+/)
      .find((part) => /^\d+\.\d+\.\d+\.\d+$/.test(part));
  } catch {
    return undefined;
  }
}

export function commandExists(command: string): boolean {
  const pathEnv = process.env.PATH ?? '';
  const hasExtension = path.extname(command) !== '';
  const exts = process.platform === 'win32' && !hasExtension ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of pathEnv.split(path.delimiter)) {
    for (const ext of exts) {
      if (fs.existsSync(path.join(dir, `${command}${ext}`))) return true;
    }
  }
  return false;
}
