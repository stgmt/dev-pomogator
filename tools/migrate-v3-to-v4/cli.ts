// FR-11 migrate-v3-to-v4 CLI.
//
// Modes:
//   --suggest-only       print per-file diffs to stdout, never modify files
//   (default)            print diff + apply when confirmed; bumps
//                        `.specs/.progress.json::version` from 3 → 4
//                        only when at least one file was rewritten.
//
// Per-file safety:
//   • Reads each `.specs/[slug]/*.md`, parses for `### Requirement: FR-N`
//     headings.
//   • If `--suggest-only` → print diff, never write.
//   • Else → write the converted body atomically (temp + rename).
//
// Exit codes: 0 always. The CLI never returns non-zero unless argv is
// malformed — file-level failures are surfaced as per-file lines in
// stdout so the runner can pipe + grep without losing the overall ok.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { convertSource, renderDiff, type ConversionResult } from './converter.ts';

export interface RunArgs {
  repoRoot: string;
  suggestOnly: boolean;
  /** Limit to these spec slugs; empty = all. */
  slugs?: string[];
}

export interface FileResult {
  file: string;             // repo-relative POSIX path
  changed: boolean;
  applied: boolean;         // true iff we wrote to disk
  conversion: ConversionResult;
  error?: string;
}

export interface RunResult {
  files: FileResult[];
  /** Total FR headings converted across all files. */
  totalHeadingsConverted: number;
  versionBumped: boolean;
  text: string;             // human-readable stdout
}

function listSpecMdFiles(repoRoot: string, slugs?: string[]): string[] {
  const specsDir = path.join(repoRoot, '.specs');
  if (!fs.existsSync(specsDir)) return [];
  const out: string[] = [];
  for (const slug of fs.readdirSync(specsDir, { withFileTypes: true })) {
    if (!slug.isDirectory()) continue;
    if (slugs && slugs.length > 0 && !slugs.includes(slug.name)) continue;
    const dir = path.join(specsDir, slug.name);
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      out.push(path.join(dir, name));
    }
  }
  return out;
}

function atomicWrite(filePath: string, content: string): void {
  const tmp = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, filePath);
}

function bumpProgressVersion(repoRoot: string): boolean {
  const progressPath = path.join(repoRoot, '.specs', '.progress.json');
  let progress: { version?: number; [k: string]: unknown };
  try {
    progress = JSON.parse(fs.readFileSync(progressPath, 'utf8')) as typeof progress;
  } catch {
    progress = {};
  }
  const current = typeof progress.version === 'number' ? progress.version : 3;
  if (current >= 4) return false;
  progress.version = 4;
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  atomicWrite(progressPath, JSON.stringify(progress, null, 2) + '\n');
  return true;
}

export function run(args: RunArgs): RunResult {
  const files = listSpecMdFiles(args.repoRoot, args.slugs);
  const results: FileResult[] = [];
  const lines: string[] = [];
  let totalConverted = 0;

  for (const abs of files) {
    const rel = path.relative(args.repoRoot, abs).split(path.sep).join('/');
    try {
      const source = fs.readFileSync(abs, 'utf8');
      const conv = convertSource(source);
      const entry: FileResult = {
        file: rel,
        changed: conv.changed,
        applied: false,
        conversion: conv,
      };
      if (conv.changed) {
        totalConverted += conv.changes.length;
        const diff = renderDiff(rel, conv);
        if (diff) lines.push(diff);
        if (!args.suggestOnly) {
          atomicWrite(abs, conv.newSource);
          entry.applied = true;
        }
      }
      results.push(entry);
    } catch (err) {
      results.push({
        file: rel,
        changed: false,
        applied: false,
        conversion: { changed: false, newSource: '', changes: [] },
        error: err instanceof Error ? err.message : String(err),
      });
      lines.push(`# error: ${rel} — ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }

  let versionBumped = false;
  if (!args.suggestOnly && totalConverted > 0) {
    versionBumped = bumpProgressVersion(args.repoRoot);
  }

  lines.push('');
  lines.push(`# Summary`);
  lines.push(`#   files scanned:          ${results.length}`);
  lines.push(`#   files with conversions: ${results.filter((r) => r.changed).length}`);
  lines.push(`#   headings converted:     ${totalConverted}`);
  lines.push(`#   mode:                   ${args.suggestOnly ? '--suggest-only (no writes)' : 'apply'}`);
  if (versionBumped) {
    lines.push(`#   .specs/.progress.json:  version → 4`);
  }
  return {
    files: results,
    totalHeadingsConverted: totalConverted,
    versionBumped,
    text: lines.join('\n') + '\n',
  };
}

export function parseArgs(argv: string[]): RunArgs {
  const args: RunArgs = {
    repoRoot: process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd(),
    suggestOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--suggest-only':
        args.suggestOnly = true;
        break;
      case '--root':
        args.repoRoot = argv[i + 1];
        i++;
        break;
      case '--slug':
        if (!args.slugs) args.slugs = [];
        args.slugs.push(argv[i + 1]);
        i++;
        break;
      case '--help':
      case '-h':
        process.stdout.write(
          'Usage: dev-pomogator migrate-v3-to-v4 [--suggest-only] [--root PATH] [--slug NAME ...]\n',
        );
        process.exit(0);
        break;
      default:
        throw new Error(`unknown flag "${a}"`);
    }
  }
  return args;
}

function isMain(): boolean {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = run(args);
    process.stdout.write(result.text);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[migrate-v3-to-v4] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
