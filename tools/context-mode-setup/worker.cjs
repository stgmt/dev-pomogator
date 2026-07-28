'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function forceKillProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 });
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* already exited */ } }
}

const MAX_INSTALL_RUNTIME_MS = 5 * 60 * 1000;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function installerSpawnOptions() {
  return {
    detached: false,
    env: { ...process.env, CI: '1', NO_COLOR: '1' },
    stdio: 'ignore',
    windowsHide: true,
  };
}

async function main() {
  const workerScript = argument('--worker-script');
  const command = argument('--command');
  const encodedArgs = argument('--args');
  if (!workerScript || !command || !encodedArgs) return;
  const args = JSON.parse(encodedArgs);
  let child;
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
    await new Promise(resolve => child.once('close', resolve));
  } catch {
    // SessionStart remains fail-open.
  } finally {
    clearTimeout(timer);
    cleanup();
  }
}

void main();

module.exports = { installerSpawnOptions };
