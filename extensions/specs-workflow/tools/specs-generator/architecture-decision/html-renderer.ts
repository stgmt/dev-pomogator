/**
 * Self-contained HTML renderer для axis decision artefacts (FR-2).
 * Pure template literal — no template engine, no build step, no npm runtime dep.
 * Inline CSS only (no external <link>). Recommendation pinned top regardless of
 * variant order in grid (position-bias mitigation). ✅/◐/❌ colour coding.
 */

export interface Precedent {
  repo: string;
  stars?: number;
  url: string;
}

export interface VariantModel {
  id: string;
  name: string;
  y_statement: string;
  maturity_ring: 'Adopt' | 'Trial' | 'Assess' | 'Hold';
  cost_chip: '$' | '$$' | '$$$';
  good: string[];
  neutral: string[];
  bad: string[];
  when_to_choose: string;
  when_not_to_choose: string;
  failure_modes?: string[]; // R10
  real_world_precedent?: Precedent[];
  confirmation?: string;
  is_recommended: boolean;
}

export interface AxisModel {
  axis_id: string;
  axis_name: string;
  context: string;
  variants: VariantModel[];
  status?: 'pending' | 'accepted' | 'deferred' | 'rejected';
  chosen?: string | null;
}

export interface IndexAxisRow {
  axis_id: string;
  axis_name: string;
  status: string;
  chosen: string | null;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BASE_CSS = `
:root{--good:#16a34a;--neutral:#ca8a04;--bad:#dc2626;--rec:#2563eb;--bg:#0f172a;--card:#1e293b;--fg:#e2e8f0;--muted:#94a3b8}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);padding:24px}
h1{font-size:1.6rem;margin:0 0 4px}.ctx{color:var(--muted);margin:0 0 24px;max-width:70ch}
.rec-card{border:2px solid var(--rec);border-radius:12px;padding:16px 20px;margin:0 0 24px;background:linear-gradient(180deg,rgba(37,99,235,.12),transparent)}
.rec-badge{display:inline-block;background:var(--rec);color:#fff;font-weight:700;font-size:.72rem;padding:2px 10px;border-radius:999px;letter-spacing:.04em}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.variant{background:var(--card);border-radius:12px;padding:16px;border:1px solid #334155}
.variant h3{margin:0 0 6px;font-size:1.15rem}.y{color:var(--muted);font-size:.9rem;margin:0 0 10px;font-style:italic}
.chips{margin:0 0 10px}.chip{display:inline-block;font-size:.72rem;padding:2px 8px;border-radius:999px;margin-right:6px;border:1px solid #475569}
ul{margin:6px 0;padding-left:4px;list-style:none}li{margin:3px 0}
.g::before{content:"✅ ";}.n::before{content:"◐ ";color:var(--neutral)}.b::before{content:"❌ ";}
.label{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:10px 0 2px}
.when{font-size:.85rem;margin:2px 0}.when.no{color:var(--bad)}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{border:1px solid #334155;padding:6px 10px;text-align:left;font-size:.85rem}
`;

function variantCard(v: VariantModel): string {
  const li = (items: string[] | undefined, cls: string) =>
    (items ?? []).map((x) => `<li class="${cls}">${esc(x)}</li>`).join('');
  return `<article class="variant">
  <h3>${esc(v.name)}</h3>
  <p class="y">${esc(v.y_statement)}</p>
  <div class="chips"><span class="chip">${v.maturity_ring}</span><span class="chip">${v.cost_chip}</span></div>
  <ul>${li(v.good, 'g')}${li(v.neutral, 'n')}${li(v.bad, 'b')}</ul>
  ${v.failure_modes?.length ? `<div class="label">Failure modes</div><ul>${li(v.failure_modes, 'b')}</ul>` : ''}
  <div class="label">When to choose</div><p class="when">${esc(v.when_to_choose)}</p>
  <div class="label">When NOT to choose</div><p class="when no">${esc(v.when_not_to_choose)}</p>
  ${v.confirmation ? `<div class="label">Confirmation</div><p class="when">${esc(v.confirmation)}</p>` : ''}
</article>`;
}

export function renderAxisHtml(axis: AxisModel): string {
  const rec = axis.variants.find((v) => v.is_recommended);
  const recBlock = rec
    ? `<div class="rec-card"><span class="rec-badge">✅ RECOMMENDED</span>
       <h3>${esc(rec.name)}</h3><p class="y">${esc(rec.y_statement)}</p></div>`
    : '';
  const cards = axis.variants.map(variantCard).join('\n');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(axis.axis_name)} — architecture decision</title>
<style>${BASE_CSS}</style></head><body>
<h1>${esc(axis.axis_name)}</h1>
<p class="ctx">${esc(axis.context)}</p>
${recBlock}
<div class="grid">${cards}</div>
</body></html>`;
}

export function renderIndexHtml(slug: string, rows: IndexAxisRow[]): string {
  const trs = rows
    .map(
      (r) =>
        `<tr><td>${esc(r.axis_name)}</td><td>${esc(r.status)}</td><td>${esc(r.chosen ?? '—')}</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(slug)} — architecture decisions</title>
<style>${BASE_CSS}</style></head><body>
<h1>Architecture decisions — ${esc(slug)}</h1>
<table><thead><tr><th>Axis</th><th>Status</th><th>Chosen</th></tr></thead><tbody>${trs}</tbody></table>
</body></html>`;
}
