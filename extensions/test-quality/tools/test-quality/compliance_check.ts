#!/usr/bin/env npx tsx
/**
 * Test Compliance Check — PostToolUse Hook
 *
 * On Write/Edit of test files: scans for 7 anti-patterns and blocks
 * if issues found, triggering /tests-create-update skill.
 *
 * Fail-open: exit 0 always, never block on errors.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { log as _logShared, normalizePath } from '../_shared/hook-utils.ts';
import {
  markerPath,
  readMarker,
  writeMarkerAtomic,
  isWithinCooldown,
} from '../_shared/marker-utils.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostToolUseInput {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    command?: string;
  };
  workspace_roots?: string[];
}

interface AntiPatternMatch {
  rule: string;
  line: number;
  code: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARKER_FILENAME = '.compliance-marker.json';
const MARKER_DIR = '.dev-pomogator';
const COOLDOWN_MINUTES = 30;
const MAX_RETRIES = 1;

const TEST_PATTERNS = [
  /tests?\//i,
  /\.test\.ts$/,
  /\.test\.cs$/,
  /Steps\.cs$/,
];

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const LOG_PREFIX = 'TEST-COMPLIANCE';
function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  _logShared(level, LOG_PREFIX, message);
}

// ---------------------------------------------------------------------------
// Test file detection
// ---------------------------------------------------------------------------

function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return TEST_PATTERNS.some(p => p.test(normalized));
}

// ---------------------------------------------------------------------------
// Anti-pattern scanners
// ---------------------------------------------------------------------------

function scanAntiPatterns(content: string, filePath: string): AntiPatternMatch[] {
  const matches: AntiPatternMatch[] = [];
  const lines = content.split('\n');
  const isTs = filePath.endsWith('.ts') || filePath.endsWith('.js');
  const isCs = filePath.endsWith('.cs');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (isTs) {
      // Rule 1: Source scan — readFile + toContain('function/class/const/export/import')
      if (/\.toContain\(['"](?:function|class|const|import|export|async|interface)\s/.test(line)) {
        matches.push({ rule: 'source-scan', line: lineNum, code: line.trim() });
      }

      // Rule 2: pathExists-only — pathExists without nearby readFile
      if (/pathExists\(/.test(line) && !hasNearbyContentCheck(lines, i, 5)) {
        matches.push({ rule: 'existence-only', line: lineNum, code: line.trim() });
      }

      // Rule 3: Weak assertion — toBeDefined/toBeTruthy without nearby strong assertion
      if ((/\.toBeDefined\(\)/.test(line) || /\.toBeTruthy\(\)/.test(line)) && !hasNearbyStrongAssertion(lines, i, 3)) {
        matches.push({ rule: 'weak-assertion', line: lineNum, code: line.trim() });
      }
      if (/typeof\s+\S+\s*===?\s*['"]string['"]/.test(line) && /expect/.test(line)) {
        matches.push({ rule: 'weak-assertion', line: lineNum, code: line.trim() });
      }

      // Rule 4: Response.ok only
      if (/\.ok\)\.toBe\(true\)/.test(line) && !hasNearbyJsonParse(lines, i, 5)) {
        matches.push({ rule: 'response-ok-only', line: lineNum, code: line.trim() });
      }

      // Rule 5: Silent skip
      if (/if\s*\(!.*\)\s*return/.test(line) && isInsideTestBlock(lines, i)) {
        matches.push({ rule: 'silent-skip', line: lineNum, code: line.trim() });
      }
    }

    if (isCs) {
      // Rule 4: Status-only (C#)
      if (/Assert\.Equal\(HttpStatusCode\.\w+/.test(line) && !hasNearbyReadFromJson(lines, i, 8)) {
        matches.push({ rule: 'response-status-only', line: lineNum, code: line.trim() });
      }

      // Rule 5: Empty catch (C#)
      if (/catch\s*\{\s*\}/.test(line) || /catch\s*\{[\s/]*\}/.test(line)) {
        matches.push({ rule: 'silent-catch', line: lineNum, code: line.trim() });
      }

      // Rule 7: Unsafe GetProperty chain (C#)
      if (/\.GetProperty\("/.test(line) && (line.match(/\.GetProperty\("/g) || []).length >= 2) {
        if (!/TryGetProperty/.test(line)) {
          matches.push({ rule: 'unsafe-json', line: lineNum, code: line.trim() });
        }
      }

      // Rule 3: Assert.NotNull only (C#)
      if (/Assert\.NotNull\(/.test(line) && !hasNearbyValueAssert(lines, i, 3)) {
        matches.push({ rule: 'weak-assertion', line: lineNum, code: line.trim() });
      }
    }
  }

  return matches;
}

function hasNearbyContentCheck(lines: string[], idx: number, range: number): boolean {
  const start = Math.max(0, idx - range);
  const end = Math.min(lines.length, idx + range + 1);
  for (let j = start; j < end; j++) {
    if (/readFile|stat\(|\.size/.test(lines[j])) return true;
  }
  return false;
}

function hasNearbyJsonParse(lines: string[], idx: number, range: number): boolean {
  const start = Math.max(0, idx - range);
  const end = Math.min(lines.length, idx + range + 1);
  for (let j = start; j < end; j++) {
    if (/\.json\(\)|toHaveProperty|JSON\.parse/.test(lines[j])) return true;
  }
  return false;
}

function hasNearbyReadFromJson(lines: string[], idx: number, range: number): boolean {
  const start = Math.max(0, idx - range);
  const end = Math.min(lines.length, idx + range + 1);
  for (let j = start; j < end; j++) {
    if (/ReadFromJsonAsync|DeserializeAsync|\.Content\.Read/.test(lines[j])) return true;
  }
  return false;
}

function hasNearbyValueAssert(lines: string[], idx: number, range: number): boolean {
  const end = Math.min(lines.length, idx + range + 1);
  for (let j = idx + 1; j < end; j++) {
    if (/\.Should\(\)|Assert\.Equal|\.Be\(|\.Contain/.test(lines[j])) return true;
  }
  return false;
}

function isInsideTestBlock(lines: string[], idx: number): boolean {
  for (let j = idx; j >= Math.max(0, idx - 20); j--) {
    if (/\bit\(|\.it\(/.test(lines[j])) return true;
  }
  return false;
}

function hasNearbyStrongAssertion(lines: string[], idx: number, range: number): boolean {
  const end = Math.min(lines.length, idx + range + 1);
  for (let j = idx + 1; j < end; j++) {
    if (/\.toBe\(|\.toEqual\(|\.toContain\(|\.toHaveProperty\(|\.toMatch\(/.test(lines[j])) return true;
  }
  return false;
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
  if (process.env.TEST_COMPLIANCE_ENABLED === 'false') {
    log('DEBUG', 'Disabled via TEST_COMPLIANCE_ENABLED=false');
    approve();
    return;
  }

  const raw = await readStdin();
  if (!raw.trim()) {
    approve();
    return;
  }

  let input: PostToolUseInput;
  try {
    input = JSON.parse(raw) as PostToolUseInput;
  } catch {
    log('ERROR', `Failed to parse stdin: ${raw.slice(0, 200)}`);
    approve();
    return;
  }

  // Only trigger on Write/Edit tools
  const tool = input.tool_name ?? '';
  if (tool !== 'Write' && tool !== 'Edit') {
    approve();
    return;
  }

  const filePath = input.tool_input?.file_path ?? '';
  if (!filePath || !isTestFile(filePath)) {
    approve();
    return;
  }

  const projectPath = input.workspace_roots?.[0];
  if (!projectPath) {
    approve();
    return;
  }

  const repoRoot = normalizePath(projectPath);
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);

  // Read the file that was just written/edited
  let content: string;
  try {
    content = fs.readFileSync(absPath, 'utf-8');
  } catch {
    log('DEBUG', `Cannot read ${absPath}`);
    approve();
    return;
  }

  // Cooldown: hash file content, skip if same hash checked recently
  const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const mp = markerPath(repoRoot, MARKER_DIR, MARKER_FILENAME);
  const marker = readMarker(mp);

  if (marker && marker.hash === contentHash) {
    log('DEBUG', `Same content hash (${contentHash}), already checked`);
    approve();
    return;
  }

  if (marker && isWithinCooldown(marker.timestamp, COOLDOWN_MINUTES)) {
    log('DEBUG', `Cooldown active (${COOLDOWN_MINUTES}min), skipping`);
    approve();
    return;
  }

  // Scan for anti-patterns
  const issues = scanAntiPatterns(content, filePath);

  if (issues.length === 0) {
    log('INFO', `${filePath}: 0 anti-patterns found`);
    writeMarkerAtomic(mp, { hash: contentHash, timestamp: new Date().toISOString(), count: 0 });
    approve();
    return;
  }

  // Max retries
  const newCount = (marker?.count ?? 0) + 1;
  if (newCount > MAX_RETRIES) {
    log('INFO', `Max retries (${MAX_RETRIES}) exceeded for ${filePath}`);
    approve();
    return;
  }

  writeMarkerAtomic(mp, { hash: contentHash, timestamp: new Date().toISOString(), count: newCount });

  // Format report
  const summary = issues.map(i => `  L${i.line} [${i.rule}]: ${i.code.slice(0, 100)}`).join('\n');
  log('INFO', `${filePath}: ${issues.length} anti-pattern(s) found`);

  block(
    `${issues.length} test anti-pattern(s) in ${path.basename(filePath)}:\n${summary}\n\nRun /tests-create-update to fix.`
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
