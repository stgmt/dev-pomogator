# Functional Requirements (FR)

## FR-1: Persistent log для docker-test.sh output

Скрипт `scripts/docker-test.sh` ОБЯЗАН писать полный stdout+stderr прогона vitest в persistent файл `.dev-pomogator/.docker-status/test-run-<timestamp>.log` **одновременно** с forward'ом в родительский stdout. Файл создаётся в начале прогона и остаётся на диске после exit (не удаляется trap cleanup). Параллельная запись через `tee` в pipeline не меняет exit code благодаря уже активному `set -o pipefail`.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-long-running-docker-test-в-background-с-persistent-log), [UC-3](USE_CASES.md#uc-3-recovery-инцидента--читаем-persistent-log)

## FR-2: Обновить rule `no-blocking-on-tests` — запрет naked `| tail` в bg

Файл `.claude/rules/pomogator/no-blocking-on-tests.md` ОБЯЗАН явно документировать anti-pattern `<long-cmd> 2>&1 | tail -N` с `run_in_background: true` и safe replacement (`| tee /tmp/full.log | tail -N` ИЛИ `&> /tmp/full.log; tail -N /tmp/full.log`). Секция "Anti-patterns" с reasoning (три hypotheses почему это ломается) включена.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-ai-агент-формирует-bg-bash-команду--rule-блокирует-naked--tail)

## FR-3: Directory lifecycle — `.dev-pomogator/.docker-status/` создаётся безопасно

`docker-test.sh` ОБЯЗАН создать директорию `.dev-pomogator/.docker-status/` через `mkdir -p` ПЕРЕД открытием log файла. Директория уже существует на dogfood-проекте (для YAML heartbeat), но скрипт должен быть self-sufficient для fresh checkouts и CI.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3)
**Use Case:** [UC-1](USE_CASES.md#uc-1-long-running-docker-test-в-background-с-persistent-log)

## FR-4: Log rotation / gitignore — не коммитить test-run-*.log

Files `.dev-pomogator/.docker-status/test-run-*.log` не должны попадать в git. Либо `.dev-pomogator/` уже в `.gitignore` (как managed dir), либо добавить паттерн. Спека ОБЯЗАНА верифицировать текущий gitignore-статус и задокументировать его.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-4)
**Use Case:** [UC-1](USE_CASES.md#uc-1-long-running-docker-test-в-background-с-persistent-log)

## FR-5: Exit code preservation — regression guard

После добавления `tee` в pipeline docker-test.sh ОБЯЗАН сохранять exit code `docker compose run` (non-zero при test failure). `set -o pipefail` уже активен; patch MUST NOT удалить этот flag. Integration test ОБЯЗАН проверить что `bash docker-test.sh false` (симуляция неудачного теста) возвращает non-zero.

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-5)
**Use Case:** [UC-1](USE_CASES.md#uc-1-long-running-docker-test-в-background-с-persistent-log)

## FR-6: Feedback memory — anti-pattern зафиксирован в personal memory — OUT OF SCOPE (частично)

> OUT OF SCOPE — Создание файла `memory/feedback_bg-tail-requires-tee.md` происходит в runtime через user request или AI proactive capture, не через шеллится инсталлером. Спека документирует рекомендуемый text/содержимое, но файл пишется вручную после merge. Связанный User Story №4 также помечен OUT OF SCOPE для этой фичи.

## FR-7 (DEPRECATED — replaced by FR-11 in v0.3.0)

> **DEPRECATED in v0.3.0**: ранее предполагал создание `scripts/bg-log.sh` как отдельной обёртки. Откачен как duplicate — `test_runner_wrapper.cjs` уже реализует persistent log через `logStream.write()` (строки 366-374 в `extensions/tui-test-runner/tools/tui-test-runner/test_runner_wrapper.ts`). Замещён FR-11 (Generic passthrough adapter в существующем wrapper).

## FR-8: Rule update — confirmed Anthropic bug citations + file-redirect pattern (v0.2.0)

Файл `.claude/rules/pomogator/no-blocking-on-tests.md` ОБЯЗАН содержать новые subsection'ы (additive — existing секции v0.1.0 backward-compat сохраняются):

1. **`## Confirmed Anthropic bugs (post-incident 2026-05-10)`** — таблица с 4 markdown ссылками на `github.com/anthropics/claude-code/issues/{16305, 21915, 36915, 50616}` и статусами (closed: not planned / closed as duplicate / open). H1 hypothesis confirmed как #21915, H2 как #16305, H3 как #36915, новый #50616 Windows hang.
2. **`## Preferred pattern: file redirect (Windows-safe для не-docker bg)`** — примеры для dotnet test, pytest, cargo test через `> .dev-pomogator/.bg-logs/<slug>.log 2>&1` (без pipe вообще — обходит все 4 confirmed bugs одним приёмом). Reference на `scripts/bg-log.sh` как convenience wrapper.
3. Расширить чеклист новой строкой `[ ] Не-docker bg → > file 2>&1 (БЕЗ pipe) ИЛИ scripts/bg-log.sh`.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-2](USE_CASES.md#uc-2-ai-читает-обновлённое-правило-и-выбирает-file-redirect)

## FR-9: PreToolUse `bg-pipe-guard` hook — OUT OF SCOPE (defer to follow-up)

> **OUT OF SCOPE — defer to follow-up spec.** Hook автоматического deny для `Bash` invocations с `run_in_background: true` + naked pipe pattern. Откладывается потому что: (1) **Premature без baseline** — нет данных как часто AI игнорирует FR-7/FR-8 в practice; (2) **Risk over-blocking legitimate piped commands** (та же H1 failure mode из `feedback_single-incident-rules-over-generalize.md`); (3) **Helper + rule + memory достаточны** для self-disciplined agent.

## FR-10 (v0.3.0): Откат duplicate bg-log.sh

Удалить `scripts/bg-log.sh`, `tests/e2e/bg-log-helper.test.ts`, FBOL002_01..03 scenarios в обоих `.feature` файлах. Пометить FR-7 как DEPRECATED, AC-7 как DEPRECATED. Чистый refactor — `test_runner_wrapper.cjs` уже реализует persistent log через `logStream.write()` (test_runner_wrapper.ts:366-374) на тот же эффект, не нужно отдельной обёртки.

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)

## FR-11 (v0.3.0): Generic passthrough adapter в test_runner_wrapper

`extensions/tui-test-runner/tools/tui-test-runner/adapters/generic_adapter.ts` — 5-строчный `GenericAdapter extends AdapterBase { parseLine() { return null; } }`. Обновить `adapters/types.ts` `TestFramework` union добавить `'generic'`. Обновить `test_runner_wrapper.ts` `KNOWN_FRAMEWORKS` set + `getAdapter()` switch — добавить case 'generic'. Обновить `dispatch.ts` DISPATCH/FILTER_FORMAT/getFrameworkInfo — generic entry. Любая long bg команда (`npm run build`, `dotnet ef migrations add`, `sleep 60`) теперь идёт через тот же wrapper — единый persistent log + YAML status + bg-task marker.

**Связанные AC:** [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11)
**Leverage:** `adapters/adapter_base.ts`, `yaml_writer.ts` (already supports `total: 0`)

## FR-12 (v0.3.0): Smart converter hook — test_guard генерирует converted команду

`extensions/tui-test-runner/tools/tui-test-runner/test_guard.ts` обновлён: BLOCKED_PATTERNS теперь Array of `{pattern, framework}` — каждый pattern paired с target framework. При deny — `buildConvertedCommand(originalCmd, framework)` строит `node .dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs --framework <fw> -- <orig>`, вставляет в `permissionDecisionReason` как готовую к копированию команду. AI копирует — нет трения построения вручную.

**Связанные AC:** [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12)

## FR-13 (v0.3.0): Update /run-tests SKILL.md description + triggers

`.claude/skills/run-tests/SKILL.md` frontmatter description обновлён — убрано misleading "Auto-detects framework" wording, добавлены explicit trigger keywords (`dotnet test`, `pytest`, `cargo test`, `vitest`, `jest`, `run tests`, `in background`, `long bg`), добавлена секция Generic mode с примерами `--framework generic -- npm run build`. "When triggered" расширена с proactive auto-invocation guidance.

**Связанные AC:** [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13)

## FR-14 (v0.3.0): Skill trigger analysis report

`.specs/fix-bg-output-loss/ANALYSIS_SKILL_TRIGGER.md` — анализ почему `/run-tests` skill не auto-invoked в incident 2026-05-10. Включает: (a) finding — skills в Claude Code не имеют built-in auto-trigger; (b) description misleading "Auto-detects framework"; (c) test_guard install path investigation; (d) WebSearch findings 2026 про current Anthropic skill mechanics; (e) recommendations.

**Связанные AC:** [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14)

## FR-15 (v0.3.0): Three-benchmark report

`.specs/fix-bg-output-loss/BENCHMARK.md` — три измерения: **(a) Trigger rate** — synthetic prompts measure % AI выбирает Skill vs Bash; **(b) Performance overhead** — `time` микро-бенч wrapper vs raw для 6 frameworks; **(c) Reliability YAML accuracy** — wrapper YAML status vs `--reporter=json` ground truth.

**Связанные AC:** [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15)

## FR-16 (v0.3.0, conditional): Installer hook install path fix

Если investigation подтвердит: hooks в `wt-manual-billing` ложатся в `settings.json` вместо `settings.local.json` (нарушение personal-pomogator FR-2) → починить в ~~`src/installer/claude.ts`~~ (removed in v2 — no canonical replacement) + integration test.

**Investigation result (2026-05-11):** NOT APPLICABLE. `isDevPomogatorRepo()` returns false correctly for wt-manual-billing (no package.json). Hooks are in settings.json because installation predates personal-pomogator FR-2 deploy — legacy state, not bug. Re-running installer triggers `migrateLegacySettingsJson()` (claude.ts:612) to move them. No code change needed.

**Связанные AC:** [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16) (conditional → NOT APPLICABLE)

## FR-17 (v0.3.0): Fix Windows path mangling in CLAUDE_ENV_FILE sourcing

`extensions/tui-test-runner/tools/tui-test-runner/tui_session_start.ts` пишет `TEST_STATUSLINE_PROJECT=${cwd}` в `CLAUDE_ENV_FILE`. На Windows cwd содержит backslashes (`D:\repos\dev-pomogator`). Когда Claude Code harness sources env file через bash, escape sequences интерпретируются: `\r` → `r`, `\d` → `d`, etc. — backslashes стрипаются. Bash устанавливает `TEST_STATUSLINE_PROJECT=D:reposdev-pomogator` (mangled). Downstream wrapper.ts `path.resolve('D:reposdev-pomogator')` на Windows treats `D:` как drive-relative → resolves к `D:\repos\dev-pomogator\reposdev-pomogator` — path mangling.

**Fix**: normalize path to forward slashes before writing к env file:

```typescript
const cwdPosix = cwd.replace(/\\/g, '/');
```

Node fs handles forward slashes на Windows transparently, bash treats their как literal characters.

**Discovered via**: FR-15 reliability benchmark — wrapper YAML showed `total: 0` despite ground truth showing 6 tests. Investigation traced cause to bad env var. Fix applied in same commit.

**Связанные AC:** [AC-17](ACCEPTANCE_CRITERIA.md#ac-17-fr-17) Если usage data покажет несоблюдение FR-7/FR-8 — создать отдельный spec `bg-pipe-guard-hook` с PreToolUse Bash matcher (mirror pattern `extensions/scope-gate/` + `extensions/reqnroll-ce-guard/`).
