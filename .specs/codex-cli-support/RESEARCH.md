# Research

## Контекст

Исследование фичи поддержки `Codex CLI` в `dev-pomogator`. Цель — актуализировать спецификацию под реальный Codex, а не под ранний снимок hooks из `0.114.0`: учесть trusted project model, additive config layers, AGENTS/skills discovery, расширившийся hook surface, ограничения `PreToolUse`/`PostToolUse`, Windows execution strategy и честную support matrix для текущих extensions.

## Источники

- [Codex CLI](https://developers.openai.com/codex/cli) — overview, platform support
- [Config basics](https://developers.openai.com/codex/config-basic) — `~/.codex/config.toml`, `.codex/config.toml`, precedence, trusted projects
- [Advanced Configuration](https://developers.openai.com/codex/config-advanced) — `project_doc_fallback_filenames`, `project_root_markers`, `notify`, `tui.notifications`
- [Configuration Reference](https://developers.openai.com/codex/config-reference) — ключи `config.toml`, `[mcp_servers]`
- [Hooks](https://developers.openai.com/codex/hooks) — текущий hooks surface, execution model, layering
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md) — project guidance model
- [Agent Skills](https://developers.openai.com/codex/skills) — `.agents/skills` и skill lifecycle
- [Customization](https://developers.openai.com/codex/concepts/customization) — связь `AGENTS.md`, skills и MCP
- [Windows](https://developers.openai.com/codex/windows/) — native Windows sandbox и WSL path
- [Non-interactive mode](https://developers.openai.com/codex/noninteractive) — `codex exec`
- [Automations](https://developers.openai.com/codex/app/automations) — app automations
- [Codex GitHub Action](https://developers.openai.com/codex/github-action) — CI parity surface
- [Codex changelog](https://developers.openai.com/codex/changelog) — timeline hooks evolution and Windows updates

## Технические находки

### 1. Project config в Codex layered и trusted-only

Официальные docs описывают два ключевых факта:

- user-level конфиг хранится в `~/.codex/config.toml`
- project-level `.codex/config.toml` участвует в precedence chain только для trusted projects

Следствие для спеки:

- repo-local install остаётся корректной стратегией, но support не может предполагать, что `.codex/config.toml` будет применён немедленно в untrusted repo
- нужен onboarding/warning про trust state
- support нельзя проектировать как “project config полностью заменяет user config”

### 2. Hooks в Codex уже не ограничены двумя событиями

По актуальному changelog и текущей hooks-странице surface развивался по шагам:

- `0.114.0+`: `SessionStart`, `Stop`
- `0.116.0+`: `UserPromptSubmit`
- `0.117.0+`: `PreToolUse`, `PostToolUse`
- `0.120.0+`: changelog сообщает о снятии Windows hook gate и расширении `SessionStart`

Это ломает исходную предпосылку текущей спеки, где вся hook-модель жёстко прибита к `0.114.0` и только к `SessionStart`/`Stop`.

### 3. `PreToolUse` и `PostToolUse` пока shell-only

Официальная hooks-страница прямо ограничивает `PreToolUse` и `PostToolUse` текущим перехватом `Bash`. Эти события:

- не перехватывают `Write`, `WebSearch`, `MCP` и другие non-shell tool calls
- не являются универсальной заменой Claude-style tool gating

Следствие для спеки:

- parity для `specs-workflow` и `plan-pomogator` нельзя честно описывать как прямой перенос существующих `PreToolUse` сценариев из Claude
- `tui-test-runner` может использовать Bash guards, но только как Bash guards

### 4. Matching hooks одного события запускаются concurrently

Docs по hooks указывают два критичных свойства:

- Codex загружает hooks additively из нескольких слоёв (`~/.codex/hooks.json` и `<repo>/.codex/hooks.json`)
- matching hooks одного event запускаются concurrent, а не по одному в deterministic chain

Следствие для спеки:

- нельзя materialize по отдельному managed `Stop` hook для каждого extension и ожидать стабильный порядок
- нужен единый managed dispatcher per event, внутри которого `dev-pomogator` уже сам управляет порядком и short-circuit semantics

### 5. `Stop` в Codex семантически не равен “последний пост-хук”

У `Stop` есть особое поведение:

- plain text stdout для `Stop` невалиден
- `decision: "block"` не отменяет turn, а создаёт continuation prompt
- `continue: false` имеет приоритет над continuation decisions других matching `Stop` hooks

Это означает, что несколько независимых `Stop` extensions без dispatcher-а будут конкурировать за continuation behavior.

### 6. `AGENTS.md` — core guidance surface, `CLAUDE.md` — только coexistence concern

Docs по `AGENTS.md` и advanced config показывают:

- Codex читает `AGENTS.md` и `AGENTS.override.md`
- можно добавить fallback filenames через `project_doc_fallback_filenames`
- `CLAUDE.md` не является встроенным first-class instruction filename для Codex

Следствие для спеки:

- `AGENTS.md` должен быть primary managed guidance artifact
- `CLAUDE.md` может сохраняться, обновляться минимально или упоминаться как fallback/legacy doc, но parity не должна зависеть от того, что Codex сам прочтёт `CLAUDE.md`

### 7. Skills layered и collision-prone

Docs по skills уточняют:

- Codex сканирует `.agents/skills` не только в repo root, а в текущей директории и каждом parent directory до repo root
- плюс существуют user/admin/system skill locations
- skills с одинаковым `name` не merge-ятся

Следствие для спеки:

- недостаточно просто скопировать skills в repo root и считать задачу закрытой
- нужен collision-aware naming и явная стратегия для user-owned skills
- `skillFiles` из текущих Claude manifests нельзя просто механически считать эквивалентом Codex distribution model

### 8. Windows docs изменились и местами расходятся

Официальная страница Windows теперь рекомендует native Windows sandbox по умолчанию, а WSL2 — как fallback, если нужен Linux-native workflow. В то же время hooks documentation и changelog ещё не полностью синхронизированы по Windows hook support.

Следствие для спеки:

- FR про обязательный `bash/sh` path на Windows устарел
- нужна native-first стратегия плюс explicit WSL fallback
- hook support на Windows должен идти через version/capability gate, а не через вечное предположение “на Windows hooks нет” или “на Windows только bash/sh”

### 9. Помимо hooks у Codex есть другие parity surfaces

Даже без полного lifecycle parity Codex предоставляет:

- `AGENTS.md`
- `.agents/skills`
- `[mcp_servers]` в `.codex/config.toml`
- `codex exec`
- `notify` и `tui.notifications`
- app automations
- GitHub Action

Следствие для спеки:

- support matrix должна быть честной и многоуровневой: `supported`, `partial`, `excluded`
- `test-statusline` исключается не “просто по желанию”, а потому что в Codex нет эквивалента status line surface; notifications/notify — это другая UX-модель

### 10. Реальный разрыв между Codex и текущими extension manifests

Текущие manifests в репозитории уже показывают, что parity несимметрична:

- `prompt-suggest` в Claude уже использует `UserPromptSubmit` + `Stop`, а не только `Stop`
- `specs-workflow` и `plan-pomogator` опираются на `PreToolUse` для не-Bash semantics
- `tui-test-runner` использует `PreToolUse` на `Bash` плюс `SessionStart`/`Stop`
- `suggest-rules` зависит от `requiresClaudeMem`
- `test-statusline` зависит от `PostToolUse(Bash)` и custom statusline surface

Следствие для спеки:

- часть расширений можно поддержать напрямую
- часть только частично
- часть нужно исключить или потребовать redesign

### 11. Что это значит для dev-pomogator

Поверх внешних docs есть внутренние constraints репозитория:

- `src/config/schema.ts`, `src/index.ts`, `src/installer/extensions.ts` пока живут в модели `cursor | claude`
- `src/constants.ts` и manifests привязаны к `.claude/skills`
- `src/updater/index.ts` и `src/installer/shared.ts` уже дают правильные backup/update primitives
- `tests/e2e/helpers.ts`, `tests/e2e/cli-integration.test.ts`, `Dockerfile.test` пока dual-platform only

Значит Codex support — это одновременно platform expansion, hook-dispatch redesign, support-matrix exercise и test harness feature.

### 12. Upstream capabilities, которых сейчас не хватает

Ниже список не “вообще желательных” вещей, а конкретных upstream capabilities Codex, отсутствие которых прямо мешает parity текущих extensions.

- Нет `PreToolUse` / `PostToolUse` для non-Bash tools.
  Сейчас Codex не даёт hook events для `Write`, `Edit`, `ApplyPatch`, `WebSearch`, `MCP` и других non-shell инструментов.
  Из-за этого:
  - `specs-workflow` не может честно перенести phase gate на запись файлов
  - `plan-pomogator` не может честно перенести gate при завершении plan mode
  - `tui-test-runner` может использовать только Bash guardrails, но не generic tool interception
- Нет lifecycle hook-а уровня `ExitPlanMode` или другого plan-mode boundary event.
  Это отдельный blocker для `plan-pomogator`, даже если generic non-Bash hooks появятся не сразу.
- Нет native status line / status bar surface.
  Поэтому `test-statusline` нельзя считать partial direct-port: у Codex просто другой UX surface.
- Нет deterministic ordered chain для matching hooks.
  Пока matching hooks concurrent, несколько независимых `Stop` hooks будут конфликтовать по continuation semantics, значит dispatcher остаётся обязательным.
- Нет полностью консистентного official story по hooks на Windows.
  Changelog и docs частично расходятся, поэтому Windows hook support должен оставаться capability-gated.

### 12.1 `ExitPlanMode` status in Codex primary sources

На дату **2026-04-18** в primary sources Codex не найден публичный tool/event/hook с именем `ExitPlanMode`.

Что подтверждено:

- official hooks docs перечисляют только `SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`
- по GitHub `openai/codex` есть публичные discussion/issue про `Plan Mode` / `Plan / Spec Mode`
- это не эквивалентно наличию задокументированного event-а `ExitPlanMode`

Следствие для спеки:

- `ExitPlanMode` нельзя использовать как проектный design assumption для Codex
- parity `plan-pomogator` должна строиться вокруг `AGENTS.md`, skills, доступных prompt hooks и explicit partial support
- revisit по этой точке нужен только если `ExitPlanMode` или аналогичный plan-mode boundary event появится в official docs/changelog

### 13. Что именно нужно перепроверить через месяц

Если вернуться к фиче позже, нужно в первую очередь проверить, появились ли в official Codex docs/changelog:

1. `PreToolUse` / `PostToolUse` для `Write`, `Edit`, `ApplyPatch`, `WebSearch`, `MCP`
2. plan-mode lifecycle event вроде `ExitPlanMode`
   На 2026-04-18 такой event не найден в primary sources Codex; revisit нужен именно на предмет появления новой официальной сущности, а не для повторной проверки старого предположения
3. native status line / persistent status bar surface
4. deterministic hook ordering, priorities или sequential chain semantics
5. синхронизация docs и changelog по Windows hooks

Если хотя бы один из этих пунктов закроется, support matrix в этой спецификации надо пересмотреть, а не просто доработать код по старому plan.

## Где лежит реализация

- App-код: `src/config/schema.ts`, `src/index.ts`, `src/installer/index.ts`, `src/installer/extensions.ts`, `src/installer/shared.ts`, `src/updater/index.ts`, `src/updater/github.ts`
- Конфигурация: `install`, `install.ps1`, `install.sh`, `README.md`, `extensions/*/extension.json`

## Выводы

1. `Codex` должен быть спроектирован как first-class платформа `dev-pomogator`, а не как вариант `Cursor` или `Claude`.
2. Project-level only стратегия остаётся валидной, но должна быть дополнена trust onboarding и coexistence с глобальными `~/.codex/*` layers.
3. Основные managed артефакты фичи: `.codex/config.toml`, `.codex/hooks.json`, `AGENTS.md`, `.agents/skills/`, `.dev-pomogator/tools/`; `CLAUDE.md` — secondary coexistence surface.
4. Hooks у `Codex` больше нельзя описывать как `0.114.0-only` модель. Нужен version-aware capability resolver и единый dispatcher per event.
5. `PreToolUse`/`PostToolUse` в текущем Codex — это Bash-only guardrail, а не общий tool interception layer.
6. Support matrix должна быть честной: `supported`, `partial` или `excluded`, с version floor и reason, а не “всё кроме test-statusline поддержано”.
7. Windows strategy должна быть native-first с documented WSL fallback; старая формулировка `bash/sh only` устарела.
8. Реализация должна опираться на уже существующие shared/update primitives, а не дублировать их в новом Codex-specific коде.
9. Test harness, MCP tooling, global layer coexistence и memory-coupled extensions являются частью объёма фичи наравне с installer/update path.
10. Для части parity сейчас отсутствуют не “наши имплементационные детали”, а именно upstream capabilities Codex; эти gaps должны быть зафиксированы как revisit watchlist.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги пишутся через temp file + atomic move | `.codex/config.toml`, `.codex/hooks.json`, merge artefacts | FR-2, FR-3, NFR-Reliability |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | `extension.json` — source of truth; новые platform assets должны быть перечислены в manifest | Добавление `codex` в manifests | FR-1, FR-7, FR-9 |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Апдейтер должен синхронизировать tools и hooks вместе | Reinstall/update path для `codex` | FR-4, FR-11 |
| updater-managed-cleanup | `.claude/rules/updater-managed-cleanup.md` | Только managed cleanup, backup user-modified files, smart merge configs | Existing user artifacts, update safety | FR-3, FR-11, NFR-Reliability |
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | `CLAUDE.md` — индекс/глоссарий, его нельзя разрушать или превращать в дубликат правил | Coexistence `AGENTS.md` + `CLAUDE.md` | FR-6, NFR-Usability |
| docker-only-tests | `.claude/rules/docker-only-tests.md` | Тесты живут в `tests/e2e/*` и запускаются через `npm test` | Phase 0/implementation test plan | FR-11, NFR-Reliability |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| Managed backup/update | `src/updater/index.ts` | Hash-based backup before overwrite + managed cleanup | Основа для safe merge Codex project files |
| MCP setup | `extensions/specs-workflow/tools/mcp-setup/setup-mcp.py` | Project/global config resolution, backup, atomic write | Reference для Codex TOML writer и MCP registration |
| Claude Stop hooks | `extensions/auto-commit/`, `extensions/auto-simplify/`, `extensions/prompt-suggest/` | Existing lifecycle automation patterns on `Stop` | Reuse mapping для `Codex Stop` parity |
| Claude SessionStart hooks | `extensions/claude-mem-health/`, `extensions/bun-oom-guard/` | Existing `SessionStart` hook patterns | Reuse mapping для `Codex SessionStart` parity |
| Existing skills bundles | `extensions/suggest-rules/skills/`, `extensions/tui-test-runner/skills/` | `SKILL.md` + scripts/references packaging | Source material для `.agents/skills/`, but not proof that repo-root-only layout is sufficient |
| Root guidance | `CLAUDE.md` | Existing repo guidance/glossary that users may already maintain | Must coexist with `AGENTS.md`, not be clobbered |
| Installer targets | `install`, `install.ps1`, `install.sh` | Existing platform routing for `cursor`/`claude` | Needs explicit `codex` target and updated Windows strategy |

### Architectural Constraints Summary

- `Codex` support must stay project-local: no writes to `~/.codex/*`, auth caches or user credential stores.
- Existing user-owned project files are treated as merge surfaces, not as installer-owned blank slates.
- `CLAUDE.md` already has repo-specific semantics in this project, so `AGENTS.md` introduction must coexist with it instead of replacing it.
- Hook support is versioned and partially shell-only; capability decisions must be explicit and version-gated.
- Matching hooks can execute concurrently and global hooks are additive with project hooks, so managed behavior must use per-event dispatchers rather than many independent hooks.
- Manifest, updater, trust onboarding and bootstrap layers all require coordinated changes; partial support at only one layer would violate existing project rules and produce stale behaviour.
