# Use Cases

## UC-1: Happy path — всё окружение в порядке @feature1

Пользователь клонит проект где dev-pomogator уже установлен, делает `npm install`, в течение первого `SessionStart` hook запускается и Doctor проверяет все 14 категорий.

- Пользователь: `git clone ...` → `npm install` → `claude code`
- Claude Code вызывает SessionStart hook → `doctor-hook.ts --quiet`
- Doctor запускает 14 checks параллельно (Node ≥ 22.6, Git, `~/.dev-pomogator/{config,scripts,tools}`, hooks registry, envRequirements, .env.example, Bun, Python+chromadb, MCP parse, MCP Full probe, version match, managed gitignore block)
- Все checks возвращают severity `ok`
- Результат: stdout `{"continue":true,"suppressOutput":true}`, exit 0, в chat ничего не появляется

## UC-2: Missing tools → предложение переустановки @feature2

Пользователь ставит репозиторий на новой машине, но файлы `~/.dev-pomogator/tools/*` не успели создаться (или удалены случайно). Hooks ссылаются на несуществующие пути.

- Пользователь: `/pomogator-doctor` (slash-command, interactive mode)
- Doctor: C3 (`~/.dev-pomogator/config.json`) → ✗ critical `reinstallable: yes`
- Doctor: C5 (`~/.dev-pomogator/tools/auto-commit/`) → ✗ critical `reinstallable: yes`
- Reporter выводит chalk-таблицу: 2 critical reinstallable findings
- Doctor вызывает AskUserQuestion "Found 2 problems that can be fixed by reinstall. Run `npx dev-pomogator` now?" с опциями [Reinstall now | Show details only]
- Пользователь выбирает "Reinstall now"
- Doctor спавнит `npx dev-pomogator` через `child_process.spawn` с `stdio: 'inherit'`
- Installer восстанавливает `~/.dev-pomogator/tools/*`, exit 0

## UC-3: Missing API key — переустановка не поможет @feature3

Пользователь склонил проект, но не скопировал `.env.example` → `.env`. `AUTO_COMMIT_API_KEY` не задан — auto-commit hook падает с missing credential.

- Пользователь: `dev-pomogator --doctor`
- Doctor: C7 (envRequirements) → ✗ critical `reinstallable: no`, hint `"Add AUTO_COMMIT_API_KEY=... to .env (see .env.example line 3)"`
- Reporter выводит chalk-таблицу, выделяет отдельным блоком **non-reinstallable critical** (1 штука)
- Doctor **не предлагает** переустановку (нет reinstallable critical findings)
- Exit 2 (critical)

## UC-4: SessionStart silent when OK @feature4

Пользователь постоянно открывает Claude Code в здоровом проекте. Doctor не должен захламлять chat.

- Claude Code запускает SessionStart → `doctor-hook.ts --quiet`
- Все 14 checks `ok`
- stdout: `{"continue":true,"suppressOutput":true}`
- В chat — пусто; в логе `~/.dev-pomogator/logs/doctor.log` — последний timestamp + `OK`

## UC-5: SessionStart banner on problem @feature4

Пользователь вчера удалил `~/.claude/mcp.json` — MCP сервер `context7` теперь не сконфигурирован, но правила `.claude/rules/*` всё ещё ссылаются на `mcp__context7__*` инструменты.

- Claude Code запускает SessionStart → doctor-hook с `--quiet`
- Doctor: C11 (MCP parse) → ✗ warning "context7 referenced in rules but not configured in .mcp.json / ~/.claude/mcp.json"
- stdout: `{"continue":true,"additionalContext":"⚠ pomogator-doctor: 1 MCP server missing (context7), run /pomogator-doctor for details"}`
- В chat появляется короткий баннер, пользователь может вызвать `/pomogator-doctor` для подробностей

## UC-6: MCP probe timeout @feature4

Пользователь сконфигурировал MCP сервер, но процесс сервера висит (например deadlock при initialize).

- Doctor: C12 (MCP Full probe) спавнит stdio сервер, отправляет `initialize` + `tools/list`, ждёт 3s
- Сервер не отвечает за 3s → hard timeout, `child.kill('SIGKILL')`
- Результат: ✗ `reinstallable: no`, hint `"MCP server probe failed: timeout after 3s. Check server logs, try restart Claude Code."`

## UC-7: Version mismatch → переустановка @feature2

Пользователь обновил dev-pomogator через `npm install dev-pomogator@latest`, но не запускал installer — `~/.dev-pomogator/config.json` содержит старую версию.

- Doctor: C13 (version match) → `package.json` `1.5.0` vs `~/.dev-pomogator/config.json` `1.3.0` → ✗ critical `reinstallable: yes`
- AskUserQuestion → Reinstall now
- Spawn `npx dev-pomogator` → installer пересинхронизирует tools/hooks/config

## UC-8: CI mode — machine-readable output @feature8

DevOps инженер запускает Doctor на build-агенте в GitHub Actions.

- CI: `dev-pomogator --doctor --json`
- Doctor не печатает chalk, выводит JSON: `[{"id":"C1","severity":"ok","name":"Node version",...}, {"id":"C7","severity":"critical","reinstallable":false,"hint":"..."}]`
- Security: env var **values** redact-нуты в JSON (показано только `name + [set|unset]`)
- Exit code 2 (есть critical) → pipeline падает, сборка блокируется

## UC-9: Commands/Skills не зарегистрированы в plugin-loader @feature10

Пользователь жалуется "вчера `/create-spec` работал, сегодня пропал". Установка физически есть, но Claude Code не видит команду.

- Пользователь: `/pomogator-doctor`
- Doctor: C15 (commands/skills loader check) — читает `.dev-pomogator/.claude-plugin/plugin.json` → собирает список declared commands (`create-spec`, `reflect`, `suggest-rules`, ...) и skills (18 штук)
- Для каждой команды проверяет: (a) файл физически существует в `.claude/commands/` ИЛИ в plugin registry (`~/.claude/plugins/`), (b) Claude Code plugin-loader видит её (heuristic: файл readable + frontmatter валиден)
- Результат: `/create-spec` — declared в plugin.json, но `.claude/commands/create-spec.md` не существует **и** не в plugin registry
- Severity ✗ critical `reinstallable: yes`, hint `"plugin-loader missing commands — run 'npx dev-pomogator' to re-register"`

## UC-10: Traffic-light отчёт по установленным extensions @feature9

Junior разработчик хочет быстро понять готовность окружения.

- Пользователь: `/pomogator-doctor`
- Doctor драйвит checks из `config.installedExtensions` (8 установленных из 18 возможных)
- Reporter группирует output по 3 категориям:
  - 🟢 **Self-sufficient (работают сразу)**: auto-simplify ✓, bg-task-guard ✓, plan-pomogator ✓, specs-workflow ✓, test-quality ✓
  - 🟡 **Needs env vars**: auto-commit (AUTO_COMMIT_API_KEY **unset** → add to .env), prompt-suggest (same)
  - 🔴 **Needs external deps**: claude-mem-health (Bun missing + chromadb missing)
- Каждая группа — отдельный chalk-блок со своим цветом, сводная таблица внизу

## UC-11: Per-extension gated checks @feature11

Пользователь установил только `plan-pomogator` и `auto-commit`. Doctor не должен требовать Python/Bun/Docker — эти extensions их не используют.

- Doctor читает `config.installedExtensions`: [`plan-pomogator`, `auto-commit`]
- Для каждого extension читает `dependencies` поле из `extension.json` (новое поле — spec его описывает): `{node: ">=22.6", envRequirements: [...], pythonPackages: [...], binaries: [...]}`
- Doctor запускает **только** checks которые relevant для installed set:
  - C1 (Node) — всегда relevant
  - C7 (envRequirements) — relevant (auto-commit требует AUTO_COMMIT_API_KEY)
  - C9 (Bun) — **пропущен**, ни один installed extension не требует
  - C10 (Python+chromadb) — **пропущен**
- Отчёт: "14 possible checks, 7 relevant for your 2 installed extensions, 6 ok, 1 critical"

## UC-12: API key в settings.local.json env fallback @feature3

Пользователь поставил `AUTO_COMMIT_API_KEY` в `.claude/settings.local.json → env` блок (а не в `.env`) — согласно рекомендации из README.

- Doctor: C7 (env vars) — проверяет **оба** источника:
  1. `process.env.AUTO_COMMIT_API_KEY` (из `.env` через dotenv или shell export)
  2. Parse `.claude/settings.local.json` → `env.AUTO_COMMIT_API_KEY`
- Если хоть в одном есть — ✓ ok
- Если ни в одном — ✗ critical, hint `"Set AUTO_COMMIT_API_KEY in .env OR .claude/settings.local.json env block"`

---

# Post-Launch Use Cases (2026-04-20)

## UC-13: Hook storm on broken project @feature12

**Real-world scenario (webapp, 2026-04-20):** пользователь работает в `D:\repos\webapp`, после каждого ответа Claude в чате появляется стена из 8+ `ERR_MODULE_NOT_FOUND` для хуков `auto_commit_stop.ts`, `simplify_stop.ts` и др. Суммарно в `settings.local.json` зарегистрировано 22 хука (5 events), файлы тулов физически отсутствуют в `.dev-pomogator/tools/` (директория существует, но содержит только `tui-test-runner/`).

- Пользователь: `/pomogator-doctor` в webapp
- Doctor парсит `.claude/settings.local.json → hooks` (array format с matcher+hooks[]), извлекает relative пути из команд формата `node -e "..." -- ".dev-pomogator/tools/X/Y.ts"` и из `bash .dev-pomogator/tools/X/Y.sh`
- Для 21 из 22 команд `fs.existsSync(path.join(cwd, extractedPath))` → false
- Doctor emit C20 groupby event: `Stop: 8 missing; SessionStart: 4 missing; PreToolUse: 4 missing; UserPromptSubmit: 4 missing; PostToolUse: 1 missing` (всего 21 critical); 1 хук на `tui/tui_stop.ts` всё-таки находится частично → ещё один critical
- AskUserQuestion → Reinstall now → `spawn('npx', ['dev-pomogator'])` восстанавливает `.dev-pomogator/tools/*`
- Exit 2 → reinstall → retry doctor → всё green

## UC-14: Partial wipe of managed files @feature12

**Real-world scenario:** `webapp/.dev-pomogator/tools/tui-test-runner/tui/` существует, но top-level `tui_stop.ts` нет. Частичный wipe — подпапки остались, root-files пропали. Простой `fs.existsSync('.../tui-test-runner/')` возвращает true (false negative у C5).

- Doctor: C21 итерирует `installedExtensions[ext=tui-test-runner].managed[webapp].tools[]` — каждый `entry.path` индивидуально проверяется на диске
- `.dev-pomogator/tools/tui-test-runner/tui_stop.ts` → missing → critical reinstallable
- `.dev-pomogator/tools/tui-test-runner/tui/compact_bar.py` → present → hash check → ok
- Report показывает **файл-level granularity** отсутствия, а не dir-level (как в старом C5)

## UC-15: Content hash drift between projects @feature12

**Real-world evidence:** `config.json` для одного файла `auto_commit_stop.ts`:
- dev-pomogator hash: `f4ea8b61d79108fe013495439fc4ba8f4b72672c9b0df0c7dc61895fdebdf41c`
- webapp hash: `33b4e963d89c7ddf9a435d570074f6a011bf26005b19bee3d3cb2054a253ba7d`

Два разных SHA-256 → либо разные версии extension установлены в разное время, либо user edited один из них.

- Doctor запущен в webapp: FR-27 пересчитывает sha256 от `.dev-pomogator/tools/auto-commit/auto_commit_stop.ts` (после reinstall), сравнивает с `managed[webapp].tools[auto_commit_stop.ts].hash = 33b4e963...`
- Если файл пересобран reinstaller-ом → hash matches → ok
- Если user отредактировал после install → mismatch → warning `"file modified since install (user edit or version drift)"` + hint "compare with `extensions/auto-commit/tools/auto_commit_stop.ts` in source"
- Apply rule `updater-managed-cleanup`: на следующем reinstall user changes бэкапятся в `.dev-pomogator/.user-overrides/` перед overwrite

## UC-16: Cross-project scan @feature12

**Real-world scenario:** пользователь в cwd=`dev-pomogator`, получает `ERR_MODULE_NOT_FOUND` spam от сессии в webapp (которая сломана) — но из cwd=dev-pomogator `/pomogator-doctor` показывает зелёный отчёт про dev-pomogator.

- Пользователь: `dev-pomogator --doctor --all-projects`
- Doctor читает `config.installedExtensions[*].projectPaths` → union `[D:\\repos\\dev-pomogator, D:\\repos\\webapp]` (deduplicated)
- Параллельный run (concurrency 4) для каждого projectPath: per-project CheckContext с `projectRoot` установленным соответствующе
- Output:
  ```
  === D:\repos\dev-pomogator ===
  🟢 Self-sufficient: 8 ok
  🟡 Needs env vars: 1 critical (AUTO_COMMIT_API_KEY)
  Summary: 8 ok, 0 warnings, 1 critical

  === D:\repos\webapp ===
  🟢 Self-sufficient: 3 ok
  🔴 Critical: C20 hook integrity — 21 missing files
  🔴 Critical: C21 managed files — 24 missing
  Summary: 3 ok, 0 warnings, 2 critical

  Scanned 2 projects: 0 fully healthy, 2 with issues
  ```
- Exit code 2 (max across projects)

## UC-17: Self-install detection @feature12

**Real-world evidence:** `~/.dev-pomogator/config.json`.`installedExtensions[*].name` содержит 17 extensions, но `pomogator-doctor` среди них НЕТ. Значит SessionStart doctor hook не ставился ни в одну projectPath, и проактивный баннер никогда не сработает.

- Doctor: FR-29 check
  - Step (a): `installedExtensions.find(e => e.name === 'pomogator-doctor')` → undefined → WARNING
  - Report: severity=warning, hint "proactive broken-install detection disabled — reinstall to enable SessionStart doctor banner"
- После reinstall (который будет включать pomogator-doctor extension автоматически) — SessionStart hook появится в target projectPaths, следующая сессия в webapp покажет баннер "⚠ pomogator-doctor: N issues detected, run /pomogator-doctor" без необходимости пользователю вручную догадаться

## UC-18: Stale managed entries @feature12

Сценарий после удаления extension: пользователь запускает `npx dev-pomogator uninstall --extension=legacy-tool`, но config.json всё ещё хранит `managed[projectPath].tools[]` entries с `legacy-tool/...` путями.

- Doctor: FR-34 cross-reference
  - Extract distinct tool-dirs из managed paths: `{auto-commit, auto-simplify, ..., specs-validator, legacy-tool}`
  - Валидный набор:
    - installed extension names: `{auto-commit, auto-simplify, ...}`
    - sub-tool dirs из `extension.json → tools`: `specs-workflow → {specs-generator, specs-validator, steps-validator, mcp-setup}`, `test-statusline → {test-statusline, bg-task-guard}`
  - Orphans = `{legacy-tool}` — не в валидном наборе
- Emit severity=warning, hint "managed entries orphaned from removed/renamed extension: legacy-tool; reinstall will prune stale references"
- Anti-false-positive: `specs-validator` распознан как sub-tool `specs-workflow` → НЕ считается orphan
