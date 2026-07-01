/**
 * Markdown parser for the SpecGraph builder.
 *
 * Walks a markdown document line-by-line, finds the ATX spec headings the
 * v4 conformance model cares about (FR / NFR / AC), and emits a typed
 * parser slice (`ParserOutput`) the builder will fold into the global
 * SpecGraph. Each heading registers BOTH the compact id (`FR-001`) and a
 * slug derived from id+title (`fr-001-login`) so wiki-links of either
 * shape navigate identically (per FR-3 dual-anchor invariant).
 *
 * Why line-walker instead of `unified` + `remark-parse`: building the full
 * mdast AST for every spec file is the hot path of the cold-start
 * benchmark (~775 .md files per real-repo build). Profiling on 2026-06-02
 * showed `unified` parse dominated cold-start at ~3000ms (out of a 2000ms
 * NFR-Performance-1 budget); a heading-only line scan does the same job
 * in ~8ms — a >300× speedup that keeps the public ParserOutput identical.
 * See NFR-Performance-1 in `.specs/spec-generator-v4/NFR.md`.
 *
 * Recognised heading shapes (Phase 1 starter set):
 *   `## FR-N: Title`           → FrNode  (compact + slug anchors)
 *   `### FR-N: Title`          → FrNode  (same)
 *   `## NFR-Category-N: Title` → NfrNode (Category extracted)
 *   `## NFR-N: Title`          → NfrNode (no category)
 *   `## AC-N (FR-M)`           → AcNode  (parentFr = FR-M)
 *   `## AC-N.M (FR-K)`         → AcNode  (id literally `AC-N.M`)
 *
 * Phase 1 follow-ups will add Scenario refs (via gherkin parser), Task /
 * UseCase / Risk headings, and triple-anchor legacy support per FR-3.
 *
 * @see .specs/spec-generator-v4/FR.md FR-2 (graph builder), FR-3 (dual-anchor)
 * @see ../types.ts (Node / Edge / ParserOutput)
 */

import fs from 'node:fs';
import path from 'node:path';
import { marksmanSlug } from '../../anchor-integrity/marksman-slug.mjs';
import type {
  Node as SpecNode,
  ParserOutput,
  FrNode,
  NfrNode,
  AcNode,
  DecisionNode,
  StoryNode,
  Edge,
} from '../types.ts';
import { specOf, qualifySlice } from '../coverage.ts';

// Module-level pre-compiled regexes (hot path — recompilation per call would
// allocate ~775×4 regex instances per cold-start). See
// `.claude/rules/testing/output-invariants-first.md` rationale: any regex
// re-allocated per row in a 10³-cardinality loop is a perf red flag.
const HEADING_LINE_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^(?:```|~~~)/;
const FR_HEADING_RE = /^FR-(\d+):\s*(.+)$/;
const NFR_HEADING_RE = /^NFR(?:-([A-Za-z][A-Za-z0-9]*))?-(\d+):\s*(.+)$/;
const AC_HEADING_RE = /^AC-(\d+(?:\.\d+)?)\s*\(FR-(\d+)\)\s*:?\s*(.*)$/;
// Decision (DESIGN.md «Key Decisions»): `### Decision: <title>`. The parent FR is
// read from an EXPLICIT `**Требование:** [FR-N]` / `**Requirement:** [FR-N]` line in
// the block (decisionRequirementAfter) — NOT any FR mention in the prose, so the
// FR↔Decision edge is a real declared link, not a body text-scan (FR-46 «no crutch»).
const DECISION_HEADING_RE = /^Decision:\s*(.+)$/;
// Story (USER_STORIES.md): `### User Story N: <title> (Priority: …)`. Same explicit-link
// rule as Decision — FR from the `**Требование:**` line (decisionRequirementAfter), not prose.
const STORY_HEADING_RE = /^User Story (\d+):\s*(.+)$/;

// FR-7c short-heading forms — the migrated, Marksman-resolvable shape where the
// heading slug equals the bare id (`## FR-7` → slug `fr-7`, so `[…](#fr-7)`
// resolves). The title (FR/NFR) and the parent-FR (AC) move to the BODY, read by
// the lookahead helpers below. These are tried AFTER the colon/paren forms above
// so the 44 un-migrated specs keep parsing identically.
const SHORT_FR_RE = /^FR-(\d+)$/;
const SHORT_NFR_RE = /^NFR(?:-([A-Za-z][A-Za-z0-9]*))?-(\d+)$/;
const SHORT_AC_RE = /^AC-(\d+(?:\.\d+)?)$/;

// FR-3 legacy backward compat — v3 spec headings of the form
// `Requirement: FR-001 Login flow` register a triple anchor so the same
// node is reachable via three aliases:
//   • compact id            FR-001
//   • modern slug           fr-001-login-flow
//   • legacy "requirement-" slug   requirement-fr-001-login-flow
// All three resolve to the SAME canonical id (FR-001).
const LEGACY_FR_HEADING_RE = /^Requirement:\s*FR-(\d+)\s+(.+)$/;

/**
 * Slug component of the dual anchor — delegates to the single `marksmanSlug`
 * source of truth (FR-34a) so the graph's anchors match what Marksman actually
 * resolves. (The old local impl dashed dots and stripped Cyrillic — both wrong
 * vs the measured binary; this fixes that latent corpus bug.)
 */
function slugify(text: string): string {
  return marksmanSlug(text);
}

/**
 * Strip mdast inline-formatting markers from raw heading text so the
 * downstream regexes see the same payload they got from the unified parser.
 * Removes the **bold** / *italic* / `code` markers and inline link wrappers
 * `[label](href)` → `label`. Conservative — only touches the markers we
 * actually expect inside spec headings.
 */
function stripInlineMarkers(text: string): string {
  let s = text;
  // Inline links: [label](href) → label  (no nested brackets)
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Bold/italic/code wrappers — symmetric, single-token pass each.
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/_([^_]+)_/g, '$1');
  s = s.replace(/`([^`]+)`/g, '$1');
  return s.trim();
}

/**
 * For a migrated short heading (`## FR-7`), the title was relocated to a `**bold**`
 * line directly below. Scan the next few non-empty lines: the FIRST non-empty line
 * is the title iff it is wholly `**…**`; otherwise there is no relocated title
 * (returns `''`). Stops at the next heading so we never borrow a sibling's title.
 */
function relocatedTitleAfter(lines: string[], i: number): string {
  for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
    const t = lines[j].trim();
    if (!t) continue;
    if (t.startsWith('#')) return '';
    const m = t.match(/^\*\*(.+?)\*\*$/);
    return m ? stripInlineMarkers(m[1]).trim() : '';
  }
  return '';
}

/**
 * For a migrated short AC heading (`## AC-1.1`), the parent FR moved to the
 * `**Требование:** [FR-K](…)` line below (it was already present there in v4
 * specs — the `(FR-K)` in the heading was redundant). Return `FR-K` from the
 * first FR citation in the next few lines, or `''` if none.
 */
function parentFrAfter(lines: string[], i: number): string {
  for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
    const t = lines[j].trim();
    if (!t) continue;
    if (t.startsWith('#')) return '';
    // Prefer the canonical FR from the link HREF (`…#fr-7` → FR-7) so a sub-clause
    // citation like `[FR-7a](FR.md#fr-7)` maps to the real FR-7 node, not a
    // non-existent FR-7a. Fall back to the first FR-N token in the text.
    const href = t.match(/#fr-(\d+)\b/i);
    if (href) return `FR-${href[1]}`;
    const m = t.match(/\bFR-(\d+)\b/);
    if (m) return `FR-${m[1]}`;
  }
  return '';
}

/**
 * For a Decision block, read the parent FR ONLY from an explicit
 * `**Требование:** [FR-N]` / `**Requirement:** [FR-N]` label line — NOT from any FR
 * mention in the Rationale/Alternatives prose. Keeps FR↔Decision a DECLARED link
 * (FR-46 «no crutch»): a coincidental `FR-1` in prose must not forge the edge.
 * Returns `FR-N`, or `''` if the block declares no requirement.
 */
function decisionRequirementAfter(lines: string[], i: number): string {
  for (let j = i + 1; j < Math.min(lines.length, i + 14); j++) {
    const t = lines[j].trim();
    if (t.startsWith('#')) return ''; // next heading — block ended
    const label = t.match(/^\*\*\s*(?:Требовани[ея]|Requirements?)\s*:?\s*\*\*\s*:?\s*(.*)$/i);
    if (!label) continue;
    const rest = label[1];
    const href = rest.match(/#fr-(\d+)\b/i);
    if (href) return `FR-${href[1]}`;
    const m = rest.match(/\bFR-(\d+)\b/);
    return m ? `FR-${m[1]}` : ''; // labeled line is the single source — no fallback scan
  }
  return '';
}

/**
 * Parse a markdown document and emit FR / NFR / AC nodes plus the
 * `covers` edges that flow from AC to its parent FR.
 *
 * Uses a single-pass line walker rather than the full `unified` +
 * `remark-parse` AST: the parser only cares about ATX headings and is on
 * the hot path of the cold-start benchmark (775 .md files per build). The
 * line-based path is ~375× faster than the AST build (8ms vs 3000ms on
 * the real-repo corpus). Code fences (` ``` ` / `~~~`) are tracked so a
 * `## FR-1: foo` inside a code block is correctly skipped.
 *
 * @param mdSource     raw markdown text
 * @param relativePath repository-relative POSIX path to record on each node
 * @returns parser slice ready for the builder to merge
 */
export function parseMarkdown(mdSource: string, relativePath: string): ParserOutput {
  const nodes: SpecNode[] = [];
  const edges: Edge[] = [];
  const anchors: ParserOutput['anchors'] = [];

  const lines = mdSource.split(/\r?\n/);
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Track fenced code blocks so headings inside ` ``` ` aren't picked up.
    // ATX heading detection is `startsWith('#')` so the fence check is cheap.
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // Fast-path: only lines starting with `#` can be ATX headings. The
    // heading regex is strict (`#{1,6}\s+...`) so leading-`#` non-headings
    // bail in ≤1µs.
    if (raw.charCodeAt(0) !== 35 /* '#' */) continue;
    const hm = raw.match(HEADING_LINE_RE);
    if (!hm) continue;

    const text = stripInlineMarkers(hm[2]);
    const line = i + 1; // 1-indexed line number (matches the old AST parser)
    const location = { file: relativePath, line };

    // Legacy v3 form — `Requirement: FR-001 Login flow` → triple anchor.
    // Must match BEFORE the modern FR_HEADING_RE (the modern form uses
    // colon-after-id while the legacy form uses space-after-id).
    let m = text.match(LEGACY_FR_HEADING_RE);
    if (m) {
      const num = m[1];
      const title = m[2].trim();
      const compact = `FR-${num}`;
      const modernSlug = `fr-${num}-${slugify(title)}`;
      const legacySlug = `requirement-fr-${num}-${slugify(title)}`;
      const node: FrNode = {
        id: compact,
        type: 'FR',
        title,
        file: relativePath,
        line,
        anchors: [compact, modernSlug, legacySlug],
        body: text,
      };
      nodes.push(node);
      anchors.push(
        { alias: compact, canonicalId: compact, location },
        { alias: modernSlug, canonicalId: compact, location },
        { alias: legacySlug, canonicalId: compact, location },
      );
      continue;
    }

    // FR — the modern (v4) form: `FR-N: Title`.
    m = text.match(FR_HEADING_RE);
    if (m) {
      const num = m[1];
      const title = m[2].trim();
      const compact = `FR-${num}`;
      const slug = `fr-${num}-${slugify(title)}`;
      const node: FrNode = {
        id: compact,
        type: 'FR',
        title,
        file: relativePath,
        line,
        anchors: [compact, slug],
        body: text,
      };
      nodes.push(node);
      anchors.push(
        { alias: compact, canonicalId: compact, location },
        { alias: slug, canonicalId: compact, location },
      );
      continue;
    }

    // NFR — with or without a category subfield.
    m = text.match(NFR_HEADING_RE);
    if (m) {
      const category = m[1]; // optional, e.g. "Performance"
      const num = m[2];
      const title = m[3].trim();
      const compact = category ? `NFR-${category}-${num}` : `NFR-${num}`;
      const slug = `nfr-${category ? `${category.toLowerCase()}-` : ''}${num}-${slugify(title)}`;
      const node: NfrNode = {
        id: compact,
        type: 'NFR',
        title,
        category,
        file: relativePath,
        line,
        anchors: [compact, slug],
        body: text,
      };
      nodes.push(node);
      anchors.push(
        { alias: compact, canonicalId: compact, location },
        { alias: slug, canonicalId: compact, location },
      );
      continue;
    }

    // AC — emits a `covers` edge back to its parent FR.
    m = text.match(AC_HEADING_RE);
    if (m) {
      const acId = `AC-${m[1]}`;
      const parentFr = `FR-${m[2]}`;
      const ears = (m[3] || '').trim();
      const node: AcNode = {
        id: acId,
        type: 'AC',
        parentFr,
        file: relativePath,
        line,
        ears,
      };
      nodes.push(node);
      edges.push({ from: parentFr, to: acId, type: 'covers' });
      anchors.push({ alias: acId, canonicalId: acId, location });
      continue;
    }

    // ── Migrated short forms (FR-7c) ──────────────────────────────────────
    // Slug == bare id, so the existing `[…](#fr-7)` / `(#ac-1-1)` links resolve
    // in Marksman. Title / parent-FR are read from the body.

    // Short FR: `## FR-N` (title relocated to the `**bold**` line below).
    m = text.match(SHORT_FR_RE);
    if (m) {
      const num = m[1];
      const compact = `FR-${num}`;
      const slug = `fr-${num}`; // matches Marksman's slug for `## FR-N`
      const title = relocatedTitleAfter(lines, i);
      const node: FrNode = { id: compact, type: 'FR', title, file: relativePath, line, anchors: [compact, slug], body: text };
      nodes.push(node);
      anchors.push(
        { alias: compact, canonicalId: compact, location },
        { alias: slug, canonicalId: compact, location },
      );
      continue;
    }

    // Short NFR: `## NFR-Category-N` / `## NFR-N` (title relocated below).
    m = text.match(SHORT_NFR_RE);
    if (m) {
      const category = m[1];
      const num = m[2];
      const compact = category ? `NFR-${category}-${num}` : `NFR-${num}`;
      const slug = `nfr-${category ? `${category.toLowerCase()}-` : ''}${num}`;
      const title = relocatedTitleAfter(lines, i);
      const node: NfrNode = { id: compact, type: 'NFR', title, category, file: relativePath, line, anchors: [compact, slug], body: text };
      nodes.push(node);
      anchors.push(
        { alias: compact, canonicalId: compact, location },
        { alias: slug, canonicalId: compact, location },
      );
      continue;
    }

    // Short AC: `## AC-N.M` (parent-FR read from the `**Требование:**` line).
    m = text.match(SHORT_AC_RE);
    if (m) {
      const acId = `AC-${m[1]}`;
      // Marksman slug for `## AC-1.1` is `ac-11` (dot dropped) — via the single
      // marksmanSlug source of truth (FR-34a).
      const slug = marksmanSlug(acId);
      const parentFr = parentFrAfter(lines, i);
      const node: AcNode = { id: acId, type: 'AC', parentFr, file: relativePath, line, ears: '' };
      nodes.push(node);
      if (parentFr) edges.push({ from: parentFr, to: acId, type: 'covers' });
      anchors.push(
        { alias: acId, canonicalId: acId, location },
        { alias: slug, canonicalId: acId, location },
      );
      continue;
    }

    // Decision: `### Decision: <title>` (DESIGN.md design decisions). Parent FR from
    // the explicit `**Требование:**` line → real FR→Decision `covers` edge (the design
    // leg of the trace web). No requirement line → node with empty parentFr, no edge.
    m = text.match(DECISION_HEADING_RE);
    if (m) {
      const title = m[1].trim();
      const decId = `Decision-${slugify(title)}`;
      const slug = slugify(text); // Marksman slug of the full `Decision: <title>` heading
      const parentFr = decisionRequirementAfter(lines, i);
      const node: DecisionNode = { id: decId, type: 'Decision', title, parentFr, file: relativePath, line, body: text };
      nodes.push(node);
      if (parentFr) edges.push({ from: parentFr, to: decId, type: 'covers' });
      anchors.push(
        { alias: decId, canonicalId: decId, location },
        { alias: slug, canonicalId: decId, location },
      );
      continue;
    }

    // Story: `### User Story N: <title>` (USER_STORIES.md). Parent FR from the explicit
    // `**Требование:**` line → real FR→Story `covers` edge (the story leg of the web).
    m = text.match(STORY_HEADING_RE);
    if (m) {
      const num = m[1];
      const title = m[2].trim();
      // Id keyed by the story NUMBER (its identity), not the title alone — two stories
      // with the same title but different N must NOT collapse to one node (FR-36 collision).
      const storyId = `Story-${num}-${slugify(title)}`;
      const slug = slugify(text); // Marksman slug of the full `User Story N: <title>` heading
      const parentFr = decisionRequirementAfter(lines, i);
      const node: StoryNode = { id: storyId, type: 'Story', title, parentFr, file: relativePath, line, body: text };
      nodes.push(node);
      if (parentFr) edges.push({ from: parentFr, to: storyId, type: 'covers' });
      anchors.push(
        { alias: storyId, canonicalId: storyId, location },
        { alias: slug, canonicalId: storyId, location },
      );
      continue;
    }
  }

  // FR-36a (P13-2): the parser itself emits spec-qualified composite keys —
  // node ids, covers-edge endpoints and parentFr. Anchors stay BARE (FR-36b),
  // hence not passed into qualifySlice. Slug-less files keep bare ids.
  qualifySlice({ nodes, edges }, specOf(relativePath));

  return { nodes, edges, anchors };
}

/** Convenience: read a file from disk and parse it. */
export function parseMarkdownFile(absPath: string, repoRoot: string): ParserOutput {
  const source = fs.readFileSync(absPath, 'utf-8');
  const relative = path.relative(repoRoot, absPath).split(path.sep).join('/');
  return parseMarkdown(source, relative);
}
