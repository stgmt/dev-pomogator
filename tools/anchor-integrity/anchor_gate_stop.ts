/**
 * Stop-gate (FR-34b) — blocks declaring work "done" while a spec the session EDITED
 * still has broken link anchors. Only git-MODIFIED `.specs/<slug>/...md` are judged, so
 * the pre-existing corpus backlog never blocks an unrelated Stop. Escape hatch:
 * `[skip-anchor-fix: <reason ≥8 chars>]` in the latest commit message, or env
 * `ANCHOR_GATE_SKIP=1` — logged to `.claude/logs/anchor-gate-escapes.jsonl`.
 *
 * Modes via `ANCHOR_GATE_ENABLED`: "true" (enforce, default) | "shadow" (log only) |
 * "false" (off). SOFT tier: any internal error → approve (never wedge the session).
 *
 * Mirrors `claim-evidence-gate` (stdout `{decision:'block', reason}`; honours
 * `stop_hook_active`).
 *
 * @see ../anchor-integrity/check.mjs
 * @see .specs/spec-generator-v4/FR.md FR-34b / AC-34.3
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkSpecDir } from './check.mjs';

interface StopInput {
  stop_hook_active?: boolean;
  session_id?: string;
}

function approve(): void {
  process.exit(0);
}
function block(reason: string): void {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

/** Modified `.specs/<slug>/…md` → distinct slugs, via `git status --porcelain`. */
export function modifiedSpecSlugs(repoRoot: string): string[] {
  const r = spawnSync('git', ['status', '--porcelain', '--', '.specs'], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return [];
  const slugs = new Set<string>();
  for (const line of r.stdout.split('\n')) {
    const m = line.match(/\.specs\/([^/]+)\/[^\s]*\.md$/);
    if (m) slugs.add(m[1]);
  }
  return [...slugs];
}

/** Extract a `[skip-anchor-fix: reason]` escape reason from any text, else null. */
export function escapeReason(text: string): string | null {
  const m = text.match(/\[skip-anchor-fix:\s*([^\]]+)\]/i);
  return m ? m[1].trim() : null;
}

/** The escape reason is honoured only when it is substantive (≥8 chars). */
export function escapeHonoured(reason: string | null): boolean {
  return !!reason && reason.length >= 8;
}

/** Latest commit message carries `[skip-anchor-fix: reason]`? → the reason, else null. */
function escapeFromCommit(repoRoot: string): string | null {
  const r = spawnSync('git', ['log', '-1', '--format=%B'], { cwd: repoRoot, encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return null;
  return escapeReason(r.stdout);
}

function logEscape(repoRoot: string, reason: string, sessionId?: string): void {
  try {
    const dir = path.join(repoRoot, '.claude', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, 'anchor-gate-escapes.jsonl'),
      JSON.stringify({ reason, session_id: sessionId ?? null, cwd: repoRoot }) + '\n',
    );
  } catch {
    /* best-effort */
  }
}

async function readStdinJson(): Promise<StopInput> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on('data', (c) => chunks.push(c as Buffer));
    process.stdin.on('end', () => {
      const t = Buffer.concat(chunks).toString('utf8').trim();
      try {
        resolve(t ? (JSON.parse(t) as StopInput) : {});
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

async function main(): Promise<void> {
  const mode = process.env.ANCHOR_GATE_ENABLED ?? 'true';
  if (mode === 'false') return approve();
  const input = await readStdinJson();
  if (input.stop_hook_active === true) return approve(); // inside a continuation — don't re-block
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();

  const slugs = modifiedSpecSlugs(repoRoot);
  if (!slugs.length) return approve();

  const broken: ReturnType<typeof checkSpecDir> = [];
  for (const slug of slugs) {
    try {
      broken.push(...checkSpecDir(path.join(repoRoot, '.specs', slug), repoRoot));
    } catch {
      /* unreadable spec — skip */
    }
  }
  if (!broken.length) return approve();

  // Escape hatch
  const envSkip = process.env.ANCHOR_GATE_SKIP === '1';
  const commitSkip = escapeFromCommit(repoRoot);
  if (envSkip || escapeHonoured(commitSkip)) {
    logEscape(repoRoot, commitSkip || 'ANCHOR_GATE_SKIP=1', input.session_id);
    return approve();
  }

  const head = broken.slice(0, 8).map((b) => `  ${b.file}:${b.line} [${b.linkText}] #${b.brokenAnchor}` + (b.currentSlug ? ` → #${b.currentSlug}` : ' (ambiguous)'));
  const reason =
    `anchor-integrity (FR-34): you edited ${slugs.join(', ')} and left ${broken.length} broken link anchor(s) — ` +
    `they will NOT resolve in the Marksman LSP.\n${head.join('\n')}` +
    (broken.length > 8 ? `\n  …+${broken.length - 8} more` : '') +
    `\nFix: node tools/anchor-integrity/fix.mjs --spec .specs/${slugs[0]} --apply  (or the anchor-fix skill), then re-check.` +
    `\nEscape (deliberate): add [skip-anchor-fix: <reason ≥8 chars>] to the commit message, or set ANCHOR_GATE_SKIP=1.`;

  if (mode === 'shadow') {
    process.stderr.write(`[anchor-gate] shadow: would block — ${broken.length} broken in ${slugs.join(',')}\n`);
    return approve();
  }
  block(reason);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`[anchor-gate] soft-tier error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(0);
  });
}
