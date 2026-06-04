// Wiki-link resolver (FR-3 / AC-3.3) — the GRAPH-side resolution the spec
// already required, built on the parser's existing `definitions` map (anchor
// alias → location). Scans spec bodies for `[[...]]`, resolves each against the
// registered anchors, and surfaces broken ones. This is the resolver AC-3.3
// assigns to the custom MD parser — NOT a separate LSP.
//
//   AC-3.3: WHEN a wiki-link `[[FR-001]]` is encountered AND FR-001 is defined
//   elsewhere THEN the resolver SHALL navigate to the heading correctly.

import type { NodeLocation } from './types.ts';

export interface WikiLinkOccurrence {
  /** Lookup key — the alias before any `#fragment` or `|display`. */
  target: string;
  /** Optional `#fragment` (sub-heading) after the target. */
  fragment?: string;
  /** Raw inner text of the `[[...]]`. */
  raw: string;
  /** Source file (as passed in — repo-relative by convention). */
  file: string;
  /** 1-based source line. */
  line: number;
  /** Resolved target location from `definitions`, or null when unresolved. */
  resolved: NodeLocation | null;
}

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/**
 * Find every `[[...]]` in `content` and resolve its target against `definitions`.
 * Same-file fragment links (`[[#heading]]`) have an empty target and are left
 * unresolved (target navigation is the FR-3 concern). Resolution is exact-match
 * over the registered anchor aliases (compact `FR-1` + slug `fr-1-title`).
 */
export function resolveWikiLinks(
  content: string,
  file: string,
  definitions: Map<string, NodeLocation>,
): WikiLinkOccurrence[] {
  const out: WikiLinkOccurrence[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    WIKILINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = WIKILINK_RE.exec(lines[i])) !== null) {
      const inner = m[1].trim();
      const beforeDisplay = inner.split('|')[0];
      const hashIdx = beforeDisplay.indexOf('#');
      const target = (hashIdx >= 0 ? beforeDisplay.slice(0, hashIdx) : beforeDisplay).trim();
      const fragment = hashIdx >= 0 ? beforeDisplay.slice(hashIdx + 1).trim() : undefined;
      const resolved = target === '' ? null : definitions.get(target) ?? null;
      out.push({ target, fragment, raw: inner, file, line: i + 1, resolved });
    }
  }
  return out;
}

/** Wiki-links whose target is set but does not resolve (AC-3.3 violation candidates). */
export function brokenWikiLinks(occurrences: WikiLinkOccurrence[]): WikiLinkOccurrence[] {
  return occurrences.filter((o) => o.target !== '' && o.resolved === null);
}
