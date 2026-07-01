#!/usr/bin/env npx tsx
/**
 * Deterministic bench for the jargon detector (the engine the Stop hook gates on).
 *
 * Unlike `.claude/skills/answer-simple/evals/evals.json` (LLM-judged SKILL prompts),
 * this is a DETERMINISTIC block/no-block oracle: each fixture pins whether
 * `detectJargon` SHOULD fire, so a regression (missed jargon OR over-blocking clean
 * prose) fails loudly. Fixtures are drawn from REAL incidents — the messages that got
 * "ниче не понял" — plus clean controls that must NOT block (anti over-application).
 *
 * Run:  node --import tsx tools/answer-simple/evals/detector-bench.ts
 * Exit: 0 ⇔ every fixture's block verdict matches expectation.
 */
import { detectJargon } from '../jargon_detector.ts';

interface Fixture {
  name: string;
  message: string;
  expectBlock: boolean;
  /** Why this is the expected verdict (audit trail). */
  why: string;
}

// The REAL Phase-18 wall that got "ниче не понял" — the regression that motivated this.
const PHASE18_WALL = `Phase 18 сориентирован — самый judgment-heavy кусок (FR-43c = HITL by design — классификатор считает ПОДОЗРЕНИЕ, человек подтверждает; авто-ретайр запрещён). legacy-v3.feature по сигналам = SUPERSEDED (v3→v4 consolidated, 28 SPECGEN003 not_run). Резолюция по FR-43c: либо архив, либо маркер superseded. Строю P18-1 (классификатор 4 состояний REMOVED/DRIFTED/ABSORBED + триаж-отчёт) → P18-2 применяет выбранное. rewrite_inbound опционально.`;

const FIXTURES: Fixture[] = [
  // ── SHOULD BLOCK — genuine walls of internal codes ──────────────────────
  {
    name: 'phase18-real-incident',
    message: PHASE18_WALL,
    expectBlock: true,
    why: 'the actual incident: FR-43c, SUPERSEDED, HITL, P18-1/2, REMOVED/DRIFTED/ABSORBED, not_run, SPECGEN003 — a dense wall',
  },
  {
    name: 'wave-codes-question',
    message:
      'Есть три нерешённых вопроса. Wave 14 (gates + OpenRouter) перед Wave 11? Issue D — merge маленькие waves? Issue C — HITL clarifier раньше через Phase 6? Каждый с trade-off, нужно решить порядок чтобы не сломать VARIANT_COVERAGE.',
    expectBlock: true,
    why: 'Wave 14, Wave 11, HITL, Phase 6, VARIANT_COVERAGE — multiple internal codes, no plain gloss',
  },
  {
    name: 'dense-status-report',
    message:
      'Закрыл P21-5: CAS через expected_sha, fr-census детерминированный, rename_spec_doc anchors-aware. SPECGEN004_155 биндит реальный handler, вердикт SUPERSEDED снят, traceability gate проходит. Дальше Phase 18 и FR-43 триаж.',
    expectBlock: true,
    why: 'P21-5, expected_sha, fr-census, rename_spec_doc, SPECGEN004_155, SUPERSEDED, Phase 18, FR-43 — wall',
  },
  // ── SHOULD NOT BLOCK — clean / legit technical output ───────────────────
  {
    name: 'plain-micro-story',
    message:
      'После того как ты попросил переделать правило на шаблон самопроверки, я переписал его на пять шагов — что понял, черновик, самооценка, как отвечать, переписать если плохо. Сейчас правило лежит на месте, дальше применяю в каждом ответе. Скажи если что-то поправить.',
    expectBlock: false,
    why: 'a plain-language micro-story, zero internal codes — the model answer',
  },
  {
    name: 'trivial-done',
    message: 'Готово, тесты зелёные, закоммитил.',
    expectBlock: false,
    why: 'short + clean — nothing to flag',
  },
  {
    name: 'one-mild-acronym',
    message:
      'Поправил парсер — теперь он читает ответ как JSON и отдаёт список. Проверил на реальном файле, всё сходится. Дальше подключу к API и напишу пару тестов на крайние случаи.',
    expectBlock: false,
    why: 'JSON + API are universal acronyms (allowlisted); the rest is plain prose',
  },
  {
    name: 'code-heavy-diff',
    message:
      'Вот фикс:\n```ts\nconst slug = String(spec).replace(/\\\\/g, "/");\nif (!isSafeSlug(slug)) return { ok: false };\n```\nЗапусти `npm test` и глянь `tools/x/y.ts` — там осталась пара мест.',
    expectBlock: false,
    why: 'mostly fenced code + inline paths → proseRatio low → hard-OUT (legit technical artifact)',
  },
  {
    name: 'two-codes-not-a-wall',
    message: 'Готово. Обновил FR-12 и переключил порог в конфиге, прогнал — зелёное.',
    expectBlock: false,
    why: '2 codes (FR-12 + none-else) ≤ threshold — a mild mention, not a wall (hook fires on density ≥3)',
  },
];

function run(): number {
  let failed = 0;
  console.log('═══ jargon-detector bench ═══');
  for (const f of FIXTURES) {
    const r = detectJargon(f.message);
    const ok = r.block === f.expectBlock;
    if (!ok) failed++;
    const mark = ok ? '🟢 PASS' : '🔴 FAIL';
    console.log(
      `${mark}  ${f.name}  (expect block=${f.expectBlock}, got=${r.block}; codes=${r.stats.distinctCodes} [${r.stats.codes.slice(0, 8).join(', ')}], words=${r.stats.words}, prose=${r.stats.proseRatio.toFixed(2)})`,
    );
    if (!ok) console.log(`        WHY EXPECTED: ${f.why}`);
  }
  console.log(`─── ${FIXTURES.length - failed}/${FIXTURES.length} passed ───`);
  return failed === 0 ? 0 : 1;
}

const isDirectRun = process.argv[1]?.endsWith('detector-bench.ts');
if (isDirectRun) process.exit(run());

export { FIXTURES, run };
