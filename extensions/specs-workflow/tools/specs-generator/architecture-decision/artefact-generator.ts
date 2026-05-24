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
import {
  renderAxisHtml,
  pickRecommended,
  hasPolicyVariation,
  ALL_POLICIES,
  DEFAULT_POLICY,
  type AxisModel,
  type VariantModel,
} from './html-renderer.ts';

const POLICY_MD_LABEL: Record<string, string> = {
  'mvp-poc': 'MVP/PoC',
  'production-grade': 'Production',
  'cost-optimal': 'Cost',
  'scale-ready': 'Scale',
  portability: 'Portability',
};

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

const VERDICT_MD: Record<string, string> = { good: '🟢', ok: '🟡', bad: '🔴' };

/** Карта-сравнение (markdown): критерии × варианты, цвет по verdict. */
function renderComparisonMatrix(axis: AxisModel): string {
  const scored = axis.variants.filter((v) => v.scorecard && v.scorecard.length > 0);
  if (scored.length < 2) return '';
  const criteria: string[] = [];
  for (const v of scored) for (const e of v.scorecard ?? []) if (!criteria.includes(e.criterion)) criteria.push(e.criterion);
  const rec = pickRecommended(axis);
  const header = `| Критерий | ${scored.map((v) => (v.id === rec?.id ? `**${v.name} ★**` : v.name)).join(' | ')} |`;
  const sep = `|${' --- |'.repeat(scored.length + 1)}`;
  const rows = criteria.map((crit) => {
    const cells = scored
      .map((v) => {
        const e = v.scorecard?.find((s) => s.criterion === crit);
        return e ? `${VERDICT_MD[e.verdict] ?? ''} ${e.value}` : '—';
      })
      .join(' | ');
    return `| ${crit} | ${cells} |`;
  });
  return ['## Карта сравнения — критерии × варианты\n', header, sep, ...rows, '\n🟢 хорошо · 🟡 нормально · 🔴 плохо\n'].join('\n');
}

/** FR-16 markdown demonstration table: вариант × 5 политик. */
function renderDemonstrationTable(axis: AxisModel): string {
  if (!hasPolicyVariation(axis)) return '';
  const rec = pickRecommended(axis);
  const header = `| Variant | ${ALL_POLICIES.map((p) => POLICY_MD_LABEL[p]).join(' | ')} |`;
  const sep = `|${' --- |'.repeat(ALL_POLICIES.length + 1)}`;
  const rows = axis.variants.map((v) => {
    const cells = ALL_POLICIES.map((p) => (v.policy_fit?.includes(p) ? '✓' : '·')).join(' | ');
    const name = v.id === rec?.id ? `**${v.name} ★**` : v.name;
    return `| ${name} | ${cells} |`;
  });
  const active = axis.selected_policy ?? DEFAULT_POLICY;
  return [
    `## Recommendation depends on goal\n`,
    `★ = recommended under active policy \`${active}\`. Switch policy → recommendation changes.\n`,
    header,
    sep,
    ...rows,
    '',
  ].join('\n');
}

export function renderAxisMarkdown(axis: AxisModel): string {
  const policy = axis.selected_policy ?? DEFAULT_POLICY;
  const rec = pickRecommended(axis);
  const parts: string[] = [];
  // Frontmatter — source of status for index-compiler / audit. status starts 'pending';
  // a choice (auto-mode recommendation or override) flips it to 'accepted' + chosen id.
  parts.push(
    `---\naxis_id: ${axis.axis_id}\nstatus: ${axis.status ?? 'pending'}\nchosen: ${axis.chosen ?? 'null'}\nrecommended: ${rec?.id ?? 'null'}\nselected_policy: ${policy}\n---\n`,
  );
  parts.push(`# ${axis.axis_name}\n\n${axis.context}\n`);
  if (axis.door_type === 'one-way') {
    parts.push(`> 🚪 **Необратимое решение (one-way door)** — выход дорогой, ресёрчь тщательно.\n`);
  } else if (axis.door_type === 'two-way') {
    parts.push(`> 🔁 **Обратимое решение (two-way door)** — легко поменять, не переусердствуй.\n`);
  }
  if (rec) {
    parts.push(`## ✅ Recommended: ${rec.name} _(under ${policy})_\n\n${rec.y_statement}\n`);
  }
  if (axis.sensitivity?.length) {
    parts.push(`**Когда рекомендация меняется:**\n${bullets(axis.sensitivity, '↪')}\n`);
  }
  const matrix = renderComparisonMatrix(axis);
  if (matrix) parts.push(matrix);
  const demo = renderDemonstrationTable(axis);
  if (demo) parts.push(demo);
  for (const v of axis.variants) {
    parts.push(`## ${v.name}${v.id === rec?.id ? ' ✅' : ''}\n`);
    parts.push(`_${v.y_statement}_\n`);
    parts.push(`**Maturity:** ${v.maturity_ring} · **Cost:** ${v.cost_chip}\n`);
    if (v.business_summary) {
      const b = v.business_summary;
      parts.push(
        `**💼 Для бизнеса:** получаешь — ${b.gets}; срок — ${b.time_to_market}; стоимость — ${b.cost}; риск — ${b.risk}\n`,
      );
    }
    if (v.cost_at_scale?.length) {
      const ladder = v.cost_at_scale.map((c) => `${c.tier}: ${c.cost}`).join(' → ');
      parts.push(`**Стоимость на масштабе:** ${ladder}\n`);
    }
    if (v.time_costs) {
      const t = v.time_costs;
      const segs = [
        t.to_market ? `до прода — ${t.to_market}` : '',
        t.to_feature ? `фича — ${t.to_feature}` : '',
        t.to_test ? `тесты — ${t.to_test}` : '',
        t.to_support ? `поддержка — ${t.to_support}` : '',
      ].filter(Boolean);
      if (segs.length) parts.push(`**⏱ Время команды:** ${segs.join('; ')}\n`);
    }
    if (v.good?.length) parts.push(bullets(v.good, '✅'));
    if (v.neutral?.length) parts.push(bullets(v.neutral, '◐'));
    if (v.bad?.length) parts.push(bullets(v.bad, '❌'));
    if (v.reality_check?.length) parts.push(`\n**⚠️ Реальность — что руками:**\n${bullets(v.reality_check, '⚠️')}`);
    if (v.failure_modes?.length) parts.push(`\n**Failure modes:**\n${bullets(v.failure_modes, '❌')}`);
    if (v.exit_cost) parts.push(`\n**🚪 Выход (exit cost):** ${v.exit_cost}`);
    if (v.real_world_precedent?.length) {
      const prec = v.real_world_precedent
        .map((p) => {
          const stars = typeof p.stars === 'number' ? ` (${p.stars}★)` : '';
          const link = p.url ? `[${p.repo}](${p.url})` : p.repo;
          const rel = p.relevance ? ` — ${p.relevance}` : '';
          return `- 📎 ${link}${stars}${rel}`;
        })
        .join('\n');
      parts.push(`\n**Proof — real-world precedent:**\n${prec}`);
    }
    parts.push(`\n**When to choose:** ${v.when_to_choose}`);
    parts.push(`**When NOT to choose:** ${v.when_not_to_choose}`);
    if (v.confirmation) parts.push(`**Confirmation:** ${v.confirmation}`);
    if (v.correction_log?.length) parts.push(`\n**Corrections:**\n${bullets(v.correction_log, '↻')}`);
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
