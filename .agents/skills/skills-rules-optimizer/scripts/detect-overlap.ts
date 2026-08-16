#!/usr/bin/env npx tsx
/**
 * detect-overlap.ts — FR-4 triple-axis Jaccard overlap detection.
 *
 * Pairwise N×N comparison across 3 axes:
 *   - trigger phrases (extracted from `description` field via /"([^"]+)"/g)
 *   - section headings (## .+ patterns в body)
 *   - functional keywords (Mission line + first tokens of Steps section)
 *
 * Pair flagged if any axis Jaccard ≥ threshold (default 0.3).
 *
 * Algorithm derived from connorblack/skill-tools `/deduplicate` slash command
 * (triple-axis) + L-Qun/EvoClaude (Jaccard pre-filter, threshold ≥0.3-0.5).
 *
 * CLI: detect-overlap.ts --dir <path> [--threshold <num>] [--save <file>]
 */

import { writeFileSync, readdirSync } from 'fs';
import { resolve, basename, dirname, join } from 'path';

import {
  buildAsset,
  collectSkillDirs,
  validateDir,
  type Asset,
  type OverlapPair,
} from './shared.ts';

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_THRESHOLD = 0.3;

// ── Axis extractors ─────────────────────────────────────────────────────────

/**
 * Trigger phrases: quoted strings from `description` field.
 * Examples:  "test runner", "vitest", "pytest"
 */
function extractTriggers(asset: Asset): Set<string> {
  const desc = String(asset.frontmatter.description ?? '');
  const triggers = new Set<string>();
  const re = /"([^"\n]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc)) !== null) {
    const phrase = m[1].trim().toLowerCase();
    if (phrase) triggers.add(phrase);
  }
  return triggers;
}

/**
 * Universal headings present в most skills — exclude from overlap detection
 * чтобы не triggers false positives на boilerplate structure.
 */
const TRIVIAL_SECTIONS = new Set([
  'mission', 'steps', 'output', 'references', 'when triggered', 'arguments',
  'usage', 'examples', 'overview', 'execution', 'execution steps',
]);

/**
 * Section headings: ## .+ patterns в body, lowercased, excluding trivial boilerplate.
 */
function extractSections(asset: Asset): Set<string> {
  const sections = new Set<string>();
  const lines = asset.body.split(/\r?\n/);
  for (const line of lines) {
    const m = /^##\s+(.+)$/.exec(line);
    if (m) {
      const heading = m[1].trim().toLowerCase().replace(/[^\w\s]/g, '').trim();
      if (heading && !TRIVIAL_SECTIONS.has(heading)) sections.add(heading);
    }
  }
  return sections;
}

/**
 * Functional keywords: tokens from Mission line + first line of each Steps item.
 * Filtered: stopwords removed, words ≥3 chars only.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'when', 'then',
  'will', 'must', 'should', 'has', 'have', 'are', 'was', 'were', 'been', 'being',
  'и', 'в', 'на', 'по', 'для', 'не', 'это', 'как', 'или', 'то', 'если', 'есть',
]);

function extractFunctional(asset: Asset): Set<string> {
  const tokens = new Set<string>();
  const lines = asset.body.split(/\r?\n/);

  let inMission = false;
  let inSteps = false;
  for (const line of lines) {
    if (/^##\s+Mission\b/i.test(line)) {
      inMission = true;
      inSteps = false;
      continue;
    }
    if (/^##\s+Steps\b/i.test(line)) {
      inMission = false;
      inSteps = true;
      continue;
    }
    if (/^##\s+/.test(line)) {
      inMission = false;
      inSteps = false;
      continue;
    }

    if (inMission && line.trim().length > 0) {
      addTokens(line, tokens);
    }
    if (inSteps) {
      const stepMatch = /^\s*\d+\.\s+(.+)$/.exec(line);
      if (stepMatch) addTokens(stepMatch[1], tokens);
    }
  }

  return tokens;
}

function addTokens(text: string, set: Set<string>): void {
  const words = text.toLowerCase().match(/[a-zа-я0-9]+/gi) ?? [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (lw.length >= 3 && !STOPWORDS.has(lw)) {
      set.add(lw);
    }
  }
}

// ── Jaccard ─────────────────────────────────────────────────────────────────

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function recommendationFor(similarity: number): OverlapPair['recommendation'] {
  if (similarity >= 0.7) return 'merge';
  if (similarity >= 0.5) return 'cross-reference';
  if (similarity >= 0.3) return 'reorganize';
  return 'keep separate';
}

// ── Main ────────────────────────────────────────────────────────────────────

interface SkillIndex {
  name: string;
  triggers: Set<string>;
  sections: Set<string>;
  functional: Set<string>;
}

function buildIndex(skillMdPath: string): SkillIndex {
  const asset = buildAsset(skillMdPath, 'skill');
  return {
    name: basename(dirname(skillMdPath)),
    triggers: extractTriggers(asset),
    sections: extractSections(asset),
    functional: extractFunctional(asset),
  };
}

export function detectOverlaps(parentDir: string, threshold: number = DEFAULT_THRESHOLD): OverlapPair[] {
  const skillPaths = collectSkillDirs(parentDir);

  // Also include nested skill dirs (e.g. overlap-pair/a, overlap-pair/b в fixtures).
  // Recursively walk: any subdir containing SKILL.md = skill candidate.
  const nestedSkills = collectNestedSkills(parentDir);
  const allPaths = Array.from(new Set([...skillPaths, ...nestedSkills]));

  const indexes = allPaths.map(buildIndex);
  const overlaps: OverlapPair[] = [];

  for (let i = 0; i < indexes.length; i++) {
    for (let j = i + 1; j < indexes.length; j++) {
      const a = indexes[i];
      const b = indexes[j];

      const triggerSim = jaccard(a.triggers, b.triggers);
      const sectionSim = jaccard(a.sections, b.sections);
      const functionalSim = jaccard(a.functional, b.functional);

      // Flag highest-scoring axis if ≥ threshold.
      const axes: Array<['trigger' | 'sections' | 'functional', number]> = [
        ['trigger', triggerSim],
        ['sections', sectionSim],
        ['functional', functionalSim],
      ];
      const flagged = axes.filter(([, s]) => s >= threshold);
      if (flagged.length === 0) continue;

      // Pick highest-similarity axis as primary report axis (one entry per pair).
      flagged.sort((x, y) => y[1] - x[1]);
      const [axis, similarity] = flagged[0];

      overlaps.push({
        a: a.name,
        b: b.name,
        axis,
        similarity: Math.round(similarity * 100) / 100,
        recommendation: recommendationFor(similarity),
      });
    }
  }

  return overlaps;
}

/**
 * Walk directory recursively; collect all SKILL.md files (not just first-level).
 * Used to support nested fixture structures like overlap-pair/{a,b}/SKILL.md.
 */
function collectNestedSkills(dir: string): string[] {
  const results: string[] = [];
  const queue = [dir];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    let entries: import('fs').Dirent[];
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(cur, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.isFile() && entry.name === 'SKILL.md') results.push(full);
    }
  }
  return results;
}

function parseArgs(argv: string[]): { dir: string; threshold: number; save?: string } {
  let dir = '';
  let threshold = DEFAULT_THRESHOLD;
  let save: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir') dir = argv[++i] ?? '';
    else if (arg === '--threshold') threshold = parseFloat(argv[++i] ?? '');
    else if (arg === '--save') save = argv[++i];
  }
  if (!dir) {
    console.error('Usage: detect-overlap.ts --dir <path> [--threshold <num>] [--save <file>]');
    process.exit(2);
  }
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    console.error(`Invalid threshold ${threshold} (expected 0.0-1.0)`);
    process.exit(2);
  }
  return { dir, threshold, save };
}

function main() {
  const { dir, threshold, save } = parseArgs(process.argv.slice(2));
  const absDir = resolve(dir);
  validateDir(absDir);

  const overlaps = detectOverlaps(absDir, threshold);
  const output = JSON.stringify({ overlaps, threshold }, null, 2);

  if (save) writeFileSync(save, output, 'utf-8');
  else process.stdout.write(output + '\n');
}

const isDirectRun =
  process.argv[1]?.endsWith('detect-overlap.ts') ||
  process.argv[1]?.endsWith('detect-overlap.js');
if (isDirectRun) main();

export { extractTriggers, extractSections, extractFunctional, jaccard };
