/**
 * Per-axis artefact generator (FR-2). Renders an AxisModel (variants filled by
 * the skill/LLM) into markdown + self-contained HTML on disk. The generator is
 * deterministic mechanics — it does NOT invent variants (that's the skill's job,
 * mirror of variant-matrix where helpers render/parse and the skill fills content).
 *
 * Variant order in the grid is shuffled with a seeded Fisher-Yates (position-bias
 * mitigation, FR-8); the recommendation is always pinned top by html-renderer.
 * Word-budget guard warns when variant descriptions diverge > ±15%.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderAxisHtml, type AxisModel, type VariantModel } from './html-renderer.ts';

export interface GenerateResult {
  axis_id: string;
  mdPath: string;
  htmlPath: string;
  wordsPerVariant: number[];
  wordBudgetOk: boolean;
}

// Deterministic seeded shuffle (mulberry32 from string seed) — reproducible per axis.id.
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const rand = () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function wordCount(v: VariantModel): number {
  const text = [v.y_statement, ...v.good, ...v.neutral, ...v.bad, v.when_to_choose, v.when_not_to_choose]
    .join(' ');
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function checkWordBudget(variants: VariantModel[]): { counts: number[]; ok: boolean } {
  const counts = variants.map(wordCount);
  if (counts.length < 2) return { counts, ok: true };
  const avg = counts.reduce((s, n) => s + n, 0) / counts.length;
  const ok = counts.every((c) => Math.abs(c - avg) <= avg * 0.15 + 1e-9 || avg === 0);
  return { counts, ok };
}

function bullets(items: string[] | undefined, mark: string): string {
  return (items ?? []).map((x) => `- ${mark} ${x}`).join('\n');
}

export function renderAxisMarkdown(axis: AxisModel): string {
  const rec = axis.variants.find((v) => v.is_recommended);
  const parts: string[] = [];
  // Frontmatter — source of status for index-compiler / audit. status starts 'pending';
  // a choice (auto-mode recommendation or override) flips it to 'accepted' + chosen id.
  parts.push(
    `---\naxis_id: ${axis.axis_id}\nstatus: ${axis.status ?? 'pending'}\nchosen: ${axis.chosen ?? 'null'}\nrecommended: ${rec?.id ?? 'null'}\n---\n`,
  );
  parts.push(`# ${axis.axis_name}\n\n${axis.context}\n`);
  if (rec) {
    parts.push(`## ✅ Recommended: ${rec.name}\n\n${rec.y_statement}\n`);
  }
  for (const v of axis.variants) {
    parts.push(`## ${v.name}${v.is_recommended ? ' ✅' : ''}\n`);
    parts.push(`_${v.y_statement}_\n`);
    parts.push(`**Maturity:** ${v.maturity_ring} · **Cost:** ${v.cost_chip}\n`);
    if (v.good?.length) parts.push(bullets(v.good, '✅'));
    if (v.neutral?.length) parts.push(bullets(v.neutral, '◐'));
    if (v.bad?.length) parts.push(bullets(v.bad, '❌'));
    if (v.failure_modes?.length) parts.push(`\n**Failure modes:**\n${bullets(v.failure_modes, '❌')}`);
    parts.push(`\n**When to choose:** ${v.when_to_choose}`);
    parts.push(`**When NOT to choose:** ${v.when_not_to_choose}`);
    if (v.confirmation) parts.push(`**Confirmation:** ${v.confirmation}`);
    parts.push('');
  }
  return parts.join('\n');
}

export function generateAxisArtefact(
  axis: AxisModel,
  outDir: string,
  opts: { shuffle?: boolean } = {},
): GenerateResult {
  const ordered: AxisModel = {
    ...axis,
    variants: opts.shuffle === false ? axis.variants : seededShuffle(axis.variants, axis.axis_id),
  };
  const budget = checkWordBudget(axis.variants);

  fs.mkdirSync(outDir, { recursive: true });
  const base = `AXIS-${axis.axis_id}`;
  const mdPath = path.join(outDir, `${base}.md`);
  const htmlPath = path.join(outDir, `${base}.html`);

  fs.writeFileSync(mdPath, renderAxisMarkdown(ordered), 'utf-8');
  fs.writeFileSync(htmlPath, renderAxisHtml(ordered), 'utf-8');

  return {
    axis_id: axis.axis_id,
    mdPath,
    htmlPath,
    wordsPerVariant: budget.counts,
    wordBudgetOk: budget.ok,
  };
}
