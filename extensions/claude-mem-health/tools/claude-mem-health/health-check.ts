#!/usr/bin/env npx tsx
/**
 * Claude-Mem Health Check Hook (SessionStart)
 *
 * Checks if Chroma vector DB is reachable on port 8000.
 * If not — finds chroma.exe and starts it in background.
 *
 * Input (stdin): JSON from Claude Code SessionStart event
 * Output (stdout): JSON { continue: true, suppressOutput?: true }
 */

import { execSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import os from 'os';

const CHROMA_HOST = '127.0.0.1';
const CHROMA_PORT = 8000;
const CHROMA_DATA_DIR = path.join(os.homedir(), '.claude-mem', 'vector-db');
const HEARTBEAT_URL = `http://${CHROMA_HOST}:${CHROMA_PORT}/api/v2/heartbeat`;
const RETRY_COUNT = 8;
const RETRY_INTERVAL_MS = 1500;

function httpGet(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

async function isChromaHealthy(): Promise<boolean> {
  try {
    const { status } = await httpGet(HEARTBEAT_URL, 3000);
    return status === 200;
  } catch {
    return false;
  }
}

function findChromaExe(): string | null {
  const isWindows = process.platform === 'win32';
  const chromaBin = isWindows ? 'chroma.exe' : 'chroma';

  // 1. Check well-known locations
  const knownPaths = [
    // pip --user install on Linux
    path.join(os.homedir(), '.local', 'bin', chromaBin),
    // venv fallback
    path.join(os.homedir(), '.dev-pomogator', '.venv', 'bin', chromaBin),
    path.join(os.homedir(), '.dev-pomogator', '.venv', 'Scripts', chromaBin),
  ];
  for (const p of knownPaths) {
    if (fs.existsSync(p)) return p;
  }

  // 2. pip show chromadb → derive Scripts/bin path
  for (const pip of isWindows ? ['pip'] : ['pip3', 'pip']) {
    try {
      const location = execSync(`${pip} show chromadb`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      });
      const locationMatch = location.match(/Location:\s*(.+)/);
      if (locationMatch) {
        const scriptsDir = path.join(path.dirname(locationMatch[1].trim()), isWindows ? 'Scripts' : 'bin');
        const chromaPath = path.join(scriptsDir, chromaBin);
        if (fs.existsSync(chromaPath)) return chromaPath;
      }
    } catch { /* pip not available or chromadb not installed */ }
  }

  // 3. Windows-specific: APPDATA/Python and LOCALAPPDATA/Programs/Python
  if (isWindows) {
    for (const envVar of ['APPDATA', 'LOCALAPPDATA']) {
      const base = envVar === 'APPDATA'
        ? process.env.APPDATA
        : process.env.LOCALAPPDATA;
      if (!base) continue;
      const pythonDir = envVar === 'APPDATA'
        ? path.join(base, 'Python')
        : path.join(base, 'Programs', 'Python');
      if (fs.existsSync(pythonDir)) {
        try {
          const versions = fs.readdirSync(pythonDir).filter((d) => d.startsWith('Python'));
          for (const ver of versions) {
            const candidate = path.join(pythonDir, ver, 'Scripts', chromaBin);
            if (fs.existsSync(candidate)) return candidate;
          }
        } catch { /* skip */ }
      }
    }
  }

  // 4. which/where as last resort
  try {
    const result = execSync(isWindows ? `where ${chromaBin}` : `which ${chromaBin}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim().split('\n')[0].trim();
    if (result && fs.existsSync(result)) return result;
  } catch { /* not in PATH */ }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeOutput(output: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(output) + '\n');
}

async function main(): Promise<void> {
  // Drain stdin (required by hook protocol)
  let inputRaw = '';
  for await (const chunk of process.stdin) {
    inputRaw += chunk;
  }

  // Check if claude-mem data directory exists (skip if claude-mem not installed)
  if (!fs.existsSync(CHROMA_DATA_DIR)) {
    writeOutput({ continue: true, suppressOutput: true });
    return;
  }

  // Check if Chroma is already healthy
  if (await isChromaHealthy()) {
    writeOutput({ continue: true, suppressOutput: true });
    return;
  }

  // Chroma is down — find and start it
  const chromaExe = findChromaExe();
  if (!chromaExe) {
    process.stderr.write(
      '[claude-mem-health] chroma not found. Install: pip install chromadb\n',
    );
    writeOutput({ continue: true, suppressOutput: true });
    return;
  }

  // Start Chroma in background (detached)
  const child = spawn(
    chromaExe,
    ['run', '--path', CHROMA_DATA_DIR, '--host', CHROMA_HOST, '--port', String(CHROMA_PORT)],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    },
  );
  child.unref();

  // Wait for Chroma to become healthy
  for (let i = 0; i < RETRY_COUNT; i++) {
    await sleep(RETRY_INTERVAL_MS);
    if (await isChromaHealthy()) {
      process.stderr.write(
        `[claude-mem-health] Chroma started (PID ${child.pid}, attempt ${i + 1}/${RETRY_COUNT})\n`,
      );
      writeOutput({ continue: true, suppressOutput: true });
      return;
    }
  }

  process.stderr.write(
    `[claude-mem-health] Chroma failed to start after ${RETRY_COUNT} attempts\n`,
  );
  writeOutput({ continue: true, suppressOutput: true });
}

main().catch((error) => {
  process.stderr.write(`[claude-mem-health] Fatal: ${error}\n`);
  // Don't block session start on hook failure
  writeOutput({ continue: true });
});
