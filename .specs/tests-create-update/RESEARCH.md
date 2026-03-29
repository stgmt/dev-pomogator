# Research

## Audit Results: реальные проблемы в тестах

### Summary

Аудит двух проектов выявил **258+ проблем** в 7 категориях.

| Категория | dev-pomogator (TS) | Zoho (C#) | Всего |
|-----------|:------------------:|:---------:|:-----:|
| Unit-only / source scan | 35 | 0 | 35 |
| pathExists/NotNull only | 33 | 20+ | 53+ |
| Weak assertions | 28 | 40+ | 68+ |
| Response status only | 11 | 40+ | 51+ |
| Silent skip / catch {} | 10 | 25 | 35 |
| Inline helper dup | 6 | 0 | 6 |
| Unsafe JSON (GetProperty) | 0 | 50+ | 50+ |

### Worst offenders — dev-pomogator

| File | Проблем | Главная |
|------|---------|---------|
| `auto-commit.test.ts` | 27 | 23 source text scan — `readFile(src).toContain('functionName')` вместо запуска |
| `claude-installer.test.ts` | 30 | 18 pathExists-only + 7 silent skip (`if (!exists) return`) |
| `claude-mem-runtime.test.ts` | 19 | 11 `res.ok` only + 8 `toBeDefined()` |
| `simplify-stop.test.ts` | 12 | 10 source string checks |
| `cli-integration.test.ts` | 8 | 6 pathExists-only |

### Worst offenders — ZohoIntegrationClient.Tests

| File | Проблем | Главная |
|------|---------|---------|
| `BinLocationSteps.cs` | 25+ | Chained `.GetProperty()` без `TryGetProperty()` — throws KeyNotFoundException |
| `ShipmentSteps.cs` | 14+ | `Assert.Equal(HttpStatusCode.OK, res.StatusCode)` без body check |
| `WinClientSteps.cs` | 20 | 11 empty `catch {}` + 9 `.NotBeNull()` only |
| `InventoryAdjustmentSteps.cs` | 6+ | Status-only assertions |

### Конкретные примеры BAD → GOOD

**TypeScript — source scan (auto-commit.test.ts:115):**
```typescript
// BAD: проверяет что строка есть в исходнике, не что функция работает
const content = await fs.readFile(corePath, 'utf-8');
expect(content).toContain('const intervalMs = config.intervalMinutes * 60 * 1000');

// GOOD: запускает реальный hook и проверяет поведение
const result = spawnSync('npx', ['tsx', hookPath], { input: JSON.stringify(hookInput) });
expect(result.status).toBe(0);
expect(JSON.parse(result.stdout)).toHaveProperty('continue', true);
```

**TypeScript — pathExists only (claude-installer.test.ts:97):**
```typescript
// BAD: пустой файл проходит
expect(await fs.pathExists(rulePath)).toBe(true);

// GOOD: проверяет содержимое
const stat = await fs.stat(rulePath);
expect(stat.size).toBeGreaterThan(0);
const content = await fs.readFile(rulePath, 'utf-8');
expect(content).toContain('## ');  // markdown header
```

**C# — status only (ShipmentSteps.cs:1352):**
```csharp
// BAD: 200 с пустым body проходит
Assert.Equal(HttpStatusCode.OK, response.StatusCode);

// GOOD: проверяет body structure
Assert.Equal(HttpStatusCode.OK, response.StatusCode);
var body = await response.Content.ReadFromJsonAsync<ShipmentResponse>();
body.Should().NotBeNull();
body!.ShipmentId.Should().NotBeEmpty();
```

**C# — unsafe GetProperty (BinLocationSteps.cs:168):**
```csharp
// BAD: throws KeyNotFoundException если property нет
var id = doc.RootElement.GetProperty("salesorder").GetProperty("salesorder_id").GetString()!;

// GOOD: safe parsing
if (doc.RootElement.TryGetProperty("salesorder", out var so) &&
    so.TryGetProperty("salesorder_id", out var idProp))
{
    var id = idProp.GetString();
    Assert.NotNull(id);
}
else
{
    Assert.Fail("Expected 'salesorder.salesorder_id' in response");
}
```

---

## Внешний ресерч: дизайн skills

### Официальные docs Anthropic

**Источник:** https://code.claude.com/docs/en/skills [VERIFIED: 2026-03-28]

- Skills и commands унифицированы — SKILL.md рекомендуемый путь
- Description — trigger mechanism. Claude использует description чтобы решить auto-loading
- Хороший description: `"This skill should be used when the user asks to 'create a test', 'update test', 'add regression test'"` — конкретные trigger phrases, third-person
- Плохой description: `"Test management"` — нет триггеров, не third-person
- `allowed-tools` поддерживает granular Bash patterns: `Bash(npx tsx *)`, `Bash(grep *)`
- Новые frontmatter поля: `context: fork` (subagent), `effort`, `model`, `agent`, `paths`
- `$ARGUMENTS`, `$ARGUMENTS[0]`, `` !`command` `` (dynamic context injection)

### Anthropic skill-development meta-skill

**Источник:** https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/skill-development/SKILL.md [VERIFIED: 2026-03-28]

- **Progressive disclosure (3 уровня загрузки):**
  1. Metadata (name + description) — всегда в контексте (~100 слов)
  2. SKILL.md body — при триггере (<5k слов, target 1,500-2,000)
  3. Bundled resources (references/, scripts/) — по запросу Claude
- Структура: `SKILL.md` + `references/` + `examples/` + `scripts/`
- Стиль: императив ("Parse the frontmatter"), НЕ "You should..."
- Avoid duplication: инфо в SKILL.md ИЛИ references, не в обоих
- SKILL.md если >5k слов — включить grep patterns для поиска в references

### Реальные примеры с GitHub

| Repo | Паттерн | Что работает |
|------|---------|-------------|
| VideoCaptioner (WEIFENG2333/VideoCaptioner) | CLI wrapper | allowed-tools с конкретными command prefixes [UNVERIFIED: URL not recorded] |
| gh-aw-firewall (github/gh-aw-firewall) | Background knowledge | `user-invocable: false` [UNVERIFIED: URL not recorded] |
| Anthropic frontend-design (anthropics/claude-code) | Pure prompt | Без allowed-tools, creative guidance only [VERIFIED: 2026-03-28] |
| DataClaw (peteromallet/dataclaw) | Granular permissions | `Bash(dataclaw *)`, `Bash(grep *)` [UNVERIFIED: URL not recorded] |

### Community best practices

**Источники:** alexop.dev, SFEIR Institute cheatsheet, batsov.com [UNVERIFIED: URLs not recorded]

- 50-200 строк SKILL.md для быстрой загрузки
- `context: fork` для heavy research/scan чтобы не раздувать main context
- Vague descriptions не триггерятся — нужны конкретные фразы
- Minimal tool permissions — security и clarity

### Анализ skills в этом репо (7 штук)

| Skill | Строк | Шагов | Скрипты | Паттерн |
|-------|-------|-------|---------|---------|
| run-tests | 130 | 5 | refs to wrapper | detect → build → execute → report |
| dedup-tests | 82 | 7 | 0 (npx jscpd) | scan → classify → ask → fix → verify |
| deep-insights | 171 | 6 | 1 (121 строк) | aggregate → analyze → report |
| docker-optimize | 200 | 6 | 0 | check → detect → report → fix |
| rules-optimizer | 102 | 5 | 4 (649 строк) | audit → classify → merge → report |
| context-menu | 236 | 12 | 0 | install → configure (cookbook) |
| debug-screenshot | 94 | 4 | 1 (28 строк) | hypothesis → capture → analyze → verdict |

**Наблюдения:**
- 86% имеют decision tables
- 86% имеют код-примеры
- Skills с external scripts имеют самый простой SKILL.md (102 строки) но самый большой total (921 строк)
- `/dedup-tests` — 0 коммитов от него в git log (возможно неиспользуемый)
- `specs-management` rule (457 строк) по сути skill, замаскированный под rule

---

## Существующая инфраструктура тестирования

### Rules (8 штук, разбросаны)

| Rule | Путь | Что проверяет |
|------|------|---------------|
| extension-test-quality | `.claude/rules/extension-test-quality.md` | 1:1 mapping test↔feature, naming DOMAIN_CODE_NN, import guard, запрет inline-копий |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Интеграционные обязательны, unit — только как доп |
| no-test-helper-duplication | `.claude/rules/test-quality/no-test-helper-duplication.md` | Проверь helpers.ts перед дублированием |
| no-mocks-fallbacks | `.claude/rules/specs-workflow/no-mocks-fallbacks.md` | Запрет моков/стабов, fail-fast |
| tui-pilot-tests | `.claude/rules/tui-pilot-tests.md` | TUI через Pilot API, не file inspection |
| spec-test-sync | `.claude/rules/plan-pomogator/spec-test-sync.md` | Тесты → спеки, багфикс → .feature |
| manifest-test-coverage | `.claude/rules/checklists/manifest-test-coverage.md` | Динамические тесты из manifest |
| specs-validation | `.claude/rules/specs-workflow/specs-validation.md` | @featureN теги для трейсабилити |

### Skills (2 штуки — только running и dedup)

| Skill | Назначение |
|-------|-----------|
| `/run-tests` | Запуск тестов (auto-detect framework, wrapper, statusline) |
| `/dedup-tests` | Сканер дублей в тестах (jscpd → extract → helpers.ts) |

### Shared helpers

`tests/e2e/helpers.ts` — экспортирует: `runInstaller`, `homePath`, `appPath`, `getClaudeMemDir`, `setupCleanState`, `getInstallLog`, `startWorker`, `stopWorker`, `runHookWithParams`, `spawnSync` wrappers и др.

### Naming Convention (из extension-test-quality)

- **describe**: `DOMAIN_CODE: Description` (e.g. `CORE003: Claude Code Installer`)
- **it**: `CODE_NN: description` (e.g. `CORE003_01: should install rules`)
- **Feature**: `Scenario: CODE_NN description`
- **@featureN**: `// @featureN` перед it, `# @featureN` перед Scenario

### Domain codes в проекте

Существующие коды из `tests/features/**/*.feature` — CORE001-CORE018, PLUGIN001-PLUGIN015, GUARD001-GUARD002.

## Проблема

Нет единого workflow для СОЗДАНИЯ и ОБНОВЛЕНИЯ тестов. Разработчик (или AI) должен:
1. Знать про 8 rules и проверять каждое вручную
2. Самостоятельно искать domain code и свободный номер
3. Самостоятельно искать .feature и helpers.ts
4. Самостоятельно проверять 1:1 mapping

Это приводит к ложноположительным тестам (проверяют только pathExists), дублированию helpers, нарушению naming conventions.

## Аналоги

- `/dedup-tests` — проверяет ПОСЛЕ написания, не помогает ПРИ написании
- `/run-tests` — запускает готовые тесты, не создаёт
- `specs-management` rule — описывает workflow спеков, не тестов

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Impacts |
|------|------|---------|
| extension-test-quality | `.claude/rules/extension-test-quality.md` | Naming, 1:1 mapping — skill MUST enforce |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Approach selection — skill MUST check |
| no-test-helper-duplication | `.claude/rules/test-quality/no-test-helper-duplication.md` | Helper check — skill MUST verify |
| skill-allowed-tools-audit | `.claude/rules/checklists/skill-allowed-tools-audit.md` | allowed-tools — SKILL.md MUST list all |

### Existing Patterns & Extensions

| Source | Path | Relevance |
|--------|------|-----------|
| dedup-tests skill | `.claude/skills/dedup-tests/SKILL.md` | Pattern: scan → classify → ask → fix → verify |
| run-tests skill | `.claude/skills/run-tests/SKILL.md` | Pattern: detect → build → execute → report |
| test-quality extension | `extensions/test-quality/extension.json` | Manifest pattern for skill + hook |

### Architectural Constraints

- Skill = SKILL.md с YAML frontmatter + markdown workflow
- allowed-tools MUST cover all tools used in steps
- Skill может жить в существующем extension (test-quality) или в новом
- PoC — минимальный набор шагов, без hook автоматизации
