/**
 * Phase 0 Step 1: Archetype triage (FR-8, NFR-P2).
 *
 * 2-minute triage ДО parallel recon — classifies repo в один из 9 архетипов
 * (или `unknown`). Читает только root + top-2-depth directories, НЕ бизнес-логику.
 *
 * Routing для последующих шагов — archetype определяет какие subagent prompts запускать,
 * какие секции в report, какие rules релевантны.
 *
 * See .specs/onboard-repo-phase0/FR.md#fr-8, NFR.md#performance (≤120s).
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fsExtra from 'fs-extra';
import { glob } from 'glob';
import type { ArchetypeTriageResult, Archetype, Confidence } from '../lib/types.ts';


interface SignalRule {
  path?: string;
  pathPattern?: string;
  contentMatch?: string;
  weight: number;
}

interface ArchetypeEntry {
  signals: SignalRule[];
  incompatible_with: string[];
}

interface SignalsConfig {
  archetypes: Record<string, ArchetypeEntry>;
  confidence_thresholds: { high: number; medium: number; low: number };
}


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIGNALS_PATH = path.resolve(__dirname, '..', 'templates', 'archetype-signals.json');


let cachedConfig: SignalsConfig | null = null;

async function loadSignalsConfig(): Promise<SignalsConfig> {
  if (cachedConfig) return cachedConfig;
  const raw = (await fsExtra.readJson(SIGNALS_PATH)) as SignalsConfig & { $description?: string };
  cachedConfig = { archetypes: raw.archetypes, confidence_thresholds: raw.confidence_thresholds };
  return cachedConfig;
}


async function pathExistsAtDepth(projectPath: string, relPath: string, maxDepth: number = 2): Promise<boolean> {
  const depthParts = relPath.split(/[/\\]/).filter(Boolean);
  if (depthParts.length > maxDepth) return false;
  const absPath = path.join(projectPath, relPath);
  return await fsExtra.pathExists(absPath);
}


async function matchesPattern(projectPath: string, pattern: string, maxDepth: number = 2): Promise<string[]> {
  const maxLevels = '*/'.repeat(Math.max(0, maxDepth - 1));
  const patterns = [pattern, `${maxLevels}${pattern}`.replace(/\/+/g, '/')];
  const matches: string[] = [];
  for (const p of patterns) {
    const hits = await glob(p, { cwd: projectPath, dot: false, nodir: false });
    matches.push(...hits);
  }
  return [...new Set(matches)];
}


async function readFileContent(projectPath: string, relPath: string): Promise<string | null> {
  const absPath = path.join(projectPath, relPath);
  try {
    const stat = await fsExtra.stat(absPath);
    if (stat.isDirectory()) return null;
    if (stat.size > 1024 * 1024) return null; // skip files > 1MB
    return await fsExtra.readFile(absPath, 'utf-8');
  } catch {
    return null;
  }
}


async function scoreSignal(projectPath: string, signal: SignalRule): Promise<{ matched: boolean; contribution: number }> {
  let matchedPath = false;
  let matchedContent = true; // content match requires path match first; if no content constraint, pass

  if (signal.path) {
    matchedPath = await pathExistsAtDepth(projectPath, signal.path, 2);

    if (matchedPath && signal.contentMatch) {
      const content = await readFileContent(projectPath, signal.path);
      if (content === null) {
        matchedContent = false;
      } else {
        try {
          const regex = new RegExp(signal.contentMatch, 'm');
          matchedContent = regex.test(content);
        } catch {
          matchedContent = false;
        }
      }
    }
  } else if (signal.pathPattern) {
    const matches = await matchesPattern(projectPath, signal.pathPattern, 2);
    matchedPath = matches.length > 0;
  }

  const matched = matchedPath && matchedContent;
  return { matched, contribution: matched ? signal.weight : 0 };
}


function determineConfidence(score: number, thresholds: SignalsConfig['confidence_thresholds']): Confidence {
  if (score >= thresholds.high) return 'high';
  if (score >= thresholds.medium) return 'medium';
  return 'low';
}


export async function archetypeTriage(projectPath: string): Promise<ArchetypeTriageResult> {
  const config = await loadSignalsConfig();
  const scores: Record<string, { score: number; matchedSignals: string[] }> = {};

  for (const [archetype, entry] of Object.entries(config.archetypes)) {
    let score = 0;
    const matched: string[] = [];
    for (const signal of entry.signals) {
      const result = await scoreSignal(projectPath, signal);
      if (result.matched) {
        score += result.contribution;
        matched.push(signalLabel(signal));
      }
    }
    scores[archetype] = { score, matchedSignals: matched };
  }

  // Apply incompatibility penalties: если другой archetype имеет высокий score, и текущий archetype
  // указан в его incompatible_with — пенализируем текущий.
  const finalScores: Record<string, number> = {};
  for (const [archetype, data] of Object.entries(scores)) {
    finalScores[archetype] = data.score;
  }
  for (const [archetype, entry] of Object.entries(config.archetypes)) {
    const myScore = finalScores[archetype] ?? 0;
    for (const incompat of entry.incompatible_with) {
      const incompatScore = finalScores[incompat] ?? 0;
      if (incompatScore > myScore) {
        finalScores[archetype] = Math.max(0, myScore - incompatScore);
      }
    }
  }

  let bestArchetype: Archetype = 'unknown';
  let bestScore = 0;
  for (const [archetype, score] of Object.entries(finalScores)) {
    if (score > bestScore) {
      bestScore = score;
      bestArchetype = archetype as Archetype;
    }
  }

  if (bestScore < config.confidence_thresholds.low) {
    return {
      archetype: 'unknown',
      confidence: 'low',
      evidence: 'No signal files matched — repo content too minimal for classification',
    };
  }

  const confidence = determineConfidence(bestScore, config.confidence_thresholds);
  const matchedLabels = scores[bestArchetype]?.matchedSignals ?? [];
  const evidence = matchedLabels.length > 0
    ? `Matched signals: ${matchedLabels.slice(0, 5).join(', ')}`
    : 'no signals';

  const result: ArchetypeTriageResult = {
    archetype: bestArchetype,
    confidence,
    evidence,
  };

  if (bestArchetype === 'fullstack-monorepo') {
    const subs = await detectMonorepoSubArchetypes(projectPath, config);
    if (subs.length > 0) result.sub_archetypes = subs;
  }

  return result;
}


function signalLabel(signal: SignalRule): string {
  if (signal.path) return signal.path;
  if (signal.pathPattern) return signal.pathPattern;
  return '?';
}


async function detectMonorepoSubArchetypes(
  projectPath: string,
  config: SignalsConfig,
): Promise<Array<{ path: string; archetype: Archetype }>> {
  const candidates = ['packages', 'apps'];
  const results: Array<{ path: string; archetype: Archetype }> = [];
  for (const candidate of candidates) {
    const candidateDir = path.join(projectPath, candidate);
    if (!(await fsExtra.pathExists(candidateDir))) continue;
    const entries = await fsExtra.readdir(candidateDir);
    for (const entry of entries) {
      const subPath = path.join(candidateDir, entry);
      const stat = await fsExtra.stat(subPath);
      if (!stat.isDirectory()) continue;
      const subResult = await archetypeTriageSingleLevel(subPath, config);
      if (subResult && subResult !== 'unknown' && subResult !== 'fullstack-monorepo') {
        results.push({ path: path.join(candidate, entry).replace(/\\/g, '/') + '/', archetype: subResult });
      }
    }
  }
  return results;
}


async function archetypeTriageSingleLevel(projectPath: string, config: SignalsConfig): Promise<Archetype | null> {
  let best: { archetype: Archetype; score: number } = { archetype: 'unknown', score: 0 };
  for (const [archetype, entry] of Object.entries(config.archetypes)) {
    if (archetype === 'fullstack-monorepo') continue;
    let score = 0;
    for (const signal of entry.signals) {
      const result = await scoreSignal(projectPath, signal);
      score += result.contribution;
    }
    if (score > best.score) best = { archetype: archetype as Archetype, score };
  }
  if (best.score < config.confidence_thresholds.low) return null;
  return best.archetype;
}
