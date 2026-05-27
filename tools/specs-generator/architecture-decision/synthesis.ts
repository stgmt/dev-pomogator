/**
 * Cross-axis synthesis (FR-13). After the per-axis loop, collects all AXIS-*.md
 * frontmatter to know which axes exist, then renders SYNTHESIS.md (+ .html) from
 * insights supplied by the skill/LLM. Mirror artefact-generator split: the helper
 * is deterministic mechanics (collect / validate / render) — it does NOT invent
 * insights (that's the skill's job). insights_count=0 is valid (1-axis spec).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderSynthesisHtml, type Insight } from './html-renderer.ts';

export interface SynthesisResult {
  synthesisMd: string;
  synthesisHtml: string;
  insights_count: number;
  rejected: { reason: string; insight: Partial<Insight> }[];
}

function parseFrontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

/** Axis ids present in the spec dir (from AXIS-*.md frontmatter). */
export function collectAxisIds(specDir: string): string[] {
  if (!fs.existsSync(specDir)) return [];
  return fs
    .readdirSync(specDir)
    .filter((f) => /^AXIS-.*\.md$/.test(f))
    .sort()
    .map((f) => {
      const fm = parseFrontmatter(fs.readFileSync(path.join(specDir, f), 'utf-8'));
      return fm.axis_id ?? f.replace(/^AXIS-|\.md$/g, '');
    });
}

/**
 * Keep only valid cross-axis insights: ≥2 axes AND every referenced axis id exists.
 * Invalid insights are reported in `rejected` (not silently dropped) so the skill
 * sees why an insight didn't render.
 */
export function validateInsights(
  insights: Insight[],
  knownAxisIds: string[],
): { valid: Insight[]; rejected: SynthesisResult['rejected'] } {
  const known = new Set(knownAxisIds);
  const valid: Insight[] = [];
  const rejected: SynthesisResult['rejected'] = [];
  for (const ins of insights) {
    const axes = ins.axes ?? [];
    if (axes.length < 2) {
      rejected.push({ reason: 'fewer than 2 axes (not cross-axis)', insight: ins });
      continue;
    }
    const unknown = axes.filter((a) => !known.has(a));
    if (unknown.length) {
      rejected.push({ reason: `unknown axis id(s): ${unknown.join(', ')}`, insight: ins });
      continue;
    }
    valid.push(ins);
  }
  return { valid, rejected };
}

function renderSynthesisMd(slug: string, insights: Insight[]): string {
  const parts: string[] = [`# Cross-axis synthesis — ${slug}\n`];
  parts.push(
    'Emergent insights spanning ≥2 decision axes (cross-axis dependencies, component redundancy, secondary effects).\n',
  );
  if (!insights.length) {
    parts.push('_No cross-axis insights — single-axis spec or axes are independent._\n');
    return parts.join('\n');
  }
  for (const i of insights) {
    parts.push(`## ${i.title}\n`);
    parts.push(`**Axes:** ${i.axes.join(', ')}\n`);
    parts.push(`${i.description}\n`);
    parts.push(`**Recommendation:** ${i.recommendation}`);
    if (i.trade_off) parts.push(`**Trade-off:** ${i.trade_off}`);
    parts.push('');
  }
  return parts.join('\n');
}

/** Spec slug for display: parent dir name if specDir is an ARCHITECTURE/ subdir, else basename. */
export function deriveSlug(specDir: string): string {
  const norm = specDir.replace(/[/\\]+$/, '');
  const base = path.basename(norm);
  return base === 'ARCHITECTURE' ? path.basename(path.dirname(norm)) : base;
}

export function synthesize(
  specDir: string,
  insights: Insight[] = [],
  slug = deriveSlug(specDir),
): SynthesisResult {
  const knownAxisIds = collectAxisIds(specDir);
  const { valid, rejected } = validateInsights(insights, knownAxisIds);

  const md = renderSynthesisMd(slug, valid);
  const html = renderSynthesisHtml(slug, valid);
  const synthesisMd = path.join(specDir, 'SYNTHESIS.md');
  const synthesisHtml = path.join(specDir, 'SYNTHESIS.html');

  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(synthesisMd, md, 'utf-8');
  fs.writeFileSync(synthesisHtml, html, 'utf-8');

  return { synthesisMd, synthesisHtml, insights_count: valid.length, rejected };
}
