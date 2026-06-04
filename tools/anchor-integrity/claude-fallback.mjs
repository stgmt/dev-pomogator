/**
 * `claude -p` fallback (FR-34c / AC-34.5) — for broken anchors the deterministic
 * fixer can NOT repair (the link text carries no heading id, so `currentSlug` is
 * null), hand the decision to a headless `claude -p`: it gets the broken link + the
 * target file's candidate headings and edits that one link in the background.
 *
 * Three hard invariants (all directly testable, all enforced here):
 *   1. NON-BLOCKING — each dispatch is `detached` + `unref()`d; we never await it,
 *      so the triggering edit/commit is not blocked.
 *   2. NO GUESS — when the `claude` binary is unavailable, ambiguous links stay
 *      flagged. We dispatch or we leave it; we never rewrite on a guess here.
 *   3. AMBIGUOUS-ONLY — links with a `currentSlug` belong to the deterministic
 *      fixer (applyFixes); this path touches only `currentSlug === null`.
 *
 * Every side-effecting dependency (binary resolution, spawn) is injectable so the
 * unit test runs with zero real processes and the BDD "unavailable" path is exact.
 *
 * @see ./fix.mjs (deterministic sibling) · ./check.mjs (headingList candidates)
 * @see .specs/spec-generator-v4/FR.md FR-34c / AC-34.5
 */
import { spawn, spawnSync } from 'node:child_process';

/**
 * Resolve the `claude` executable, or null when it is not on PATH.
 * `ANCHOR_CLAUDE_BIN` overrides (tests / non-standard installs).
 * @param {{env?:NodeJS.ProcessEnv, spawnSyncFn?:typeof spawnSync, platform?:string}} [o]
 * @returns {string|null}
 */
export function resolveClaudeBin({ env = process.env, spawnSyncFn = spawnSync, platform = process.platform } = {}) {
  if (env.ANCHOR_CLAUDE_BIN) return env.ANCHOR_CLAUDE_BIN;
  const probe = platform === 'win32' ? 'where' : 'which';
  try {
    const r = spawnSyncFn(probe, ['claude'], { encoding: 'utf8' });
    if (r && r.status === 0 && r.stdout) {
      const first = r.stdout.split(/\r?\n/)[0].trim();
      return first || null;
    }
  } catch {
    /* probe failed → treat as unavailable */
  }
  return null;
}

/**
 * The instruction handed to `claude -p` for one ambiguous link.
 * @param {import('./check.mjs').BrokenAnchor} b
 * @param {{text:string, slug:string}[]} candidates  headings of the target file
 * @returns {string}
 */
export function buildClaudePrompt(b, candidates) {
  const where = b.targetRaw ? `${b.targetRaw}#${b.brokenAnchor}` : `#${b.brokenAnchor}`;
  const list = candidates.length
    ? candidates.map((c) => `  - ${c.text}  (#${c.slug})`).join('\n')
    : '  (no headings found in the target file)';
  return [
    `In ${b.file} on line ${b.line}, the markdown link [${b.linkText}](${where}) has an anchor that does not resolve to any heading.`,
    `Choose the heading it most likely meant from the target file's headings:`,
    list,
    ``,
    `Edit ONLY that single link's #anchor to the chosen heading's Marksman slug (shown in parentheses).`,
    `If none of them is a credible match, leave the link unchanged — do NOT guess.`,
  ].join('\n');
}

/**
 * Dispatch the headless fallback for every ambiguous broken anchor.
 *
 * @param {import('./check.mjs').BrokenAnchor[]} broken
 * @param {Map<string,{text:string,slug:string}[]>} candidatesByFile  target file → its headings
 * @param {{repoRoot?:string, claudeBin?:(string|null), spawnFn?:typeof spawn, detached?:boolean, extraArgs?:string[]}} [o]
 * @returns {{available:boolean, dispatched:number, flagged:number, argvs:string[][]}}
 *   `dispatched` = backgrounded `claude -p` calls; `flagged` = left for a human when
 *   no binary; `argvs` = the argv of each spawn (for assertions / logging).
 */
export function dispatchClaudeFallback(broken, candidatesByFile, {
  repoRoot = process.cwd(),
  claudeBin = null,
  spawnFn = spawn,
  detached = true,
  extraArgs = ['--permission-mode', 'acceptEdits'],
} = {}) {
  const ambiguous = broken.filter((b) => !b.currentSlug);
  /** @type {string[][]} */
  const argvs = [];
  if (!ambiguous.length) return { available: !!claudeBin, dispatched: 0, flagged: 0, argvs };
  // INVARIANT 2 — no binary ⇒ no rewrite, links stay flagged.
  if (!claudeBin) return { available: false, dispatched: 0, flagged: ambiguous.length, argvs };

  let dispatched = 0;
  for (const b of ambiguous) {
    const candidates = candidatesByFile.get(b.targetFile || b.file) || [];
    const prompt = buildClaudePrompt(b, candidates);
    const args = ['-p', prompt, ...extraArgs];
    argvs.push([claudeBin, ...args]);
    // INVARIANT 1 — detached + unref + no await ⇒ never blocks the caller.
    const child = spawnFn(claudeBin, args, { cwd: repoRoot, detached, stdio: 'ignore' });
    if (child && typeof child.unref === 'function') child.unref();
    dispatched++;
  }
  return { available: true, dispatched, flagged: 0, argvs };
}
