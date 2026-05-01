#!/usr/bin/env npx tsx
/**
 * merge-skills.ts — FR-5 LLM merge synthesis (envelope pattern).
 *
 * Reads оба SKILL.md, formats MERGE_PROMPT (from references/merge-prompt-template.md),
 * emits JSON envelope to stdout. SKILL.md workflow yields control: main turn parses
 * envelope, calls Agent(subagent_type="general-purpose", prompt=...), writes output
 * to <merged-name>/SKILL.md.draft, runs verify-merge.ts (continuation).
 *
 * NO direct Anthropic SDK / API key dependency. Sub-agent invocation через
 * Claude Code Agent tool (orchestrated by main turn after envelope parsing).
 *
 * CLI: merge-skills.ts --execute <skill-a> <skill-b> --merged-name <name> [--skills-dir <dir>]
 */

import { readFileSync } from 'fs';
import { resolve, join, dirname, isAbsolute, normalize } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEMPLATE_PATH = join(__dirname, '..', 'references', 'merge-prompt-template.md');
const DEFAULT_SKILLS_DIR = '.claude/skills';

interface MergeEnvelope {
  action: 'invoke-agent';
  subagent_type: 'general-purpose';
  prompt: string;
  continuation: string;
  merged_path: string;
}

function loadTemplate(): string {
  if (!existsSync(TEMPLATE_PATH)) {
    console.error(`MERGE_PROMPT template not found: ${TEMPLATE_PATH}`);
    process.exit(2);
  }
  const md = readFileSync(TEMPLATE_PATH, 'utf-8');
  // Extract template body inside ``` code fence
  const m = md.match(/```\n([\s\S]*?)```/);
  if (!m) {
    console.error('MERGE_PROMPT template missing code fence in references file.');
    process.exit(2);
  }
  return m[1];
}

function validateName(name: string, label: string): void {
  // Reject path traversal + invalid characters
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    console.error(`Invalid ${label} "${name}": path traversal not allowed`);
    process.exit(2);
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    console.error(`Invalid ${label} "${name}": must match /^[a-z0-9-]+$/`);
    process.exit(2);
  }
  if (name.length > 64) {
    console.error(`Invalid ${label} "${name}": exceeds 64 char Anthropic limit`);
    process.exit(2);
  }
  for (const forbidden of ['anthropic', 'claude']) {
    if (name.toLowerCase().includes(forbidden)) {
      console.error(`Invalid ${label} "${name}": contains forbidden token "${forbidden}"`);
      process.exit(2);
    }
  }
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
    console.error(`Skill not found: ${skillMd}`);
    process.exit(2);
  }
  return readFileSync(skillMd, 'utf-8');
}

function buildPrompt(template: string, params: {
  name1: string; name2: string; content1: string; content2: string; mergedName: string;
}): string {
  return template
    .replace(/\{name1\}/g, params.name1)
    .replace(/\{name2\}/g, params.name2)
    .replace(/\{content1\}/g, params.content1)
    .replace(/\{content2\}/g, params.content2)
    .replace(/\{mergedName\}/g, params.mergedName);
}

function parseArgs(argv: string[]): {
  execute: boolean; a: string; b: string; mergedName: string; skillsDir: string;
} {
  let execute = false;
  let a = '';
  let b = '';
  let mergedName = '';
  let skillsDir = DEFAULT_SKILLS_DIR;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execute') {
      execute = true;
      a = argv[++i] ?? '';
      b = argv[++i] ?? '';
    } else if (arg === '--merged-name') {
      mergedName = argv[++i] ?? '';
    } else if (arg === '--skills-dir') {
      skillsDir = argv[++i] ?? DEFAULT_SKILLS_DIR;
    }
  }
  if (!execute || !a || !b || !mergedName) {
    console.error('Usage: merge-skills.ts --execute <skill-a> <skill-b> --merged-name <name> [--skills-dir <dir>]');
    process.exit(2);
  }
  return { execute, a, b, mergedName, skillsDir };
}

function main() {
  const { a, b, mergedName, skillsDir } = parseArgs(process.argv.slice(2));

  validateName(a, 'skill name (a)');
  validateName(b, 'skill name (b)');
  validateName(mergedName, 'merged-name');

  const content1 = readSkillContent(skillsDir, a);
  const content2 = readSkillContent(skillsDir, b);

  const template = loadTemplate();
  const prompt = buildPrompt(template, {
    name1: a, name2: b, content1, content2, mergedName,
  });

  // Reject overwrite — merged name must not already exist
  const mergedDir = resolveWithinSkills(skillsDir, mergedName);
  const mergedSkillMd = join(mergedDir, 'SKILL.md');
  if (existsSync(mergedSkillMd)) {
    console.error(`Merged skill already exists: ${mergedSkillMd}`);
    console.error('Refusing to overwrite. Choose a different --merged-name or remove first.');
    process.exit(2);
  }

  // Draft path = where Agent output should be written
  const draftPath = join(mergedDir, 'SKILL.md.draft');

  const envelope: MergeEnvelope = {
    action: 'invoke-agent',
    subagent_type: 'general-purpose',
    prompt,
    continuation: `npx tsx ${__filename.replace('merge-skills.ts', 'verify-merge.ts')} --merged ${draftPath} --originals ${a} ${b} --skills-dir ${skillsDir}`,
    merged_path: draftPath,
  };

  process.stdout.write(JSON.stringify(envelope, null, 2) + '\n');
}

const isDirectRun =
  process.argv[1]?.endsWith('merge-skills.ts') ||
  process.argv[1]?.endsWith('merge-skills.js');
if (isDirectRun) main();
