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
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkSpecDir, headingList } from './check.mjs';
import { resolveClaudeBin, dispatchClaudeFallback } from './claude-fallback.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(MODULE_DIR, '..', '..');
const BOOTSTRAP = path.join(PLUGIN_ROOT, 'tools', '_shared', 'bootstrap.cjs');

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
    const content = applyTargetRewrites(f.content, map);
    if (content !== f.content) changed[f.file] = content;
  }
  return { changed, fixable, skipped };
}

/**
 * Exact link-target rewrite `](orig)` → `](fixed)` (the broken slug is specific).
 * @param {string} content
 * @param {Map<string,string>} map
 */
function applyTargetRewrites(content, map) {
  let next = content;
  for (const [orig, fixed] of map) next = next.split(`](${orig})`).join(`](${fixed})`);
  return next;
}

/**
 * Return deterministic fix candidates grouped by document basename, for the MCP/spec-door path.
 * @param {ReturnType<typeof checkSpecDir>} broken
 * @returns {Map<string, Map<string,string>>}
 */
export function deterministicFixesByDoc(broken) {
  /** @type {Map<string, Map<string,string>>} */
  const byDoc = new Map();
  for (const b of broken) {
    if (!b.currentSlug) continue;
    const doc = b.file.split('/').pop();
    if (!doc) continue;
    if (!byDoc.has(doc)) byDoc.set(doc, new Map());
    byDoc.get(doc).set(`${b.targetRaw}#${b.brokenAnchor}`, `${b.targetRaw}#${b.currentSlug}`);
  }
  return byDoc;
}

/** Slug for a `.specs/<slug>` directory; nested slugs stay nested. */
function specSlugFromDir(dirAbs, repoRoot) {
  const rel = path.relative(path.join(repoRoot, '.specs'), path.resolve(dirAbs)).replace(/\\/g, '/');
  return rel && !rel.startsWith('..') ? rel : path.basename(path.resolve(dirAbs));
}

/**
 * Apply deterministic fixes THROUGH scripts/spec-door.ts/apply_spec_change instead of
 * writing `.specs/` directly. This is the FR-52b path for SPEC_ACCESS_ENFORCE sessions.
 * @returns {{written:string[], failed:Array<{doc:string,status:number|null,stderr:string,stdout:string}>, fixable:number, skipped:number, remaining:number}}
 */
export function fixSpecDirViaDoor(dirAbs, repoRoot, { specDoor = path.join(PLUGIN_ROOT, 'scripts', 'spec-door.ts'), spawnFn = spawnSync } = {}) {
  const slug = specSlugFromDir(dirAbs, repoRoot);
  const broken = checkSpecDir(dirAbs, repoRoot);
  const byDoc = deterministicFixesByDoc(broken);
  const written = [];
  const failed = [];
  let fixable = 0;
  const skipped = broken.filter((b) => !b.currentSlug).length;
  const tmpDir = path.join(repoRoot, '.dev-pomogator', '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const [doc, rewrites] of byDoc) {
    fixable += rewrites.size;
    const abs = path.join(dirAbs, doc);
    if (!fs.existsSync(abs)) continue;
    const current = fs.readFileSync(abs, 'utf-8');
    const next = applyTargetRewrites(current, rewrites);
    if (next === current) continue;
    const instruction = path.join(tmpDir, `anchor-fix-door-${process.pid}-${doc.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`);
    fs.writeFileSync(
      instruction,
      JSON.stringify({
        action: 'apply',
        spec: slug,
        doc,
        content: next,
        reason: 'FR-52b anchor-fix through MCP/spec door under enforce',
      }, null, 2),
      'utf-8',
    );
    const r = spawnFn(process.execPath, ['-e', `require(${JSON.stringify(BOOTSTRAP)})`, '--', specDoor, instruction], {
      cwd: repoRoot,
      env: { ...process.env, DEV_POMOGATOR_REPO_ROOT: repoRoot, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
      encoding: 'utf-8',
    });
    try { fs.unlinkSync(instruction); } catch { /* best-effort */ }
    if (r.status === 0) written.push(`.specs/${slug}/${doc}`);
    else failed.push({ doc, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' });
  }
  return { written, failed, fixable, skipped, remaining: broken.length - fixable };
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
//   node tools/anchor-integrity/fix.mjs --spec <dir> [--apply] [--door]
//   node tools/anchor-integrity/fix.mjs --all [--apply]
function cliMain() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const door = args.includes('--door') || process.env.SPEC_ACCESS_ENFORCE === 'true' || process.env.CLAUDE_PLUGIN_OPTION_SPEC_ACCESS_ENFORCE === 'true' || process.env.CLAUDE_PLUGIN_OPTION_spec_access_enforce === 'true';
  const claude = args.includes('--claude');
  const repoRoot = process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();
  const specDoorIdx = args.indexOf('--spec-door');
  const specDoor = specDoorIdx !== -1 ? path.resolve(process.cwd(), args[specDoorIdx + 1]) : undefined;
  const dirs = [];
  if (args.includes('--all')) {
    if (door && apply) { process.stderr.write('--door/controlled SPEC_ACCESS_ENFORCE supports one --spec at a time; --all would batch many validated door writes.\n'); process.exit(2); }
    const specsRoot = path.join(repoRoot, '.specs');
    for (const d of fs.readdirSync(specsRoot)) {
      const dir = path.join(specsRoot, d);
      try { if (fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'FR.md'))) dirs.push(dir); } catch { /* skip */ }
    }
  } else {
    const i = args.indexOf('--spec');
    const dir = i !== -1 ? args[i + 1] : args.find((a) => !a.startsWith('--'));
    if (!dir) { process.stderr.write('usage: fix.mjs --spec <dir> [--apply] [--door] | --all [--apply]\n'); process.exit(2); }
    dirs.push(path.resolve(repoRoot, dir));
  }
  let totalFixable = 0, totalSkipped = 0, totalWritten = 0, totalDispatched = 0, totalFlagged = 0, totalFailed = 0;
  let claudeUnavailable = false;
  for (const dir of dirs) {
    const r = door && apply ? fixSpecDirViaDoor(dir, repoRoot, specDoor ? { specDoor } : {}) : fixSpecDir(dir, repoRoot, { apply, claude });
    totalFixable += r.fixable; totalSkipped += r.skipped; totalWritten += r.written.length;
    if ('failed' in r) totalFailed += r.failed.length;
    if (r.claude) {
      totalDispatched += r.claude.dispatched; totalFlagged += r.claude.flagged;
      if (!r.claude.available) claudeUnavailable = true;
    }
    if (r.fixable || r.skipped || ('failed' in r && r.failed.length)) {
      const cl = r.claude ? ` claude=${r.claude.available ? r.claude.dispatched + ' dispatched' : 'unavailable→flagged'}` : '';
      const via = door && apply ? ' via-door' : '';
      const failed = 'failed' in r && r.failed.length ? ` failed=${r.failed.length}` : '';
      process.stdout.write(`${path.basename(dir).padEnd(36)} fixable=${r.fixable} ambiguous=${r.skipped}${apply ? ` written=${r.written.length}` : ''}${via}${failed}${cl}\n`);
      if ('failed' in r) for (const f of r.failed) process.stderr.write(`[anchor-fix-door] ${f.doc} failed status=${f.status}: ${f.stderr || f.stdout}\n`);
    }
  }
  const claudeNote = claude
    ? (claudeUnavailable
        ? `; claude UNAVAILABLE → ${totalFlagged} ambiguous left flagged (no guess)`
        : `; ${totalDispatched} dispatched to claude -p (background)`)
    : '';
  const doorNote = door && apply ? ' via door' : '';
  const failNote = totalFailed ? `, ${totalFailed} failed` : '';
  process.stdout.write(`\n${apply ? 'APPLIED' : 'SUGGEST'}${doorNote}: ${totalFixable} deterministic fixes, ${totalSkipped} ambiguous${claude ? '' : ' (claude -p)'}${apply ? `, ${totalWritten} files written${failNote}` : ', dry run'}${claudeNote}\n`);
  process.exit(totalFailed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cliMain();
