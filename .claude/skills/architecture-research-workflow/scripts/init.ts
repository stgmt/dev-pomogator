// architecture-research-workflow Stage 0 — scaffold .architecture-research/.
//
// Creates `.specs/<slug>/.architecture-research/` and writes seven empty
// stage files from the templates in `./references/<N>-<stage>.md`.
// Idempotent: re-running on an existing dir leaves files alone unless
// --force is supplied. Returns a structured summary so the calling
// agent can print a one-line confirmation.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const STAGES = [
  { num: 1, slug: 'problem-framing', title: 'Problem framing' },
  { num: 2, slug: 'external-pain', title: 'External-pain validation' },
  { num: 3, slug: 'broad-research', title: 'Broad research' },
  { num: 4, slug: 'variants', title: 'Variant generation' },
  { num: 5, slug: 'decisions-locked', title: 'Decision Q&A loop' },
  { num: 6, slug: 'rollout-phases', title: 'Phased rollout' },
  { num: 7, slug: 'handoff', title: 'Hand-off + merge' },
] as const;

export interface InitOptions {
  repoRoot: string;
  slug: string;
  force?: boolean;
}

export interface InitResult {
  dir: string;
  created: string[];
  skipped: string[];
}

function templatePath(repoRoot: string, num: number, slug: string): string {
  return path.join(
    repoRoot,
    '.claude',
    'skills',
    'architecture-research-workflow',
    'references',
    `${num}-${slug}.md`,
  );
}

function defaultTemplate(num: number, slug: string, title: string): string {
  return [
    `# Stage ${num} — ${title}`,
    '',
    `<!-- Owner: architecture-research-workflow Stage ${num}. -->`,
    `<!-- Filled by the agent during the live skill invocation. -->`,
    '',
    `## Inputs from prior stages`,
    '',
    num === 1 ? '_None — this is the entry stage._' : `_See ./${num - 1}-*.md._`,
    '',
    `## Findings`,
    '',
    `_(fill in)_`,
    '',
    `## Open questions for the next stage`,
    '',
    `_(list)_`,
    '',
  ].join('\n');
}

function loadTemplate(repoRoot: string, num: number, slug: string, title: string): string {
  const p = templatePath(repoRoot, num, slug);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  return defaultTemplate(num, slug, title);
}

export function initStageFiles(opts: InitOptions): InitResult {
  const dir = path.join(opts.repoRoot, '.specs', opts.slug, '.architecture-research');
  fs.mkdirSync(dir, { recursive: true });
  const created: string[] = [];
  const skipped: string[] = [];
  for (const stage of STAGES) {
    const fileName = `${stage.num}-${stage.slug}.md`;
    const target = path.join(dir, fileName);
    if (fs.existsSync(target) && !opts.force) {
      skipped.push(fileName);
      continue;
    }
    const body = loadTemplate(opts.repoRoot, stage.num, stage.slug, stage.title);
    fs.writeFileSync(target, body);
    created.push(fileName);
  }
  return { dir, created, skipped };
}

function isMain(): boolean {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const slugIndex = argv.findIndex((a) => a === '--slug');
  if (slugIndex === -1 || !argv[slugIndex + 1]) {
    process.stderr.write('Usage: init.ts --slug <name> [--force]\n');
    process.exit(1);
  }
  const result = initStageFiles({
    repoRoot: process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd(),
    slug: argv[slugIndex + 1],
    force,
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
