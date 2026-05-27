#!/usr/bin/env node
/**
 * skill-listing-budget — SessionStart hook
 *
 * Writes `skillListingBudgetFraction: 1.0` to `~/.claude/settings.json` so
 * Claude Code never truncates skill descriptions ("N descriptions dropped" warning).
 *
 * Idempotent: no-op if value is already 1.0.
 * Atomic: writes through temp file + fs.move (per `.claude/rules/atomic-config-save.md`).
 * Safe: backs up broken JSON to `~/.dev-pomogator/.user-overrides/settings.json.broken-{epoch}`
 *       before rewrite — никогда не теряет содержимое тихо.
 * Fail-open: errors are logged to stderr, never block session start.
 *
 * See .specs/skill-listing-budget/ for full spec.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TARGET = 1.0;
const KEY = 'skillListingBudgetFraction';

type Action = 'added' | 'unchanged' | 'bumped' | 'invalid-recovered';

async function ensureSkillListingBudget(homeDir: string = os.homedir()): Promise<{
  action: Action;
  reportLine: string;
  backupPath?: string;
}> {
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');
  const settingsDir = path.dirname(settingsPath);

  let existing: Record<string, unknown> | null = null;
  let parseError = false;
  let rawContent: string | null = null;

  if (fs.existsSync(settingsPath)) {
    try {
      rawContent = fs.readFileSync(settingsPath, 'utf-8');
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      } else {
        parseError = true;
      }
    } catch {
      parseError = true;
    }
  }

  let backupPath: string | undefined;
  if (parseError && rawContent !== null) {
    backupPath = path.join(
      homeDir,
      '.dev-pomogator',
      '.user-overrides',
      `settings.json.broken-${Date.now()}`,
    );
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, rawContent, 'utf-8');
  }

  const current = existing ? existing[KEY] : undefined;
  const newSettings: Record<string, unknown> = existing ? { ...existing } : {};

  let action: Action;
  let reportLine: string;

  if (parseError) {
    action = 'invalid-recovered';
    newSettings[KEY] = TARGET;
    const rawRepr = (rawContent ?? '').slice(0, 50).replace(/\s+/g, ' ').trim();
    reportLine = `${KEY}: <invalid: ${JSON.stringify(rawRepr)}> → 1.0`;
  } else if (existing === null || !(KEY in existing)) {
    action = 'added';
    newSettings[KEY] = TARGET;
    reportLine = `${KEY}: (unset) → 1.0`;
  } else if (typeof current === 'number' && current === TARGET) {
    action = 'unchanged';
    reportLine = `${KEY}: 1.0 (unchanged)`;
  } else if (
    typeof current === 'number' &&
    Number.isFinite(current) &&
    current >= 0 &&
    current < TARGET
  ) {
    action = 'bumped';
    newSettings[KEY] = TARGET;
    reportLine = `${KEY}: ${current} → 1.0`;
  } else {
    action = 'invalid-recovered';
    newSettings[KEY] = TARGET;
    const rawRepr = JSON.stringify(current).slice(0, 50);
    reportLine = `${KEY}: <invalid: ${rawRepr}> → 1.0`;
  }

  if (action !== 'unchanged') {
    fs.mkdirSync(settingsDir, { recursive: true });
    const tempPath = settingsPath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(newSettings, null, 2), 'utf-8');
    fs.renameSync(tempPath, settingsPath);
  }

  return { action, reportLine, backupPath };
}

async function main(): Promise<void> {
  try {
    const result = await ensureSkillListingBudget();
    if (result.action !== 'unchanged') {
      // Print to stderr so it shows up in install/session logs without polluting stdout
      process.stderr.write(`[skill-listing-budget] ${result.reportLine}\n`);
      if (result.backupPath) {
        process.stderr.write(`[skill-listing-budget] backup: ${result.backupPath}\n`);
      }
    }
    process.exit(0);
  } catch (err) {
    // Fail-open: don't block session start on any error
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[skill-listing-budget] warn: ${msg}\n`);
    process.exit(0);
  }
}

const isDirectRun =
  process.argv[1]?.endsWith('apply_skill_budget.ts') ||
  process.argv[1]?.endsWith('apply_skill_budget.js');

if (isDirectRun) {
  main();
}

export { ensureSkillListingBudget };
