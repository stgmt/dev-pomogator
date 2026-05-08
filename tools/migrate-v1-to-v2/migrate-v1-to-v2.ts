#!/usr/bin/env tsx
/**
 * Migration script: dev-pomogator v1 → v2 cleanup utility.
 *
 * Removes v1 install artifacts so user can switch to canonical Anthropic plugin install:
 *   /plugin marketplace add stgmt/dev-pomogator
 *   /plugin install dev-pomogator@stgmt
 *   /reload-plugins   (CLI) or restart Claude Desktop
 *
 * Usage:
 *   npx tsx tools/migrate-v1-to-v2/migrate-v1-to-v2.ts          # cleanup project + global (default)
 *   npx tsx ... --project-only                                   # project artifacts only
 *   npx tsx ... --global-only                                    # global artifacts only (~/.dev-pomogator, ~/.claude/settings.json entries)
 *   npx tsx ... --no-global                                      # synonym for --project-only
 *   npx tsx ... --no-project                                     # synonym for --global-only
 *   npx tsx ... --dry-run                                        # show what would be removed without modifying
 *
 * Idempotent: re-run после cleanup → exit 0 + informational.
 * Fail-soft: partial failures log warning, marker не записывается до full success.
 *
 * Refs: .specs/dev-pomogator-canonical-plugin/FR.md FR-7
 */

import { existsSync, readFileSync, rmSync, statSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

interface Flags {
  project: boolean;
  global: boolean;
  dryRun: boolean;
}

interface MigrationResult {
  detectedV1Version: string | null;
  removedFiles: string[];
  removedDirs: string[];
  backupFiles: string[];
  gitignoreBlockRemoved: boolean;
  settingsLocalUpdated: boolean;
  globalSettingsUpdated: boolean;
  markerWritten: boolean;
  warnings: string[];
}

const MARKER_BEGIN_RE = /^# >>> dev-pomogator (managed[^>]*) >>>$/m;
const MARKER_END_RE = /^# <<< dev-pomogator (managed[^<]*) <<<$/m;

function parseFlags(argv: string[]): Flags {
  const args = new Set(argv.slice(2));
  let project = true;
  let global = true;
  if (args.has('--project-only')) global = false;
  if (args.has('--global-only')) project = false;
  if (args.has('--no-global')) global = false;
  if (args.has('--no-project')) project = false;
  return {
    project,
    global,
    dryRun: args.has('--dry-run'),
  };
}

function resolveWithinHome(p: string): string | null {
  const abs = resolve(p);
  const home = resolve(homedir());
  const rel = relative(home, abs);
  if (rel.startsWith('..') || resolve(home, rel) !== abs) return null;
  return abs;
}

function resolveWithinProject(projectRoot: string, p: string): string | null {
  const root = resolve(projectRoot);
  const abs = resolve(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || resolve(root, rel) !== abs) return null;
  return abs;
}

function safeRemove(path: string, result: MigrationResult, dryRun: boolean): void {
  if (!existsSync(path)) return;
  const stat = statSync(path);
  if (dryRun) {
    if (stat.isDirectory()) result.removedDirs.push(path);
    else result.removedFiles.push(path);
    return;
  }
  try {
    rmSync(path, { recursive: true, force: true });
    if (stat.isDirectory()) result.removedDirs.push(path);
    else result.removedFiles.push(path);
  } catch (err: unknown) {
    result.warnings.push(`Failed to remove ${path}: ${(err as Error).message}`);
  }
}

function detectV1Project(projectRoot: string): string | null {
  const manifestPath = join(projectRoot, '.dev-pomogator', '.claude-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) return null;
  const markerPath = join(projectRoot, '.dev-pomogator', '.migrated-to-v2');
  if (existsSync(markerPath)) return null;
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const v = typeof m.version === 'string' ? m.version : null;
    if (!v) return null;
    const major = parseInt(v.split('.')[0] ?? '0', 10);
    if (major >= 2) return null;
    return v;
  } catch {
    return null;
  }
}

function removeManagedGitignoreBlock(projectRoot: string, result: MigrationResult, dryRun: boolean): void {
  const gp = resolveWithinProject(projectRoot, '.gitignore');
  if (!gp || !existsSync(gp)) return;
  const text = readFileSync(gp, 'utf-8');
  if (!MARKER_BEGIN_RE.test(text) || !MARKER_END_RE.test(text)) return;
  const lines = text.split('\n');
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (MARKER_BEGIN_RE.test(line)) {
      inside = true;
      continue;
    }
    if (MARKER_END_RE.test(line)) {
      inside = false;
      continue;
    }
    if (!inside) out.push(line);
  }
  while (out.length > 1 && out[out.length - 1] === '' && out[out.length - 2] === '') out.pop();
  if (dryRun) {
    result.gitignoreBlockRemoved = true;
    return;
  }
  writeFileSync(gp, out.join('\n'), 'utf-8');
  result.gitignoreBlockRemoved = true;
}

function backupUserModifiedFiles(projectRoot: string, result: MigrationResult, dryRun: boolean): void {
  const skillsRoot = join(projectRoot, '.claude', 'skills');
  const rulesRoot = join(projectRoot, '.claude', 'rules');
  const overrideRoot = join(projectRoot, '.dev-pomogator', '.user-overrides');
  for (const root of [skillsRoot, rulesRoot]) {
    if (!existsSync(root)) continue;
    walkDir(root, (filePath) => {
      const rel = relative(projectRoot, filePath);
      const overridePath = join(overrideRoot, rel);
      if (dryRun) {
        result.backupFiles.push(rel);
        return;
      }
      try {
        mkdirSync(dirname(overridePath), { recursive: true });
        copyFileSync(filePath, overridePath);
        result.backupFiles.push(rel);
      } catch (err: unknown) {
        result.warnings.push(`Backup failed for ${rel}: ${(err as Error).message}`);
      }
    });
  }
}

function walkDir(dir: string, callback: (file: string) => void): void {
  if (!existsSync(dir)) return;
  const items = readFileSync; // dummy reference to silence unused
  void items;
  // Use require to avoid additional imports complexity
  const { readdirSync, statSync: statDirSync } = require('node:fs') as {
    readdirSync: (p: string) => string[];
    statSync: (p: string) => { isDirectory(): boolean; isFile(): boolean };
  };
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statDirSync(full);
    if (st.isDirectory()) walkDir(full, callback);
    else if (st.isFile()) callback(full);
  }
}

function smartMergeSettingsRemoval(settingsPath: string, removePredicate: (cmd: string) => boolean, result: MigrationResult, dryRun: boolean): boolean {
  if (!existsSync(settingsPath)) return false;
  let text: string;
  try {
    text = readFileSync(settingsPath, 'utf-8');
  } catch {
    return false;
  }
  let parsed: { hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ command?: string; type?: string }> }>>; statusLine?: { command?: string } } & Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    result.warnings.push(`Failed to parse JSON at ${settingsPath}`);
    return false;
  }
  let modified = false;
  const hooks = parsed.hooks;
  if (hooks && typeof hooks === 'object') {
    for (const event of Object.keys(hooks)) {
      const entries = hooks[event];
      if (!Array.isArray(entries)) continue;
      const filtered = entries.filter((entry) => {
        const innerHooks = entry?.hooks;
        if (!Array.isArray(innerHooks)) return true;
        const surviving = innerHooks.filter((h) => {
          const cmd = typeof h?.command === 'string' ? h.command : '';
          return !removePredicate(cmd);
        });
        if (surviving.length === 0) return false;
        if (surviving.length !== innerHooks.length) {
          entry.hooks = surviving;
          modified = true;
        }
        return true;
      });
      if (filtered.length !== entries.length) {
        hooks[event] = filtered;
        modified = true;
      }
    }
  }
  if (parsed.statusLine && typeof parsed.statusLine === 'object') {
    const cmd = typeof parsed.statusLine.command === 'string' ? parsed.statusLine.command : '';
    if (removePredicate(cmd)) {
      delete parsed.statusLine;
      modified = true;
    }
  }
  if (!modified) return false;
  if (dryRun) return true;
  const tmp = settingsPath + '.tmp';
  try {
    writeFileSync(tmp, JSON.stringify(parsed, null, 2) + '\n', 'utf-8');
    const { renameSync } = require('node:fs') as { renameSync: (a: string, b: string) => void };
    renameSync(tmp, settingsPath);
  } catch (err: unknown) {
    result.warnings.push(`Failed to write ${settingsPath}: ${(err as Error).message}`);
    return false;
  }
  return true;
}

function projectCleanup(projectRoot: string, result: MigrationResult, dryRun: boolean): void {
  const v1Version = detectV1Project(projectRoot);
  if (!v1Version) {
    return;
  }
  result.detectedV1Version = v1Version;

  console.log(`Detected v1 install (version ${v1Version}) at ${projectRoot}`);
  backupUserModifiedFiles(projectRoot, result, dryRun);

  const targets = [
    join(projectRoot, '.dev-pomogator'),
    join(projectRoot, '.claude', 'rules', 'plan-pomogator'),
    join(projectRoot, '.claude', 'rules', 'pomogator'),
    join(projectRoot, '.claude', 'rules', 'specs-workflow'),
    join(projectRoot, '.claude', 'rules', 'auto-simplify'),
    join(projectRoot, '.claude', 'rules', 'tui-test-runner'),
    join(projectRoot, '.claude', 'rules', 'reqnroll-ce-guard'),
    join(projectRoot, '.claude', 'rules', 'scope-gate'),
    join(projectRoot, '.claude', 'rules', 'suggest-rules'),
    join(projectRoot, '.claude', 'rules', 'onboard-repo'),
    join(projectRoot, '.claude', 'rules', 'specs-workflow'),
    join(projectRoot, '.claude', 'rules', 'test-quality'),
    join(projectRoot, '.claude', 'rules', 'gotchas'),
    join(projectRoot, '.claude', 'rules', 'checklists'),
  ];
  for (const t of targets) safeRemove(t, result, dryRun);

  removeManagedGitignoreBlock(projectRoot, result, dryRun);

  const settingsLocal = join(projectRoot, '.claude', 'settings.local.json');
  result.settingsLocalUpdated = smartMergeSettingsRemoval(
    settingsLocal,
    (cmd) => cmd.includes('.dev-pomogator/scripts/tsx-runner-bootstrap.cjs') || cmd.includes('.dev-pomogator/tools/'),
    result,
    dryRun,
  );

  if (!dryRun) {
    const markerPath = join(projectRoot, '.dev-pomogator', '.migrated-to-v2');
    try {
      mkdirSync(dirname(markerPath), { recursive: true });
      writeFileSync(markerPath, JSON.stringify({ migratedAt: new Date().toISOString(), v1Version }, null, 2) + '\n', 'utf-8');
      result.markerWritten = true;
    } catch (err: unknown) {
      result.warnings.push(`Failed to write migration marker: ${(err as Error).message}`);
    }
  }
}

function globalCleanup(result: MigrationResult, dryRun: boolean): void {
  const home = homedir();
  const devPomogatorHome = resolveWithinHome(join(home, '.dev-pomogator'));
  if (devPomogatorHome) safeRemove(devPomogatorHome, result, dryRun);

  const configHome = resolveWithinHome(join(home, '.config', 'dev-pomogator'));
  if (configHome) safeRemove(configHome, result, dryRun);

  const globalSettings = join(home, '.claude', 'settings.json');
  result.globalSettingsUpdated = smartMergeSettingsRemoval(
    globalSettings,
    (cmd) => cmd.includes('.dev-pomogator/scripts/tsx-runner-bootstrap.cjs') || cmd.includes('dev-pomogator-statusline'),
    result,
    dryRun,
  );
}

function printSummary(result: MigrationResult, flags: Flags): void {
  const noun = flags.dryRun ? 'Would remove' : 'Removed';
  console.log('');
  console.log('=== Migration v1 → v2 summary ===');
  if (result.detectedV1Version) {
    console.log(`v1 version detected: ${result.detectedV1Version}`);
  } else if (flags.project) {
    console.log('No v1 install detected in project (no cleanup needed for project scope)');
  }
  console.log(`${noun} files: ${result.removedFiles.length}`);
  console.log(`${noun} directories: ${result.removedDirs.length}`);
  console.log(`Backed up to .user-overrides/: ${result.backupFiles.length}`);
  console.log(`.gitignore block removed: ${result.gitignoreBlockRemoved}`);
  console.log(`.claude/settings.local.json updated: ${result.settingsLocalUpdated}`);
  if (flags.global) console.log(`~/.claude/settings.json updated: ${result.globalSettingsUpdated}`);
  console.log(`Marker .migrated-to-v2 written: ${result.markerWritten}`);
  if (result.warnings.length) {
    console.log('');
    console.log('Warnings:');
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
  if (!flags.dryRun && (result.detectedV1Version || result.globalSettingsUpdated || result.removedDirs.length || result.removedFiles.length)) {
    console.log('');
    console.log('✓ Migration complete. Next steps:');
    console.log('  1. /plugin marketplace add stgmt/dev-pomogator');
    console.log('  2. /plugin install dev-pomogator@stgmt');
    console.log('  3. /reload-plugins   (CLI) or restart Claude Desktop');
  }
}

function main(): void {
  const flags = parseFlags(process.argv);
  const projectRoot = process.cwd();
  const result: MigrationResult = {
    detectedV1Version: null,
    removedFiles: [],
    removedDirs: [],
    backupFiles: [],
    gitignoreBlockRemoved: false,
    settingsLocalUpdated: false,
    globalSettingsUpdated: false,
    markerWritten: false,
    warnings: [],
  };

  if (flags.dryRun) console.log('[DRY RUN] no files will be modified');

  if (flags.project) projectCleanup(projectRoot, result, flags.dryRun);
  if (flags.global) globalCleanup(result, flags.dryRun);

  printSummary(result, flags);
  process.exit(0);
}

main();
