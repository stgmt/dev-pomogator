/**
 * Anchor-integrity check (FR-34a) — does every markdown link anchor resolve to a
 * heading whose Marksman slug matches? Covers BOTH same-file `[t](#a)` and
 * cross-file `[t](f.md#a)` (the latter is all `CROSS_REF_LINKS` checks today; the
 * same-file class is the gap this closes). Links inside fenced/inline code are
 * skipped — they are illustrative examples, not live links.
 *
 * `.mjs` on purpose (see marksman-slug.mjs): the `.mjs` validator and the `.ts`
 * hooks/tests must all import it.
 *
 * @see ./marksman-slug.mjs
 * @see .specs/spec-generator-v4/FR.md FR-34a / AC-34.1
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { marksmanSlug } from './marksman-slug.mjs';

/**
 * @typedef {Object} BrokenAnchor
 * @property {string} file          repo-relative .md path holding the LINK
 * @property {number} line          1-indexed line of the link
 * @property {string} linkText      the `[text]` of the link
 * @property {string} targetFile    repo-relative target .md, or '' for same-file
 * @property {string} targetRaw     the raw file part of the link as written ('' for same-file) — for exact rewrite
 * @property {string} brokenAnchor  the `#anchor` that did not resolve
 * @property {string} inferredId    id parsed from linkText (FR-7 / AC-1.1 / …), '' if none
 * @property {(string|null)} currentSlug  the slug of inferredId's heading in the target (the fix), or null
 */

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^(?:```|~~~)/;
// id shapes the specs use, for inferring a link's intended target heading
const ID_RE = /\b((?:FR|NFR|AC|UC|US)-[A-Za-z0-9.]+)\b/;
// a markdown inline link: [text](target)  — target captured raw
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/** Strip the inline-formatting wrappers Marksman ignores, so the slug matches. */
function headingText(raw) {
  return raw
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** Extract the canonical id from a heading's text, or '' (e.g. `## FR-7: Title` → FR-7). */
export function idFromHeading(text) {
  const m = text.match(/^((?:FR|NFR|AC|UC|US)-[A-Za-z0-9.-]+?)(?::|\s|\(|$)/);
  return m ? m[1] : '';
}

/**
 * Index one markdown file: the set of heading slugs + a map id→slug.
 * @param {string} content
 * @returns {{ slugs: Set<string>, idToSlug: Map<string,string> }}
 */
export function indexHeadings(content) {
  const slugs = new Set();
  const idToSlug = new Map();
  let inFence = false;
  for (const raw of content.split(/\r?\n/)) {
    if (FENCE_RE.test(raw)) { inFence = !inFence; continue; }
    if (inFence || raw.charCodeAt(0) !== 35) continue;
    const hm = raw.match(HEADING_RE);
    if (!hm) continue;
    const text = headingText(hm[2]);
    const slug = marksmanSlug(text);
    slugs.add(slug);
    const id = idFromHeading(text);
    if (id) idToSlug.set(id, slug);
  }
  return { slugs, idToSlug };
}

/** Byte offsets of inline-code (`backtick`) spans on a line, to skip links inside them. */
function codeSpans(line) {
  const spans = [];
  const re = /`+/g;
  let openTick = null;
  let m;
  while ((m = re.exec(line))) {
    if (openTick === null) openTick = { tick: m[0], start: m.index };
    else if (m[0].length === openTick.tick.length) { spans.push([openTick.start, m.index + m[0].length]); openTick = null; }
  }
  return spans;
}
function inSpan(idx, spans) {
  return spans.some(([s, e]) => idx >= s && idx < e);
}

/**
 * Check all links in `files` (a list of {file, content}) against the heading
 * index. `file` is repo-relative POSIX; same-dir resolution for `target.md`.
 * @returns {BrokenAnchor[]}
 */
export function checkLinks(files) {
  const index = new Map(); // repo-relative file -> {slugs, idToSlug}
  for (const f of files) index.set(f.file, indexHeadings(f.content));

  /** @type {BrokenAnchor[]} */
  const broken = [];
  for (const f of files) {
    const dir = path.posix.dirname(f.file);
    const lines = f.content.split(/\r?\n/);
    let inFence = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (FENCE_RE.test(line)) { inFence = !inFence; continue; }
      if (inFence) continue;
      const spans = codeSpans(line);
      LINK_RE.lastIndex = 0;
      let m;
      while ((m = LINK_RE.exec(line))) {
        if (inSpan(m.index, spans)) continue; // illustrative, inside `code`
        const linkText = m[1];
        const target = m[2];
        const hashIdx = target.indexOf('#');
        if (hashIdx === -1) continue; // no anchor → not our concern
        const filePart = target.slice(0, hashIdx);
        const anchor = target.slice(hashIdx + 1);
        if (!anchor) continue;
        // resolve target file: same-file when filePart is empty; else relative .md
        const targetFile = filePart ? path.posix.normalize(path.posix.join(dir, filePart)) : f.file;
        const targetIndex = index.get(targetFile);
        // external / non-spec targets we don't index → skip (can't judge)
        if (filePart && !filePart.endsWith('.md')) continue;
        if (!targetIndex) continue; // unknown file → out of scope for this check
        if (targetIndex.slugs.has(anchor)) continue; // resolves ✓
        // broken — try to infer the intended heading from the link text
        const idm = linkText.match(ID_RE);
        const inferredId = idm ? idm[1] : '';
        const currentSlug = inferredId && targetIndex.idToSlug.has(inferredId)
          ? targetIndex.idToSlug.get(inferredId)
          : null;
        broken.push({ file: f.file, line: i + 1, linkText, targetFile: filePart ? targetFile : '', targetRaw: filePart, brokenAnchor: anchor, inferredId, currentSlug });
      }
    }
  }
  return broken;
}

/** Convenience: read every `.md` in a spec dir and check it. */
export function checkSpecDir(dirAbs, repoRoot) {
  const files = [];
  for (const name of fs.readdirSync(dirAbs)) {
    if (!name.endsWith('.md')) continue;
    const abs = path.join(dirAbs, name);
    if (!fs.statSync(abs).isFile()) continue;
    const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
    files.push({ file: rel, content: fs.readFileSync(abs, 'utf-8') });
  }
  return checkLinks(files);
}

/** Check every `.specs/<slug>/` that has an FR.md. @returns {Map<string,BrokenAnchor[]>} */
export function checkCorpus(repoRoot) {
  const specsRoot = path.join(repoRoot, '.specs');
  /** @type {Map<string, BrokenAnchor[]>} */
  const out = new Map();
  if (!fs.existsSync(specsRoot)) return out;
  for (const d of fs.readdirSync(specsRoot)) {
    const dir = path.join(specsRoot, d);
    try {
      if (!fs.statSync(dir).isDirectory() || !fs.existsSync(path.join(dir, 'FR.md'))) continue;
      const b = checkSpecDir(dir, repoRoot);
      if (b.length) out.set(d, b);
    } catch {
      /* unreadable — skip */
    }
  }
  return out;
}

// ── CLI ──────────────────────────────────────────────────────────────────
//   node tools/anchor-integrity/check.mjs --spec <dir>   # one spec dir
//   node tools/anchor-integrity/check.mjs --all          # whole .specs corpus
// Exits non-zero when broken anchors are found (CI-friendly). The corpus path
// needs `.specs/` on disk (it is `.dockerignore`d, so this is a host/CI command,
// not a Docker vitest test).
function cliMain() {
  const args = process.argv.slice(2);
  const repoRoot = process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();
  if (args[0] === '--all') {
    const corpus = checkCorpus(repoRoot);
    let total = 0;
    for (const [slug, b] of [...corpus.entries()].sort((a, c) => c[1].length - a[1].length)) {
      total += b.length;
      process.stdout.write(`${String(b.length).padStart(4)}  ${slug}\n`);
    }
    process.stdout.write(`\nTOTAL ${total} broken anchors across ${corpus.size} specs\n`);
    process.exit(total ? 1 : 0);
  }
  const specIdx = args.indexOf('--spec');
  const dir = specIdx !== -1 ? args[specIdx + 1] : args[0];
  if (!dir) {
    process.stderr.write('usage: check.mjs --spec <dir> | --all\n');
    process.exit(2);
  }
  const broken = checkSpecDir(path.resolve(repoRoot, dir), repoRoot);
  for (const b of broken) {
    process.stdout.write(`${b.file}:${b.line}  [${b.linkText}] #${b.brokenAnchor}` + (b.currentSlug ? ` → #${b.currentSlug}` : '') + '\n');
  }
  process.stdout.write(`${broken.length} broken anchors in ${dir}\n`);
  process.exit(broken.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cliMain();
