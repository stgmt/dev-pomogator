/**
 * Markdown parser for the SpecGraph builder.
 *
 * Walks a markdown document via `unified` + `remark-parse`, finds the spec
 * headings the v4 conformance model cares about (FR / NFR / AC), and emits
 * a typed parser slice (`ParserOutput`) the builder will fold into the
 * global SpecGraph. Each heading registers BOTH the compact id (`FR-001`)
 * and a slug derived from id+title (`fr-001-login`) so wiki-links of either
 * shape navigate identically (per FR-3 dual-anchor invariant).
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
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Heading, Text, Root } from 'mdast';
import type {
  Node as SpecNode,
  ParserOutput,
  FrNode,
  NfrNode,
  AcNode,
  Edge,
} from '../types.ts';

const FR_HEADING_RE = /^FR-(\d+):\s*(.+)$/;
const NFR_HEADING_RE = /^NFR(?:-([A-Za-z][A-Za-z0-9]*))?-(\d+):\s*(.+)$/;
const AC_HEADING_RE = /^AC-(\d+(?:\.\d+)?)\s*\(FR-(\d+)\)\s*:?\s*(.*)$/;

/** Normalise a heading title into the slug component of the dual anchor. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks (accents)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Collapse mdast inline children into the raw heading-line text. */
function headingText(node: Heading): string {
  return node.children
    .map((child) => (child.type === 'text' ? (child as Text).value : ''))
    .join('')
    .trim();
}

/**
 * Parse a markdown document and emit FR / NFR / AC nodes plus the
 * `covers` edges that flow from AC to its parent FR.
 *
 * @param mdSource     raw markdown text
 * @param relativePath repository-relative POSIX path to record on each node
 * @returns parser slice ready for the builder to merge
 */
export function parseMarkdown(mdSource: string, relativePath: string): ParserOutput {
  const tree = unified().use(remarkParse).parse(mdSource) as Root;

  const nodes: SpecNode[] = [];
  const edges: Edge[] = [];
  const anchors: ParserOutput['anchors'] = [];

  for (const child of tree.children) {
    if (child.type !== 'heading') continue;
    const heading = child as Heading;
    if (!heading.position) continue; // remark always sets position; defensive

    const text = headingText(heading);
    const line = heading.position.start.line;
    const location = { file: relativePath, line };

    // FR — the most common heading.
    let m = text.match(FR_HEADING_RE);
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
  }

  return { nodes, edges, anchors };
}

/** Convenience: read a file from disk and parse it. */
export function parseMarkdownFile(absPath: string, repoRoot: string): ParserOutput {
  const source = fs.readFileSync(absPath, 'utf-8');
  const relative = path.relative(repoRoot, absPath).split(path.sep).join('/');
  return parseMarkdown(source, relative);
}
