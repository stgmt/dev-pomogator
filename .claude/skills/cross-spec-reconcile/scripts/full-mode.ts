// cross-spec-reconcile full mode (FR-17 + FR-8 wire-up).
//
// Wraps the existing spec-llm-judge subprocess bridge to surface
// `cross-spec/semantic-drift` findings beyond what mechanical analysis
// catches. The cheap-token-overlap heuristic in `reconcile.ts` flags
// `cross-spec/contradictory-fr` when two same-id FRs share <40% tokens —
// but two FRs CAN share 60% tokens (same domain, similar prose) and
// still describe genuinely different behaviour. That's where the
// LLM-as-judge call comes in.
//
// The decision tree mirrors `tools/spec-llm-judge/index.ts::runJudge`:
//   1. Pre-filter — skip pairs already flagged by mechanical
//      contradictory-fr (no double-count) AND skip pairs without
//      enough body to judge (<60 chars after normalization).
//   2. FR-26 deny-list check runs INSIDE `runJudge`; if a deny-list
//      pattern is found, no subprocess fires and the finding is logged
//      as `SKIPPED_DENY_LIST`.
//   3. Cache hit returns the cached verdict — no spawn.
//   4. Subprocess runs, parses JSON, returns DRIFT or NO_DRIFT.
//
// `runFullMode` is pure orchestration — the LLM spawn is injected so unit tests
// cover every branch without a real call. PRODUCTION default = `deepseekSpawn`
// through the project's AiPomogator OpenAI-compatible route. Fail-open: if the
// provider is unavailable, the spawn throws → `runJudge` returns SUBPROCESS_FAILED → full mode keeps
// the mechanical findings, emits a WARNING semantic finding, and marks the report
// partial instead of silently pretending the semantic pass completed.

import fs from 'node:fs';
import path from 'node:path';
import { runJudge, type JudgeResult } from '../../../../tools/spec-llm-judge/index.ts';
import { selectAipomogatorDeepSeek } from '../../../../tools/_shared/deepseek-model.ts';
import { extractConceptNouns, type Finding, type ReconcileResult, reconcileLight } from './reconcile.ts';

const DEEPSEEK_TIMEOUT_MS = 120_000;
const deepseekBaseUrl = () => (process.env.AUTO_COMMIT_LLM_URL || 'https://aipomogator.ru/go/v1').replace(/\/+$/, '');

/**
 * DeepSeek transport for the semantic-drift judge through AiPomogator's
 * OpenAI-compatible endpoint. Returns the JSON verdict text with optional markdown
 * fences stripped. THROWS on any failure so the caller fails open to SUBPROCESS_FAILED.
 */
async function deepseekSpawn(prompt: string): Promise<string> {
  if (typeof fetch !== 'function') throw new Error('no global fetch (node <18)');
  const apiKey = process.env.AUTO_COMMIT_API_KEY;
  if (!apiKey) throw new Error('AUTO_COMMIT_API_KEY is not configured');
  const baseUrl = deepseekBaseUrl();
  const selection = await selectAipomogatorDeepSeek({
    baseUrl,
    apiKey,
    override: process.env.CROSS_SPEC_RECONCILE_MODEL,
  });
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, DEEPSEEK_TIMEOUT_MS);
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: selection.model,
        max_tokens: 256,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) throw new Error(`DeepSeek chat completion ${r.status}`);
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) throw new Error('empty DeepSeek response');
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  } catch (e) {
    if (timedOut) throw new Error(`semantic dispatcher timeout after ${DEEPSEEK_TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export interface FullModeOptions {
  repoRoot: string;
  slugs?: string[];
  /** Same shape as JudgeOptions.spawn — inject for tests. */
  spawn?: (prompt: string) => Promise<string>;
  /** Hard cap on subprocess calls per run (prevents runaway). Defaults to 50. */
  maxCalls?: number;
  /**
   * Per-spec opt-out flag override. By default the function reads the
   * spec body for `spec_llm_judge_deny: true` in frontmatter. Tests
   * can short-circuit via this map.
   */
  denyOverrides?: Map<string, boolean>;
  /** Forwarded to `reconcileLight` — see ReconcileOptions for semantics. */
  crossSpecFrNamespace?: 'per-spec' | 'shared';
}

export interface FullModeResult extends ReconcileResult {
  mode: 'full';
  /** Number of subprocess calls actually fired (cache hits don't count). */
  subprocess_calls: number;
  /** Number of pairs the judge said had drift. */
  drift_detected: number;
  /** Number of pairs skipped by FR-26 deny-list. */
  deny_list_skips: number;
  /** Number of semantic judge failures that degraded full mode to mechanical-only for the affected pair. */
  semantic_failures: number;
}

const MIN_TEXT_LEN = 60;
const DEFAULT_MAX_CALLS = 50;
const SEMANTIC_PREFILTER_MIN_SHARED = 3;
const SEMANTIC_CONCEPT_WORD_RE = /\b[A-Za-z][A-Za-z0-9-]{2,}\b/g;
const SEMANTIC_CONCEPT_STOPLIST = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have', 'in', 'into', 'is', 'it', 'its',
  'of', 'on', 'or', 'that', 'the', 'their', 'then', 'this', 'to', 'via', 'when', 'with', 'without',
  'add', 'adds', 'after', 'against', 'all', 'also', 'before', 'body', 'both', 'can', 'check', 'checks',
  'code', 'correctly', 'default', 'detect', 'does', 'done', 'each', 'emit', 'emits', 'every', 'exists',
  'fail', 'fails', 'file', 'files', 'flag', 'flow', 'from', 'given', 'green', 'handles', 'long', 'matching',
  'mode', 'must', 'only', 'pair', 'pairs', 'pass', 'passed', 'prose', 'read', 'reads', 'report', 'reports',
  'result', 'returns', 'same', 'scenario', 'shall', 'short', 'shows', 'skip', 'skips', 'spec', 'specs',
  'successfully', 'system', 'task', 'test', 'tests', 'text', 'then', 'true', 'user', 'users', 'when', 'write',
  'writes',
]);
// JS regex has no `\Z` — emulate end-of-input with `(?=\n#{2,3}\s|$)` and
// the `s` flag so `.` is unused; use `[\s\S]*?` non-greedy + lookahead.
const FR_BLOCK_RE = /^#{2,3}\s+(?:Requirement:\s+)?(FR-\d+)(?:[:\s][^\n]*)?\n([\s\S]*?)(?=\n#{2,3}\s|$)/gm;

interface FrBlock {
  slug: string;
  frId: string;
  body: string;
  file: string;
}

function collectFrBlocks(repoRoot: string, slugs: string[]): FrBlock[] {
  const out: FrBlock[] = [];
  for (const slug of slugs) {
    const dir = path.join(repoRoot, '.specs', slug);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const abs = path.join(dir, name);
      const body = fs.readFileSync(abs, 'utf8');
      let m: RegExpExecArray | null;
      FR_BLOCK_RE.lastIndex = 0;
      while ((m = FR_BLOCK_RE.exec(body)) !== null) {
        out.push({
          slug,
          frId: m[1],
          body: m[2].trim(),
          file: abs,
        });
      }
    }
  }
  return out;
}

function semanticConcepts(body: string): Set<string> {
  const concepts = extractConceptNouns(body);
  let m: RegExpExecArray | null;
  SEMANTIC_CONCEPT_WORD_RE.lastIndex = 0;
  while ((m = SEMANTIC_CONCEPT_WORD_RE.exec(body)) !== null) {
    const word = m[0].toLowerCase();
    if (word.length < 3 || SEMANTIC_CONCEPT_STOPLIST.has(word)) continue;
    if (/^fr-?\d+$/i.test(word) || /^ac-?\d+$/i.test(word)) continue;
    concepts.add(word);
  }
  return concepts;
}

function hasSemanticOverlap(a: FrBlock, b: FrBlock): boolean {
  const conceptsA = semanticConcepts(a.body);
  const conceptsB = semanticConcepts(b.body);
  let shared = 0;
  for (const concept of conceptsA) {
    if (!conceptsB.has(concept)) continue;
    shared++;
    if (shared >= SEMANTIC_PREFILTER_MIN_SHARED) return true;
  }
  return false;
}

/** Run full-mode reconcile (mechanical + LLM-judge). Async because of subprocess calls. */
export async function runFullMode(opts: FullModeOptions): Promise<FullModeResult[]> {
  // Full-mode forwards the shared-namespace toggle so the mechanical
  // `cross-spec/contradictory-fr` short-circuit (line ~110) still works
  // when the caller is operating in shared-namespace mode.
  const mechanical = reconcileLight({
    repoRoot: opts.repoRoot,
    slugs: opts.slugs,
    crossSpecFrNamespace: opts.crossSpecFrNamespace,
  });

  // Already-contradictory pairs — skip the LLM call (mechanical already won).
  const alreadyFlagged = new Set<string>();
  for (const r of mechanical) {
    for (const f of r.findings) {
      if (f.code === 'cross-spec/contradictory-fr') {
        const key = `${f.spec_a ?? ''}::${f.spec_b ?? ''}`;
        alreadyFlagged.add(key);
      }
    }
  }

  const slugs = opts.slugs?.length ? opts.slugs : mechanical.map((r) => r.specSlug);
  const blocks = collectFrBlocks(opts.repoRoot, slugs);
  const maxCalls = opts.maxCalls ?? DEFAULT_MAX_CALLS;

  // Build the pair list — same FR id, different slug, not already flagged.
  const pairs: Array<[FrBlock, FrBlock]> = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.slug === b.slug) continue;
      if (a.frId !== b.frId) continue;
      if (a.body.length < MIN_TEXT_LEN || b.body.length < MIN_TEXT_LEN) continue;
      const key = `.specs/${a.slug}::.specs/${b.slug}`;
      const keyRev = `.specs/${b.slug}::.specs/${a.slug}`;
      if (alreadyFlagged.has(key) || alreadyFlagged.has(keyRev)) continue;
      if (!hasSemanticOverlap(a, b)) continue;
      pairs.push([a, b]);
    }
  }

  let calls = 0;
  let drift = 0;
  let denyListSkips = 0;
  const semanticBySlug = new Map<string, Finding[]>();
  const partialReasonsBySlug = new Map<string, string[]>();
  for (const slug of slugs) {
    semanticBySlug.set(slug, []);
    partialReasonsBySlug.set(slug, []);
  }

  for (const [a, b] of pairs) {
    if (calls >= maxCalls) break;
    const denyA = opts.denyOverrides?.get(a.slug) ?? false;
    const denyB = opts.denyOverrides?.get(b.slug) ?? false;
    if (denyA || denyB) {
      denyListSkips++;
      continue;
    }
    const judgeRes: JudgeResult = await runJudge({
      repoRoot: opts.repoRoot,
      frId: a.frId,
      frText: a.body,
      // Use the OTHER spec's body in the scenario slot — same prompt
      // structure, asks "do these two prose blocks describe the same
      // requirement?". `runJudge`'s prompt builder is generic enough.
      scenarioId: `${b.slug}/${b.frId}`,
      scenarioText: b.body,
      spec_llm_judge_deny: denyA || denyB,
      spawn: opts.spawn ?? deepseekSpawn, // production default = DeepSeek through AiPomogator
    });
    if (!judgeRes.from_cache) calls++;
    if (judgeRes.result === 'SKIPPED_DENY_LIST') {
      denyListSkips++;
      continue;
    }
    if (judgeRes.result === 'SUBPROCESS_FAILED') {
      const reason =
        `Semantic judge failed for ${a.slug}/${a.frId} ↔ ${b.slug}/${b.frId}; ` +
        `full mode continued with mechanical findings only for this pair. ${judgeRes.error ?? 'No error detail.'}`;
      const finding: Finding = {
        code: 'cross-spec/semantic-check-failed',
        class: 'semantic',
        severity: 'WARNING',
        spec_a: `.specs/${a.slug} (${a.frId})`,
        spec_b: `.specs/${b.slug} (${b.frId})`,
        suggested_fix: reason,
      };
      semanticBySlug.get(a.slug)!.push(finding);
      semanticBySlug.get(b.slug)!.push(finding);
      partialReasonsBySlug.get(a.slug)!.push(reason);
      partialReasonsBySlug.get(b.slug)!.push(reason);
      continue;
    }
    if (judgeRes.result === 'DRIFT') {
      drift++;
      const finding: Finding = {
        code: 'cross-spec/semantic-drift',
        class: 'semantic',
        severity: judgeRes.severity === 'error' ? 'CRITICAL' : 'WARNING',
        spec_a: `.specs/${a.slug} (${a.frId})`,
        spec_b: `.specs/${b.slug} (${b.frId})`,
        suggested_fix:
          judgeRes.explanation ??
          `LLM-judge flagged semantic drift between ${a.frId} in ${a.slug} and ${b.slug} — review prose.`,
      };
      semanticBySlug.get(a.slug)!.push(finding);
      semanticBySlug.get(b.slug)!.push(finding);
    }
  }

  return mechanical.map((r) => {
    const partialReasons = partialReasonsBySlug.get(r.specSlug) ?? [];
    return {
      ...r,
      mode: 'full',
      findings: [...r.findings, ...(semanticBySlug.get(r.specSlug) ?? [])],
      partial: partialReasons.length > 0 ? true : undefined,
      partialReasons: partialReasons.length > 0 ? partialReasons : undefined,
      subprocess_calls: calls,
      drift_detected: drift,
      deny_list_skips: denyListSkips,
      semantic_failures: partialReasons.length,
    };
  });
}
