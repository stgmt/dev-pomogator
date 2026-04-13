# Design

## Реализуемые требования

- [FR-1: Linux npx install regression coverage](FR.md#fr-1-linux-npx-install-regression-coverage-feature1)
- [FR-2: Windows npx install regression coverage](FR.md#fr-2-windows-npx-install-regression-coverage-feature2)
- [FR-3: runInstallerViaNpx helper API](FR.md#fr-3-runinstallerviapnpx-helper-api-feature3)
- [FR-4: install-diagnostics spec structure](FR.md#fr-4-install-diagnostics-spec-structure-feature4)
- [FR-5: Cross-references via @featureN tags](FR.md#fr-5-cross-references-via-featuren-tags-feature5)

## Компоненты

- `install-diagnostics` skill — interactive diagnostic guide для пользователей, столкнувшихся с silent install failure. Доступен через `/install-diagnostics` slash command. Содержит 4 mode (A=Win EPERM, B=missing dist, C=installer crash, D=top error) с инструкциями по сбору evidence и рекомендациями по fix-у.
- `runInstallerViaNpx()` helper — спавнит реальный `npx --yes github:stgmt/dev-pomogator` в isolated temp dir, возвращает structured `NpxInstallResult` с evidence для assertions
- `CORE003_18` BDD scenario + integration test — Linux control test, проверяет happy path в Docker CI
- `CORE003_19` BDD scenario + integration test — Windows TDD red regression, проверяет что silent install bug detected (failing-by-design до upstream fix-а)

## Где лежит реализация

- Skill: `.claude/skills/install-diagnostics/SKILL.md` (создан в этой session)
- Helper: `tests/e2e/helpers.ts` (после `runInstaller` на ~строке 55), также `getInstallLogPath` на ~строке 1198 переиспользуется
- BDD scenarios: `tests/features/core/CORE003_claude-installer.feature` (новые сценарии добавляются в конец, после CORE003_CMEM)
- Integration tests: `tests/e2e/claude-installer.test.ts` (новые `describe.skipIf` блоки добавляются перед `afterAll` основного `describe('CORE003: ...', ...)` блока)

## Директории и файлы

- `.claude/skills/install-diagnostics/SKILL.md` — диагностический skill
- `tests/e2e/helpers.ts` — helper `runInstallerViaNpx()` и interface `NpxInstallResult`
- `tests/e2e/claude-installer.test.ts` — 2 новых describe блока
- `tests/features/core/CORE003_claude-installer.feature` — 2 новых scenarios CORE003_18, CORE003_19
- `.specs/install-diagnostics/*.md` — этот спек целиком (13 файлов)

## Алгоритм

1. Test runner запускает `runInstallerViaNpx('--claude --all', { fresh: true })`
2. Helper создаёт `mkdtempSync(os.tmpdir() + '/pom-npx-')` и `mkdtempSync(os.tmpdir() + '/pom-npx-cache-')`
3. Helper читает `fs.statSync(getInstallLogPath()).mtimeMs` если файл существует, иначе `beforeMtime = 0`
4. Helper вызывает `spawnSync('npx', ['--loglevel', 'verbose', '--yes', 'github:stgmt/dev-pomogator', '--claude', '--all'], { cwd: tempDir, env: { ...process.env, NPM_CONFIG_CACHE: tempCache, FORCE_COLOR: '0' }, input: 'y\n', timeout: 120_000 })`
5. Helper парсит `result.stderr.split('\n').filter(line => /npm warn cleanup/i.test(line))` → `cleanupWarnings: string[]`
6. Helper walks `tempCache/_npx/*/node_modules/dev-pomogator/package.json` чтобы установить `cachePopulated: boolean`
7. Helper читает `fs.statSync(getInstallLogPath()).mtimeMs` после run → `afterMtime`
8. Helper возвращает `{ stdout, stderr, exitCode, cleanupWarnings, cachePopulated, installerLogTouched: afterMtime > beforeMtime, tempDir, tempCache }`
9. Test code (`describe.skipIf` блоки) делает assertions на полях result

## API

### runInstallerViaNpx

```typescript
function runInstallerViaNpx(
  args?: string,                    // default '--claude --all'
  options?: { fresh?: boolean }     // default {}
): Promise<NpxInstallResult>

interface NpxInstallResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  cleanupWarnings: string[];
  cachePopulated: boolean;
  installerLogTouched: boolean;
  tempDir: string;
  tempCache: string | null;
}
```

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**Classification:** TEST_DATA_ACTIVE
**Evidence:** (1) ДА — helper создаёт temp dirs и temp NPM cache, mutates filesystem; (2) ДА — нужно cleanup tempDir/tempCache после теста; (3) ДА — Given-шаги предполагают чистый temp dir и fresh npm cache; (4) НЕТ — внешний npm registry и github.com используются как есть, без mock-ов (по правилу `no-mocks-fallbacks`).
**Verdict:** Нужны hooks для `beforeAll` (создание isolated state — но это уже встроено в `runInstallerViaNpx({ fresh: true })`) и `afterAll` (cleanup tempDir/tempCache).

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/claude-installer.test.ts` | beforeAll | describe('CORE003: ...') | вызывает `setupCleanState('claude')` + `runInstaller('--claude --all')` для тестов CORE003_01..CORE003_CMEM | Нет — CORE003_18/19 используют `runInstallerViaNpx()` вместо `runInstaller()` (разные code paths: spawnSync npx vs spawnSync node dist/index.js) |
| `tests/e2e/helpers.ts` (`setupCleanState`) | utility | per-test | Удаляет HOME и project Claude artefacts | Не нужен — `runInstallerViaNpx({ fresh: true })` уже изолирует через `mkdtempSync` |

### Новые hooks

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/claude-installer.test.ts` | beforeAll | describe('CORE003_18: ...') | `runInstallerViaNpx('--claude --all', { fresh: true })`, сохраняет result в локальную переменную для it-блоков | inline-pattern существующего `beforeAll` в parent describe |
| `tests/e2e/claude-installer.test.ts` | beforeAll | describe('CORE003_19: ...') | то же что CORE003_18, но run на Windows host (skipIf) | то же |
| `tests/e2e/claude-installer.test.ts` | afterAll | describe('CORE003_18: ...') | `fs.rmSync(result.tempDir, { recursive: true, force: true })` + `if (result.tempCache) fs.rmSync(result.tempCache, ...)` | стандартный cleanup после интеграционного теста |
| `tests/e2e/claude-installer.test.ts` | afterAll | describe('CORE003_19: ...') | то же | то же |

### Cleanup Strategy

1. После завершения каждого `describe.skipIf` блока — `afterAll` удаляет `result.tempDir` и `result.tempCache` (если non-null)
2. Если test crash до достижения afterAll — temp dirs остаются в `os.tmpdir()` до OS-cleanup. Это intentional: failing tests benefit от inspection leftover state
3. Не кэшируем npx результаты между runs — `{ fresh: true }` гарантирует isolation
4. `~/.dev-pomogator/logs/install.log` НЕ модифицируется helper-ом directly, только наблюдается mtime — поэтому не нужен restore после теста

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Temp working dir | `os.tmpdir()/pom-npx-XXXXXX` | cwd для npx subprocess | per-describe (один на CORE003_18 или CORE003_19) |
| Temp NPM cache | `os.tmpdir()/pom-npx-cache-XXXXXX` | NPM_CONFIG_CACHE override (только при `{ fresh: true }`) | per-describe |
| GitHub tarball | `https://codeload.github.com/stgmt/dev-pomogator/tar.gz/<HEAD>` | source code dev-pomogator | external, downloaded by npm |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `result` (local var) | `NpxInstallResult` | `beforeAll` of CORE003_18/19 | `it()` блоки внутри того же describe | Передача результата npx run между beforeAll и assertions |
| `installerLogPath` | `string` | helper internal (`getInstallLogPath()`) | helper internal | Cross-platform path к install.log |
