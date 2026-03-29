#!/usr/bin/env node
/**
 * bun-oom-guard SessionStart Hook
 *
 * Auto-patches claude-mem's bun-runner.js to prevent OOM crashes on Windows.
 * Runs on every SessionStart to self-heal after claude-mem updates.
 *
 * Patches applied:
 * 1. --smol flag: reduces JSC heap 6x (343MB → 54MB)
 * 2. Streaming stdin: pipe() instead of collectStdin() buffer (64KB vs 500MB+)
 * 3. Stderr filter: 1-line error instead of 30-line Bun panic dump
 *
 * Fail-open: errors are logged, never block session start.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { log as _logShared } from '../../../_shared/hook-utils.js';

const VERBOSE = process.env.DEV_POMOGATOR_HOOK_VERBOSE === '1';
const LOG_PREFIX = 'bun-oom-guard';

function log(level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', msg: string): void {
  if (level !== 'ERROR' && !VERBOSE) return;
  _logShared(level, LOG_PREFIX, msg);
}

/**
 * Find all bun-runner.js files in claude-mem plugin cache.
 * Searches: ~/.claude/plugins/cache/{org}/claude-mem/{ver}/scripts/bun-runner.js
 */
function findBunRunners(): string[] {
  const cacheDir = path.join(os.homedir(), '.claude', 'plugins', 'cache');
  if (!fs.existsSync(cacheDir)) return [];

  const results: string[] = [];
  try {
    for (const org of fs.readdirSync(cacheDir)) {
      const memDir = path.join(cacheDir, org, 'claude-mem');
      if (!fs.existsSync(memDir) || !fs.statSync(memDir).isDirectory()) continue;

      for (const version of fs.readdirSync(memDir)) {
        const candidate = path.join(memDir, version, 'scripts', 'bun-runner.js');
        if (fs.existsSync(candidate)) {
          results.push(candidate);
        }
      }
    }
  } catch (err) {
    log('WARN', `Error scanning plugin cache: ${err}`);
  }
  return results;
}

/**
 * Check if bun-runner.js needs patching.
 * Unpatched files have collectStdin() or lack --smol.
 */
function needsPatching(content: string): boolean {
  return content.includes('collectStdin') || !content.includes("'--smol'");
}

/**
 * Find the patched template file by walking up from cwd to git root.
 */
function findPatchedTemplate(): string | null {
  const relativePath = path.join('.dev-pomogator', 'tools', 'bun-oom-guard', 'bun-runner.patched.js');

  // Try cwd first
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, relativePath);
    if (fs.existsSync(candidate)) return candidate;

    // Check if this is git root
    if (fs.existsSync(path.join(dir, '.git'))) break;

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

async function main(): Promise<void> {
  try {
    // Read stdin (hook contract — consume but don't need it)
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);

    // Only patch on Windows (Bun OOM panic is Windows-specific)
    if (os.platform() !== 'win32') {
      log('DEBUG', 'Not Windows, skipping');
      process.stdout.write('{}');
      return;
    }

    // Find patched template
    const templatePath = findPatchedTemplate();
    if (!templatePath) {
      log('DEBUG', 'Patched template not found (bun-oom-guard not installed in this project)');
      process.stdout.write('{}');
      return;
    }

    const patchedContent = fs.readFileSync(templatePath, 'utf-8');

    // Find all bun-runner.js targets
    const targets = findBunRunners();
    if (targets.length === 0) {
      log('DEBUG', 'No bun-runner.js found (claude-mem not installed)');
      process.stdout.write('{}');
      return;
    }

    for (const target of targets) {
      const current = fs.readFileSync(target, 'utf-8');
      if (needsPatching(current)) {
        // Backup original (only first time)
        const backupPath = target + '.original';
        if (!fs.existsSync(backupPath)) {
          fs.writeFileSync(backupPath, current, 'utf-8');
          log('INFO', `Backup saved: ${backupPath}`);
        }
        // Apply patch
        fs.writeFileSync(target, patchedContent, 'utf-8');
        log('INFO', `Patched: ${target}`);
      } else {
        log('DEBUG', `Already patched: ${target}`);
      }
    }
  } catch (err) {
    log('ERROR', `${err}`);
  }

  // Fail-open: always exit successfully
  process.stdout.write('{}');
}

main();
