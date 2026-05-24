import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { runInstaller } from './helpers';

const APP_DIR = process.env.APP_DIR || process.cwd();
const appPath = (rel: string = ''): string => path.join(APP_DIR, rel);

// Source repo paths — answer-simple extension artifacts that should exist
// after this PR/spec implementation is committed
const RULE_PATH = '.claude/rules/answer-simple/clear-questions-to-user.md';
const SKILL_PATH = '.claude/skills/answer-simple/SKILL.md';
const MANIFEST_PATH = 'extensions/answer-simple/extension.json';

describe('PLUGIN017_answer-simple', () => {
  // ---------------------------------------------------------------------------
  // @feature1 — FR-1 / FR-4 (always-apply self-check + incident trigger)
  //
  // These two scenarios verify agent behavior (silent rule application before
  // every response, no-new-question on "не понял" signal). Claude Code does NOT
  // expose a PostUserMessage hook, so we cannot integration-test the agent's
  // text output through automation — the rule is guidance, not enforcement.
  //
  // Instead, we verify the RULE FILE itself has the required structure
  // (5-step template + incident trigger section). If the rule is structurally
  // correct, agent compliance is the human-review concern (manual verification
  // in TASKS.md Phase 3 final-verification task).
  // ---------------------------------------------------------------------------

  it('PLUGIN017_01: rule file at new path has 5-step self-check template structure', async () => {
    const ruleFullPath = appPath(RULE_PATH);
    const exists = await fs.pathExists(ruleFullPath);
    expect(exists, `Rule file must exist at ${RULE_PATH}`).toBe(true);

    const content = await fs.readFile(ruleFullPath, 'utf-8');

    // All 5 numbered steps of template must be present
    expect(content).toMatch(/### 1\. Что я понял/);
    expect(content).toMatch(/### 2\. Что я собираюсь ответить/);
    expect(content).toMatch(/### 3\. Самооценка/);
    expect(content).toMatch(/### 4\. Шаблон ответа = микроистория/);
    expect(content).toMatch(/### 5\. Если шаблон не прошёл/);

    // Micro-story 5 points must be enumerated
    expect(content).toMatch(/Откуда пришли/);
    expect(content).toMatch(/Что юзер сказал/);
    expect(content).toMatch(/Что сделал и почему/);
    expect(content).toMatch(/Где сейчас/);
    expect(content).toMatch(/Что дальше/);
  });

  it('PLUGIN017_02: rule file has incident trigger section with "no new question" mandate', async () => {
    const content = await fs.readFile(appPath(RULE_PATH), 'utf-8');

    // Incident trigger section must exist
    expect(content).toMatch(/## Триггер инцидента/);

    // Trigger keywords must be enumerated
    expect(content).toMatch(/не понял/);
    expect(content).toMatch(/сложно/);
    expect(content).toMatch(/ты не понял сути/);

    // Mandate: STOP, no new question
    expect(content).toMatch(/СТОП.{0,30}не задавать новый вопрос/);
  });

  // ---------------------------------------------------------------------------
  // @feature2 — FR-2 (slash-команда /answer-simple)
  // ---------------------------------------------------------------------------

  it('PLUGIN017_03: skill SKILL.md has correct frontmatter and 4-criteria workflow', async () => {
    const skillFullPath = appPath(SKILL_PATH);
    const exists = await fs.pathExists(skillFullPath);
    expect(exists, `Skill file must exist at ${SKILL_PATH}`).toBe(true);

    const content = await fs.readFile(skillFullPath, 'utf-8');

    // Frontmatter checks
    expect(content).toMatch(/^---\s*\n/);
    expect(content).toMatch(/name: answer-simple/);
    expect(content).toMatch(/allowed-tools: Read/);

    // Description must mention slash invocation
    expect(content).toMatch(/\/answer-simple/);

    // 4 critères of analysis must be enumerated in body
    expect(content).toMatch(/Микроистория с 5 опорными точками/);
    expect(content).toMatch(/Внутренние коды без расшифровки/);
    expect(content).toMatch(/Multi-select.{0,20}3.{0,20}опций/);
    expect(content).toMatch(/Причинно-следственные связки/);

    // Fixed output headers
    expect(content).toMatch(/Переформулировано:/);
    expect(content).toMatch(/Найдено проблем:/);
    expect(content).toMatch(/Проблем не найдено/);
  });

  it.skip('PLUGIN017_04: slash-команда /answer-simple on clean draft returns "Проблем не найдено" (manual review)', () => {
    // SKIP: This verifies agent behavior when invoking the slash command — requires
    // actual Claude Code session with skill loaded. Cannot integration-test text I/O
    // through automated framework. Manual review verifies output format matches
    // SKILL.md Example invocation 2.
  });

  // ---------------------------------------------------------------------------
  // @feature3 — FR-3 / FR-5 (extension structure + atomic migration)
  // ---------------------------------------------------------------------------

  it('PLUGIN017_05: extension manifest is well-formed, old rule path removed, CLAUDE.md updated', async () => {
    // (a) Manifest exists and structure correct (FR-3)
    const manifestPath = appPath(MANIFEST_PATH);
    expect(await fs.pathExists(manifestPath), `Manifest must exist at ${MANIFEST_PATH}`).toBe(true);

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    expect(manifest.name).toBe('answer-simple');
    expect(manifest.platforms).toContain('claude');
    expect(manifest.ruleFiles.claude).toContain(RULE_PATH);
    expect(manifest.skills['answer-simple']).toBe('.claude/skills/answer-simple');
    expect(manifest.skillFiles['answer-simple']).toContain(SKILL_PATH);

    // Manifest must NOT contain tools/toolFiles/hooks (declarative extension)
    expect(manifest.tools).toBeUndefined();
    expect(manifest.toolFiles).toBeUndefined();
    expect(manifest.hooks).toBeUndefined();

    // (b) Old rule path must NOT exist after migration (FR-5)
    const oldRulePath = appPath('.claude/rules/clear-questions-to-user.md');
    expect(
      await fs.pathExists(oldRulePath),
      `Old rule path ${oldRulePath} must NOT exist after migration`
    ).toBe(false);

    // (c) New rule path exists (FR-5)
    expect(await fs.pathExists(appPath(RULE_PATH))).toBe(true);

    // (d) CLAUDE.md глоссарий points to new path (FR-5)
    const claudeMd = await fs.readFile(appPath('CLAUDE.md'), 'utf-8');
    expect(claudeMd).toMatch(/clear-questions-to-user/);
    expect(claudeMd).toMatch(/\.claude\/rules\/answer-simple\/clear-questions-to-user\.md/);

    // CLAUDE.md must NOT contain orphan reference to old path with backticks (would be glossary entry)
    expect(claudeMd).not.toMatch(/`\.claude\/rules\/clear-questions-to-user\.md`/);
  });
});
