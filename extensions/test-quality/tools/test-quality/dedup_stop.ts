#!/usr/bin/env npx tsx
/**
 * Test Dedup Stop Hook
 *
 * On agent Stop event: checks if test files were modified via `git diff --numstat`,
 * applies hash-dedup + cooldown + maxRetries to prevent loops,
 * and blocks stop to trigger /dedup-tests skill.
 *
 * Fail-open: exit 0 always, never block on errors.
 */

import { execSync } from 'node:child_process';

import { log as _logShared, normalizePath } from '../_shared/hook-utils.js';
import {
  markerPath,
  readMarker,
  writeMarkerAtomic,
  isWithinCooldown,
  hashFileList,
} from '../_shared/marker-utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopHookInput {
  conversation_id?: string;
  workspace_roots?: string[];
  transcript_path?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKER_FILENAME = '.dedup-marker.json';
const MARKER_DIR = '.dev-pomogator';
const COOLDOWN_MINUTES = 10;
const MAX_RETRIES = 1;
const TEST_DIR_PREFIX = 'tests/';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const LOG_PREFIX = 'DEDUP-TESTS';
function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  _logShared(level, LOG_PREFIX, message);
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function getTestDiffFiles(repoRoot: string): string[] {
  try {
    const raw = execSync('git diff --numstat', {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (!raw) return [];

    const testFiles: string[] = [];
    for (const line of raw.split('\n')) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      const filename = parts[2];
      if (filename.startsWith(TEST_DIR_PREFIX)) {
        testFiles.push(filename);
      }
    }
    return testFiles.sort();
  } catch {
    return [];
  }
}


// ---------------------------------------------------------------------------
// Stdin reader
// ---------------------------------------------------------------------------

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function approve(): void {
  process.stdout.write('{}');
}

function block(reason: string): void {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.env.DEDUP_ENABLED === 'false') {
    log('DEBUG', 'Disabled via DEDUP_ENABLED=false');
    approve();
    return;
  }

  const raw = await readStdin();
  if (!raw.trim()) {
    approve();
    return;
  }

  let input: StopHookInput;
  try {
    input = JSON.parse(raw) as StopHookInput;
  } catch {
    log('ERROR', `Failed to parse stdin: ${raw.slice(0, 200)}`);
    approve();
    return;
  }

  const projectPath = input.workspace_roots?.[0];
  if (!projectPath) {
    log('DEBUG', 'No workspace_roots in input');
    approve();
    return;
  }

  const repoRoot = normalizePath(projectPath);

  // 1. Get test files from git diff
  const testFiles = getTestDiffFiles(repoRoot);
  if (testFiles.length === 0) {
    log('DEBUG', 'No test files in diff');
    approve();
    return;
  }

  // 2. Hash file list
  const currentHash = hashFileList(testFiles);

  // 3. Read marker
  const mp = markerPath(repoRoot, MARKER_DIR, MARKER_FILENAME);
  const marker = readMarker(mp);

  // 4. Hash dedup
  if (marker && marker.hash === currentHash) {
    log('INFO', `Same diff hash (${currentHash}), already checked`);
    approve();
    return;
  }

  // 5. Cooldown
  if (marker && isWithinCooldown(marker.timestamp, COOLDOWN_MINUTES)) {
    log('INFO', `Cooldown active (${COOLDOWN_MINUTES}min), skipping`);
    approve();
    return;
  }

  // 6. Max retries
  const newCount = (marker?.count ?? 0) + 1;
  if (newCount > MAX_RETRIES) {
    log('INFO', `Max retries (${MAX_RETRIES}) exceeded`);
    approve();
    return;
  }

  // 7. Write marker
  writeMarkerAtomic(mp, {
    hash: currentHash,
    timestamp: new Date().toISOString(),
    count: newCount,
  });

  // 8. Block stop
  log('INFO', `Blocking stop: ${testFiles.length} test file(s) changed (hash: ${currentHash})`);
  block(
    `${testFiles.length} test file(s) changed. Run /dedup-tests to check for duplicated helpers.`
  );
}

main()
  .catch((err) => {
    log('ERROR', `Unhandled: ${err instanceof Error ? err.message : String(err)}`);
    approve();
  })
  .finally(() => {
    process.exit(0);
  });
