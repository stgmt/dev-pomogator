/**
 * LLM-as-judge orchestrator for semantic-drift checks (FR-8 + FR-26).
 *
 * Public surface:
 *
 *   runJudge({frId, frText, scenarioId, scenarioText, …})
 *     → { result: 'NO_DRIFT_DETECTED' | 'DRIFT' | 'SKIPPED_DENY_LIST' |
 *                 'SKIPPED_OPT_OUT' | 'SUBPROCESS_FAILED', … }
 *
 * Decision order:
 *   1. Opt-out (`spec_llm_judge_deny: true` in opts) → SKIPPED_OPT_OUT
 *   2. Cache hit → cached verdict
 *   3. FR-26 deny-list scan on the constructed prompt → SKIPPED_DENY_LIST
 *      (writes nothing to disk, logs nothing to the cache)
 *   4. Spawn `claude -p <prompt>` via the injectable `spawn` function,
 *      parse JSON stdout, write the verdict to cache, return it
 *
 * Phase 3 ships the decision tree + deny-list + cache; the real subprocess
 * call is behind the injectable `spawn` so unit tests cover every branch
 * without invoking a real `claude` binary. The MCP `conformance_check`
 * tool wires this into agent context behind the `semantic: true` opt-in
 * flag (NOT default).
 *
 * @see ./deny-list.ts
 * @see ./cache.ts
 * @see .specs/spec-generator-v4/FR.md FR-8, FR-26
 */

import { checkDenyList } from './deny-list.ts';
import { cacheKey, readEntry, writeEntry, type CacheEntry, type Verdict } from './cache.ts';

export interface JudgeOptions {
  repoRoot: string;
  frId: string;
  frText: string;
  scenarioId: string;
  scenarioText: string;
  /** Per-spec opt-out flag from frontmatter (FR-26 last paragraph). */
  spec_llm_judge_deny?: boolean;
  /**
   * Override the subprocess implementation. Default reads `CLAUDE_BIN`
   * env var or falls back to `claude` on PATH. The function gets the
   * prompt and must resolve with the raw stdout text.
   */
  spawn?: (prompt: string) => Promise<string>;
  /** Identifier of the model used; surfaced in the cache entry. */
  model?: string;
}

export interface JudgeResult {
  result:
    | 'NO_DRIFT_DETECTED'
    | 'DRIFT'
    | 'SKIPPED_DENY_LIST'
    | 'SKIPPED_OPT_OUT'
    | 'SUBPROCESS_FAILED'
    | 'CACHE_HIT';
  /** Present iff `result === 'DRIFT'`. */
  explanation?: string;
  /** Present iff `result === 'DRIFT'`. */
  severity?: 'warning' | 'error';
  /** Present iff `result === 'SKIPPED_DENY_LIST'`. */
  deny_pattern?: string;
  /** Present iff `result === 'SUBPROCESS_FAILED'`. */
  error?: string;
  /** sha256 cache key for the (FR text + Scenario text) tuple. */
  cache_key: string;
  /** True iff we returned the verdict directly from cache without spawning. */
  from_cache: boolean;
}

/** Build the prompt the subprocess sees. Exported for inspection in tests. */
export function buildPrompt(frText: string, scenarioText: string): string {
  return [
    'You are a strict spec-conformance auditor.',
    'Compare the following FR text with the Scenario steps. Answer with a',
    'single JSON object on stdout (no prose, no markdown fences):',
    '  {"result": "NO_DRIFT_DETECTED"}  OR',
    '  {"result": "DRIFT", "explanation": "<1-2 sentences>", "severity": "warning"|"error"}',
    '',
    '--- FR ---',
    frText,
    '--- Scenario ---',
    scenarioText,
  ].join('\n');
}

function parseSubprocessOutput(stdout: string): Verdict | null {
  try {
    const obj = JSON.parse(stdout.trim()) as Partial<Verdict & { result: string }>;
    if (obj.result === 'NO_DRIFT_DETECTED') return { result: 'NO_DRIFT_DETECTED' };
    if (obj.result === 'DRIFT' && typeof obj.explanation === 'string') {
      const sev = obj.severity === 'error' ? 'error' : 'warning';
      return { result: 'DRIFT', explanation: obj.explanation, severity: sev };
    }
    return null;
  } catch {
    return null;
  }
}

export async function runJudge(opts: JudgeOptions): Promise<JudgeResult> {
  const key = cacheKey(opts.frText, opts.scenarioText);

  // 1. Opt-out.
  if (opts.spec_llm_judge_deny === true) {
    return { result: 'SKIPPED_OPT_OUT', cache_key: key, from_cache: false };
  }

  // 2. Cache hit.
  const cached = readEntry(opts.repoRoot, key);
  if (cached) {
    if (cached.verdict.result === 'NO_DRIFT_DETECTED') {
      return { result: 'CACHE_HIT', cache_key: key, from_cache: true };
    }
    return {
      result: 'DRIFT',
      explanation: cached.verdict.explanation,
      severity: cached.verdict.severity,
      cache_key: key,
      from_cache: true,
    };
  }

  // 3. FR-26 deny-list — must run AFTER cache check (cached verdicts are
  //    safe by construction; new prompts need scanning).
  const prompt = buildPrompt(opts.frText, opts.scenarioText);
  const verdict = checkDenyList(prompt);
  if (verdict.denied) {
    return {
      result: 'SKIPPED_DENY_LIST',
      deny_pattern: verdict.pattern,
      cache_key: key,
      from_cache: false,
    };
  }

  // 4. Spawn — bail OPEN on internal failure (subprocess not available,
  //    parse error). The MCP server surfaces SUBPROCESS_FAILED as an INFO
  //    finding so agents don't treat it as drift.
  const spawn = opts.spawn ?? defaultSpawn;
  let stdout: string;
  try {
    stdout = await spawn(prompt);
  } catch (e) {
    return {
      result: 'SUBPROCESS_FAILED',
      error: e instanceof Error ? e.message : String(e),
      cache_key: key,
      from_cache: false,
    };
  }
  const parsed = parseSubprocessOutput(stdout);
  if (!parsed) {
    return {
      result: 'SUBPROCESS_FAILED',
      error: `unparseable stdout: ${stdout.slice(0, 200)}`,
      cache_key: key,
      from_cache: false,
    };
  }

  // 5. Persist + return.
  const entry: CacheEntry = {
    fr_id: opts.frId,
    scenario_id: opts.scenarioId,
    verdict: parsed,
    generated_at: new Date().toISOString(),
    model: opts.model,
  };
  writeEntry(opts.repoRoot, key, entry);
  return parsed.result === 'NO_DRIFT_DETECTED'
    ? { result: 'NO_DRIFT_DETECTED', cache_key: key, from_cache: false }
    : { result: 'DRIFT', explanation: parsed.explanation, severity: parsed.severity, cache_key: key, from_cache: false };
}

/**
 * Default subprocess invocation — spawns `claude -p <prompt>`, captures
 * stdout. Phase 3 ships the wire-up; integration with the MCP server's
 * `conformance_check(semantic: true)` is a one-line call.
 */
function defaultSpawn(prompt: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // Lazy require so unit tests that never call this branch don't pay
    // the import cost.
    import('node:child_process').then(({ spawn }) => {
      const bin = process.env.CLAUDE_BIN ?? 'claude';
      const child = spawn(bin, ['-p', prompt], { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];
      child.stdout.on('data', (c) => chunks.push(c));
      child.stderr.on('data', (c) => errChunks.push(c));
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve(Buffer.concat(chunks).toString('utf8'));
        else reject(new Error(`claude -p exited ${code}: ${Buffer.concat(errChunks).toString('utf8').slice(0, 200)}`));
      });
    }, reject);
  });
}
