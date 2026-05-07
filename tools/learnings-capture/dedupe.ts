// Auto-Capture Learnings — Dedupe Logic
// Used by suggest-rules Phase 2.5 (queue-based candidate overlap)
// and Phase 6 (pairwise rule merge candidates)

import { promises as nodeFs } from 'node:fs';
import path from 'path';

async function pathExists(p: string): Promise<boolean> {
  try { await nodeFs.access(p); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverlapResult {
  type: 'DUP' | 'MERGE' | 'NEW';
  overlapPercent: number;
  matchedFile?: string;
}

export interface MergeCandidate {
  file1: string;
  file2: string;
  overlap: number;
}

// ---------------------------------------------------------------------------
// Keyword Extraction
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
  'under', 'again', 'further', 'then', 'once', 'and', 'but', 'or', 'nor',
  'not', 'so', 'than', 'too', 'very', 'just', 'about', 'up', 'its',
  'this', 'that', 'these', 'those', 'each', 'every', 'all', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'only', 'own',
  'same', 'also', 'how', 'when', 'where', 'why', 'what', 'which', 'who',
  'if', 'else', 'true', 'false', 'null', 'undefined', 'при', 'для',
  'или', 'как', 'что', 'это', 'все', 'они', 'его', 'она', 'оно',
  'мы', 'вы', 'нет', 'да', 'так', 'тоже', 'уже', 'ещё', 'еще',
  // Approval-context words (merged from capture.ts)
  'really', 'great', 'good', 'perfect', 'exactly', 'needed', 'wanted',
  'works', 'job', 'work', 'correctly', 'нужно', 'надо', 'мне',
]);

export function extractKeywords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s_-]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  return new Set(words);
}

// ---------------------------------------------------------------------------
// Overlap Calculation
// ---------------------------------------------------------------------------

function computeOverlap(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0;

  let intersectionSize = 0;
  for (const word of set1) {
    if (set2.has(word)) intersectionSize++;
  }

  const minSize = Math.min(set1.size, set2.size);
  return (intersectionSize / minSize) * 100;
}

// ---------------------------------------------------------------------------
// Glob Helper
// ---------------------------------------------------------------------------

async function findRuleFiles(rulesDir: string): Promise<string[]> {
  if (!(await pathExists(rulesDir))) return [];

  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await nodeFs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  await walk(rulesDir);
  return files;
}

// ---------------------------------------------------------------------------
// Check Overlap (Phase 2.5)
// ---------------------------------------------------------------------------

export async function checkOverlap(
  signal: string,
  context: string,
  rulesDir: string
): Promise<OverlapResult> {
  const candidateKeywords = extractKeywords(`${signal} ${context}`);
  if (candidateKeywords.size === 0) {
    return { type: 'NEW', overlapPercent: 0 };
  }

  const ruleFiles = await findRuleFiles(rulesDir);
  let maxOverlap = 0;
  let maxFile: string | undefined;

  for (const file of ruleFiles) {
    const content = await nodeFs.readFile(file, 'utf-8');
    const ruleKeywords = extractKeywords(content);
    const overlap = computeOverlap(candidateKeywords, ruleKeywords);

    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      maxFile = file;
    }
  }

  if (maxOverlap > 80) {
    return { type: 'DUP', overlapPercent: maxOverlap, matchedFile: maxFile };
  } else if (maxOverlap >= 30) {
    return { type: 'MERGE', overlapPercent: maxOverlap, matchedFile: maxFile };
  }

  return { type: 'NEW', overlapPercent: maxOverlap };
}

// ---------------------------------------------------------------------------
// Find Merge Candidates (Phase 6)
// ---------------------------------------------------------------------------

export async function findMergeCandidates(
  rulesDir: string
): Promise<MergeCandidate[]> {
  const ruleFiles = await findRuleFiles(rulesDir);
  if (ruleFiles.length < 2) return [];

  // Pre-compute keywords for all files
  const fileKeywords = new Map<string, Set<string>>();
  for (const file of ruleFiles) {
    const content = await nodeFs.readFile(file, 'utf-8');
    fileKeywords.set(file, extractKeywords(content));
  }

  const candidates: MergeCandidate[] = [];

  // Pairwise comparison
  for (let i = 0; i < ruleFiles.length; i++) {
    for (let j = i + 1; j < ruleFiles.length; j++) {
      const kw1 = fileKeywords.get(ruleFiles[i])!;
      const kw2 = fileKeywords.get(ruleFiles[j])!;
      const overlap = computeOverlap(kw1, kw2);

      if (overlap > 70) {
        candidates.push({
          file1: ruleFiles[i],
          file2: ruleFiles[j],
          overlap: Math.round(overlap),
        });
      }
    }
  }

  // Sort by overlap descending
  candidates.sort((a, b) => b.overlap - a.overlap);
  return candidates;
}
