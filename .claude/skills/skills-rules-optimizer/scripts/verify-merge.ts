#!/usr/bin/env npx tsx
/**
 * verify-merge.ts — FR-6 ratchet scorer (envelope pattern).
 *
 * Reads merged SKILL.md draft + originals A, B. Loads SCORER_PROMPT template
 * from references/ratchet-scoring.md. Emits JSON envelope: main turn invokes
 * Agent (independent fresh-context sub-agent), parses JSON response, decides
 * apply / revert.
 *
 * CLI: verify-merge.ts --merged <draft-path> --originals <a> <b> [--skills-dir <dir>] [--force]
 *
 * Output JSON envelope:
 *   { action: "invoke-agent", subagent_type: "general-purpose", prompt, decision_handler }
 *
 * Main turn parses scorer JSON response: if regression && !force → delete draft + report;
 * if no regression OR force → rename draft → final SKILL.md + emit cleanup_suggestions.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname, normalize } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATE_PATH = join(__dirname, '..', 'references', 'ratchet-scoring.md');
const DEFAULT_SKILLS_DIR = '.claude/skills';

interface ScorerEnvelope {
  action: 'invoke-agent';
  subagent_type: 'general-purpose';
  prompt: string;
  decision_handler: {
    merged_path: string;
    originals: { a: string; b: string };
    force: boolean;
    on_regression: 'delete_draft_emit_report';
    on_pass: 'rename_draft_emit_cleanup';
    cleanup_suggestions: string[];
  };
}

function loadTemplate(): string {
  if (!existsSync(TEMPLATE_PATH)) {
    console.error(`SCORER_PROMPT template not found: ${TEMPLATE_PATH}`);
    process.exit(2);
  }
  const md = readFileSync(TEMPLATE_PATH, 'utf-8');
  const m = md.match(/```\n([\s\S]*?)```/);
  if (!m) {
    console.error('SCORER_PROMPT template missing code fence в references file.');
    process.exit(2);
  }
  return m[1];
}

function resolveWithinSkills(skillsDir: string, name: string): string {
  const base = resolve(skillsDir);
  const candidate = resolve(base, name);
  const rel = normalize(candidate).slice(normalize(base).length);
  if (rel.startsWith('..')) {
    console.error(`Path traversal rejected: ${name}`);
    process.exit(2);
  }
  return candidate;
}

function readSkillContent(skillsDir: string, name: string): string {
  const dir = resolveWithinSkills(skillsDir, name);
  const skillMd = join(dir, 'SKILL.md');
  if (!existsSync(skillMd)) {
    console.error(`Original skill not found: ${skillMd}`);
    process.exit(2);
  }
  return readFileSync(skillMd, 'utf-8');
}

function buildPrompt(template: string, params: {
  merged: string; nameA: string; nameB: string; origA: string; origB: string;
}): string {
  return template
    .replace(/\{merged\}/g, params.merged)
    .replace(/\{nameA\}/g, params.nameA)
    .replace(/\{nameB\}/g, params.nameB)
    .replace(/\{origA\}/g, params.origA)
    .replace(/\{origB\}/g, params.origB);
}

function parseArgs(argv: string[]): {
  merged: string; a: string; b: string; skillsDir: string; force: boolean;
} {
  let merged = '';
  let a = '';
  let b = '';
  let skillsDir = DEFAULT_SKILLS_DIR;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--merged') merged = argv[++i] ?? '';
    else if (arg === '--originals') {
      a = argv[++i] ?? '';
      b = argv[++i] ?? '';
    } else if (arg === '--skills-dir') {
      skillsDir = argv[++i] ?? DEFAULT_SKILLS_DIR;
    } else if (arg === '--force') {
      force = true;
    }
  }
  if (!merged || !a || !b) {
    console.error('Usage: verify-merge.ts --merged <draft-path> --originals <a> <b> [--skills-dir <dir>] [--force]');
    process.exit(2);
  }
  return { merged, a, b, skillsDir, force };
}

function main() {
  const { merged, a, b, skillsDir, force } = parseArgs(process.argv.slice(2));

  const mergedPath = resolve(merged);
  if (!existsSync(mergedPath)) {
    console.error(`Merged draft not found: ${mergedPath}`);
    process.exit(2);
  }

  const mergedContent = readFileSync(mergedPath, 'utf-8');
  const origA = readSkillContent(skillsDir, a);
  const origB = readSkillContent(skillsDir, b);

  const template = loadTemplate();
  const prompt = buildPrompt(template, {
    merged: mergedContent, nameA: a, nameB: b, origA, origB,
  });

  const envelope: ScorerEnvelope = {
    action: 'invoke-agent',
    subagent_type: 'general-purpose',
    prompt,
    decision_handler: {
      merged_path: mergedPath,
      originals: { a, b },
      force,
      on_regression: 'delete_draft_emit_report',
      on_pass: 'rename_draft_emit_cleanup',
      cleanup_suggestions: [
        `rm -rf ${join(resolve(skillsDir), a)}`,
        `rm -rf ${join(resolve(skillsDir), b)}`,
      ],
    },
  };

  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

const isDirectRun =
  process.argv[1]?.endsWith('verify-merge.ts') ||
  process.argv[1]?.endsWith('verify-merge.js');
if (isDirectRun) main();
