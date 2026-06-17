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
