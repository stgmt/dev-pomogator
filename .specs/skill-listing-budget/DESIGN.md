# Design

## Реализуемые требования

- [FR-1: Запись `skillListingBudgetFraction: 1.0`](FR.md#fr-1-запись-skilllistingbudgetfraction-10-в-claudesettingsjson)
- [FR-2: Идемпотентность](FR.md#fr-2-идемпотентность-повторных-запусков)
- [FR-3: Bump существующего значения < 1.0](FR.md#fr-3-bump-существующего-значения--10)
- [FR-4: Install report line](FR.md#fr-4-install-report-includes-change-line)

## Компоненты

- `src/installer/skill-budget.ts` — новый module, единственная экспортируемая функция `ensureSkillListingBudget(homeDir?, report?): Promise<void>`. Содержит весь decision-tree (absent/equal/lower/invalid).
- ~~`src/installer/claude.ts`~~ (removed in v2 — no canonical replacement) — вызов `ensureSkillListingBudget()` после основного install loop, перед формированием InstallReport.
- `.claude/skills/skills-rules-optimizer/scripts/report.ts` — добавлен метод `recordSkillBudget(line: string)` для накопления одной строки.
- `src/utils/atomic-json.ts` — reuse существующих `readJsonSafe()` + `writeJsonAtomic()`. Никаких новых утилит.

## Где лежит реализация

- App-код: `src/installer/skill-budget.ts` (новый)
- Wiring: ~~`src/installer/claude.ts`~~ (removed in v2 — no canonical replacement) (1 вызов в существующей функции `installClaude`)
- Report: `.claude/skills/skills-rules-optimizer/scripts/report.ts` (1 новый метод + 1 строка в render)
- Tests (integration): `tests/e2e/skill-listing-budget.test.ts` (новый)
- Tests (.feature): `tests/features/core/CORE023_skill-listing-budget.feature` (новый, копия из `.specs/skill-listing-budget/skill-listing-budget.feature`)

## Директории и файлы

- `src/installer/skill-budget.ts` — новый
- ~~`src/installer/claude.ts`~~ (removed in v2 — no canonical replacement) — edit (1 import + 1 вызов)
- `.claude/skills/skills-rules-optimizer/scripts/report.ts` — edit (1 метод + 1 render-строка)
- `tests/e2e/skill-listing-budget.test.ts` — новый
- `tests/features/core/CORE023_skill-listing-budget.feature` — новый

## Алгоритм

```
function ensureSkillListingBudget(homeDir = os.homedir()):
  settingsPath = path.join(homeDir, '.claude', 'settings.json')

  // 1. Read existing (handle absent/corrupted)
  let existing: Record<string, unknown> | null
  let parseError = false
  if not fs.existsSync(settingsPath):
    existing = null
  else:
    try:
      raw = fs.readFile(settingsPath, 'utf-8')
      existing = JSON.parse(raw)
    catch (parse error):
      // Backup broken file
      backupPath = '~/.dev-pomogator/.user-overrides/settings.json.broken-{Date.now()}'
      ensureDir(dirname(backupPath))
      fs.copyFile(settingsPath, backupPath)
      existing = null
      parseError = true

  // 2. Decide action
  current = existing?.skillListingBudgetFraction
  rawRepr = JSON.stringify(current).slice(0, 50)  // for invalid case
  newSettings = existing ?? {}

  if existing === null:
    if parseError:
      action = 'invalid-recovered'
      newSettings = { skillListingBudgetFraction: 1.0 }
    else:
      action = 'added'
      newSettings = { skillListingBudgetFraction: 1.0 }
  else if typeof current === 'number' and current === 1.0:
    action = 'unchanged'
  else if typeof current === 'number' and current >= 0 and current < 1.0:
    action = 'bumped'
    newSettings.skillListingBudgetFraction = 1.0
  else:
    // string, null, object, NaN, negative, >1 — all invalid
    action = 'invalid-recovered'
    newSettings.skillListingBudgetFraction = 1.0

  // 3. Write (skip if unchanged)
  if action !== 'unchanged':
    writeJsonAtomic(settingsPath, newSettings)  // temp + fs.move

  // 4. Report line
  switch action:
    case 'added':      reportLine = 'skillListingBudgetFraction: (unset) → 1.0'
    case 'bumped':     reportLine = `skillListingBudgetFraction: ${current} → 1.0`
    case 'unchanged':  reportLine = 'skillListingBudgetFraction: 1.0 (unchanged)'
    case 'invalid-recovered': reportLine = `skillListingBudgetFraction: <invalid: ${rawRepr}> → 1.0`
  report.recordSkillBudget(reportLine)
```

## API

Не applicable — feature не expose внешнего API, только internal function.

### Внутренний API

- `ensureSkillListingBudget(homeDir?: string, report?: InstallReport): Promise<void>` — main entry.
  - `homeDir` опциональный для тестов (default = `os.homedir()`).
  - `report` опциональный — если передан, добавляет line; если нет — пишет в stderr через `chalk`.

## Key Decisions

### Decision: Использовать значение `1.0` (валидатор-максимум), не computed optimum

**Rationale:** User explicit feedback (2026-05-11): "зачем так сложно? считать что-то. просто прописывать максмально возможно скил бюджет". Любое computed значение (сумма descriptions × запас) добавляет сложность подсчёта + расширения списка skills источников + edge cases при изменении model context window. `1.0` — единственное значение которое валидатор Claude Code примет и которое гарантирует zero truncation независимо от количества/размера skills.

**Trade-off:** Каждая сессия загружает ~5k tokens skill descriptions целиком, даже если фактически используется 5. На 200k контексте это 2.5% — для user не критично ("контекста дохуя"), но user с очень маленьким контекстом или платный per-token user может негодовать. Для них — manual override (US-2 — но bump перепишет; нужно вручную каждый раз после updater).

**Alternatives considered:**
- Compute fraction = `sumDescriptionsTokens / contextWindow × 1.2` (запас 20%) — rejected потому что (a) user explicit отверг "считать что-то", (b) изменение skill set требует пересчёта, (c) tokens count зависит от tokenizer Claude — не точно reproducible.
- Поставить умеренный fixed `0.10` (10%, хватит на большинство setups) — rejected потому что не страхует extreme cases (367 skills как в issue #1834 ruvnet/ruflo). `1.0` страхует все.
- Не писать в settings.json, дать `pomogator-doctor` рекомендацию — rejected потому что user хочет автоматический фикс, не recommendation.

### Decision: Bump существующего значения < 1.0 (не сохраняем user-override)

**Rationale:** Primary goal спецификации — никогда не truncate. Если existing value < 1.0, оно по определению allows truncation в некоторых случаях. User может re-set ниже после updater run — это его последнее слово до следующего updater run. Альтернатива (никогда не перетирать) ломает primary goal.

**Trade-off:** Пользователь сознательно поставивший 0.5 для экономии токенов получит unexpected 1.0 после next `dev-pomogator update`. Mitigation: build report line `skillListingBudgetFraction: 0.5 → 1.0` явно показывает действие; CHANGELOG/README документирует поведение.

**Alternatives considered:**
- "Не трогать существующее значение, только добавлять если absent" — rejected, потому что bug возвращается тихо если user когда-то поставил 0.005.
- "Bump только если existing < {recommended computed}" — rejected по той же причине что compute path выше.

### Decision: На corrupted JSON — backup + rewrite с потерей других ключей

**Rationale:** Если `~/.claude/settings.json` уже битый, user уже потерял его как валидный config. Лучше иметь рабочий config с одним правильным ключом + backup битого, чем silent fail. Backup даёт возможность manual recovery.

**Trade-off:** User теряет другие keys в момент install. Mitigation: backup сохраняется, лог явно сообщает; user может вручную merge назад.

**Alternatives considered:**
- "Не трогать битый файл, только log warning" — rejected, потому что primary goal не достигается.
- "Попытаться merge через partial parse / JSON repair lib" — rejected как over-engineering; corrupted settings.json уже редкость.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE [VERIFIED: spec own classification per DESIGN.md template]
**TEST_FORMAT:** BDD [VERIFIED: project convention per `.claude/rules/extension-test-quality.md` 1:1 mapping]
**Framework:** vitest (project default — это integration-первые BDD-style тесты через `describe`/`it` + `.feature` 1:1 mapping per `extension-test-quality` rule)
**Install Command:** already installed (vitest 1.x в `package.json`)
**Evidence:** ~~`tests/e2e/claude-installer.test.ts`~~ + ~~`tests/features/core/CORE003_claude-installer.feature`~~ — существующий pattern integration-first с 1:1 .feature mapping. `tests/e2e/settings-protection.test.ts` + `tests/features/core/CORE005_settings-protection.feature` — точно тот же шаблон для settings.json manipulation.
**Verdict:** TEST_DATA_ACTIVE: тесты пишут в temp `HOME` directory; `beforeEach` создаёт temp HOME, `afterEach` удаляет. Hooks нужны для temp HOME isolation.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/fixtures/pomogator-doctor/temp-home-builder.ts` | helper (utility) | per-test | Создаёт temp HOME, ставит `process.env.HOME`, возвращает path + cleanup | Да — pattern matches наш use case |
| `tests/e2e/settings-protection.test.ts` (inline beforeEach/afterEach) | beforeEach/afterEach | per-test | tempDir + restore env | Да — точно тот же шаблон, можно скопировать |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/skill-listing-budget.test.ts` (inline beforeEach/afterEach) | beforeEach/afterEach | per-test | (1) создаёт temp HOME, (2) populate `~/.claude/settings.json` с фикстурой, (3) afterEach cleanup temp dir | `tests/e2e/settings-protection.test.ts` |

### Cleanup Strategy

- `afterEach`: `fs.removeSync(tempHomeDir)` гарантирует чистый state. При ошибке cleanup — лог warning, не fail test (cleanup not load-bearing).
- `process.env.HOME` восстанавливается из snapshot перед каждым тестом (capture в `beforeAll`).

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| `settings-absent` (no file) | inline (не создаём файл) | UC-1 starting state | per-scenario |
| `settings-with-1.0` | inline JSON `{ "skillListingBudgetFraction": 1.0 }` | UC-2 starting state | per-scenario |
| `settings-with-0.5` | inline JSON `{ "skillListingBudgetFraction": 0.5, "otherKey": "preserved" }` | UC-3 + key preservation | per-scenario |
| `settings-broken` | inline string `"{ skillListingBudgetFraction: }"` (битый JSON) | UC-4 | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tempHomeDir` | `string` | beforeEach | каждый it | Корень изолированной HOME |
| `originalHome` | `string \| undefined` | beforeAll | afterAll | Snapshot оригинального `process.env.HOME` |
