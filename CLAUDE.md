# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Command | Description |
|---------|-------------|
| `npm run lint` | ESLint on `.claude/` and `tools/` |
| `npm test` | E2E tests via Docker (isolated, safe) |
| `npm run test:all` | E2E + TUI tests via Docker |
| `npx tsx tools/plan-pomogator/validate-plan.ts <path>` | Validate plan structure |
| `npx tsx tools/specs-generator/scaffold-spec.ts -Name "feature"` | Scaffold spec structure |
| `npx tsx tools/specs-generator/validate-spec.ts -Path ".specs/feature"` | Validate spec formats |
| `npx tsx tools/specs-generator/audit-spec.ts -Path ".specs/feature"` | Audit spec cross-references |
| `npx tsx tools/specs-generator/spec-status.ts -Path ".specs/feature" -ConfirmStop Discovery` | Confirm STOP point |
| `npx tsx tools/specs-generator/analyze-features.ts -Format text` | Analyze .feature file patterns |
| `npx tsx tools/migrate-v1-to-v2/migrate-v1-to-v2.ts --global` | Migration v1 → v2 cleanup (project + global v1 artifacts) |
| `/reflect` | Просмотр и управление очередью автозахваченных сигналов |
| `/simplify` | Стоковый Claude Code review (код + спеки + тесты через правило simplify-extended, auto-trigger на Stop) |
| `/pomogator-doctor` | Диагностика окружения: 17 проверок в 🟢🟡🔴 группах (canonical skill, не deprecated CLI) |

## Distribution (v2.0 canonical)

dev-pomogator distributed как canonical Claude Code marketplace plugin (per Anthropic plugin spec, plugins-reference.md + plugin-marketplaces.md). User install flow:

```
/plugin marketplace add stgmt/dev-pomogator
/plugin install dev-pomogator@stgmt
/reload-plugins   (CLI) or restart Claude Desktop
```

`npm install -g dev-pomogator` flow deprecated (v1 only). Existing v1 users — run `npx tsx tools/migrate-v1-to-v2/migrate-v1-to-v2.ts --global` для cleanup перед canonical install.

## Architecture

**Canonical Claude Code marketplace plugin** for team coding standards, workflows, и tools.

- **Source of truth**: `.claude/skills/` для skills, `.claude/commands/` для commands, `.claude/rules/` для rules, `tools/<tool>/<script>.ts` для hook scripts. Single canonical layout (no `extensions/` middleware after v2.0).
- **Plugin manifests**: `.claude-plugin/plugin.json` (canonical Anthropic schema) + `.claude-plugin/marketplace.json` (single-plugin marketplace catalog) + `.claude-plugin/hooks.json` (aggregated hook declarations).
- **Bootstrap**: `tools/_shared/bootstrap.cjs` + `tools/_shared/tsx-runner.js` — fail-soft TypeScript loader с multi-strategy fallback (Node 22.6+ native strip-types → local tsx → home tsx → global tsx → npx tsx с repair). Co-located в plugin tree, distributed внутри plugin для canonical install (no v1 install dependency).
- **Hooks**: project `.claude/settings.json` (repo dogfooding) + plugin's `.claude-plugin/hooks.json` (canonical distribution к users). Hook commands resolve script paths via `process.env.CLAUDE_PLUGIN_ROOT` (canonical context) или relative к CWD (dogfood).
- **Skills**: 19 skills в `.claude/skills/` (create-spec, run-tests, plan-pomogator-related, pomogator-doctor, research-workflow, etc.). Plugin distribution через `.claude-plugin/plugin.json` field override `"skills": ".claude/skills"`.
- **pomogator-doctor**: canonical skill (.claude/skills/pomogator-doctor/) с self-contained engine в scripts/engine/ (24 files); SessionStart hook в scripts/doctor-hook.ts.
- **Migration**: `tools/migrate-v1-to-v2/migrate-v1-to-v2.ts` — standalone cleanup script для existing v1 users (--project / --global / both flags).

## Rules

### Always-apply

| Rule | Description | Path |
|------|-------------|------|
| plan-pomogator | Единый формат планов разработки (9 секций: Context + Extracted Requirements → трёхфазная валидация + prompt-capture) | `.claude/rules/plan-pomogator/plan-pomogator.md` |
| plan-freshness | Каждый план с нуля; запрет копирования File Changes/Requirements из предыдущих планов; Phase 3 cross-ref валидация | `.claude/rules/plan-pomogator/plan-freshness.md` |
| ts-import-extensions | В `tools/**/*.ts` relative imports ОБЯЗАНЫ использовать `.ts` расширение; `.js` спецификаторы ломают Node 22.6+ native strip-types | `.claude/rules/ts-import-extensions.md` |
| jira-smart-commit-one-line | Smart Commit парсится только если ключ Jira и команда в первой строке, одна строка | `.claude/rules/jira-smart-commit-one-line.md` |
| atomic-config-save | Конфиги через temp file + atomic move, не прямой writeJson | `.claude/rules/atomic-config-save.md` |
| atomic-update-lock | Lock через `flag: 'wx'` (O_EXCL), не exists-check + write | `.claude/rules/atomic-update-lock.md` |
| claude-md-glossary | CLAUDE.md = глоссарий/индекс на rules; при добавлении/удалении правил обновлять таблицу | `.claude/rules/claude-md-glossary.md` |
| clear-questions-to-user | Перед каждым ответом/вопросом — шаблон самопроверки: (1) что я понял бытовым языком, (2) черновик, (3) самооценка "поймёт?", (4) ответ = микроистория с 5 опорными точками (откуда пришли → что юзер сказал → что сделал и почему → где сейчас → дальше), (5) переписать если не прошло. При "не понял" — СТОП, прогнать шаблон заново. Часть extension `answer-simple` (skill для on-demand аудита) | `.claude/rules/answer-simple/clear-questions-to-user.md` |
| self-improving | Real-time детекция ситуаций для новых rules/skills/hooks (триггеры T2/T3/T4/T6 + automation hints) | `.claude/rules/suggest-rules/self-improving.md` |
| simplify-extended | При /simplify проверять спеки (нечёткие FR, reuse) и тесты (setup duplication, naming); различать systemic vs one-off issues (extension: auto-simplify) | `.claude/rules/auto-simplify/simplify-extended.md` |
| tui-pilot-tests | TUI тесты через Textual Pilot API; запрет file-inspection тестов для виджетов | `.claude/rules/tui-pilot-tests.md` |
| reqnroll-ce-slash | Reqnroll 2.x авто-детектит CE vs regex; `/` в паттерне без regex-маркеров = ошибка парсера; hook `reqnroll-ce-guard` блокирует Write/Edit `.cs` | `.claude/rules/reqnroll-ce-guard/reqnroll-ce-slash.md` |
| extension-test-quality | Тесты расширений: 1:1 mapping test↔feature, запрет inline-копий, naming DOMAIN_CODE_NN, import guard | `.claude/rules/extension-test-quality.md` |
| no-test-helper-duplication | Запрет дублирования helpers в тестах; shared → `tests/e2e/helpers.ts` (extension: test-quality) | `.claude/rules/test-quality/no-test-helper-duplication.md` |
| verify-render-target | Перед редактированием render/statusline кода — проверить какой файл реально вызывается (compact_bar.py, не statusline_render.cjs) | `.claude/rules/pomogator/verify-render-target.md` |
| screenshot-driven-verification | КАЖДЫЙ скриншот реально анализировать: описать что видно, сравнить с ожиданием, формат CONFIRMED/DENIED | `.claude/rules/pomogator/screenshot-driven-verification.md` |
| no-blocking-on-tests | Docker тесты 7-12 мин; НИКОГДА не блокировать сессию; run_in_background + продолжать работу; запрет naked `\| tail` в bg (используй `\| tee <path> \| tail -N`) | `.claude/rules/pomogator/no-blocking-on-tests.md` |
| post-edit-verification | После КАЖДОГО изменения кода: build, copy installed, /run-tests background, screenshot если UI | `.claude/rules/pomogator/post-edit-verification.md` |
| skill-allowed-tools-audit | При создании/модификации skill — проверь что allowed-tools покрывает ВСЕ инструменты workflow | `.claude/rules/checklists/skill-allowed-tools-audit.md` |
| docker-no-git-repo | Docker тесты без .git — git команды fail, использовать env override | `.claude/rules/gotchas/docker-no-git-repo.md` |
| proactive-investigation | Не спрашивай разрешение исследовать — делай сам; каждое утверждение с evidence; [UNVERIFIED] для непроверяемого | `.claude/rules/plan-pomogator/proactive-investigation.md` |
| cross-scope-coverage | При multi-scope фичах: coverage matrix scope×variant, gap report, [OUT_OF_SCOPE] для пропусков | `.claude/rules/plan-pomogator/cross-scope-coverage.md` |
| spec-test-sync | При тестах в File Changes — спеки обязательны; при багфиксе — BDD .feature обязателен | `.claude/rules/plan-pomogator/spec-test-sync.md` |
| integration-tests-first | Тесты ОБЯЗАНЫ быть интеграционными (runInstaller/spawnSync); unit допустим как доп, не как замена | `.claude/rules/integration-tests-first.md` |
| output-invariants-first | Для функций возвращающих коллекцию — тесты на инварианты (uniqueness/cardinality/conservation), не только per-input; N×M loops red-flag; mutation testing не заменяет integration | `.claude/rules/testing/output-invariants-first.md` |
| tui-debug-verification | TUI/statusline изменения: screenshot второго монитора + cross-verify YAML age + container; SKIP_BUILD запрещён после wrapper changes | `.claude/rules/pomogator/tui-debug-verification.md` |
| onboarding-artifact-ai-centric | `.specs/.onboarding.json` — AI-first artifact: обязательны rules_index/skills_registry/hooks_registry/mcp_servers/boundaries/gotchas/glossary/verification. Generic project metadata без AI-specific секций — violation | `.claude/rules/onboard-repo/onboarding-artifact-ai-centric.md` |
| commands-via-skill-reference | `.onboarding.json.commands.*` обязаны ссылаться на skill-обёртку через `via_skill` если она существует; `forbidden_if_skill_present=true + via_skill set` требует non-empty `raw_pattern_to_block` (AJV custom keyword) | `.claude/rules/onboard-repo/commands-via-skill-reference.md` |
| scope-gate/when-to-verify | Триггер map для `/verify-generic-scope-fix` skill: когда invoke (guard/policy файлы + enum/switch expansion) + hard-OUT signals (prevent H1 over-application) | `.claude/rules/scope-gate/when-to-verify.md` |
| scope-gate/escape-hatch-audit | Audit workflow + anti-gaming guidance для `[skip-scope-verify:]` escape hatch через `.claude/logs/scope-gate-escapes.jsonl` | `.claude/rules/scope-gate/escape-hatch-audit.md` |
| architecture-decision/when-to-build | Триггер map для `architecture-decision-builder` skill (greenfield stack choice): invoke когда нет build-manifest + greenfield triggers; hard-OUT brownfield/locked stack (prevent H1) | `.claude/rules/specs-workflow/architecture-decision/when-to-build-architecture.md` |
| architecture-decision/escape-hatch-audit | Audit + anti-gaming для `[skip-architecture-axis:]` escape hatch через `.claude/logs/spec-architecture-escapes.jsonl` | `.claude/rules/specs-workflow/architecture-decision/escape-hatch-audit.md` |
| spec-reality-check/maintain-evals-on-edit | При изменении `spec-reality-check` skill — ОБЯЗАТЕЛЬНО прогнать `run-evals.ts` + `bulk-run.ts` + `bench-synthetic.ts`. Bulk-run на 45 real specs поймал 4 false-positive bugs за 1 проход; isolated evals их не видят | `.claude/rules/spec-reality-check/maintain-evals-on-edit.md` |
| session-pilot/action-button-injection | POST /api/launch decision tree: existing session → focus-pane-id + write-chars; new session → KDL layout + `zellij -s NAME -n FILE` (NOT `-l`); 5s idempotency lock; path whitelist; UUID regex | `.claude/rules/session-pilot/action-button-injection.md` |
| session-pilot/claude-projects-encoding | Claude Code пишет JSONL в разные encoded dirs от same logical path: WSL `/mnt/d/repos/foo` → `-mnt-d-repos-foo`, Windows `D:\\repos\\foo` → `D--repos-foo`. `encode_path_for_claude()` возвращает ALL variants; обе `~/.claude/projects` (WSL) и `/mnt/c/Users/.../.claude/projects` (Windows mount) сканируются | `.claude/rules/session-pilot/claude-projects-encoding.md` |
| session-pilot/perf-budget | Per-endpoint latency targets: `/api/index` <150ms warm, `/api/claude` <300ms cold + <5ms 304 path, `/api/launch` <2s, frontend cold first paint <1s top-20. Regression в любой target → block PR | `.claude/rules/session-pilot/perf-budget.md` |
| session-pilot/mcp-chrome-only | session-pilot skill scenarios MUST использовать `mcp__claude-in-chrome__*` (navigate / screenshot / read_page) для browser automation. PowerShell desktop captures (`[System.Drawing.Bitmap]`) ЗАПРЕЩЕНЫ | `.claude/rules/session-pilot/mcp-chrome-only.md` |

### Triggered

| Rule | Trigger | Path |
|------|---------|------|
| centralized-test-runner | Запуск тестов — только через `/run-tests`; прямые `npm test`/`pytest`/`dotnet test` блокируются hook-ом | `.claude/rules/tui-test-runner/centralized-test-runner.md` |

> **Note:** specs management workflow перенесён из rules в Claude Code skill `create-spec` (см. `.claude/skills/create-spec/SKILL.md`). Стандалоне skill `research-workflow` (`.claude/skills/research-workflow/SKILL.md`) триггерится на "исследуй / найди / погугли / ресерч". Skills грузятся on-demand через метаданные — не индексируются в этой таблице per `claude-md-glossary` rule.
