#!/usr/bin/env npx tsx
/**
 * Auto-Simplify Stop Hook
 *
 * On agent Stop event: checks for uncommitted changes via `git diff --numstat`,
 * applies threshold + hash-based dedup + cooldown to prevent infinite loops,
 * and blocks stop to trigger /simplify skill.
 *
 * Anti-loop algorithm:
 *   1. git diff --numstat → parse insertions + deletions
 *   2. if totalLines < SIMPLIFY_MIN_LINES → approve (too small)
 *   3. hash sorted file list → compare with stored marker
 *   4. if same hash → approve (already reviewed)
 *   5. if cooldown not expired → approve (recently triggered)
 *   6. if retries >= max → approve (loop protection)
 *   7. otherwise → block stop, trigger /simplify
 *
 * Fail-open: exit 0 always, never block on errors.
 */

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopHookInput {
  conversation_id?: string;
  workspace_roots?: string[];
  transcript_path?: string;
}

interface MarkerData {
  hash: string;
  timestamp: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Constants & Config (env vars)
// ---------------------------------------------------------------------------

const MARKER_FILENAME = '.simplify-marker.json';
const MARKER_DIR = '.dev-pomogator';

function getConfig() {
  return {
    enabled: process.env.SIMPLIFY_ENABLED !== 'false',
    cooldownMinutes: parseInt(process.env.SIMPLIFY_COOLDOWN_MINUTES || '5', 10) || 5,
    maxRetries: parseInt(process.env.SIMPLIFY_MAX_RETRIES || '2', 10) || 2,
    minLines: parseInt(process.env.SIMPLIFY_MIN_LINES || '10', 10) || 10,
  };
}

// ---------------------------------------------------------------------------
// Logging (stderr, never stdout — stdout is reserved for hook output)
// ---------------------------------------------------------------------------

function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  const ts = new Date().toISOString();
  process.stderr.write(`[${ts}] [AUTO-SIMPLIFY] [${level}] ${message}\n`);
}

// ---------------------------------------------------------------------------
// Path normalization (from auto_commit_core.ts pattern)
// ---------------------------------------------------------------------------

function normalizePath(p: string): string {
  if (!p) return p;
  // /d:/repos/project → D:\repos\project on Windows
  if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(p)) {
    const drive = p[1].toUpperCase();
    return `${drive}:${p.slice(2).replace(/\//g, '\\')}`;
  }
  return p;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

interface DiffStats {
  totalLines: number;
  fileList: string[];
}

function getGitDiffStats(repoRoot: string): DiffStats | null {
  try {
    // git diff --numstat outputs: "insertions\tdeletions\tfilename" per line
    // Binary files show "-\t-\tfilename"
    const raw = execSync('git diff --numstat', {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (!raw) return { totalLines: 0, fileList: [] };

    let totalLines = 0;
    const fileList: string[] = [];

    for (const line of raw.split('\n')) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;

      const [ins, del, filename] = parts;
      fileList.push(filename);

      // Skip binary files (shown as "-\t-")
      if (ins === '-' || del === '-') continue;

      totalLines += (parseInt(ins, 10) || 0) + (parseInt(del, 10) || 0);
    }

    return { totalLines, fileList: fileList.sort() };
  } catch {
    return null; // git error → fail-open
  }
}

// ---------------------------------------------------------------------------
// Hash
// ---------------------------------------------------------------------------

function hashFileList(files: string[]): string {
  return createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Marker file (atomic read/write per atomic-config-save rule)
// ---------------------------------------------------------------------------

function markerPath(repoRoot: string): string {
  return path.join(repoRoot, MARKER_DIR, MARKER_FILENAME);
}

function readMarker(filePath: string): MarkerData | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw) as MarkerData;
    if (data && typeof data.hash === 'string' && typeof data.timestamp === 'string') {
      return data;
    }
    return null;
  } catch {
    return null; // corrupted or missing → treat as fresh
  }
}

function writeMarkerAtomic(filePath: string, data: MarkerData): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

// ---------------------------------------------------------------------------
// Cooldown check
// ---------------------------------------------------------------------------

function isWithinCooldown(timestamp: string, cooldownMinutes: number): boolean {
  const markerTime = new Date(timestamp).getTime();
  if (isNaN(markerTime)) return false;
  const elapsed = (Date.now() - markerTime) / 60_000;
  return elapsed < cooldownMinutes;
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
  const config = getConfig();

  if (!config.enabled) {
    log('DEBUG', 'Disabled via SIMPLIFY_ENABLED=false');
    approve();
    return;
  }

  // Read stdin
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

  // 1. Get diff stats
  const stats = getGitDiffStats(repoRoot);
  if (!stats) {
    log('ERROR', 'git diff failed');
    approve();
    return;
  }

  if (stats.fileList.length === 0) {
    log('DEBUG', 'No uncommitted changes');
    approve();
    return;
  }

  // 2. Threshold check (FR-1a)
  if (stats.totalLines < config.minLines) {
    log('INFO', `Below threshold: ${stats.totalLines} lines < ${config.minLines} min`);
    approve();
    return;
  }

  // 3. Hash file list
  const currentHash = hashFileList(stats.fileList);

  // 4. Read marker
  const mp = markerPath(repoRoot);
  const marker = readMarker(mp);

  // 5. Hash dedup (FR-2)
  if (marker && marker.hash === currentHash) {
    log('INFO', `Same diff hash (${currentHash}), already reviewed`);
    approve();
    return;
  }

  // 6. Cooldown (FR-3)
  if (marker && isWithinCooldown(marker.timestamp, config.cooldownMinutes)) {
    log('INFO', `Cooldown active (${config.cooldownMinutes}min), skipping`);
    approve();
    return;
  }

  // 7. Max retries (FR-4)
  const newCount = (marker?.count ?? 0) + 1;
  if (newCount > config.maxRetries) {
    log('INFO', `Max retries (${config.maxRetries}) exceeded`);
    approve();
    return;
  }

  // 8. Write marker (FR-5, atomic)
  writeMarkerAtomic(mp, {
    hash: currentHash,
    timestamp: new Date().toISOString(),
    count: newCount,
  });

  // 9. Block stop → trigger /simplify
  const fileCount = stats.fileList.length;
  log('INFO', `Blocking stop: ${fileCount} files, ${stats.totalLines} lines changed (hash: ${currentHash}, attempt: ${newCount})`);
  block(
    `${stats.totalLines} lines changed across ${fileCount} file(s). Run /simplify to review code quality, reuse opportunities, and efficiency improvements.`
  );
}

// Fail-open wrapper: always exit 0
main()
  .catch((err) => {
    log('ERROR', `Unhandled: ${err instanceof Error ? err.message : String(err)}`);
    approve();
  })
  .finally(() => {
    process.exit(0);
  });
