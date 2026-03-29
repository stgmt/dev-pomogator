#!/usr/bin/env npx tsx
/**
 * Stop hook: test-spec-gate
 * Blocks session stop when git diff shows test files changed without spec files.
 * Uses hash+cooldown+maxRetries pattern to prevent infinite blocking.
 *
 * stdin: JSON { session_id, stop_hook_active, cwd }
 * stdout: JSON { decision: "approve" | "block", reason? }
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const MAX_RETRIES = 2;

interface HookInput {
  session_id?: string;
  stop_hook_active?: boolean;
  cwd?: string;
}

interface Marker {
  hash: string;
  timestamp: number;
  count: number;
}

function approve(): void {
  process.stdout.write(JSON.stringify({ decision: 'approve' }));
  process.exit(0);
}

function block(reason: string): void {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

function readMarker(markerPath: string): Marker | null {
  try {
    return JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeMarker(markerPath: string, marker: Marker): void {
  const dir = path.dirname(markerPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = markerPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(marker), 'utf-8');
  fs.renameSync(tmpPath, markerPath);
}

async function main(): Promise<void> {
  let input: HookInput = {};
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    approve(); // fail-open
    return;
  }

  // Prevent infinite loop
  if (input.stop_hook_active) {
    approve();
    return;
  }

  const cwd = input.cwd || process.cwd();

  // Get git diff
  let diffOutput: string;
  try {
    diffOutput = execSync('git diff --numstat', { cwd, encoding: 'utf-8', timeout: 5000 });
  } catch {
    approve(); // fail-open: no git or error
    return;
  }

  if (!diffOutput.trim()) {
    approve(); // no changes
    return;
  }

  const lines = diffOutput.trim().split('\n');
  const testFiles = lines
    .map((l) => l.split('\t')[2])
    .filter((p): p is string => !!p && p.startsWith('tests/'));
  const specFiles = lines
    .map((l) => l.split('\t')[2])
    .filter((p): p is string => !!p && (p.startsWith('.specs/') || p.endsWith('.feature')));

  // No test changes or specs already present → approve
  if (testFiles.length === 0 || specFiles.length > 0) {
    approve();
    return;
  }

  // Hash current test file list
  const hash = createHash('sha256').update(testFiles.sort().join('\n')).digest('hex');
  const markerPath = path.join(cwd, '.dev-pomogator', '.test-spec-marker.json');
  const marker = readMarker(markerPath);

  // Same diff + within cooldown → approve
  if (marker && marker.hash === hash && (Date.now() - marker.timestamp) < COOLDOWN_MS) {
    approve();
    return;
  }

  // Max retries exceeded → approve
  const count = (marker && marker.hash === hash) ? marker.count : 0;
  if (count >= MAX_RETRIES) {
    approve();
    return;
  }

  // Block and update marker
  writeMarker(markerPath, { hash, timestamp: Date.now(), count: count + 1 });
  block(
    `Изменены ${testFiles.length} тестовых файл(ов) без обновления спеков.\n` +
    `Файлы: ${testFiles.slice(0, 3).join(', ')}${testFiles.length > 3 ? '...' : ''}\n` +
    `Обнови .specs/ или tests/features/ для соответствующей фичи.`,
  );
}

main().catch(() => approve());
