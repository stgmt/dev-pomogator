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
  // 1. Try PATH first
  try {
    const result = execSync('where chroma 2>NUL', { encoding: 'utf-8', timeout: 5000 }).trim();
    if (result) {
      const firstLine = result.split('\n')[0].trim();
      if (fs.existsSync(firstLine)) return firstLine;
    }
  } catch {
    // not in PATH
  }

  // 2. Search Python Scripts directories (pip user install)
  const appData = process.env.APPDATA;
  if (appData) {
    const pythonDir = path.join(appData, 'Python');
    if (fs.existsSync(pythonDir)) {
      try {
        const versions = fs.readdirSync(pythonDir).filter((d) => d.startsWith('Python'));
        for (const ver of versions) {
          const candidate = path.join(pythonDir, ver, 'Scripts', 'chroma.exe');
          if (fs.existsSync(candidate)) return candidate;
        }
      } catch {
        // skip
      }
    }
  }

  // 3. Search LocalAppData Python installations
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const programsDir = path.join(localAppData, 'Programs', 'Python');
    if (fs.existsSync(programsDir)) {
      try {
        const versions = fs.readdirSync(programsDir).filter((d) => d.startsWith('Python'));
        for (const ver of versions) {
          const candidate = path.join(programsDir, ver, 'Scripts', 'chroma.exe');
          if (fs.existsSync(candidate)) return candidate;
        }
      } catch {
        // skip
      }
    }
  }

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
      '[claude-mem-health] chroma.exe not found. Install: pip install chromadb\n',
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
