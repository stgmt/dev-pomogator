/**
 * Deterministic anchor fixer (FR-34c) — repairs broken link anchors WITHOUT an LLM
 * for the common case: the link text carries the target id (`[FR-7](…#fr-7-old)`),
 * so the check already resolved the heading's CURRENT slug. We just rewrite the
 * stale `#anchor` → the current slug. Idempotent. Links whose target heading could
 * NOT be inferred (`currentSlug === null`) are left UNTOUCHED for the `--claude`
 * fallback (FR-34c) — a wrong auto-rewrite is worse than a flagged broken link.
 *
 * @see ./check.mjs (produces the BrokenAnchor[] this consumes)
 * @see .specs/spec-generator-v4/FR.md FR-34c / AC-34.4
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkSpecDir, headingList } from './check.mjs';
import { resolveClaudeBin, dispatchClaudeFallback } from './claude-fallback.mjs';

/**
 * Apply deterministic fixes to in-memory files.
 * @param {{file:string, content:string}[]} files
 * @param {import('./check.mjs').BrokenAnchor[]} broken
 * @returns {{ changed: Record<string,string>, fixable: number, skipped: number }}
 *   `changed` = file → new content (only files that changed); `skipped` = ambiguous (left for claude -p)
 */
export function applyFixes(files, broken) {
  /** @type {Map<string, Map<string,string>>} file → (origTarget → fixedTarget) */
  const byFile = new Map();
  let fixable = 0;
  let skipped = 0;
  for (const b of broken) {
    if (!b.currentSlug) { skipped++; continue; } // ambiguous → claude -p fallback
    const orig = `${b.targetRaw}#${b.brokenAnchor}`;
    const fixed = `${b.targetRaw}#${b.currentSlug}`;
    if (orig === fixed) continue; // already correct
    if (!byFile.has(b.file)) byFile.set(b.file, new Map());
    byFile.get(b.file).set(orig, fixed);
    fixable++;
  }
  /** @type {Record<string,string>} */
  const changed = {};
  for (const f of files) {
    const map = byFile.get(f.file);
    if (!map) continue;
    let content = f.content;
    for (const [orig, fixed] of map) {
      // Exact link-target rewrite `](orig)` → `](fixed)` (the broken slug is specific).
      content = content.split(`](${orig})`).join(`](${fixed})`);
    }
    if (content !== f.content) changed[f.file] = content;
  }
  return { changed, fixable, skipped };
}

/**
 * Fix a spec dir on disk. Deterministic rewrites always run; `claude` additionally
 * dispatches the headless fallback (FR-34c) for the ambiguous remainder.
 * @returns {{written:string[], fixable:number, skipped:number, remaining:number, claude?:ReturnType<typeof dispatchClaudeFallback>}}
 */
export function fixSpecDir(dirAbs, repoRoot, { apply = false, claude = false, claudeBin = undefined, spawnFn = undefined } = {}) {
  const files = [];
  for (const name of fs.readdirSync(dirAbs)) {
    if (!name.endsWith('.md')) continue;
    const abs = path.join(dirAbs, name);
    if (!fs.statSync(abs).isFile()) continue;
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    files.push({ file: rel, abs, content: fs.readFileSync(abs, 'utf-8') });
  }
  const broken = checkSpecDir(dirAbs, repoRoot);
  const { changed, fixable, skipped } = applyFixes(files, broken);
  const written = [];
  if (apply) {
    for (const f of files) {
      if (changed[f.file] !== undefined) { fs.writeFileSync(f.abs, changed[f.file]); written.push(f.file); }
    }
  }
  const result = { written: apply ? written : Object.keys(changed), fixable, skipped, remaining: broken.length - fixable };
  if (claude && skipped > 0) {
    // Build target-file → headings map for the prompt; re-check from the (possibly
    // rewritten) on-disk state so determinstic fixes aren't re-dispatched.
    const postBroken = apply ? checkSpecDir(dirAbs, repoRoot) : broken;
    const candidatesByFile = new Map();
    for (const f of files) {
      const content = apply && changed[f.file] !== undefined ? changed[f.file] : f.content;
      candidatesByFile.set(f.file, headingList(content));
    }
    const bin = claudeBin !== undefined ? claudeBin : resolveClaudeBin();
    result.claude = dispatchClaudeFallback(postBroken, candidatesByFile, { repoRoot, claudeBin: bin, spawnFn });
  }
  return result;
}

// ── CLI ──────────────────────────────────────────────────────────────────
//   node tools/anchor-integrity/fix.mjs --spec <dir> [--apply]   (default: --suggest)
//   node tools/anchor-integrity/fix.mjs --all [--apply]
function cliMain() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const claude = args.includes('--claude');
  const repoRoot = process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();
  const dirs = [];
  if (args.includes('--all')) {
    const specsRoot = path.join(repoRoot, '.specs');
    for (const d of fs.readdirSync(specsRoot)) {
      const dir = path.join(specsRoot, d);
      try { if (fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'FR.md'))) dirs.push(dir); } catch { /* skip */ }
    }
  } else {
    const i = args.indexOf('--spec');
    const dir = i !== -1 ? args[i + 1] : args.find((a) => !a.startsWith('--'));
    if (!dir) { process.stderr.write('usage: fix.mjs --spec <dir> [--apply] | --all [--apply]\n'); process.exit(2); }
    dirs.push(path.resolve(repoRoot, dir));
  }
  let totalFixable = 0, totalSkipped = 0, totalWritten = 0, totalDispatched = 0, totalFlagged = 0;
  let claudeUnavailable = false;
  for (const dir of dirs) {
    const r = fixSpecDir(dir, repoRoot, { apply, claude });
    totalFixable += r.fixable; totalSkipped += r.skipped; totalWritten += r.written.length;
    if (r.claude) {
      totalDispatched += r.claude.dispatched; totalFlagged += r.claude.flagged;
      if (!r.claude.available) claudeUnavailable = true;
    }
    if (r.fixable || r.skipped) {
      const cl = r.claude ? ` claude=${r.claude.available ? r.claude.dispatched + ' dispatched' : 'unavailable→flagged'}` : '';
      process.stdout.write(`${path.basename(dir).padEnd(36)} fixable=${r.fixable} ambiguous=${r.skipped}${apply ? ` written=${r.written.length}` : ''}${cl}\n`);
    }
  }
  const claudeNote = claude
    ? (claudeUnavailable
        ? `; claude UNAVAILABLE → ${totalFlagged} ambiguous left flagged (no guess)`
        : `; ${totalDispatched} dispatched to claude -p (background)`)
    : '';
  process.stdout.write(`\n${apply ? 'APPLIED' : 'SUGGEST'}: ${totalFixable} deterministic fixes, ${totalSkipped} ambiguous${claude ? '' : ' (claude -p)'}${apply ? `, ${totalWritten} files written` : ', dry run'}${claudeNote}\n`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cliMain();
