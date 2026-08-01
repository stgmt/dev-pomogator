/**
 * Apply pinator-only FR-49 surgery on clean HEAD v4 docs (no FR-81).
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';

const root = process.cwd();
const v4 = path.join(root, '.specs', 'spec-generator-v4');

function patchFr49(fr: string): string {
  const bStart = fr.indexOf('- **FR-49b (census-aware стоп-гейт):**');
  const cStart = fr.indexOf('- **FR-49c (смена статуса освежает кэш):**');
  if (bStart < 0 || cStart < 0) throw new Error('FR-49b/c markers missing');
  fr =
    fr.slice(0, bStart) +
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
    '**Self-exemption (turtle):** historical while FR-49b lived as an in-v4 Stop block; Pinator ([.specs/pinator/](../pinator/FR.md)) now owns self-markers / judge exemptions. FR-49 no longer defines that block.\n\n',
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
  ).replace(
    '**Требование:** [FR-49e](FR.md#fr-49)',
    '**Требование:** [FR-49b](FR.md#fr-49), [FR-49a](FR.md#fr-49)',
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
  if (!out.includes('# HISTORICAL: Pinator policy scenarios')) {
    out = out.replace(
      /  @historical @superseded-by-pinator\n  Scenario: SPECGEN004_187/,
      '  # HISTORICAL: Pinator policy scenarios — superseded by .specs/pinator/; not a second live executor (CEGATE001 owns execution).\n  @historical @superseded-by-pinator\n  Scenario: SPECGEN004_187',
    );
  }
  return out;
}

let cached: ReturnType<typeof buildGraph> | undefined;
const tools = buildToolRegistry(
  () => (cached ??= buildGraph({ repoRoot: root, skipNdjson: true })),
  { refreshGraph: () => { cached = undefined; } },
);
const txn = tools.find((t) => t.name === 'apply_spec_transaction')!;
const result = await txn.handler({
  edits: [
    { spec: 'spec-generator-v4', doc: 'FR.md', content: patchFr49(fs.readFileSync(path.join(v4, 'FR.md'), 'utf8')) },
    { spec: 'spec-generator-v4', doc: 'ACCEPTANCE_CRITERIA.md', content: patchAc(fs.readFileSync(path.join(v4, 'ACCEPTANCE_CRITERIA.md'), 'utf8')) },
    { spec: 'spec-generator-v4', doc: 'DESIGN.md', content: patchDesign(fs.readFileSync(path.join(v4, 'DESIGN.md'), 'utf8')) },
    { spec: 'spec-generator-v4', doc: 'USER_STORIES.md', content: patchStories(fs.readFileSync(path.join(v4, 'USER_STORIES.md'), 'utf8')) },
    { spec: 'spec-generator-v4', doc: 'spec-generator-v4.feature', content: patchFeature(fs.readFileSync(path.join(v4, 'spec-generator-v4.feature'), 'utf8')) },
  ],
  reason: 'pinator-only FR-49 surgery for clean commit (no FR-81)',
});
const j = JSON.parse(result.content[0].text);
console.log(JSON.stringify({ ok: j.ok, findings: (j.findings || []).slice(0, 10) }, null, 2));
if (!j.ok) process.exit(1);
if (fs.readFileSync(path.join(v4, 'FR.md'), 'utf8').includes('## FR-81')) {
  console.error('FR-81 leaked into FR.md');
  process.exit(2);
}
