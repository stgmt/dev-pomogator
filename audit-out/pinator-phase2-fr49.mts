/**
 * Phase 2: strip Pinator judge policy from FR-49; retarget ownership to pinator;
 * mark moved scenarios historical; clean pinator RESEARCH inventory path refs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';

const root = process.cwd();
const v4 = path.join(root, '.specs', 'spec-generator-v4');
const pin = path.join(root, '.specs', 'pinator');

function read(p: string): string {
  return fs.readFileSync(p, 'utf8');
}

function patchFr49(fr: string): string {
  // Replace FR-49b / e / g policy bullets with one ownership pointer; keep a/c/d/f/h.
  const bStart = fr.indexOf('- **FR-49b (census-aware стоп-гейт):**');
  const cStart = fr.indexOf('- **FR-49c (смена статуса освежает кэш):**');
  if (bStart < 0 || cStart < 0) throw new Error('FR-49b/c markers missing');
  fr = fr.slice(0, bStart) +
    '- **FR-49b (Pinator Stop policy — owned elsewhere):** whole-spec completion blocking, claim classification, Meridian/помогатор judge, fire/marker policy, and require-next-section live under [.specs/pinator/](../pinator/FR.md) modules **M1–M2** (migrated from claim-evidence-gate). FR-49 only supplies the shared census/router facts those consumers may read; it SHALL NOT redefine Pinator judge policy here.\n' +
    fr.slice(cStart);

  const eStart = fr.indexOf('- **FR-49e (LLM-судья на серую зону через Meridian, fail-open):**');
  const fStart = fr.indexOf('- **FR-49f (дверь жёстко отказывает авторингу сценария-пустышки):**');
  if (eStart < 0 || fStart < 0) throw new Error('FR-49e/f markers missing');
  fr = fr.slice(0, eStart) + fr.slice(fStart);

  const gStart = fr.indexOf('- **FR-49g (детерминированный require-next-section');
  const hStart = fr.indexOf('- **FR-49h (transcript todo replay reconciliation');
  if (gStart < 0 || hStart < 0) throw new Error('FR-49g/h markers missing');
  fr = fr.slice(0, gStart) + fr.slice(hStart);

  fr = fr.replace(
    /\*\*Self-exemption \(turtle\):\*\*[^\n]+\n\n/,
    '**Self-exemption (turtle):** historical while FR-49b lived in v4; Pinator owns self-markers now ([pinator](../pinator/FR.md)).\n\n',
  );

  fr = fr.replace(
    /claim-evidence-gate \(живой стоп-хук\)/,
    '[pinator](../pinator/README.md) (живой стоп-хук; runtime `tools/claim-evidence-gate/`)',
  );

  fr = fr.replace(
    /- Pinator eligibility, completion-claim classification, judge\/provider behavior, fire\/marker policy, no-progress\/blocker handling, and native `\/goal` integration are owned by the `claim-evidence-gate` spec and are not activated by FR-49 alone\./,
    '- Pinator eligibility, completion-claim classification, judge/provider behavior, fire/marker policy, no-progress/blocker handling, and native `/goal` integration are owned by [.specs/pinator/](../pinator/FR.md) (M1–M2) and are not activated by FR-49 alone.',
  );

  fr = fr.replace(
    /\*\*Авто-сёрфинг честного статуса \+ анти-false-close: гибрид \(баннер несёт следующий шаг \+ census-aware стоп-гейт \+ освежение кэша на смене статуса \+ сверщик устаревших маркеров \+ LLM-судья на серую зону через Meridian\)\*\*/,
    '**Авто-сёрфинг честного статуса: shared census/router + cache refresh + stale-marker reconciler (Pinator Stop-judge policy → [.specs/pinator/](../pinator/FR.md))**',
  );

  return fr;
}

function patchAc(ac: string): string {
  return ac.replace(
    /WHEN FR-49 census or routing runs without an active `claim-evidence-gate` work context THEN it SHALL NOT invoke a Pinator judge, classify completion prose, write Pinator fire or marker state, or block Stop; claim-gate policy scenarios SHALL live under the `claim-evidence-gate` contract while FR-49 retains only generic integration boundaries\./,
    'WHEN FR-49 census or routing runs without an active Pinator work context THEN it SHALL NOT invoke a Pinator judge, classify completion prose, write Pinator fire or marker state, or block Stop; Pinator policy scenarios SHALL live under [.specs/pinator/](../pinator/) while FR-49 retains only generic integration boundaries.',
  );
}

function patchDesign(d: string): string {
  return d
    .replace(
      /Task census, target-root resolution, next-step routing, transcript replay, and stale-marker reconciliation are shared spec infrastructure; `claim-evidence-gate` separately owns whether a Stop may be judged\./,
      'Task census, target-root resolution, next-step routing, transcript replay, and stale-marker reconciliation are shared spec infrastructure; [.specs/pinator/](../pinator/README.md) separately owns whether a Stop may be judged (M1–M2).',
    )
    .replace(
      /- \*\*FR-49b\*\* — make the LIVE `claim-evidence-gate` census-AWARE:[^\n]+\n/,
      '- **FR-49b** — historical: Pinator census-aware Stop policy now lives in pinator M2 (not redefined here).\n',
    );
}

function patchStories(s: string): string {
  return s.replace(
    /Eligibility and Stop judgment remain a separate `claim-evidence-gate` responsibility\./,
    'Eligibility and Stop judgment remain a separate [pinator](../pinator/README.md) responsibility.',
  );
}

function patchFeature(f: string): string {
  let out = f.replace(/@moved-to-claim-evidence-gate/g, '@historical @superseded-by-pinator');
  out = out.replace(
    /legacy ([^\n]+) moved to claim-evidence-gate/g,
    'legacy $1 moved to pinator (historical; executor = CEGATE001)',
  );
  // Banner once before first historical block
  if (!out.includes('# HISTORICAL: Pinator policy scenarios')) {
    out = out.replace(
      /  @historical @superseded-by-pinator\n  Scenario: SPECGEN004_187/,
      '  # HISTORICAL: Pinator policy scenarios — superseded by .specs/pinator/; not a second live executor (CEGATE001 owns execution).\n  @historical @superseded-by-pinator\n  Scenario: SPECGEN004_187',
    );
  }
  return out;
}

function patchPinResearch(r: string): string {
  // Drop inlined JSON that embeds `.specs/claim-evidence-gate/` (blocks archive).
  const marker = '## Naming freeze + inbound inventory (2026-07-31)';
  const idx = r.indexOf(marker);
  if (idx < 0) return r + `\n\n${marker}\n\nCanonical: Pinator. Inventory: \`audit-out/pinator-inbound-refs.json\` (pre-migrate). Former live slug \`claim-evidence-gate\` archived after this wave.\n`;
  return (
    r.slice(0, idx) +
    `${marker}\n\n` +
    `Canonical: Pinator = this Stop-judge drive-loop. Runtime stays \`tools/claim-evidence-gate/\` until a follow-up rename wave.\n\n` +
    `Inbound refs snapshot (pre-migrate) lives outside the live graph: \`audit-out/pinator-inbound-refs.json\`.\n` +
    `Former product slug \`claim-evidence-gate\` is superseded by this spec and archived (no second live SoT).\n`
  );
}

function patchPinTasks(t: string): string {
  const wave = `## Wave: unified pinator spec (2026-07-31)

- [x] Migrate CEG contract docs → pinator (M1–M4) — id: wave-migrate-docs — Status: DONE | Est: 120m
  _Requirements: FR-1..FR-12_
  **Done When:**
    - [x] FR/AC/DESIGN/feature/REQUIREMENTS mirrored under \`.specs/pinator/\`
    - [x] Former live slug archived (superseded)

- [ ] M0 Intent — goal-driven auto-continue (#63) — id: m0-intent-gh63 — Status: TODO | Est: 480m
  _Requirements: M0 (open backlog)_
  **Done When:**
    - [ ] Spec+impl for drive-until-genuine-decision without fake COMPLETE rollup

- [ ] M6 Polarity flip (#74) — id: m6-polarity-gh74 — Status: TODO | Est: 240m
  _Requirements: M6 (open backlog)_
  **Done When:**
    - [ ] Referent carve-out documented and tested under pinator

- [ ] M2 evidence/normative follow-ups (#149/#161/#193) — id: m2-gh-followups — Status: TODO | Est: 360m
  _Requirements: FR-8, FR-9, FR-11_
  **Done When:**
    - [ ] Each issue mapped to CHK/status; not marked complete merely by ingest

- [ ] M7 Orchestration (#212/#215) — id: m7-orchestration — Status: TODO | Est: 0m
  _Requirements: M7 OUT_OF_SCOPE this wave_
  **Done When:**
    - [ ] Tracked as open backlog; implementation deferred

`;
  if (t.includes('## Wave: unified pinator spec')) return t;
  return t.replace(/^# Claim-Evidence Gate — Implementation Tasks/, '# Pinator — Implementation Tasks')
    .replace(
      /All tasks are pending\.[^\n]*/,
      'Inherited redesign tasks below remain open where still valid. Wave section records migrate DoD + GH debt (M0/M6/M7 open → overall NOT COMPLETE).',
    )
    .replace('\n## Phase 1:', `\n${wave}\n## Phase 1:`);
}

let cached: ReturnType<typeof buildGraph> | undefined;
const tools = buildToolRegistry(
  () => (cached ??= buildGraph({ repoRoot: root, skipNdjson: true })),
  { refreshGraph: () => { cached = undefined; } },
);

const txn = tools.find((t) => t.name === 'apply_spec_transaction')!;

const edits = [
  { spec: 'spec-generator-v4', doc: 'FR.md', content: patchFr49(read(path.join(v4, 'FR.md'))) },
  { spec: 'spec-generator-v4', doc: 'ACCEPTANCE_CRITERIA.md', content: patchAc(read(path.join(v4, 'ACCEPTANCE_CRITERIA.md'))) },
  { spec: 'spec-generator-v4', doc: 'DESIGN.md', content: patchDesign(read(path.join(v4, 'DESIGN.md'))) },
  { spec: 'spec-generator-v4', doc: 'USER_STORIES.md', content: patchStories(read(path.join(v4, 'USER_STORIES.md'))) },
  { spec: 'spec-generator-v4', doc: 'spec-generator-v4.feature', content: patchFeature(read(path.join(v4, 'spec-generator-v4.feature'))) },
  { spec: 'pinator', doc: 'RESEARCH.md', content: patchPinResearch(read(path.join(pin, 'RESEARCH.md'))) },
  { spec: 'pinator', doc: 'TASKS.md', content: patchPinTasks(read(path.join(pin, 'TASKS.md'))) },
];

const result = await txn.handler({
  edits,
  reason: 'pinator wave: FR-49 policy → pinator; historical scenarios; RESEARCH/TASKS cleanup',
});
const text = result.content[0].text;
fs.writeFileSync(path.join(root, 'audit-out', 'pinator-phase2-result.json'), text);
const j = JSON.parse(text);
console.log(JSON.stringify({ ok: j.ok, findings: (j.findings || []).slice(0, 20), error: j.error }, null, 2));
if (!j.ok) process.exit(1);
