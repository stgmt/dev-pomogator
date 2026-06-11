/**
 * legacy-judge — the LLM-judge escalation for legacy-triage's HARD kinds (FR-43 + FR-8).
 *
 * The deterministic classifier can't tell REMOVED (gone) from MOVED (refactored →
 * DRIFTED) from ABSORBED (merged elsewhere) — a missing FILE_CHANGES path looks the
 * same for all three. This asks `claude -p` to judge, GROUNDED by a deterministic
 * grep: for each missing path, does a file with the same basename exist in the live
 * code tree? (same-name-elsewhere = strong "moved" evidence). The LLM weighs that
 * evidence; it is never trusted blind.
 *
 * Reuses the spec-llm-judge spawn idiom (`claude -p`, injectable for tests, fail-loud
 * degrade when no binary) — NOT a new engine. The judge is OPT-IN (legacy-triage runs
 * deterministically by default) and DEGRADES to UNKNOWN when no binary, so the tool
 * stays honest (never fabricates a verdict — FR-37c).
 *
 * @see tools/spec-llm-judge/index.ts (the FR-8 judge whose spawn idiom this mirrors)
 * @see .specs/spec-generator-v4/FR.md FR-43 (states), FR-8 (LLM-as-judge)
 */
import { spawn as nodeSpawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type JudgedState = 'MOVED' | 'REMOVED' | 'ABSORBED' | 'UNKNOWN';
export interface LegacyVerdict {
  state: JudgedState;
  why: string;
  /** false when no binary / parse failure — caller keeps the deterministic default. */
  ran: boolean;
}

/** Live code roots a moved implementation would land in (post-v2 layout). */
const CODE_ROOTS = ['tools', '.claude', 'src', 'scripts', 'tests'];

/** Deterministic evidence: where (if anywhere) a file with this basename lives now. */
export function findBasenameElsewhere(repoRoot: string, missingPath: string): string[] {
  const base = path.basename(missingPath);
  if (!base) return [];
  const hits: string[] = [];
  const walk = (dir: string): void => {
    if (hits.length >= 5) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (hits.length >= 5) return;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
        walk(abs);
      } else if (e.name === base) {
        hits.push(path.relative(repoRoot, abs).replace(/\\/g, '/'));
      }
    }
  };
  for (const root of CODE_ROOTS) walk(path.join(repoRoot, root));
  return hits;
}

export function buildLegacyPrompt(slug: string, evidence: Array<{ missing: string; foundAt: string[] }>): string {
  const lines = evidence.map(
    (e) => `  - ${e.missing} → ${e.foundAt.length ? `same-named file(s) now at: ${e.foundAt.join(', ')}` : 'NO file with this name found anywhere'}`,
  );
  return [
    'You classify the implementation status of an abandoned-looking spec. Reply with a',
    'SINGLE JSON object on stdout, no prose, no markdown fences:',
    '  {"state": "MOVED"|"REMOVED"|"ABSORBED", "why": "<one sentence>"}',
    '',
    `Spec "${slug}" claims to implement these files, but they are MISSING from disk.`,
    'A search for files with the SAME NAME elsewhere found:',
    ...lines,
    '',
    'Rules:',
    '- MOVED: most missing files have a same-named file at a NEW path (a refactor/migration —',
    '  the spec just needs its FILE_CHANGES paths updated; this is NOT a retirement).',
    '- REMOVED: NO replacement exists anywhere for the missing files (implementation gone).',
    '- ABSORBED: the work merged into a differently-named file/subsystem (no same name, but the',
    '  capability plausibly lives elsewhere).',
    'When unsure between MOVED and REMOVED, prefer MOVED (the safe, non-destructive read).',
  ].join('\n');
}

function defaultSpawn(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = process.env.CLAUDE_BIN ?? 'claude';
    const child = nodeSpawn(bin, ['-p', prompt], { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (d) => out.push(d as Buffer));
    child.stderr.on('data', (d) => err.push(d as Buffer));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(out).toString('utf8'))
        : reject(new Error(`claude -p exited ${code}: ${Buffer.concat(err).toString('utf8').slice(0, 200)}`)),
    );
  });
}

function parse(stdout: string): { state: JudgedState; why: string } | null {
  // tolerate a stray code fence / surrounding prose — grab the first JSON object.
  const m = stdout.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as { state?: string; why?: string };
    if (o.state === 'MOVED' || o.state === 'REMOVED' || o.state === 'ABSORBED') {
      return { state: o.state, why: typeof o.why === 'string' ? o.why : '' };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export interface JudgeLegacyOptions {
  repoRoot: string;
  slug: string;
  missingPaths: string[];
  /** Injectable subprocess — defaults to `claude -p`. Tests pass a mock. */
  spawn?: (prompt: string) => Promise<string>;
}

/** Judge a DRIFTED candidate into MOVED/REMOVED/ABSORBED. Degrades to UNKNOWN
 *  (ran:false) when no binary / unparseable — caller keeps the DRIFTED default. */
export async function judgeLegacyState(opts: JudgeLegacyOptions): Promise<LegacyVerdict> {
  const evidence = opts.missingPaths.slice(0, 12).map((mp) => ({ missing: mp, foundAt: findBasenameElsewhere(opts.repoRoot, mp) }));
  const prompt = buildLegacyPrompt(opts.slug, evidence);
  const spawn = opts.spawn ?? defaultSpawn;
  let stdout: string;
  try {
    stdout = await spawn(prompt);
  } catch (e) {
    return { state: 'UNKNOWN', why: `judge unavailable: ${e instanceof Error ? e.message : String(e)}`, ran: false };
  }
  const parsed = parse(stdout);
  if (!parsed) return { state: 'UNKNOWN', why: 'judge output unparseable', ran: false };
  return { ...parsed, ran: true };
}
