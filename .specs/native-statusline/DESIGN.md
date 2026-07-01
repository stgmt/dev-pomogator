# Design

## Реализуемые требования

- [FR-1: Reconciler](FR.md#fr-1-reconciler-slot-classification)
- [FR-2: Atomic writer](FR.md#fr-2-atomic-conditional-writer)
- [FR-3: SessionStart hook](FR.md#fr-3-native-statusline-sessionstart-hook)
- [FR-4: Ownership marker](FR.md#fr-4-ownership-marker)
- [FR-5: Opt-out switch](FR.md#fr-5-opt-out-switch)
- [FR-6: Hook registration](FR.md#fr-6-hook-registration)
- [FR-7: Doctor check + fix](FR.md#fr-7-doctor-check-and-fix-action)
- [FR-8: Idempotent + fail-open](FR.md#fr-8-idempotent-and-fail-open)
- [FR-9: Domain separation](FR.md#fr-9-domain-separation-guard)

## Компоненты

- `reconcileStatusLine(existing)` — чистая функция классификации слота (install/noop/keep-user).
- `writeNativeStatusLine(home?)` — read-modify-write settings.json + atomic write; возвращает поля changed и action.
- `install_native_statusline.ts` — SessionStart-хук: stdin → writer → systemMessage/exit 0.
- doctor check `statusline.ts` + fix-action — переиспользует `writeNativeStatusLine`.

## Где лежит реализация

- App-код: `tools/native-statusline/reconcile-statusline.ts`, `tools/native-statusline/install_native_statusline.ts`
- Wiring: `.claude-plugin/hooks.json` (canonical), `.claude/settings.json` (dogfood)
- Doctor: `.claude/skills/pomogator-doctor/scripts/engine/checks/statusline.ts`
- Runtime target: `~/.claude/settings.json` → `statusLine`
- НЕ трогать (другой домен): `tools/test-statusline/`

## Директории и файлы

- `tools/native-statusline/reconcile-statusline.ts`
- `tools/native-statusline/install_native_statusline.ts`
- `.claude/skills/pomogator-doctor/scripts/engine/checks/statusline.ts`
- `tests/e2e/native-statusline.test.ts`
- `tests/features/native-statusline.feature` (или `tests/features/plugins/...`)

## Алгоритм

1. SessionStart → хук читает stdin-JSON; если `DEV_POMOGATOR_STATUSLINE=off` → exit 0 без записи.
2. Читает `~/.claude/settings.json` (если нет/битый → tr-catch). Env `DEV_POMOGATOR_STATUSLINE` [VERIFIED: spec-defined env var, prefix `DEV_POMOGATOR_*` уже используется в `tools/` — см. RESEARCH.md CL-5].
3. `reconcileStatusLine(settings.statusLine?.command)` → action.
4. `install` → set `settings.statusLine = {type:'command', command: DEFAULT}` → atomic write (temp+rename); `changed=true`.
5. `noop`/`keep-user` → нет записи; `changed=false`.
6. Если `changed` → вернуть hook JSON с `systemMessage`; иначе `{}`. Всегда exit 0.
7. doctor: check читает settings.json → если нет statusLine → needs-fix; fix-action зовёт тот же writer немедленно.

## API

### reconcileStatusLine

- Signature: `reconcileStatusLine(existing: string | undefined): { action: 'install'|'noop'|'keep-user'; command: string }`
- Pure, no I/O.

### writeNativeStatusLine

- Signature: `writeNativeStatusLine(opts?: { home?: string; env?: NodeJS.ProcessEnv }): { changed: boolean; action: string }`
- Reads the `.claude/settings.json` under the given home dir, applies reconciler, atomic-writes only on `install`.

## Key Decisions

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2. Hook `design-decision-guard` enforces format.

### Decision: Новый домен `tools/native-statusline/`, не расширение `tools/test-statusline/`

**Rationale:** Нативный statusLine (ccstatusline, git/model) и прогресс тестов (TUI compact_bar) — два разных продукта с разными контрактами; смешение уже привело к путанице (verify-render-target rule). Отдельная папка + отдельный хук = чистая граница, отдельные тесты, независимый opt-out.

**Trade-off:** Появляется второй SessionStart-хук (чуть больше хуков в реестре) вместо переиспользования существующего.

**Alternatives considered:**
- Дописать в `tools/test-statusline/statusline_session_start.ts` — rejected: смешивает домены, нарушает verify-render-target, риск регрессии в прогрессе тестов.
- Один общий «statusline» модуль на оба домена — rejected: контракты несовместимы (YAML-протокол vs settings.json статичная команда).

### Decision: SessionStart-хук + reconciler вместо декларации в plugin.json

**Rationale:** Canonical plugin.json не умеет объявлять главный statusLine (только subagentStatusLine), install-события в API нет — единственный путь записать в user settings.json это хук с кодом (подтверждено spec + эталон pardes).

**Trade-off:** Строка появляется только со следующей сессии (settings читаются до хука); немедленность — лишь через doctor fix-action.

**Alternatives considered:**
- Декларация `statusLine` в plugin.json — rejected: поле не поддерживается (спек).
- Plugin `settings.json` merge — rejected: allowlist только `agent`+`subagentStatusLine`.
- Вернуть npx-инсталлер v1 — rejected: deprecated, не запускается в canonical install.

### Decision: Ownership-маркер = подстрока `ccstatusline` в command

**Rationale:** Простой стабильный признак «наша строка»; не требует отдельного marker-комментария в JSON (settings.json — строгий JSON без комментариев). Любая команда с `ccstatusline` считается нашей/совместимой → noop, не перетираем.

**Trade-off:** Если пользователь вручную поставил свой `ccstatusline`-вариант, мы посчитаем его «нашим» и не тронем (что безопасно — keep semantics), но и не «обновим».

**Alternatives considered:**
- Отдельное поле-маркер в settings.json (`_devPomogatorStatusline: true`) — rejected: загрязняет user config нестандартным ключом.
- Хранить маркер в `.dev-pomogator/` state-файле — rejected: лишний source of truth, рассинхрон с реальным settings.json.

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE
**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** vitest ^4.1.0 с 1:1 `.feature`↔`it()` mapping (конвенция dev-pomogator, `extension-test-quality` rule) — НЕ Reqnroll/Cucumber.js (детектор дал false-positive на C#-фикстуре, см. RESEARCH.md)
**Install Command:** already installed (vitest в devDependencies; запуск `bash scripts/docker-test.sh` через `/run-tests`)
**Evidence:** `tests/e2e/*.test.ts` + `tests/features/**/*.feature`; package.json `vitest ^4.1.0`; RESEARCH.md "BDD framework detection — corrected"
**Verdict:** Нужны per-scenario temp HOME (mkdtemp) + isolated `~/.claude/settings.json` fixture, cleanup после каждого сценария. Хук вызывается через `spawnSync` (integration-tests-first), не import-only.

> ⚠️ **Граница автотестов (verify-against-real-artifact).** spawnSync-тесты доказывают только что
> хук **пишет корректный `statusLine` в settings.json** — они НЕ доказывают, что Claude Code
> реально **рендерит строку** из этого поля. Рендеринг — поведение самого Claude Code, не нашего
> кода. Поэтому баг считается закрытым ТОЛЬКО после ручной end-to-end проверки: реальный
> `/plugin install` → reload/restart → наблюдать строку статуса (см. Manual Verification ниже и
> TASKS Phase 5 final verification). Зелёные автотесты ≠ «строка вернулась у юзеров».

### Manual Verification (обязательна для закрытия бага)

1. Чистый профиль без `statusLine` в `~/.claude/settings.json`.
2. `/plugin install dev-pomogator@stgmt` → `/reload-plugins` или restart → новая сессия (хук пишет).
3. Ещё одна новая сессия (settings уже с нашим `statusLine`) → **визуально подтвердить, что строка ccstatusline рендерится** (CONFIRMED/DENIED per screenshot-driven-verification).
4. Проверить idempotent: повторные сессии не плодят записи; кастомная чужая строка не перетёрта.
5. Подтвердить, что `systemMessage` реально показывается Claude Code на SessionStart (output-схема непроверена — тест проверяет лишь наш контракт stdout). Если не surface-ится → переключить хук на `hookSpecificOutput: { hookEventName: "SessionStart", additionalContext }`. На запись statusLine это НЕ влияет — только на видимость уведомления.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/helpers.ts` | shared helpers | — | spawn/json helpers для e2e | Да — переиспользовать spawn helper (no-test-helper-duplication) |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/native-statusline.test.ts` (beforeEach/afterEach) | setup/teardown | per-scenario | mkdtemp temp HOME + isolated settings.json, rm после | существующие e2e тесты с temp dirs |

### Cleanup Strategy

Каждый сценарий: `mkdtempSync` → собственный HOME → прогон → `rmSync(recursive)` в afterEach. Нет глобального состояния; параллельные тесты изолированы своим HOME.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| empty settings.json | temp HOME (генерится в тесте) | пустой слот (US1) | per-scenario |
| settings.json с чужой statusLine | temp HOME (генерится) | keep-user (US2) | per-scenario |
| битый settings.json | temp HOME (генерится) | fail-open (US5) | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `tmpHome` | string (path) | beforeEach | каждый it() | изоляция HOME/settings.json на сценарий |
