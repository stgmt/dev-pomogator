import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { forceKillProcessTree } from '../_shared/process-tree.ts';

const MAX_INSTALL_RUNTIME_MS = 5 * 60 * 1000;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/**
 * The outer worker is the owned detached POSIX process group. Its installer MUST
 * stay in that group: stale recovery kills the worker group by the worker pid.
 * Detaching the installer would create a second group that survives that sweep.
 */
export function installerSpawnOptions(): { detached: false; env: NodeJS.ProcessEnv; stdio: 'ignore'; windowsHide: true } {
  return {
    detached: false,
    env: { ...process.env, CI: '1', NO_COLOR: '1' },
    stdio: 'ignore',
    windowsHide: true,
  };
}

async function main(): Promise<void> {
  const workerScript = argument('--worker-script');
  const command = argument('--command');
  const encodedArgs = argument('--args');
  if (!workerScript || !command || !encodedArgs) return;
  const args = JSON.parse(encodedArgs) as string[];
  let child: ReturnType<typeof spawn> | undefined;
  const cleanup = () => {
    if (child?.pid) forceKillProcessTree(child.pid);
    try { fs.rmSync(path.dirname(workerScript), { recursive: true, force: true }); } catch { /* best effort */ }
  };
  const terminate = () => {
    cleanup();
    process.exit(1);
  };
  const timer = setTimeout(terminate, MAX_INSTALL_RUNTIME_MS);
  process.once('SIGTERM', terminate);
  process.once('SIGINT', terminate);
  try {
    child = spawn(command, args, installerSpawnOptions());
    await new Promise<void>(resolve => child!.once('close', resolve));
  } catch {
    // The SessionStart caller is intentionally fail-open.
  } finally {
    clearTimeout(timer);
    cleanup();
  }
}

void main();
