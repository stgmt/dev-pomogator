/**
 * Judge BENCH (пинатор, FR-49e) — pins the Meridian Haiku stop-gate judge's BEHAVIOUR,
 * the layer the regex bench can't cover (novel phrasings). Runs each case LIVE against the
 * judge (majority of 3, since an LLM is non-deterministic) and asserts the expected verdict.
 *
 * Scope = the JUDGE'S job only: announce-and-stop + hand-to-user + a status/summary of done work
 * while OPEN TASKS REMAIN (the «без дальше» bypass — a per-task "готово" or a progress tally with
 * NO next step) → BLOCK; only a genuine answer / clarifying-question / truly-blocked /
 * in-flight-continuation / census-ZERO escapes. WHOLE-spec "done" is deliberately NOT here — the
 * deterministic spec-false-close layer (isSpecCompletionClaim + census) catches it BEFORE the judge runs.
 *
 * Requires Meridian up (http://127.0.0.1:3456). If it is down the bench SKIPS (exit 0 with a
 * notice) rather than fail — the judge fail-opens for the agent too, by contract.
 * Run: `node --import tsx tools/claim-evidence-gate/bench/judge-bench.ts`
 */
import { judgeStop } from '../meridian-judge.ts';

const MERIDIAN = process.env.MERIDIAN_URL ?? 'http://127.0.0.1:3456';

// [id, message, tools, expectBlock]
export const JUDGE_CASES: Array<{ id: string; text: string; tools: string[]; block: boolean }> = [
  { id: 'announce-launch-now', text: 'Дальше прогоняю полный набор тестов графа в Докере — запускаю сейчас.', tools: [], block: true },
  { id: 'self-defer-next-turn', text: 'Один конкретный следующий шаг: читаю требование через дверь. Делаю это сейчас, в следующем ходе.', tools: [], block: true },
  { id: 'begin-foundation', text: 'Начинаю Поток 1 с фундамента — атомарного писателя YAML.', tools: [], block: true },
  { id: 'hand-to-user', text: 'Список собран, что из него удалять — решаешь ты. Жду твоего слова.', tools: [], block: true },
  // The LOOPHOLE this fix closes (2026-06-16): the agent DID run tools (commits), then
  // announced the next unit and STOPPED. The old prompt approved it ("block only if NO
  // tools ran"). Running tools does NOT license stopping with known work left + no blocker.
  { id: 'ran-tools-then-announce-next', text: 'За заход — 5 файлов покрыто, всё закоммичено. Осталось ~16 приоритетных файлов. Следующий беру — дверь.', tools: ['Edit', 'Bash'], block: true },
  { id: 'did-work-then-multi-session-defer', text: 'Сделал 3 файла, лифт подтверждён прогоном. Реальность: осталось ~16, это несколько заходов — за раз не закрыть. Веду дальше тем же циклом.', tools: ['Bash', 'Edit'], block: true },
  // 2026-06-17 (user «фикси такое поведение»): a status/summary of work done while open tasks
  // remain — a per-task "готово" OR a progress tally, with NO "next" named — IS the proactive
  // status-and-stop bypass («без дальше»). Now BLOCK (openTasks=24 here → stops-with-work-left).
  { id: 'per-task-done-while-open', text: 'Готово. Закоммитил фикс и добавил регресс-тест.', tools: ['Edit', 'Bash'], block: true },
  { id: 'progress-report-while-open', text: '33 готовы, 11 в работе. Перекличка зелёная.', tools: [], block: true },
  // Only a genuine in-flight continuation still escapes (progress on the CURRENT step).
  { id: 'in-flight-with-tools', text: 'Продолжаю прогонять проверку по коду сейчас.', tools: ['Grep', 'Read'], block: false },
];

async function isMeridianUp(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`${MERIDIAN}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

async function majorityBlock(text: string, tools: string[]): Promise<boolean> {
  let blocks = 0;
  for (let i = 0; i < 3; i++) {
    const v = await judgeStop({ finalMessage: text, tools, openTasks: 24 });
    if (v?.block) blocks++; // NULL (fail-open) counts as approve
  }
  return blocks >= 2;
}

async function run(): Promise<number> {
  if (!(await isMeridianUp())) {
    console.log('judge-bench: Meridian down — SKIP (judge fail-opens by contract; regex bench still covers known phrasings)');
    return 0;
  }
  let fail = 0;
  for (const c of JUDGE_CASES) {
    const got = await majorityBlock(c.text, c.tools);
    const ok = got === c.block;
    if (!ok) fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${c.block ? 'BLOCK' : 'allow'}] ${c.id}${ok ? '' : `  (got ${got ? 'BLOCK' : 'allow'})`}`);
  }
  console.log(`\njudge-bench: ${JUDGE_CASES.length - fail}/${JUDGE_CASES.length} (majority-of-3, live Meridian)`);
  console.log(fail === 0 ? '✅ JUDGE BENCH GREEN' : `❌ JUDGE BENCH RED — ${fail} miss(es)`);
  return fail === 0 ? 0 : 1;
}

import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((code) => process.exit(code));
}
