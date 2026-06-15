/**
 * Deferred-work detector BENCH (пинатор). A labelled corpus that pins BOTH directions:
 *  - SHOULD_FIRE  — real offloads/defers the gate MUST kick «доделывай» on (incl. the
 *    cases that historically SLIPPED: self-defer to a future pass, and handing a FACTUAL
 *    question / confirm-or-correct back to the user instead of investigating).
 *  - SHOULD_NOT_FIRE — clean reports + the SANCTIONED plan confirmation «Правильно понял?»
 *    (about the user's INTENT, which only they know — must never be blocked).
 *
 * Precision over recall: a gate that false-fires on «Правильно понял?» gets disabled.
 * Run: `node --import tsx tools/claim-evidence-gate/bench/deferred-bench.ts`
 * Exit non-zero on ANY misclassification (this is the regression contract).
 */
import { isDeferredWork } from '../claim_classifier.ts';

export const SHOULD_FIRE: Array<{ id: string; text: string }> = [
  { id: 'fact-offload-confirm-or-correct', text: 'tui-test-runner-v2 — реально заброшен или ещё в работе? остальные 4 — подтверди, что живые, или поправь' },
  { id: 'self-defer-next-pass', text: 'Дверь живая. Беру это следующим заходом.' },
  { id: 'self-defer-separate-pass', text: 'Добью отдельным заходом — там по шагам.' },
  { id: 'hand-action-back', text: 'Скажешь «волна 1» — начну, вытяну открытые задачи и пойду делать.' },
  { id: 'hand-decision-back', text: 'Список собран, что из него удалять — решаешь ты.' },
  { id: 'wait-for-go-ahead', text: 'Жду твоего слова, чтобы продолжить.' },
  { id: 'conditional-offload', text: 'Если хочешь — скажи, покажу остаток.' },
  // The 2026-06-14 SLIP: announcing the NEXT unit of work and stopping. «Продолжаю»
  // was ignored to protect «продолжаю проверку» (in-flight), but «продолжаю ПО
  // СЛЕДУЮЩЕМУ куску» at STOP is an empty promise — the agent announced the next
  // unit and ended the turn instead of doing it. Distinct from continuing the
  // CURRENT action (SHOULD_NOT_FIRE continuing-now) by the "по/к следующему" shift.
  { id: 'announce-next-unit-and-stop', text: 'Продолжаю по следующему реальному куску — тем же циклом: сверить код, закрыть пункт, тест.' },
  { id: 'shift-to-next-and-stop', text: 'Перехожу к следующему куску бэклога.' },
  { id: 'take-next-unit', text: 'Беру следующий реальный кусок и довожу.' },
  // The 2026-06-15 SLIP cluster: self-defer to the NEXT TURN and "announce-now"
  // closings the regex missed → they fell to the flaky Meridian judge, which let
  // them pass, so the USER had to pin manually («дальше»). All must fire deterministically.
  { id: 'self-defer-next-turn', text: 'Один конкретный следующий шаг: читаю требование через дверь, чтобы очертить писатель. Делаю это сейчас, в следующем ходе.' },
  { id: 'begin-foundation-next-turn', text: 'Начинаю Поток 1 с фундамента — читаю контракт и собираю писатель. Делаю это сейчас, в следующем ходе.' },
  { id: 'announce-launch-now-closing', text: 'Дальше прогоняю полный набор тестов графа в Докере — запускаю сейчас.' },
  { id: 'announce-do-now-closing', text: 'Собираю первую оценку по образцу существующего харнеса. Делаю сейчас.' },
  { id: 'english-next-turn', text: "One concrete next step: build the e2e test. I'll do it in the next turn." },
];

export const SHOULD_NOT_FIRE: Array<{ id: string; text: string }> = [
  // SANCTIONED plan confirmation — about INTENT, REQUIRED by plan-pomogator. Never block.
  { id: 'sanctioned-pravilno-ponyal', text: 'Правильно понял? Спиннер только во время запроса, или нужен тост после успеха тоже?' },
  { id: 'sanctioned-ponimanie-zadachi', text: 'Это правильное понимание задачи?' },
  { id: 'sanctioned-confirm-understanding-or-correct', text: 'Подтверди, что я правильно понял задачу, или поправь.' },
  // Clean completions / plan-answers / continuing-now.
  { id: 'completion-commit', text: 'Закоммичено 7c3c723. Вердикт зелёный, 156 сценариев.' },
  { id: 'plan-answer', text: '34 FR реализованы, 11 в работе.' },
  { id: 'completion-one-pass', text: 'Свёл всё за один заход, закоммичено.' },
  { id: 'continuing-now', text: 'Продолжаю проверку организма corpus-health.' },
  { id: 'continuing-now-with-seychas', text: 'Продолжаю прогонять проверку по коду сейчас.' },
  { id: 'async-wait-on-own-task', text: 'Запустил полный прогон в фоне (bgr6pu9pp), жду результат и продолжу по нему.' },
  { id: 'explanatory', text: 'По коду гейт фаерит только при заявленном результате. Дальше идёт анти-зацикливание.' },
];

function run(): number {
  let fp = 0, fn = 0;
  for (const c of SHOULD_FIRE) {
    if (!isDeferredWork(c.text)) { fn++; console.error(`MISS (should fire): [${c.id}] ${c.text}`); }
  }
  for (const c of SHOULD_NOT_FIRE) {
    if (isDeferredWork(c.text)) { fp++; console.error(`FALSE FIRE (should stay silent): [${c.id}] ${c.text}`); }
  }
  const tp = SHOULD_FIRE.length - fn, tn = SHOULD_NOT_FIRE.length - fp;
  const precision = tp / (tp + fp || 1), recall = tp / (tp + fn || 1);
  console.log(`\ndeferred-bench: ${SHOULD_FIRE.length} should-fire, ${SHOULD_NOT_FIRE.length} should-not-fire`);
  console.log(`  precision=${precision.toFixed(3)} recall=${recall.toFixed(3)}  (FP=${fp}, FN=${fn})`);
  console.log(fp + fn === 0 ? '✅ BENCH GREEN — both directions hold' : `❌ BENCH RED — ${fp} false fire(s), ${fn} miss(es)`);
  return fp + fn === 0 ? 0 : 1;
}

// Direct-run guard (mirrors the repo's other CLIs).
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(run());
}
