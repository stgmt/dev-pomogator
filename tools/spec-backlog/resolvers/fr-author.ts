// fr-author resolver — given a backlog entry for missing FR-N section,
// reads the citing file to extract context, then drafts a new ## FR-N heading
// and skeleton body in the spec's FR.md with citation markers.
//
// Mechanical — author fills in real description and acceptance criteria later.
//
// Idempotent: if FR-N heading already exists, returns notes saying so.

import fs from 'node:fs';
import path from 'node:path';
import type { Resolver, ResolverResult } from './types.ts';
import type { BacklogEntry } from '../types.ts';
import { parseFrHeadings } from '../../_shared/fr-parser.ts';

const FR_CITATION_RE = /FR-(\d+)/g;

export const frAuthor: Resolver = {
  name: 'fr-author',
  description:
    'Drafts skeleton FR-N heading + body in FR.md from citation context found in spec files.',

  async resolve(opts): Promise<ResolverResult> {
    return frAuthorImpl(opts.repoRoot, opts.entry);
  },
};

function frAuthorImpl(repoRoot: string, entry: BacklogEntry): ResolverResult {
  const specDir = path.join(repoRoot, '.specs', entry.slug);
  const frFile = path.join(specDir, 'FR.md');

  // Bail if FR.md doesn't exist — cannot add FR section to nonexistent file
  if (!fs.existsSync(frFile)) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `${entry.slug}/FR.md not found — cannot create FR section without it.`,
      bailed_out: { reason: 'fr-md-missing' },
    };
  }

  // Extract FR number from evidence.file citation context or entry properties
  // evidence.file typically points to the citing document, e.g. "REQUIREMENTS.md"
  // evidence might also have context about which FR-N was cited
  const citingFile = (entry.evidence.file as string) || '';
  if (!citingFile) {
    return {
      confidence: 0,
      files_changed: [],
      notes: 'No citation context in evidence.file — cannot infer which FR-N to draft.',
      bailed_out: { reason: 'no-citation-context' },
    };
  }

  // Read the citing file to extract all FR-N citations and find line numbers.
  // Batch-19: normalise the Windows-style `\` separators + strip `:line`
  // suffix that the cross-spec-reconcile detector emits in
  // `referenced_in`. Resolve absolutely from repoRoot if it's already a
  // `.specs/<slug>/…` path (avoids double-prefixing with specDir).
  const cleanCiting = citingFile.replace(/:\d+$/, '').replace(/\\/g, '/');
  const citingPath = cleanCiting.startsWith('.specs/')
    ? path.join(repoRoot, cleanCiting)
    : path.join(specDir, cleanCiting);
  if (!fs.existsSync(citingPath)) {
    return {
      confidence: 0.3,
      files_changed: [],
      notes: `Citing file ${citingFile} does not exist — proceeding with generic draft.`,
      bailed_out: { reason: 'citing-file-missing' },
    };
  }

  const citingBody = fs.readFileSync(citingPath, 'utf8');
  const citingLines = citingBody.split('\n');

  // Collect all FR-N citations with their context (line numbers)
  const citations: Array<{ num: string; line: number; context: string }> = [];
  FR_CITATION_RE.lastIndex = 0;
  citingBody.split('\n').forEach((lineText, idx) => {
    FR_CITATION_RE.lastIndex = 0;
    let lineMatch: RegExpExecArray | null;
    while ((lineMatch = FR_CITATION_RE.exec(lineText)) !== null) {
      const num = lineMatch[1];
      citations.push({
        num,
        line: idx + 1,
        context: lineText.trim().slice(0, 80), // First 80 chars of context
      });
    }
  });

  if (citations.length === 0) {
    return {
      confidence: 0,
      files_changed: [],
      notes: `No FR-N citations found in ${citingFile} — cannot infer which FR to draft.`,
      bailed_out: { reason: 'no-fr-citations' },
    };
  }

  // Read existing FR.md to check which FR-N sections already exist
  const frBody = fs.readFileSync(frFile, 'utf8');
  const existingFRs = new Set(parseFrHeadings(frBody).map((h) => h.id));

  // Filter to only FR-N that don't exist yet
  const newFRs = citations.filter((c) => !existingFRs.has(`FR-${c.num}`));
  if (newFRs.length === 0) {
    return {
      confidence: 1,
      files_changed: [],
      notes: `All cited FR-N sections (${Array.from(new Set(citations.map((c) => c.num))).join(', ')}) already exist in FR.md.`,
      bailed_out: { reason: 'already-defined' },
    };
  }

  // Deduplicate and sort by FR number
  const uniqueNewFRs = Array.from(
    new Map(newFRs.map((c) => [c.num, c])).values(),
  ).sort((a, b) => parseInt(a.num, 10) - parseInt(b.num, 10));

  // Generate new FR sections
  const newSections: string[] = [];
  for (const fr of uniqueNewFRs) {
    newSections.push('');
    newSections.push(`## FR-${fr.num}: [TBD title]`);
    newSections.push('');
    newSections.push('[TBD description — replace with actual requirement text]');
    newSections.push('');
    newSections.push('### Citations');
    newSections.push('');
    // Add citation context: references from the citing file
    const frCitations = citations.filter((c) => c.num === fr.num);
    for (const cit of frCitations) {
      newSections.push(`- **${citingFile}:${cit.line}** — \`${cit.context}\``);
    }
    newSections.push('');
  }

  // Append new sections to FR.md
  const updatedFR = frBody.trimEnd() + '\n' + newSections.join('\n');
  fs.writeFileSync(frFile, updatedFR);

  return {
    confidence: 0.6,
    files_changed: [path.relative(repoRoot, frFile)],
    notes:
      `Drafted ${uniqueNewFRs.length} new FR-N section(s) (FR-${uniqueNewFRs.map((f) => f.num).join(', FR-')}) ` +
      `in ${entry.slug}/FR.md with [TBD] placeholders. Each section includes citation context ` +
      `from ${citingFile}. Author MUST replace [TBD] placeholders with real requirement text ` +
      `before the spec advances to the STOP gate.`,
  };
}
