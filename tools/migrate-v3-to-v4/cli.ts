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
import { createInterface } from 'node:readline';
import { convertSource, renderDiff, type ConversionResult } from './converter.ts';
import { promptApplyTimeout, type PromptResult, type Decision } from './interactive.ts';

export interface RunArgs {
  repoRoot: string;
  suggestOnly: boolean;
  /** Non-interactive auto-apply (CI escape hatch); default no-flag is interactive per FR-11. */
  yes?: boolean;
  /** Limit to these spec slugs; empty = all. */
  slugs?: string[];
}

export interface FileResult {
  file: string;             // repo-relative POSIX path
  changed: boolean;
  applied: boolean;         // true iff we wrote to disk
  conversion: ConversionResult;
  /** Interactive decision for this file (undefined in non-interactive run()). */
  decision?: Decision;
  /** True iff the interactive prompt timed out (→ default skip). */
  timedOut?: boolean;
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

  lines.push(
    ...summaryLines(
      results,
      totalConverted,
      args.suggestOnly ? '--suggest-only (no writes)' : 'apply',
      versionBumped,
    ),
  );
  return {
    files: results,
    totalHeadingsConverted: totalConverted,
    versionBumped,
    text: lines.join('\n') + '\n',
  };
}

/** Shared `# Summary` footer for both the non-interactive and interactive runs. */
function summaryLines(
  results: FileResult[],
  totalConverted: number,
  modeLabel: string,
  versionBumped: boolean,
): string[] {
  const out: string[] = [
    '',
    `# Summary`,
    `#   files scanned:          ${results.length}`,
    `#   files with conversions: ${results.filter((r) => r.changed).length}`,
    `#   headings converted:     ${totalConverted}`,
    `#   mode:                   ${modeLabel}`,
  ];
  if (versionBumped) out.push(`#   .specs/.progress.json:  version → 4`);
  return out;
}

/** Per-file interactive prompt: receives file context, resolves a decision. */
export interface InteractivePrompt {
  (ctx: { file: string; headingCount: number }): Promise<PromptResult>;
}

/**
 * Interactive migration (FR-11 / AC-11.2). Each *changed* file is presented
 * to `prompt` (approve/skip/edit, 30s default-skip). Only `apply` writes to
 * disk; `skip` / `edit` / timeout leave the file byte-stable and the loop
 * proceeds to the next file. The version bump fires only when at least one
 * file was actually applied — skipping everything must not bump.
 */
export async function runInteractive(args: RunArgs, prompt: InteractivePrompt): Promise<RunResult> {
  const files = listSpecMdFiles(args.repoRoot, args.slugs);
  const results: FileResult[] = [];
  const lines: string[] = [];
  let totalConverted = 0;
  let appliedCount = 0;

  for (const abs of files) {
    const rel = path.relative(args.repoRoot, abs).split(path.sep).join('/');
    try {
      const source = fs.readFileSync(abs, 'utf8');
      const conv = convertSource(source);
      const entry: FileResult = { file: rel, changed: conv.changed, applied: false, conversion: conv };
      if (conv.changed) {
        totalConverted += conv.changes.length;
        const diff = renderDiff(rel, conv);
        if (diff) lines.push(diff);
        const res = await prompt({ file: rel, headingCount: conv.changes.length });
        entry.decision = res.decision;
        entry.timedOut = res.timedOut;
        if (res.decision === 'apply') {
          atomicWrite(abs, conv.newSource);
          entry.applied = true;
          appliedCount++;
        }
        // skip / edit / timeout → leave the file unchanged, proceed to next.
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
  if (appliedCount > 0) versionBumped = bumpProgressVersion(args.repoRoot);

  lines.push(...summaryLines(results, totalConverted, 'interactive', versionBumped));
  return {
    files: results,
    totalHeadingsConverted: totalConverted,
    versionBumped,
    text: lines.join('\n') + '\n',
  };
}

/** Production prompt: a fresh readline source per file + the 30s default-skip. */
export function defaultPrompt(): InteractivePrompt {
  return async (ctx) => {
    const rl = createInterface({ input: process.stdin });
    try {
      return await promptApplyTimeout({ input: rl, context: ctx });
    } finally {
      rl.close();
    }
  };
}

export interface DispatchDeps {
  /** Injected per-file prompt (tests). Defaults to the readline-backed prompt. */
  prompt?: InteractivePrompt;
}

/**
 * Route by mode: `--suggest-only` and `--yes` are non-interactive (engine
 * `run()`); the default no-flag invocation is interactive per FR-11/AC-11.2.
 * This is the single seam `main()` and the BDD suite share — so "no flag →
 * interactive" is verified at the routing layer, not merely assumed.
 */
export async function dispatch(args: RunArgs, deps: DispatchDeps = {}): Promise<RunResult> {
  if (args.suggestOnly || args.yes) return run(args);
  return runInteractive(args, deps.prompt ?? defaultPrompt());
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
      case '--yes':
      case '-y':
        args.yes = true;
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
          'Usage: dev-pomogator migrate-v3-to-v4 [--suggest-only] [--yes] [--root PATH] [--slug NAME ...]\n' +
            '  (default no-flag is interactive: approve/skip/edit per file, 30s default-skip;\n' +
            '   --yes auto-applies non-interactively, --suggest-only is a dry-run)\n',
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
  void (async () => {
    try {
      const args = parseArgs(process.argv.slice(2));
      const result = await dispatch(args);
      process.stdout.write(result.text);
      process.exit(0);
    } catch (err) {
      process.stderr.write(`[migrate-v3-to-v4] ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  })();
}
