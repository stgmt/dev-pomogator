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
  relevance?: string; // ПОЧЕМУ релевантно ДЛЯ этого проекта (похожая система/кейс), не просто популярность
}

// Стоимость на разных масштабах — кривая, не точечная оценка (ловушка дешёвого MVP).
export interface CostTier {
  tier: string; // "MVP / 100 польз.", "10k", "100k"
  cost: string; // "$0", "~$25/мес", "$300+/мес"
}

// ВРЕМЯ по жизненному циклу — деньги это не всё, время команды считается тоже.
export interface TimeCosts {
  to_market?: string; // до первого прода (initial setup)
  to_feature?: string; // типичная фича на этом стеке (dev-velocity)
  to_test?: string; // настройка + прогон тестов
  to_support?: string; // поддержка/мейнтенанс в месяц
}

// FR-16: selection policy — глобальная цель прогона, влияет на recommended-вариант.
export type PolicyId =
  | 'mvp-poc'
  | 'production-grade'
  | 'cost-optimal'
  | 'scale-ready'
  | 'portability';

export const ALL_POLICIES: PolicyId[] = [
  'mvp-poc',
  'production-grade',
  'cost-optimal',
  'scale-ready',
  'portability',
];

export const DEFAULT_POLICY: PolicyId = 'mvp-poc';

const POLICY_LABEL: Record<PolicyId, string> = {
  'mvp-poc': 'MVP / PoC',
  'production-grade': 'Production',
  'cost-optimal': 'Cost-optimal',
  'scale-ready': 'Scale-ready',
  portability: 'Portability',
};

// Business lens — что получает бизнес (plain language, не для инженера).
export interface BusinessSummary {
  gets: string; // какую способность/ценность получает бизнес
  time_to_market: string; // как быстро до первого результата
  cost: string; // деньги: старт + при росте
  risk: string; // главный бизнес-риск выбора
}

// Implementer lens — одна строка сравнения. verdict нормализован по смыслу
// (good=зелёный независимо от критерия: "ops низкий"=good, "lock-in высокий"=bad).
export interface ScorecardEntry {
  criterion: string; // "Лёгкость интеграции", "Кривая обучения", "Ops-нагрузка", "Vendor lock-in", ...
  verdict: 'good' | 'ok' | 'bad';
  value: string; // конкретное значение/факт, e.g. "Низкая — БД+auth+fn из коробки", "$4/мес", "2 дня"
  source?: string; // [VERIFIED via ...] или url
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
  when_to_choose?: string;
  when_not_to_choose?: string;
  failure_modes?: string[]; // R10
  real_world_precedent?: Precedent[];
  confirmation?: string;
  is_recommended: boolean;
  policy_fit?: PolicyId[]; // FR-16 — под какие политики вариант оптимален
  correction_log?: string[]; // FR-14 — reasoning journey ('предполагал X → обнаружил Y → исправил')
  business_summary?: BusinessSummary; // business lens — что получает бизнес
  scorecard?: ScorecardEntry[]; // implementer lens — многокритериальная оценка (карта-сравнение)
  reality_check?: string[]; // «из реала»: SSL/HTTPS, бэкапы, мониторинг, secrets-wiring, glue — что руками
  exit_cost?: string; // цена СЛЕЗТЬ с варианта (делает lock-in конкретным): "Postgres легко, Auth+RLS ~2 нед"
  cost_at_scale?: CostTier[]; // кривая стоимости на масштабе (ловушка дешёвого MVP)
  time_costs?: TimeCosts; // время по жизненному циклу: to_market / to_feature / to_test / to_support
}

export interface AxisModel {
  axis_id: string;
  axis_name: string;
  context: string;
  variants: VariantModel[];
  status?: 'pending' | 'accepted' | 'deferred' | 'rejected';
  chosen?: string | null;
  selected_policy?: PolicyId; // FR-16 — отсутствует → DEFAULT_POLICY
  door_type?: 'one-way' | 'two-way'; // обратимость решения (Bezos): one-way → ресёрчь тщательно, выход дорогой
  sensitivity?: string[]; // «рекомендация меняется если…» — решение как функция параметров (light sensitivity)
}

/**
 * FR-16 policy-aware recommended pick: вариант чей policy_fit включает selected_policy
 * (default mvp-poc); fallback на is_recommended если ни один не подходит.
 * Shared между html-renderer и artefact-generator (markdown) — единый источник истины.
 */
export function pickRecommended(axis: AxisModel): VariantModel | undefined {
  const policy = axis.selected_policy ?? DEFAULT_POLICY;
  const byPolicy = axis.variants.find((v) => v.policy_fit?.includes(policy));
  return byPolicy ?? axis.variants.find((v) => v.is_recommended);
}

/** True если у вариантов оси заданы разные policy_fit — нужна demonstration-таблица. */
export function hasPolicyVariation(axis: AxisModel): boolean {
  const tagged = axis.variants.filter((v) => v.policy_fit && v.policy_fit.length > 0);
  if (tagged.length < 2) return false;
  const signatures = new Set(tagged.map((v) => [...(v.policy_fit ?? [])].sort().join(',')));
  return signatures.size > 1;
}

export interface IndexAxisRow {
  axis_id: string;
  axis_name: string;
  status: string;
  chosen: string | null;
}

// FR-13: cross-axis synthesis insight — emergent across ≥2 axes.
export interface Insight {
  axes: string[]; // ≥2 axis ids — cross-axis by definition
  title: string;
  description: string;
  recommendation: string;
  trade_off?: string;
}

function esc(s: unknown): string {
  // Null-safe: a missing/optional field must never crash the whole render — coerce to ''.
  return String(s ?? '')
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
.policy-badge{display:inline-block;background:#334155;color:var(--fg);font-size:.7rem;padding:1px 8px;border-radius:999px;margin-left:8px}
.demo h2{font-size:1rem;margin:24px 0 4px}.demo .hint{color:var(--muted);font-size:.82rem;margin:0 0 6px}
.demo td.fit{color:var(--good);font-weight:700;text-align:center}.demo td.nofit{color:var(--muted);text-align:center}
.demo th.active{background:rgba(37,99,235,.25)}.demo td.rec-cell{color:var(--rec);font-weight:700}
.corr{margin:8px 0 0}.corr summary{cursor:pointer;font-size:.78rem;color:var(--neutral);text-transform:uppercase;letter-spacing:.04em}
.corr li{font-size:.82rem;color:var(--muted)}
.proof{display:inline-block;font-size:.66rem;padding:0 6px;border-radius:6px;margin-left:6px;vertical-align:middle;white-space:nowrap}
.proof.v{background:rgba(22,163,74,.18);color:#4ade80;border:1px solid rgba(22,163,74,.5)}
.proof.u{background:rgba(202,138,4,.15);color:#facc15;border:1px solid rgba(202,138,4,.4)}
.prec{margin:4px 0 0;padding-left:4px}.prec li{font-size:.82rem;margin:2px 0}
.prec a{color:#60a5fa;text-decoration:none}.prec a:hover{text-decoration:underline}
.prec .stars{color:var(--muted);font-size:.76rem;margin-left:4px}
.prec li::before{content:"📎 "}
.biz{border-left:3px solid var(--rec);background:rgba(37,99,235,.08);padding:8px 12px;margin:8px 0 0;border-radius:0 8px 8px 0}
.biz .biz-h{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:#93c5fd;margin:0 0 4px}
.biz dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:.84rem}
.biz dt{color:var(--muted);white-space:nowrap}.biz dd{margin:0}
.reality{margin:8px 0 0}.reality summary{cursor:pointer;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;color:#fca5a5}
.reality li{font-size:.82rem;margin:3px 0}.reality li::before{content:"⚠️ "}
.matrix{margin:24px 0}.matrix h2{font-size:1rem;margin:0 0 6px}
.matrix table{table-layout:fixed}.matrix th.crit,.matrix td.crit{width:160px;color:var(--muted);font-weight:400}
.matrix td.good{background:rgba(22,163,74,.14)}.matrix td.ok{background:rgba(202,138,4,.12)}.matrix td.bad{background:rgba(220,38,38,.14)}
.matrix td .dot{font-weight:700;margin-right:4px}.matrix td.good .dot{color:#4ade80}.matrix td.ok .dot{color:#facc15}.matrix td.bad .dot{color:#f87171}
.matrix th.rec-col{color:var(--rec)}
.door{display:inline-block;font-size:.82rem;padding:6px 12px;border-radius:8px;margin:0 0 16px;font-weight:600}
.door.one-way{background:rgba(220,38,38,.14);color:#fca5a5;border:1px solid rgba(220,38,38,.4)}
.door.two-way{background:rgba(22,163,74,.12);color:#86efac;border:1px solid rgba(22,163,74,.4)}
.sens{border-left:3px solid var(--neutral);background:rgba(202,138,4,.08);padding:8px 12px;margin:0 0 20px;border-radius:0 8px 8px 0;font-size:.86rem}
.sens .sens-h{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:#fcd34d;margin:0 0 4px}
.sens ul{margin:0}.sens li{margin:2px 0}.sens li::before{content:"↪ "}
.ladder{margin:6px 0 0;display:flex;gap:6px;flex-wrap:wrap}
.ladder .rung{font-size:.78rem;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:2px 8px}
.ladder .rung b{color:var(--fg)}.ladder .rung .t{color:var(--muted)}
.exit{font-size:.84rem;margin:6px 0 0;color:#fca5a5}.exit::before{content:"🚪 Выход: ";color:var(--muted)}
.prec .rel{color:var(--muted);font-size:.78rem;display:block;margin-left:18px}
.time dl{margin:4px 0 0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:.82rem}
.time dt{color:var(--muted);white-space:nowrap}.time dd{margin:0}
.axis{border-top:2px solid #334155;margin-top:28px;padding-top:8px}.axis>h2{font-size:1.35rem}
.synthesis{border-top:2px solid var(--rec);margin-top:28px;padding-top:8px}
`;

/** Turn a trailing [VERIFIED ...] / [UNVERIFIED ...] marker into a visible proof chip. */
function proofChip(marker: string): string {
  const m = marker.trim();
  const verified = /^VERIFIED/i.test(m);
  const label =
    m
      .replace(/^VERIFIED\s*(?:via\s*)?/i, '')
      .replace(/^UNVERIFIED\s*[—\-:]*\s*/i, '')
      .trim() || (verified ? 'verified' : 'unverified');
  return `<span class="proof ${verified ? 'v' : 'u'}" title="${esc(m)}">${verified ? '✓' : '?'} ${esc(label)}</span>`;
}

/** Render a bullet, lifting any inline [VERIFIED/UNVERIFIED ...] marker out into a proof chip. */
function bulletLi(x: string, cls: string): string {
  const m = x.match(/\[([^\]]*(?:VERIFIED|UNVERIFIED)[^\]]*)\]/i);
  if (!m) return `<li class="${cls}">${esc(x)}</li>`;
  const text = x.replace(m[0], '').replace(/\s{2,}/g, ' ').trim();
  return `<li class="${cls}">${esc(text)}${proofChip(m[1])}</li>`;
}

function formatStars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `${n}`;
}

/** FR-8/R8 proof: real-world precedent repos as clickable links — the evidence behind the pick. */
function precedentBlock(v: VariantModel): string {
  if (!v.real_world_precedent?.length) return '';
  const items = v.real_world_precedent
    .map((p) => {
      const stars = typeof p.stars === 'number' ? `<span class="stars">${formatStars(p.stars)}★</span>` : '';
      const repo = esc(p.repo);
      const body = p.url
        ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${repo}</a>`
        : repo;
      const rel = p.relevance ? `<span class="rel">${esc(p.relevance)}</span>` : '';
      return `<li>${body}${stars}${rel}</li>`;
    })
    .join('');
  return `<div class="label">Proof — real-world precedent</div><ul class="prec">${items}</ul>`;
}

/** Business lens — что получает бизнес, plain language. */
function businessBand(v: VariantModel): string {
  const b = v.business_summary;
  if (!b) return '';
  return `<div class="biz"><div class="biz-h">💼 Для бизнеса</div><dl>
    <dt>Получаешь</dt><dd>${esc(b.gets)}</dd>
    <dt>Срок до результата</dt><dd>${esc(b.time_to_market)}</dd>
    <dt>Стоимость</dt><dd>${esc(b.cost)}</dd>
    <dt>Риск</dt><dd>${esc(b.risk)}</dd></dl></div>`;
}

/** «Из реала» — что придётся настраивать/склеивать руками (SSL/HTTPS/бэкапы/мониторинг/secrets/glue). */
function realityBlock(v: VariantModel): string {
  if (!v.reality_check?.length) return '';
  const items = v.reality_check.map((x) => `<li>${esc(x)}</li>`).join('');
  return `<details class="reality" open><summary>Реальность — что руками (${v.reality_check.length})</summary><ul>${items}</ul></details>`;
}

const VERDICT_DOT: Record<ScorecardEntry['verdict'], string> = { good: '●', ok: '◐', bad: '○' };

/**
 * Карта-сравнение (implementer lens): критерии в строках, варианты в колонках,
 * ячейка цветная по verdict. Это и есть «карта» — видно лёгкость интеграции, ops,
 * lock-in и пр. сразу по всем вариантам. Строки = union критериев всех вариантов.
 */
function comparisonMatrix(axis: AxisModel): string {
  const scored = axis.variants.filter((v) => v.scorecard && v.scorecard.length > 0);
  if (scored.length < 2) return '';
  // union of criteria preserving first-seen order
  const criteria: string[] = [];
  for (const v of scored) for (const e of v.scorecard ?? []) if (!criteria.includes(e.criterion)) criteria.push(e.criterion);
  const rec = pickRecommended(axis);
  const head = scored
    .map((v) => `<th class="${v.id === rec?.id ? 'rec-col' : ''}">${esc(v.name)}${v.id === rec?.id ? ' ★' : ''}</th>`)
    .join('');
  const rows = criteria
    .map((crit) => {
      const cells = scored
        .map((v) => {
          const e = v.scorecard?.find((s) => s.criterion === crit);
          if (!e) return `<td class="nofit">—</td>`;
          const src = e.source ? ` ${proofChip(e.source.replace(/^\[|\]$/g, ''))}` : '';
          return `<td class="${e.verdict}"><span class="dot">${VERDICT_DOT[e.verdict]}</span>${esc(e.value)}${src}</td>`;
        })
        .join('');
      return `<tr><td class="crit">${esc(crit)}</td>${cells}</tr>`;
    })
    .join('');
  return `<section class="matrix"><h2>Карта сравнения — критерии × варианты</h2>
<table><thead><tr><th class="crit">Критерий</th>${head}</tr></thead><tbody>${rows}</tbody></table>
<p class="hint">● хорошо · ◐ нормально · ○ плохо. ★ — рекомендованный под активную политику.</p></section>`;
}

/** Кривая стоимости на масштабе — ловушка дешёвого MVP видна сразу. */
function costLadder(v: VariantModel): string {
  if (!v.cost_at_scale?.length) return '';
  const rungs = v.cost_at_scale
    .map((c) => `<span class="rung"><span class="t">${esc(c.tier)}:</span> <b>${esc(c.cost)}</b></span>`)
    .join('');
  return `<div class="label">Стоимость на масштабе</div><div class="ladder">${rungs}</div>`;
}

function exitCostLine(v: VariantModel): string {
  return v.exit_cost ? `<p class="exit">${esc(v.exit_cost)}</p>` : '';
}

/** Время по жизненному циклу — деньги не всё, время команды считается тоже. */
function timeBlock(v: VariantModel): string {
  const t = v.time_costs;
  if (!t || (!t.to_market && !t.to_feature && !t.to_test && !t.to_support)) return '';
  const row = (label: string, val?: string) => (val ? `<dt>${label}</dt><dd>${esc(val)}</dd>` : '');
  return `<div class="label">⏱ Время команды</div><div class="time"><dl>
    ${row('До прода', t.to_market)}${row('Фича', t.to_feature)}${row('Тесты', t.to_test)}${row('Поддержка', t.to_support)}</dl></div>`;
}

function variantCard(v: VariantModel): string {
  const li = (items: string[] | undefined, cls: string) =>
    (items ?? []).map((x) => bulletLi(x, cls)).join('');
  return `<article class="variant">
  <h3>${esc(v.name)}</h3>
  <p class="y">${esc(v.y_statement)}</p>
  <div class="chips"><span class="chip">${v.maturity_ring}</span><span class="chip">${v.cost_chip}</span></div>
  ${businessBand(v)}
  ${costLadder(v)}
  ${timeBlock(v)}
  <ul>${li(v.good, 'g')}${li(v.neutral, 'n')}${li(v.bad, 'b')}</ul>
  ${v.failure_modes?.length ? `<div class="label">Failure modes</div><ul>${li(v.failure_modes, 'b')}</ul>` : ''}
  ${realityBlock(v)}
  ${exitCostLine(v)}
  ${precedentBlock(v)}
  ${v.when_to_choose ? `<div class="label">When to choose</div><p class="when">${esc(v.when_to_choose)}</p>` : ''}
  ${v.when_not_to_choose ? `<div class="label">When NOT to choose</div><p class="when no">${esc(v.when_not_to_choose)}</p>` : ''}
  ${v.confirmation ? `<div class="label">Confirmation</div><p class="when">${esc(v.confirmation)}</p>` : ''}
  ${
    v.correction_log?.length
      ? `<details class="corr"><summary>Corrections (${v.correction_log.length})</summary><ul>${li(v.correction_log, 'n')}</ul></details>`
      : ''
  }
</article>`;
}

/** FR-16 demonstration table: вариант × 5 политик → ✓ где policy_fit совпадает. */
function demonstrationTable(axis: AxisModel): string {
  if (!hasPolicyVariation(axis)) return '';
  const active = axis.selected_policy ?? DEFAULT_POLICY;
  const rec = pickRecommended(axis);
  const head = ALL_POLICIES.map(
    (p) => `<th class="${p === active ? 'active' : ''}">${esc(POLICY_LABEL[p])}</th>`,
  ).join('');
  const rows = axis.variants
    .map((v) => {
      const cells = ALL_POLICIES.map((p) => {
        const fit = v.policy_fit?.includes(p);
        return `<td class="${fit ? 'fit' : 'nofit'}">${fit ? '✓' : '·'}</td>`;
      }).join('');
      const name = v.id === rec?.id ? `<td class="rec-cell">${esc(v.name)} ★</td>` : `<td>${esc(v.name)}</td>`;
      return `<tr>${name}${cells}</tr>`;
    })
    .join('');
  return `<section class="demo"><h2>Recommendation depends on goal</h2>
<p class="hint">★ = recommended under active policy «${esc(POLICY_LABEL[active])}». Switch policy → recommendation changes.</p>
<table><thead><tr><th>Variant</th>${head}</tr></thead><tbody>${rows}</tbody></table></section>`;
}

/** Self-contained HTML document wrapper (shared head + inline CSS). */
function wrapDoc(title: string, bodyInner: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>${BASE_CSS}</style></head><body>
${bodyInner}
</body></html>`;
}

/** Axis content as an embeddable section (h2 + anchor) — reused by standalone page AND full report. */
export function renderAxisSection(axis: AxisModel): string {
  const policy = axis.selected_policy ?? DEFAULT_POLICY;
  const rec = pickRecommended(axis);
  const recBlock = rec
    ? `<div class="rec-card"><span class="rec-badge">✅ RECOMMENDED</span><span class="policy-badge">under ${esc(POLICY_LABEL[policy])}</span>
       <h3>${esc(rec.name)}</h3><p class="y">${esc(rec.y_statement)}</p>
       <div class="chips"><span class="chip">${rec.maturity_ring}</span><span class="chip">${rec.cost_chip}</span></div>
       ${businessBand(rec)}
       ${precedentBlock(rec)}</div>`
    : '';
  const cards = axis.variants.map(variantCard).join('\n');
  const matrix = comparisonMatrix(axis);
  const demo = demonstrationTable(axis);
  const door =
    axis.door_type === 'one-way'
      ? `<div class="door one-way">🚪 Необратимое решение (one-way door) — выход дорогой, ресёрчь тщательно</div>`
      : axis.door_type === 'two-way'
        ? `<div class="door two-way">🔁 Обратимое решение (two-way door) — легко поменять, не переусердствуй</div>`
        : '';
  const sens = axis.sensitivity?.length
    ? `<div class="sens"><div class="sens-h">Когда рекомендация меняется</div><ul>${axis.sensitivity.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>`
    : '';
  return `<section class="axis" id="axis-${esc(axis.axis_id)}">
<h2>${esc(axis.axis_name)}</h2>
<p class="ctx">${esc(axis.context)}</p>
${door}
${recBlock}
${sens}
${matrix}
${demo}
<div class="grid">${cards}</div>
</section>`;
}

export function renderAxisHtml(axis: AxisModel): string {
  return wrapDoc(`${axis.axis_name} — architecture decision`, renderAxisSection(axis));
}

/** Cross-axis synthesis as an embeddable section. */
export function renderSynthesisSection(insights: Insight[]): string {
  const cards = insights.length
    ? insights
        .map(
          (i) => `<article class="variant">
  <h3>${esc(i.title)}</h3>
  <div class="chips">${i.axes.map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</div>
  <p class="when">${esc(i.description)}</p>
  <div class="label">Recommendation</div><p class="when">${esc(i.recommendation)}</p>
  ${i.trade_off ? `<div class="label">Trade-off</div><p class="when no">${esc(i.trade_off)}</p>` : ''}
</article>`,
        )
        .join('\n')
    : '<p class="ctx">No cross-axis insights — single-axis spec or axes are independent.</p>';
  return `<section class="synthesis"><h2>Cross-axis synthesis</h2>
<p class="ctx">Emergent insights spanning ≥2 decision axes (dependencies, redundancy, secondary effects).</p>
<div class="grid">${cards}</div></section>`;
}

export function renderSynthesisHtml(slug: string, insights: Insight[]): string {
  return wrapDoc(
    `${slug} — cross-axis synthesis`,
    `<h1>Cross-axis synthesis — ${esc(slug)}</h1>${renderSynthesisSection(insights)}`,
  );
}

function indexTableSection(rows: IndexAxisRow[]): string {
  const trs = rows
    .map(
      (r) =>
        `<tr><td><a href="#axis-${esc(r.axis_id)}">${esc(r.axis_name)}</a></td><td>${esc(r.status)}</td><td>${esc(r.chosen ?? '—')}</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>Axis</th><th>Status</th><th>Chosen</th></tr></thead><tbody>${trs}</tbody></table>`;
}

export function renderIndexHtml(slug: string, rows: IndexAxisRow[]): string {
  return wrapDoc(
    `${slug} — architecture decisions`,
    `<h1>Architecture decisions — ${esc(slug)}</h1>${indexTableSection(rows)}`,
  );
}

export interface CompletenessRow {
  dimension: string;
  status: string;
  pointer?: string;
}

function completenessSection(rows: CompletenessRow[]): string {
  if (!rows.length) return '';
  const trs = rows
    .map((r) => {
      const cls = r.status === 'pending' ? 'bad' : r.status === 'out-of-scope' ? 'ok' : 'good';
      return `<tr><td class="crit">${esc(r.dimension)}</td><td class="${cls}">${esc(r.status)}</td><td>${esc(r.pointer ?? '—')}</td></tr>`;
    })
    .join('');
  return `<section class="matrix"><h2>System completeness</h2>
<table><thead><tr><th class="crit">Dimension</th><th>Status</th><th>Pointer / Reason</th></tr></thead><tbody>${trs}</tbody></table></section>`;
}

export interface FullReportOpts {
  insights?: Insight[];
  completeness?: CompletenessRow[];
}

/**
 * FR-19: single self-contained ARCHITECTURE.html — index status matrix + EVERY axis section
 * (rich: two lenses + economics) + cross-axis synthesis + completeness. Composed via the SAME
 * renderers (renderAxisSection/renderSynthesisSection) — NOT scraped from per-axis HTML, so the
 * report inherits business/scorecard/reality/cost/time/door content for free.
 */
export function renderFullReport(slug: string, axes: AxisModel[], opts: FullReportOpts = {}): string {
  const rows: IndexAxisRow[] = axes.map((a) => ({
    axis_id: a.axis_id,
    axis_name: a.axis_name,
    status: a.status ?? 'pending',
    chosen: a.chosen ?? null,
  }));
  const body = [
    `<h1>Architecture — ${esc(slug)}</h1>`,
    `<p class="ctx">Полный отчёт: статус-матрица осей, по каждой оси варианты (две линзы + экономика), cross-axis synthesis, completeness.</p>`,
    indexTableSection(rows),
    ...axes.map(renderAxisSection),
    opts.insights ? renderSynthesisSection(opts.insights) : '',
    opts.completeness ? completenessSection(opts.completeness) : '',
  ]
    .filter(Boolean)
    .join('\n');
  return wrapDoc(`Architecture — ${slug}`, body);
}
