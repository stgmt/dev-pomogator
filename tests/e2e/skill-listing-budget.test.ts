import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { ensureSkillListingBudget } from '../../tools/skill-listing-budget/apply_skill_budget.ts';
import { runInstaller, homePath, setupCleanState } from './helpers';

/**
 * CORE023: Skill Listing Budget (extension)
 *
 * Verifies the skill-listing-budget extension writes
 * `skillListingBudgetFraction: 1.0` to `~/.claude/settings.json` atomically,
 * idempotently, and recovers from broken JSON.
 *
 * The extension applies the fix in two places:
 *  - `postInstall` hook — runs once after `dev-pomogator install`
 *  - `SessionStart` hook — runs on every Claude Code session, self-heals
 *
 * See .specs/skill-listing-budget/ for the full spec.
 *
 * @implemented: skill-listing-budget.test.ts
 */
describe('CORE023: skill-listing-budget', () => {
  // ============================================================================
  // Direct integration tests via ensureSkillListingBudget() — fast, isolated.
  // ============================================================================
  describe('ensureSkillListingBudget() — direct', () => {
    let tempHome: string;
    let settingsPath: string;

    beforeEach(async () => {
      tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-budget-'));
      settingsPath = path.join(tempHome, '.claude', 'settings.json');
    });

    afterEach(async () => {
      try {
        await fs.remove(tempHome);
      } catch {
        // cleanup best-effort
      }
    });

    // @feature1 — CORE023_01
    it('CORE023_01: settings.json absent → creates with skillListingBudgetFraction=1.0', async () => {
      const result = await ensureSkillListingBudget(tempHome);

      expect(await fs.pathExists(settingsPath)).toBe(true);
      const written = await fs.readJson(settingsPath);
      expect(written.skillListingBudgetFraction).toBe(1.0);
      expect(typeof written.skillListingBudgetFraction).toBe('number');
      expect(result.action).toBe('added');
      expect(result.reportLine).toBe('skillListingBudgetFraction: (unset) → 1.0');
    });

    // @feature1 — CORE023_02
    it('CORE023_02: existing keys preserved', async () => {
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, { theme: 'dark', model: 'sonnet' });

      const result = await ensureSkillListingBudget(tempHome);

      const written = await fs.readJson(settingsPath);
      expect(written.theme).toBe('dark');
      expect(written.model).toBe('sonnet');
      expect(written.skillListingBudgetFraction).toBe(1.0);
      expect(result.action).toBe('added');
    });

    // @feature2 — CORE023_03
    it('CORE023_03: value already 1.0 → no-op (mtime preserved)', async () => {
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, { skillListingBudgetFraction: 1.0 });
      const beforeStat = await fs.stat(settingsPath);

      await new Promise((r) => setTimeout(r, 50));

      const result = await ensureSkillListingBudget(tempHome);

      const afterStat = await fs.stat(settingsPath);
      expect(afterStat.mtimeMs).toBe(beforeStat.mtimeMs);
      expect(result.action).toBe('unchanged');
      expect(result.reportLine).toBe('skillListingBudgetFraction: 1.0 (unchanged)');
    });

    // @feature3 — CORE023_04
    it('CORE023_04: bump existing 0.5 → 1.0', async () => {
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, { skillListingBudgetFraction: 0.5 });

      const result = await ensureSkillListingBudget(tempHome);

      const written = await fs.readJson(settingsPath);
      expect(written.skillListingBudgetFraction).toBe(1.0);
      expect(result.action).toBe('bumped');
      expect(result.reportLine).toBe('skillListingBudgetFraction: 0.5 → 1.0');
    });

    // @feature1 — CORE023_05
    it('CORE023_05: broken JSON → backup + rewrite with 1.0', async () => {
      await fs.ensureDir(path.dirname(settingsPath));
      const brokenContent = '{ skillListingBudgetFraction: }';
      await fs.writeFile(settingsPath, brokenContent, 'utf-8');

      const result = await ensureSkillListingBudget(tempHome);

      expect(result.backupPath).toBeDefined();
      expect(await fs.pathExists(result.backupPath!)).toBe(true);
      const backedUp = await fs.readFile(result.backupPath!, 'utf-8');
      expect(backedUp).toBe(brokenContent);

      const written = await fs.readJson(settingsPath);
      expect(written.skillListingBudgetFraction).toBe(1.0);
      expect(result.action).toBe('invalid-recovered');
      expect(result.reportLine).toMatch(/^skillListingBudgetFraction: <invalid:/);
    });

    // @feature1 — CORE023_06
    it('CORE023_06: invalid type (string) → bump to 1.0', async () => {
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, { skillListingBudgetFraction: '0.5' });

      const result = await ensureSkillListingBudget(tempHome);

      const written = await fs.readJson(settingsPath);
      expect(written.skillListingBudgetFraction).toBe(1.0);
      expect(typeof written.skillListingBudgetFraction).toBe('number');
      expect(result.action).toBe('invalid-recovered');
      expect(result.reportLine).toMatch(/^skillListingBudgetFraction: <invalid:/);
    });

    // @feature4 — CORE023_07
    it('CORE023_07: report line returned for each invocation', async () => {
      // Run against absent file
      const first = await ensureSkillListingBudget(tempHome);
      expect(first.reportLine).toBe('skillListingBudgetFraction: (unset) → 1.0');

      // Run against now-present file (will be unchanged)
      const second = await ensureSkillListingBudget(tempHome);
      expect(second.reportLine).toBe('skillListingBudgetFraction: 1.0 (unchanged)');
    });

    // @feature1 — CORE023_08
    it('CORE023_08: atomic write — no .tmp file left after completion', async () => {
      const result = await ensureSkillListingBudget(tempHome);

      expect(await fs.pathExists(settingsPath)).toBe(true);
      expect(await fs.pathExists(settingsPath + '.tmp')).toBe(false);
      expect(result.action).toBe('added');
    });

    // Bonus: number out-of-range (>1.0) handled as invalid
    it('CORE023_extra: value 2.0 (>1.0) → invalid-recovered', async () => {
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, { skillListingBudgetFraction: 2.0 });

      const result = await ensureSkillListingBudget(tempHome);

      const written = await fs.readJson(settingsPath);
      expect(written.skillListingBudgetFraction).toBe(1.0);
      expect(result.action).toBe('invalid-recovered');
    });

    // Bonus: negative number → invalid-recovered
    it('CORE023_extra: negative value → invalid-recovered', async () => {
      await fs.ensureDir(path.dirname(settingsPath));
      await fs.writeJson(settingsPath, { skillListingBudgetFraction: -0.5 });

      const result = await ensureSkillListingBudget(tempHome);

      const written = await fs.readJson(settingsPath);
      expect(written.skillListingBudgetFraction).toBe(1.0);
      expect(result.action).toBe('invalid-recovered');
    });
  });

  // ============================================================================
  // E2E via runInstaller — verifies extension wiring (postInstall + tool copy).
  // ============================================================================
  describe('Wired into installer (via extension)', () => {
    it('runInstaller writes skillListingBudgetFraction=1.0 to ~/.claude/settings.json', async () => {
      await setupCleanState('claude');
      const result = await runInstaller('--claude --all');

      expect(result.exitCode).toBe(0);
      const globalSettings = await fs.readJson(homePath('.claude', 'settings.json'));
      expect(globalSettings.skillListingBudgetFraction).toBe(1.0);
    });
  });
});
