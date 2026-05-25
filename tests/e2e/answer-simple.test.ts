import { describe, it, expect } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { runInstaller } from './helpers';
import { detectJargon } from '../../extensions/answer-simple/tools/answer-simple/jargon_detector.ts';

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

    // v1.1.0: extension now ships a Stop-hook enforcement tool (reversed from the original
    // "declarative, no hooks" decision — that was posited on the false belief that Claude Code
    // has no hook on the final agent message; the Stop hook does see it). See DESIGN.md.
    expect(manifest.tools['answer-simple']).toBe('tools/answer-simple');
    expect(manifest.toolFiles['answer-simple']).toContain(
      '.dev-pomogator/tools/answer-simple/answer_simple_stop.ts',
    );
    expect(manifest.hooks.claude.Stop).toMatch(/answer_simple_stop\.ts/);

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

  // ---------------------------------------------------------------------------
  // @feature4 — FR-8 / AC-8 (Stop-hook runtime enforcement of plain language)
  //
  // detectJargon is the pure brain (testable directly); answer_simple_stop.ts is
  // the thin Stop-hook glue. We integration-test the real hook by copying it +
  // _shared into a flat tmp layout (the installed shape it expects) and piping a
  // Stop event — Docker-safe (no dependency on a populated .dev-pomogator/).
  // ---------------------------------------------------------------------------

  const WALL =
    'Both done. (2) self-review loop: arch-review.ts --spec runs the battery. (1) scaffold stamps ' +
    'version 3 but architecture-gate.ts no-ops when version < 4 so FR-21 never fired. ARCH012 proves ' +
    'the chain; ARCH011 had no progress.json. Fixed per FR-7, VARIANT_COVERAGE green, Phase 1.75 ' +
    'grandfathered, AC-13 covered.';
  const CLEAN =
    'Готово — починил защиту. Раньше она ни разу не срабатывала из-за неправильного номера версии у ' +
    'новых проектов. Теперь срабатывает, старые проекты не трогаю. Написал тест который это доказывает. ' +
    'Дальше на твой выбор: разжевать подробнее или идём дальше по списку.';

  it('PLUGIN017_06: detector blocks a wall of internal codes regardless of length', () => {
    const r = detectJargon(WALL);
    expect(r.block).toBe(true);
    expect(r.stats.distinctCodes).toBeGreaterThan(2);
    expect(r.reasons[0]).toMatch(/внутренних кодов/);
  });

  it('PLUGIN017_07: detector passes clean prose; hard-OUT for code-heavy + short', () => {
    expect(detectJargon(CLEAN).block).toBe(false);
    // mostly a code block → not nagged
    const codey = 'Готово:\n```ts\nconst x = f(a, b);\nfor (const y of z) g(y);\nawait save(x);\n```\nДальше тест.';
    expect(detectJargon(codey).block).toBe(false);
    // short + clean → nothing wrong
    expect(detectJargon('Готово, починил. Тест зелёный.').block).toBe(false);
  });

  function setupHookTmp(): { hook: string; root: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'answer-simple-'));
    const toolDir = path.join(root, 'answer-simple');
    fs.mkdirSync(toolDir, { recursive: true });
    fs.copySync(appPath('extensions/answer-simple/tools/answer-simple/jargon_detector.ts'), path.join(toolDir, 'jargon_detector.ts'));
    fs.copySync(appPath('extensions/answer-simple/tools/answer-simple/answer_simple_stop.ts'), path.join(toolDir, 'answer_simple_stop.ts'));
    fs.copySync(appPath('extensions/_shared'), path.join(root, '_shared'));
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

  it('PLUGIN017_08: Stop hook blocks a jargon wall with a plain reason; approves clean prose', () => {
    const { hook, root } = setupHookTmp();
    try {
      const blocked = runHook(hook, { hook_event_name: 'Stop', cwd: root, output: WALL });
      expect(blocked.stdout).toContain('"decision":"block"');
      expect(blocked.stdout).toMatch(/Перепиши/);
      const ok = runHook(hook, { hook_event_name: 'Stop', cwd: root, output: CLEAN });
      expect(ok.stdout.trim()).toBe('{}');
    } finally {
      fs.removeSync(root);
    }
  });

  it('PLUGIN017_09: Stop hook anti-loop — same response re-submitted approves; stop_hook_active approves', () => {
    const { hook, root } = setupHookTmp();
    try {
      const first = runHook(hook, { hook_event_name: 'Stop', cwd: root, output: WALL });
      expect(first.stdout).toContain('"decision":"block"'); // 1st time blocks
      const second = runHook(hook, { hook_event_name: 'Stop', cwd: root, output: WALL });
      expect(second.stdout.trim()).toBe('{}'); // identical text → no re-block (loop guard)
      const active = runHook(hook, { hook_event_name: 'Stop', stop_hook_active: true, output: WALL });
      expect(active.stdout.trim()).toBe('{}'); // continuation → never block
    } finally {
      fs.removeSync(root);
    }
  });
});
