/**
 * @feature4 — answer-simple BDD migration pilot (FR-M2). The 4 RUNTIME-testable scenarios
 * (PLUGIN017_06/07 detectJargon + PLUGIN017_08/09 the Stop hook) migrated 1:1 from
 * tests/e2e/answer-simple.test.ts — each step calls the REAL engine (no mock, no inline copy).
 * The 5 agent-behaviour/manual scenarios (_01.._05) stay @wip until migrated (vitest retained).
 *
 * Regex step patterns (not Cucumber Expressions) so literal `/`, backticks and `{}` in the
 * step text match verbatim — CE would read `/` as alternation.
 *
 * @see tools/answer-simple/jargon_detector.ts detectJargon (the pure brain)
 * @see tools/answer-simple/answer_simple_stop.ts the Stop-hook glue
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { V4World } from '../hooks/before-after.ts';
import { detectJargon } from '../../tools/answer-simple/jargon_detector.ts';

const APP_DIR = process.env.APP_DIR || process.cwd();
const appPath = (rel = ''): string => path.join(APP_DIR, rel);
const RULE_PATH = '.claude/rules/answer-simple/clear-questions-to-user.md';
const SKILL_PATH = '.claude/skills/answer-simple/SKILL.md';

const WALL =
  'Both done. (2) self-review loop: arch-review.ts --spec runs the battery. (1) scaffold stamps ' +
  'version 3 but architecture-gate.ts no-ops when version < 4 so FR-21 never fired. ARCH012 proves ' +
  'the chain; ARCH011 had no progress.json. Fixed per FR-7, VARIANT_COVERAGE green, Phase 1.75 ' +
  'grandfathered, AC-13 covered.';
const CLEAN =
  'Готово — починил защиту. Раньше она ни разу не срабатывала из-за неправильного номера версии у ' +
  'новых проектов. Теперь срабатывает, старые проекты не трогаю. Написал тест который это доказывает. ' +
  'Дальше на твой выбор: разжевать подробнее или идём дальше по списку.';
const CODEY = 'Готово:\n```ts\nconst x = f(a, b);\nfor (const y of z) g(y);\nawait save(x);\n```\nДальше тест.';
const SHORT = 'Готово, починил. Тест зелёный.';

interface ASWorld extends V4World {
  asTexts?: string[];
  asResults?: ReturnType<typeof detectJargon>[];
  asHook?: string;
  asHookRoot?: string;
  asBlocked?: { status: number; stdout: string };
  asRuleContent?: string;
  asSkillContent?: string;
}

function setupHookTmp(): { hook: string; root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'answer-simple-bdd-'));
  const toolDir = path.join(root, 'answer-simple');
  fs.mkdirSync(toolDir, { recursive: true });
  fs.copySync(appPath('tools/answer-simple/jargon_detector.ts'), path.join(toolDir, 'jargon_detector.ts'));
  fs.copySync(appPath('tools/answer-simple/answer_simple_stop.ts'), path.join(toolDir, 'answer_simple_stop.ts'));
  fs.copySync(appPath('tools/_shared'), path.join(root, '_shared'));
  return { hook: path.join(toolDir, 'answer_simple_stop.ts'), root };
}
function runHook(hook: string, input: object): { status: number; stdout: string } {
  const r = spawnSync('npx', ['tsx', hook], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  return { status: r.status ?? 0, stdout: r.stdout ?? '' };
}

// --- Background ---------------------------------------------------------------
Given(/^dev-pomogator extension answer-simple установлен в текущем проекте$/, function () {
  assert.ok(fs.existsSync(APP_DIR), 'APP_DIR must exist');
});
Given(/^правило `\.claude\/rules\/answer-simple\/clear-questions-to-user\.md` присутствует$/, function () {
  assert.ok(fs.existsSync(appPath(RULE_PATH)), `rule must exist at ${RULE_PATH}`);
});
Given(/^skill `\.claude\/skills\/answer-simple\/SKILL\.md` присутствует$/, function () {
  assert.ok(fs.existsSync(appPath(SKILL_PATH)), `skill must exist at ${SKILL_PATH}`);
});

// --- PLUGIN017_06 / _07 (detectJargon — real engine) -------------------------
Given(/^финальный ответ агента содержит >2 различных внутренних кода \(FR-N, ARCH-N, SCREAMING_CODE\) в прозе$/, function (this: ASWorld) {
  this.asTexts = [WALL];
});
Given(/^ответ — чистая проза без внутренних кодов, либо преимущественно блок кода, либо короткий и чистый$/, function (this: ASWorld) {
  this.asTexts = [CLEAN, CODEY, SHORT];
});
When(/^detectJargon анализирует текст$/, function (this: ASWorld) {
  this.asResults = (this.asTexts ?? []).map((t) => detectJargon(t));
});
Then(/^результат SHALL иметь block=true$/, function (this: ASWorld) {
  assert.equal(this.asResults![0].block, true, 'wall of codes must block');
  assert.ok(this.asResults![0].stats.distinctCodes > 2, 'must see >2 distinct codes');
});
Then(/^reasons SHALL называть найденные коды бытовой формулировкой "стена внутренних кодов"$/, function (this: ASWorld) {
  assert.match(this.asResults![0].reasons[0], /внутренних кодов/, 'reason must name the wall in plain words');
});
Then(/^результат SHALL иметь block=false \(ложноположительные исключены\)$/, function (this: ASWorld) {
  for (const r of this.asResults!) assert.equal(r.block, false, 'clean/codey/short must NOT block');
});

// --- PLUGIN017_08 / _09 (the Stop hook — real spawn) -------------------------
Given(/^answer_simple_stop\.ts установлен и подключён как Stop-hook$/, function (this: ASWorld) {
  const { hook, root } = setupHookTmp();
  this.asHook = hook;
  this.asHookRoot = root;
});
When(/^на Stop приходит финальный ответ-стена из кодов$/, function (this: ASWorld) {
  this.asBlocked = runHook(this.asHook!, { hook_event_name: 'Stop', cwd: this.asHookRoot!, output: WALL });
});
Then(/^хук SHALL вернуть `\{"decision":"block"\}` с reason на простом русском "Перепиши ответ проще"$/, function (this: ASWorld) {
  assert.ok(this.asBlocked!.stdout.includes('"decision":"block"'), 'must block the wall');
  assert.match(this.asBlocked!.stdout, /Перепиши/, 'reason must say rewrite-simpler in plain Russian');
});
Then(/^на чистый ответ хук SHALL вернуть `\{\}` \(разрешить\)$/, function (this: ASWorld) {
  try {
    const ok = runHook(this.asHook!, { hook_event_name: 'Stop', cwd: this.asHookRoot!, output: CLEAN });
    assert.equal(ok.stdout.trim(), '{}', 'clean prose must be approved');
  } finally {
    fs.removeSync(this.asHookRoot!);
  }
});
Given(/^хук уже заблокировал конкретный ответ один раз$/, function (this: ASWorld) {
  const { hook, root } = setupHookTmp();
  this.asHook = hook;
  this.asHookRoot = root;
  const first = runHook(hook, { hook_event_name: 'Stop', cwd: root, output: WALL });
  assert.ok(first.stdout.includes('"decision":"block"'), 'first submit must block');
});
When(/^тот же текст приходит повторно ИЛИ stop_hook_active=true$/, function (this: ASWorld) {
  // Re-submit identical text (loop guard) — stored for the Then below.
  this.asBlocked = runHook(this.asHook!, { hook_event_name: 'Stop', cwd: this.asHookRoot!, output: WALL });
});
Then(/^хук SHALL вернуть `\{\}` \(не блокировать снова, исключая бесконечный цикл\)$/, function (this: ASWorld) {
  try {
    assert.equal(this.asBlocked!.stdout.trim(), '{}', 'identical re-submit must not re-block');
    const active = runHook(this.asHook!, { hook_event_name: 'Stop', stop_hook_active: true, output: WALL });
    assert.equal(active.stdout.trim(), '{}', 'stop_hook_active continuation must never block');
  } finally {
    fs.removeSync(this.asHookRoot!);
  }
});

// --- PLUGIN017_05 (v2 wiring + atomic migration — real repo-state artifact checks) ---
Given(/^репозиторий dev-pomogator после атомарной миграции rule \(v2 canonical\)$/, function () {
  assert.ok(fs.existsSync(appPath('.claude-plugin/hooks.json')), 'hooks.json must exist');
});
Then(/^Stop-хук answer-simple SHALL быть подключён в `\.claude-plugin\/hooks\.json`$/, function () {
  const hooks = JSON.parse(fs.readFileSync(appPath('.claude-plugin/hooks.json'), 'utf-8')).hooks;
  const stopCmds = (hooks.Stop || []).flatMap((g: { hooks?: { command?: string }[] }) =>
    (g.hooks || []).map((h) => h.command || ''),
  );
  assert.ok(
    stopCmds.some((c: string) => /tools\/answer-simple\/answer_simple_stop\.ts/.test(c)),
    'answer-simple Stop hook must be wired in hooks.json',
  );
});
Then(/^файл `tools\/answer-simple\/answer_simple_stop\.ts` SHALL присутствовать$/, function () {
  assert.ok(fs.existsSync(appPath('tools/answer-simple/answer_simple_stop.ts')));
});
Then(/^старый путь правила `\.claude\/rules\/clear-questions-to-user\.md` SHALL отсутствовать$/, function () {
  assert.equal(fs.existsSync(appPath('.claude/rules/clear-questions-to-user.md')), false, 'old rule path must be gone');
});
Then(/^новый путь правила `\.claude\/rules\/answer-simple\/clear-questions-to-user\.md` SHALL присутствовать$/, function () {
  assert.ok(fs.existsSync(appPath(RULE_PATH)));
});
Then(/^`CLAUDE\.md` SHALL ссылаться на новый путь и не содержать старый путь в backticks$/, function () {
  const claudeMd = fs.readFileSync(appPath('CLAUDE.md'), 'utf-8');
  assert.match(claudeMd, /\.claude\/rules\/answer-simple\/clear-questions-to-user\.md/, 'CLAUDE.md must point to new path');
  assert.ok(!/`\.claude\/rules\/clear-questions-to-user\.md`/.test(claudeMd), 'CLAUDE.md must not list old path in backticks');
});

// --- PLUGIN017_01 / _02 (rule artifact structure) + _03 (skill artifact structure) ---
Given(/^содержимое правила clear-questions-to-user прочитано$/, function (this: ASWorld) {
  this.asRuleContent = fs.readFileSync(appPath(RULE_PATH), 'utf-8');
});
Then(/^правило SHALL содержать все 5 шагов шаблона самопроверки$/, function (this: ASWorld) {
  const c = this.asRuleContent!;
  for (const re of [
    /### 1\. Что я понял/,
    /### 2\. Что я собираюсь ответить/,
    /### 3\. Самооценка/,
    /### 4\. Шаблон ответа = микроистория/,
    /### 5\. Если шаблон не прошёл/,
  ]) {
    assert.match(c, re, `rule must contain template step ${re}`);
  }
});
Then(/^правило SHALL перечислять 5 опорных точек микроистории$/, function (this: ASWorld) {
  const c = this.asRuleContent!;
  for (const re of [/Откуда пришли/, /Что юзер сказал/, /Что сделал и почему/, /Где сейчас/, /Что дальше/]) {
    assert.match(c, re, `rule must enumerate micro-story point ${re}`);
  }
});
Then(/^правило SHALL содержать секцию Триггер инцидента с ключевыми словами не понял и сложно$/, function (this: ASWorld) {
  const c = this.asRuleContent!;
  assert.match(c, /## Триггер инцидента/);
  assert.match(c, /не понял/);
  assert.match(c, /сложно/);
});
Then(/^правило SHALL содержать мандат СТОП не задавать новый вопрос$/, function (this: ASWorld) {
  assert.match(this.asRuleContent!, /СТОП.{0,40}не задавать новый вопрос/);
});
Given(/^содержимое skill answer-simple прочитано$/, function (this: ASWorld) {
  this.asSkillContent = fs.readFileSync(appPath(SKILL_PATH), 'utf-8');
});
Then(/^skill SHALL содержать frontmatter с name answer-simple и allowed-tools и упоминание slash-команды$/, function (this: ASWorld) {
  const c = this.asSkillContent!;
  assert.match(c, /name: answer-simple/);
  assert.match(c, /allowed-tools: Read/);
  assert.match(c, /\/answer-simple/);
});
Then(/^skill SHALL перечислять фиксированные заголовки output Переформулировано Найдено-проблем и Проблем-не-найдено$/, function (this: ASWorld) {
  const c = this.asSkillContent!;
  assert.match(c, /Переформулировано:/);
  assert.match(c, /Найдено проблем:/);
  assert.match(c, /Проблем не найдено/);
});
