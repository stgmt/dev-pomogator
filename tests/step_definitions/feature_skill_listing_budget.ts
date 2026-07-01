/**
 * @feature1/@feature2/@feature3 — skill-listing-budget BDD migration (FR-M1/P3, 2nd spec).
 * Scenarios CORE023_01.._04 migrated 1:1 from tests/e2e/skill-listing-budget.test.ts — each
 * step calls the REAL engine ensureSkillListingBudget() in an isolated tmp HOME (no mock).
 * CORE023_05..08 stay @wip (next slice). Regex steps so literal `/`, `${}`, backticks match.
 *
 * @see tools/skill-listing-budget/apply_skill_budget.ts ensureSkillListingBudget
 */
import { Given, When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { ensureSkillListingBudget } from '../../tools/skill-listing-budget/apply_skill_budget.ts';

interface SLBWorld extends V4World {
  slbHome?: string;
  slbResult?: { action: string; reportLine: string; backupPath?: string };
  slbBeforeMtime?: number;
}

const settings = (w: SLBWorld): string => path.join(w.slbHome!, '.claude', 'settings.json');

After(function (this: SLBWorld) {
  if (this.slbHome) {
    try {
      fs.removeSync(this.slbHome);
    } catch {
      /* best-effort */
    }
    this.slbHome = undefined;
  }
});

// --- Background ---------------------------------------------------------------
Given(/^installer запускается с изолированным temp HOME directory$/, function (this: SLBWorld) {
  this.slbHome = fs.mkdtempSync(path.join(os.tmpdir(), 'slb-bdd-'));
});
Given(/^путь к настройкам это `\$\{HOME\}\/\.claude\/settings\.json`$/, function () {
  /* path is derived from slbHome; nothing to set up */
});

// --- CORE023_01 ---------------------------------------------------------------
Given(/^файл `\$\{HOME\}\/\.claude\/settings\.json` не существует$/, function (this: SLBWorld) {
  assert.equal(fs.existsSync(settings(this)), false, 'settings.json must be absent at start');
});
When(/^запускается `ensureSkillListingBudget`$/, async function (this: SLBWorld) {
  this.slbResult = await ensureSkillListingBudget(this.slbHome!);
});
Then(/^файл `\$\{HOME\}\/\.claude\/settings\.json` создан$/, function (this: SLBWorld) {
  assert.ok(fs.existsSync(settings(this)), 'settings.json must be created');
});
Then(/^содержит ключ `skillListingBudgetFraction` со значением `1\.0` \(number, не string\)$/, function (this: SLBWorld) {
  const w = fs.readJsonSync(settings(this));
  assert.equal(w.skillListingBudgetFraction, 1.0);
  assert.equal(typeof w.skillListingBudgetFraction, 'number');
});
Then(/^install report содержит строку `skillListingBudgetFraction: \(unset\) → 1\.0`$/, function (this: SLBWorld) {
  assert.equal(this.slbResult!.reportLine, 'skillListingBudgetFraction: (unset) → 1.0');
});

// --- CORE023_02 ---------------------------------------------------------------
Given(/^`\$\{HOME\}\/\.claude\/settings\.json` содержит `\{ "theme": "dark", "model": "sonnet" \}`$/, function (this: SLBWorld) {
  fs.ensureDirSync(path.dirname(settings(this)));
  fs.writeJsonSync(settings(this), { theme: 'dark', model: 'sonnet' });
});
Then(/^файл содержит `theme: "dark"` без изменений$/, function (this: SLBWorld) {
  assert.equal(fs.readJsonSync(settings(this)).theme, 'dark');
});
Then(/^файл содержит `model: "sonnet"` без изменений$/, function (this: SLBWorld) {
  assert.equal(fs.readJsonSync(settings(this)).model, 'sonnet');
});
Then(/^файл содержит `skillListingBudgetFraction: 1\.0` \(новый ключ\)$/, function (this: SLBWorld) {
  assert.equal(fs.readJsonSync(settings(this)).skillListingBudgetFraction, 1.0);
});

// --- CORE023_03 ---------------------------------------------------------------
Given(/^`\$\{HOME\}\/\.claude\/settings\.json` содержит `\{ "skillListingBudgetFraction": 1\.0 \}`$/, function (this: SLBWorld) {
  fs.ensureDirSync(path.dirname(settings(this)));
  fs.writeJsonSync(settings(this), { skillListingBudgetFraction: 1.0 });
});
Given(/^запомнен текущий mtime файла$/, async function (this: SLBWorld) {
  this.slbBeforeMtime = fs.statSync(settings(this)).mtimeMs;
  await new Promise((r) => setTimeout(r, 50)); // so a rewrite would change mtime
});
Then(/^mtime файла не изменился$/, function (this: SLBWorld) {
  assert.equal(fs.statSync(settings(this)).mtimeMs, this.slbBeforeMtime, 'no-op must preserve mtime');
});
Then(/^install report содержит строку `skillListingBudgetFraction: 1\.0 \(unchanged\)`$/, function (this: SLBWorld) {
  assert.equal(this.slbResult!.reportLine, 'skillListingBudgetFraction: 1.0 (unchanged)');
});

// --- CORE023_04 ---------------------------------------------------------------
Given(/^`\$\{HOME\}\/\.claude\/settings\.json` содержит `\{ "skillListingBudgetFraction": 0\.5 \}`$/, function (this: SLBWorld) {
  fs.ensureDirSync(path.dirname(settings(this)));
  fs.writeJsonSync(settings(this), { skillListingBudgetFraction: 0.5 });
});
Then(/^файл содержит `skillListingBudgetFraction: 1\.0`$/, function (this: SLBWorld) {
  assert.equal(fs.readJsonSync(settings(this)).skillListingBudgetFraction, 1.0);
});
Then(/^install report содержит строку `skillListingBudgetFraction: 0\.5 → 1\.0`$/, function (this: SLBWorld) {
  assert.equal(this.slbResult!.reportLine, 'skillListingBudgetFraction: 0.5 → 1.0');
});

// --- CORE023_05 (broken JSON → backup + recover) ------------------------------
Given(/^`\$\{HOME\}\/\.claude\/settings\.json` содержит невалидный JSON `\{ skillListingBudgetFraction: \}`$/, function (this: SLBWorld) {
  fs.ensureDirSync(path.dirname(settings(this)));
  fs.writeFileSync(settings(this), '{ skillListingBudgetFraction: }', 'utf-8');
});
Then(/^создан backup `\$\{HOME\}\/\.dev-pomogator\/\.user-overrides\/settings\.json\.broken-\{epoch\}` с оригинальным content$/, function (this: SLBWorld) {
  assert.ok(this.slbResult!.backupPath, 'backupPath must be set');
  assert.ok(fs.existsSync(this.slbResult!.backupPath!), 'backup file must exist');
  assert.equal(fs.readFileSync(this.slbResult!.backupPath!, 'utf-8'), '{ skillListingBudgetFraction: }');
});
Then(/^`\$\{HOME\}\/\.claude\/settings\.json` теперь валидный JSON$/, function (this: SLBWorld) {
  assert.doesNotThrow(() => fs.readJsonSync(settings(this)));
});
Then(/^содержит `skillListingBudgetFraction: 1\.0`$/, function (this: SLBWorld) {
  assert.equal(fs.readJsonSync(settings(this)).skillListingBudgetFraction, 1.0);
});
Then(/^install report содержит строку начинающуюся с `skillListingBudgetFraction: <invalid:`$/, function (this: SLBWorld) {
  assert.match(this.slbResult!.reportLine, /^skillListingBudgetFraction: <invalid:/);
});

// --- CORE023_06 (invalid type string → recover) -------------------------------
Given(/^`\$\{HOME\}\/\.claude\/settings\.json` содержит `\{ "skillListingBudgetFraction": "0\.5" \}`$/, function (this: SLBWorld) {
  fs.ensureDirSync(path.dirname(settings(this)));
  fs.writeJsonSync(settings(this), { skillListingBudgetFraction: '0.5' });
});
Then(/^файл содержит `skillListingBudgetFraction: 1\.0` \(number, не string\)$/, function (this: SLBWorld) {
  const w = fs.readJsonSync(settings(this));
  assert.equal(w.skillListingBudgetFraction, 1.0);
  assert.equal(typeof w.skillListingBudgetFraction, 'number');
});

// --- CORE023_07 (exactly one report line) -------------------------------------
Given(/^любое начальное состояние `\$\{HOME\}\/\.claude\/settings\.json`$/, function () {
  /* absent tmp is a valid initial state */
});
Then(/^install report содержит ровно одну строку начинающуюся с `skillListingBudgetFraction:`$/, function (this: SLBWorld) {
  const lines = this.slbResult!.reportLine.split('\n').filter((l) => l.startsWith('skillListingBudgetFraction:'));
  assert.equal(lines.length, 1, 'exactly one skillListingBudgetFraction report line');
});
Then(/^не содержит дублирующих или противоречивых строк$/, function (this: SLBWorld) {
  const all = this.slbResult!.reportLine.split('\n').filter((l) => l.includes('skillListingBudgetFraction'));
  assert.equal(new Set(all).size, all.length, 'no duplicate report lines');
});

// --- CORE023_08 (atomic write — outcome; transient .tmp is not post-hoc observable) ---
Then(/^после записи `settings\.json\.tmp` отсутствует \(атомарный move завершён\)$/, function (this: SLBWorld) {
  assert.equal(fs.existsSync(settings(this) + '.tmp'), false, 'no .tmp left after atomic move');
});
Then(/^`settings\.json` содержит финальный JSON с `skillListingBudgetFraction: 1\.0`$/, function (this: SLBWorld) {
  assert.equal(fs.readJsonSync(settings(this)).skillListingBudgetFraction, 1.0);
});

// --- CORE023_09 / _10 (numeric out-of-range / negative → invalid-recovered) ---
Given(/^`\$\{HOME\}\/\.claude\/settings\.json` содержит `\{ "skillListingBudgetFraction": 2\.0 \}`$/, function (this: SLBWorld) {
  fs.ensureDirSync(path.dirname(settings(this)));
  fs.writeJsonSync(settings(this), { skillListingBudgetFraction: 2.0 });
});
Given(/^`\$\{HOME\}\/\.claude\/settings\.json` содержит `\{ "skillListingBudgetFraction": -0\.5 \}`$/, function (this: SLBWorld) {
  fs.ensureDirSync(path.dirname(settings(this)));
  fs.writeJsonSync(settings(this), { skillListingBudgetFraction: -0.5 });
});
Then(/^действие SHALL быть invalid-recovered$/, function (this: SLBWorld) {
  assert.equal(this.slbResult!.action, 'invalid-recovered');
});
