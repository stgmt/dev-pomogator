# Use Cases

## UC-1: Linux control test passes in Docker CI

Docker test runner запускает `npm test -- claude-installer` на Linux в контейнере. Linux control test CORE003_18 проверяет что цепочка `npx → bin → installer → install.log` отрабатывает end-to-end без warnings.

- CI пайплайн запускает `bash scripts/docker-test.sh`
- Docker container выполняет `vitest run tests/e2e/claude-installer.test.ts`
- Vitest вызывает `runInstallerViaNpx('--claude --all', { fresh: true })` в `describe('CORE003_18', ...)` блоке
- Helper создаёт temp dir, fresh `NPM_CONFIG_CACHE`, запускает `npx --loglevel verbose --yes github:stgmt/dev-pomogator --claude --all`
- npx скачивает tarball с github.com, npm reify установит пакет в `_npx/<hash>/node_modules/dev-pomogator/`
- Bin запускается, dev-pomogator main() выполняется, печатает rocket banner, install.log обновляется
- **Результат**: тест PASS, exitCode === 0, все 6 assertions довольны, `cleanupWarnings.length === 0`

## UC-2: Windows regression test fails on Windows host (TDD red — current state)

Разработчик на Windows host запускает CORE003_19 регрессионный тест. Тест намеренно failing-by-design до upstream fix-а silent install bug-а.

- Разработчик: `cd D:\repos\dev-pomogator && npx vitest run tests/e2e/claude-installer.test.ts -t "CORE003_19"`
- Vitest определяет `process.platform === 'win32'`, не пропускает блок (skipIf проходит)
- `runInstallerViaNpx('--claude --all', { fresh: true })` вызывается
- npm reify хитает EPERM на `@inquirer/external-editor/dist/esm` → cleanup warnings → exit 2 → bin не извлекается
- Assertions падают: exitCode === 2 (ожидалось 0), stdout пустой, installerLogTouched === false, cachePopulated === false, cleanupWarnings.length > 0
- **Результат**: тест FAIL с понятным сообщением включая ссылку на `.specs/install-diagnostics/RESEARCH.md`. Разработчик понимает: bug всё ещё актуален, не нужно тратить время на повторную диагностику

## UC-3: Windows regression test passes after upstream fix (post-fix state)

Через N месяцев upstream npm fix исправляет EPERM на reify cleanup ИЛИ dev-pomogator переходит на bundled installer без deep @inquirer deps. Разработчик хочет verify что fix действительно работает.

- Разработчик обновляет npm до версии с fix-ом ИЛИ применяет local workaround
- Запускает: `npx vitest run tests/e2e/claude-installer.test.ts -t "CORE003_19"`
- `runInstallerViaNpx()` теперь успешно завершает npm reify
- exitCode === 0, rocket banner печатается, install.log touched, cache populated, нет cleanup warnings
- **Результат**: тест PASS без изменения assertions. Это сигнал что bug fixed. Разработчик может закрыть upstream issue / удалить workaround mention из RESEARCH.md

## Edge Cases

### Edge: cleanup warnings присутствуют, но dev-pomogator установлен полностью

Очень редкий случай: npm reify хитает cleanup EPERM на одной из inner dirs (например `@inquirer/core/dist`), но **успевает извлечь** dev-pomogator до этого. В таком случае:

- exitCode может быть 0 (если cleanup не fail-фактал)
- cachePopulated === true
- installerLogTouched === true
- НО cleanupWarnings.length > 0

Тест FAIL на assertion `cleanupWarnings.length === 0`, что **корректно** — даже если функционально работает, наличие warnings указывает на потенциальную регрессию. Разработчик увидит это в test output и может решить: либо расслабить assertion (если bug fixed но warnings остаются), либо искать root cause.

### Edge: ~/.dev-pomogator/logs/install.log существует от прошлого запуска

Helper НЕ полагается на наличие/отсутствие файла, а сравнивает **mtime** до и после запуска. Это критично, потому что:
- В CI Docker контейнере install.log может быть от предыдущего test run в том же job
- На Windows host install.log часто существует от ручных установок пользователя

`installerLogTouched = afterMtime > beforeMtime` — корректно работает в обоих случаях.

### Edge: npx падает на network error (не EPERM)

Если GitHub недоступен или npm registry медленный, `spawnSync` может вернуть exitCode != 2. В таком случае:
- cleanupWarnings === [] (нет EPERM, есть network error)
- exitCode = 1 (или другой network exit code)
- stderr содержит `ECONNRESET` / `ETIMEDOUT` / `404`

Test FAIL, но не на CORE003_19-specific assertion (`cleanupWarnings.length === 0`). Test report покажет network error в stderr — разработчик может re-run и не считать это регрессией.

---

# Second Failure Mode Use Cases (2026-04-20, @feature6)

## UC-4: Prompt-race detection @feature6

**Real-world scenario (2026-04-20 diagnostic session):** юзер на Windows PowerShell запустил `npx github:stgmt/dev-pomogator --claude` cold (npx cache очищен). npm показал `Need to install the following packages: github:stgmt/dev-pomogator. Ok to proceed? (y)` — юзер ввёл `y`, но PS prompt вернулся без каких-либо сообщений, установка не произошла.

- Юзер запускает `/install-diagnostics`
- Skill собирает evidence через Read/Glob:
  1. `ls ~/AppData/Local/npm-cache/_npx/` → находит папку `eade2dc1c54870ea/` created Apr 20 15:13
  2. `ls ~/AppData/Local/npm-cache/_npx/eade2dc1c54870ea/` → **empty** (нет `node_modules/`, нет `package.json`)
  3. `stat -c %Y ~/.dev-pomogator/logs/install.log` → Apr 18 02:39 (2 дня назад, не advanced)
  4. `~/.dev-pomogator/last-install-report.md` mtime тоже Apr 18
  5. Skill re-reproduces с `--yes` flag в isolated temp cache → exit 0, install.log advances, 17 плагинов установлены
- Skill сравнивает evidence: empty npx hash folder + log mtime stale + `--yes` reproduction success = **Mode B**
- Output: `Mode: B — npm Confirmation Prompt Race` + citation npm/cli#7147 + recommended fix `npx --yes github:stgmt/dev-pomogator --claude`
- Юзер запускает рекомендованное — получает 17 плагинов и зелёный install.log

## UC-5: Docs hardening prevents silent failure @feature6

**Prevention scenario:** новый пользователь Windows открывает repo README, видит `## Quick Install: npx --yes github:stgmt/dev-pomogator --claude`. Копирует, запускает — работает без prompt.

- Репо contributor открыл PR, добавивший новый extension `extensions/new-ext/README.md` с примером `npx github:stgmt/dev-pomogator --claude` (без `--yes`)
- CI runs `tools/lint-install-commands.ts` → grep regex `/npx\s+(?!--?yes\s+|-y\s+)...dev-pomogator/` матчит
- Build fails с error:
  ```
  Install command lint failed:
    extensions/new-ext/README.md:12 — `npx github:stgmt/dev-pomogator --claude`
    Reason: missing --yes flag (prevents npm/cli#7147 prompt race on Windows PowerShell)
    Replace with: `npx --yes github:stgmt/dev-pomogator --claude`
  ```
- Contributor fix-ит PR, commit, CI green → merge
- Downstream users копируют safe command → no silent failure

## UC-6: CI lint rule catches regression @feature6

**Regression prevention scenario:** через 3 месяца drive-by PR редактирует `CLAUDE.md` и случайно убирает `--yes` из одного примера.

- PR opens, CI запускает docs-lint test
- Test fails на `CLAUDE.md:45 — npx github:stgmt/dev-pomogator --claude` (без --yes)
- PR author видит failure reason + suggested replacement
- Исправляет → CI green → merge
- Альтернатива без FR-8: regression просачивается в docs, следующий user копирует, хитит silent failure, тратит час на диагностику — лишние support tickets
