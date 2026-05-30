// link-fixer resolver — given a backlog entry for a dead link in a markdown file,
// scans for markdown link syntax [label](target), checks if target exists, and if not,
// globs the repo for files matching the target's basename. If exactly ONE match is found,
// rewrites the link target to the correct relative path from the spec directory.
//
// Mechanical — no LLM call. Uses substring matching on basename.
//
// Idempotent: if the link target already exists, returns notes saying so.

import fs from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';
import type { Resolver, ResolverResult } from './types.ts';
import type { BacklogEntry } from '../types.ts';

// Markdown link pattern: [label](target) — capture target path
const LINK_PATTERN = /\[([^\]]*)\]\(([^)]+)\)/g;

export const linkFixer: Resolver = {
  name: 'link-fixer',
  description:
    'Rewrites dead markdown links by globbing the repo for files matching the target basename — fixes typos and path mismatches in one pass.',

  async resolve(opts): Promise<ResolverResult> {
    return linkFixerImpl(opts.repoRoot, opts.entry);
  },
};

function linkFixerImpl(repoRoot: string, entry: BacklogEntry): ResolverResult {
  const specDir = path.join(repoRoot, '.specs', entry.slug);
  const file = entry.evidence.file;
  const deadTarget = entry.evidence.target as string | undefined;

  if (!file || !deadTarget) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `evidence.file or evidence.target missing — cannot fix link.`,
      bailed_out: { reason: 'missing-evidence' },
    };
  }

  // evidence.file from cross-spec-reconcile is a repo-relative path with
  // optional `:line` suffix and may use Windows separators. Normalise it,
  // then resolve absolutely from repoRoot if it already starts with `.specs/`.
  const cleanFile = file.replace(/:\d+$/, '').replace(/\\/g, '/');
  const filePath = cleanFile.startsWith('.specs/')
    ? path.join(repoRoot, cleanFile)
    : path.join(specDir, cleanFile);

  if (!fs.existsSync(filePath)) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Spec file ${entry.slug}/${file} not found.`,
      bailed_out: { reason: 'source-file-missing' },
    };
  }

  const targetPath = path.join(specDir, deadTarget);

  // Idempotent: if the link target already exists, we're done.
  if (fs.existsSync(targetPath)) {
    return {
      confidence: 1,
      files_changed: [],
      notes: `${entry.slug}/${deadTarget} already exists — link is correct.`,
      bailed_out: { reason: 'already-exists' },
    };
  }

  // Read the markdown file and find the dead link
  const content = fs.readFileSync(filePath, 'utf8');
  let foundLink = false;
  let linkLabel = '';

  LINK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_PATTERN.exec(content)) !== null) {
    if (match[2] === deadTarget) {
      foundLink = true;
      linkLabel = match[1];
      break;
    }
  }

  if (!foundLink) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Dead link [${deadTarget}] not found in ${entry.slug}/${file}.`,
      bailed_out: { reason: 'link-not-found' },
    };
  }

  // Glob for files matching the basename
  const targetBasename = path.basename(deadTarget);
  const glob_pattern = `**/${targetBasename}`;

  let matches: string[];
  try {
    matches = globSync(glob_pattern, {
      cwd: repoRoot,
      absolute: true,
      ignore: ['node_modules/**', '.git/**', 'dist/**', '.next/**', 'build/**'],
    });
  } catch (err) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Glob pattern error while searching for ${targetBasename}: ${err instanceof Error ? err.message : String(err)}.`,
      bailed_out: { reason: 'glob-error' },
    };
  }

  // Exclude matches that are clearly not relevant (binaries, node_modules leaks, etc.)
  matches = matches.filter((m) => {
    const rel = path.relative(repoRoot, m);
    return !rel.match(/node_modules|\.git|\.next|dist|build|\.cache/);
  });

  if (matches.length === 0) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `No file named \`${targetBasename}\` found in repo (excluding node_modules, .git, etc.).`,
      bailed_out: { reason: 'no-match' },
    };
  }

  if (matches.length > 1) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `Found ${matches.length} files named \`${targetBasename}\` — cannot auto-resolve ambiguity. Manual review required.`,
      bailed_out: { reason: 'ambiguous-match' },
    };
  }

  // Exactly one match — rewrite the link
  const correctAbsPath = matches[0];
  const correctRelPath = path.relative(specDir, correctAbsPath);

  const newContent = content.replace(
    `[${linkLabel}](${deadTarget})`,
    `[${linkLabel}](${correctRelPath})`,
  );

  fs.writeFileSync(filePath, newContent, 'utf8');

  return {
    confidence: 0.85,
    files_changed: [path.relative(repoRoot, filePath)],
    notes:
      `Rewrote dead link [${linkLabel}](${deadTarget}) → [${linkLabel}](${correctRelPath}) ` +
      `in ${entry.slug}/${file}. Matched against sole occurrence of \`${targetBasename}\` in repo.`,
  };
}
