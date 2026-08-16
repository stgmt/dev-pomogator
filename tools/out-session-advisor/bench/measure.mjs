/**
 * Дочерний запуск с замером wall-time и пикового RSS (Windows + Linux).
 * Windows: опрос Get-Process WorkingSet64; Linux: /proc/<pid>/status VmRSS.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const POLL_MS = 150;

function rssBytesLinux(pid) {
  try {
    const s = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
    const m = s.match(/VmRSS:\s+(\d+)\s*kB/);
    return m ? Number(m[1]) * 1024 : 0;
  } catch {
    return 0;
  }
}

function rssBytesWin(pid) {
  try {
    const cp = spawn('powershell', ['-NoProfile', '-Command',
      `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).WorkingSet64`], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    cp.stdout.on('data', (d) => { out += d; });
    return new Promise((resolve) => {
      cp.on('close', () => resolve(Number(out.trim()) || 0));
    });
  } catch {
    return Promise.resolve(0);
  }
}

/** Запустить cmd+args, вернуть {wallMs, peakRssMb, exitCode, stdout, stderr, timedOut}. */
export function measureSpawn(cmd, args, { cwd, timeoutMs = 300000, env, input } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    let peak = 0;
    let timedOut = false;
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    child.on('error', (e) => {
      resolve({ wallMs: Date.now() - started, peakRssMb: 0, exitCode: -1, stdout: '', stderr: `spawn error: ${e.message}`, timedOut: false });
    });
    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const poll = setInterval(async () => {
      if (child.exitCode !== null) return;
      const rss = process.platform === 'win32' ? await rssBytesWin(child.pid) : rssBytesLinux(child.pid);
      if (rss > peak) peak = rss;
    }, POLL_MS);
    const kill = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* */ } }, timeoutMs);
    child.on('close', (code) => {
      clearInterval(poll);
      clearTimeout(kill);
      resolve({
        wallMs: Date.now() - started,
        peakRssMb: Math.round(peak / 1024 / 1024),
        exitCode: code,
        stdout: out,
        stderr: err,
        timedOut,
      });
    });
  });
}
