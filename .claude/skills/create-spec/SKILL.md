---
name: create-spec
description: |
  Creates and manages feature specifications under .specs/{slug}/ via 13-file scaffold + 4-phase STOP-confirmed workflow (Discovery → Context → Requirements+Design → Finalization) + Phase 3+ Audit. EN triggers: "create / make / draft / write / sketch / outline specs", "spec out X", "scaffold a spec", "update / show / status specs". RU triggers: "создай / сделай / набросай / напиши / опиши спеки", "новые спеки для X", "спеки по фиче", "обнови / покажи / статус спеков". Matches terse phrasings like "ок спеки по фиче сделай". Invokes Skill("research-workflow") during Phase 1 step 5 for technical research. Do NOT use for plan-pomogator development plans, read-only spec viewing, or non-spec workflows.
allowed-tools: mcp__dev-pomogator-specs__read_spec_doc, mcp__dev-pomogator-specs__list_spec_docs, mcp__dev-pomogator-specs__read_attachment, mcp__dev-pomogator-specs__apply_spec_change, mcp__dev-pomogator-specs__propose_spec_change, mcp__dev-pomogator-specs__create_spec, mcp__dev-pomogator-specs__delete_spec_doc, mcp__dev-pomogator-specs__rename_spec_doc, mcp__dev-pomogator-specs__append_to_section, mcp__dev-pomogator-specs__insert_after_heading, mcp__dev-pomogator-specs__insert_at_eof, mcp__dev-pomogator-specs__replace_in_section, mcp__dev-pomogator-specs__propose_patch, mcp__dev-pomogator-specs__apply_proposed_patch, mcp__dev-pomogator-specs__apply_spec_transaction, mcp__dev-pomogator-specs__add_backlog_task, mcp__dev-pomogator-specs__add_phase, mcp__dev-pomogator-specs__amend_requirement, mcp__dev-pomogator-specs__add_acceptance_criterion, mcp__dev-pomogator-specs__register_incident_backlog, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion, Skill, Agent, WebFetch, WebSearch
argument-hint: "<feature-slug>"
---

# create-spec — Manage feature specifications

Полный 4-фазный workflow для создания и обновления спецификаций. Этот SKILL.md — overview + navigation. Детали каждой фазы лежат в `references/`.

## Структура спецификации

Каждая спека располагается в `.specs/{feature-slug}/`. Scaffold создаёт 15 файлов: README, USER_STORIES, USE_CASES, RESEARCH, REQUIREMENTS, FR, NFR, ACCEPTANCE_CRITERIA, DESIGN, TASKS, FILE_CHANGES, CHANGELOG, `{slug}.feature` (эти **13 — обязательный минимум полноты**, его проверяет валидатор) + FIXTURES и `*_SCHEMA.md` (создаются scaffold-ом, но для статуса «ПОЛНАЯ» опциональны). Полный список см. `references/phase1_discovery.md`.

## Скрипты-инструменты

| Скрипт | Назначение |
|--------|------------|
| `tools/specs-generator/scaffold-spec.ts -Name "X"` | Создать структуру `.specs/X/` |
| `tools/specs-generator/validate-spec.ts -Path ".specs/X"` | Валидация форматов |
| `tools/specs-generator/spec-status.ts -Path ".specs/X"` | Прогресс + state machine |
| `tools/specs-generator/spec-status.ts -Path ".specs/X" -ConfirmStop Discovery` | Подтверждение STOP-точки |
| `tools/specs-generator/audit-spec.ts -Path ".specs/X"` | Phase 3+ автоматический аудит |
| `tools/specs-generator/analyze-features.ts -Format text` | Паттерны существующих `.feature` |

`.progress.json` не является agent/MCP/manual-mutable документом. Писатели только engine CLI: `scaffold-spec.ts` создаёт initial v4 state при scaffold новой спеки; `spec-status.ts` создаёт missing state для existing spec и обновляет phase/STOP state. ЗАПРЕЩЕНО создавать/редактировать его через Write/Edit/MCP вручную. Аргумент `-Path` для `spec-status.ts` ОБЯЗАН указывать на `.specs/<feature>/`.

## MCP-rails: писать спеки через сервер, не Write/Edit напрямую (FR-40/FR-42)

create-spec — это ДВЕРЬ (юзер входит сюда как сейчас), но запись документов идёт через MCP-мутации `dev-pomogator-specs`, не через сырой Write/Edit по `.specs/` (слойный контракт FR-42c: тонкий скилл оркестрирует, толстый сервер валидирует ДО записи):

| Нужно | MCP-тул | Параметры |
|-------|---------|-----------|
| Новая спека (scaffold, рождается verdict-GREEN) | `create_spec` | `{ slug }` |
| Создать/переписать любой `*.md`/`*.feature` | `apply_spec_change` | `{ spec, doc, content, reason }` |
| Точечная правка | `apply_spec_change` | `{ spec, doc, old_string, new_string, reason }` |
| Переименовать/переместить doc (anchors-aware) | `rename_spec_doc` | `{ spec, doc, to_doc, reason, rewrite_inbound? }` |
| Проверить без записи (dry-run, те же гейты) | `propose_spec_change` | `{ spec, doc, content\|old/new, reason }` |
| Прочитать цельный документ / перечень | `read_spec_doc` / `list_spec_docs` | `{ spec[, doc] }` |
| Дописать в секцию по стабильному якорю заголовка (без old_string; FR-60 P33-1) | `append_to_section` / `insert_after_heading` / `insert_at_eof` | `{ spec, doc, heading?, text, expected_sha? }` |
| Якорная замена внутри секции, EOL-толерантная (FR-60 P33-2) | `replace_in_section` | `{ spec, doc, heading, old_string, new_string, expected_sha? }` |
| Dry-run мульти-документного патча (FR+AC+TASKS+.feature+FILE_CHANGES; FR-60 P33-3) | `propose_patch` | `{ edits[], reason }` |
| Применить валидный proposal / one-shot all-or-nothing запись (FR-60 P33-3) | `apply_proposed_patch` / `apply_spec_transaction` | `{ proposal_id, reason }` / `{ edits[], reason }` |
| Доменные интенты: задача/фаза/правка FR/новый AC/инцидент в бэклог (FR-60d P33-4) | `add_backlog_task` / `add_phase` / `amend_requirement` / `add_acceptance_criterion` / `register_incident_backlog` | `{ spec, ..., reason }` |

Сервер валидирует form-контракты + якоря (delta-only) + conformance ДО касания диска и отказывает с findings list — НЕ переписывай эту логику в скилле. `.progress.json` НЕ мутабелен через MCP: writer contract = `scaffold-spec.ts` bootstrap only + `spec-status.ts` state-transition/repair only.

## Cross-boundary integration checklist

When a feature crosses browser/backend/runtime/provider/service boundaries, Phase 1
and Phase 2 MUST explicitly name every contract surface before STOP:

- Public consumer contract: browser DTOs, public manifest, public policy, route,
  schema, display metadata.
- Private deployment/runtime contract: hostnames, `runtimeBaseUrl`, credentials,
  provider/runtime config, internal registry, queue names, service discovery.
- Authority split: which component owns auth, balance, pricing, reserve, dispatch,
  settlement, artifact readback, and config sync.
- Redaction boundary: what public DTOs may expose (`runtimeConfigured`, route,
  `contractVersion`, input schema) and what must remain server-side.
- Negative/live proof: unauth, insufficient balance/permission, funded success,
  duplicate/idempotency, artifact/result lookup, and leak checks.

For self-hosted marketplace/API agents, write this invariant verbatim into FR/AC/BDD
unless the product explicitly chooses another architecture: **manifest/policy is not
the deployment registry; `runtimeBaseUrl` is private backend config; browser calls a
same-origin gateway; only the backend dispatches to the runtime.** Do not accept
`endpoint exists`, `SPA route loads`, or public `runtimeConfigured=true` as deployment
proof without server-side dispatch/readiness evidence.

## Phase navigation

| Phase | Reference | Что делает |
|-------|-----------|------------|
| **1. Discovery** | [`references/phase1_discovery.md`](references/phase1_discovery.md) | USER_STORIES, USE_CASES, RESEARCH; вызывает `Skill("research-workflow")` для технических находок |
| **1.5. Project Context** | [`references/phase1.5_project-context.md`](references/phase1.5_project-context.md) | Сканирование `.claude/rules/` + `.claude/skills/` + BDD framework detection |
| **1.75. Architecture Decisions** (greenfield only) | [`references/phase1.75_architecture-decisions.md`](references/phase1.75_architecture-decisions.md) | Greenfield-only: enumerate tech-stack axes + auto-apply рекомендаций (auto-mode, без блокирующего STOP); вызывает `Skill("architecture-decision-builder")` |
| **2. Requirements + Design** | [`references/phase2_requirements-and-design.md`](references/phase2_requirements-and-design.md) | FR, NFR, AC (EARS), REQUIREMENTS, DESIGN, FILE_CHANGES, `.feature`; вызывает `Skill("requirements-chk-matrix")` |
| **2 (BDD subsection)** | [`references/phase2_bdd-test-infrastructure.md`](references/phase2_bdd-test-infrastructure.md) | TEST_DATA / TEST_FORMAT classification, hooks design, FIXTURES.md |
| **3. Finalization** | [`references/phase3_finalization.md`](references/phase3_finalization.md) | TASKS (TDD-порядок), README, CHANGELOG; вызывает `Skill("task-board-forms")` |
| **3+. Audit (entry)** | [`references/phase3plus_audit-overview.md`](references/phase3plus_audit-overview.md) | Workflow аудита + dispatch к 7 категориям + AUDIT_REPORT.md |

Sub-skill ecosystem (вызываются через `Skill(...)`): `discovery-forms` (Phase 1 step 3), `requirements-chk-matrix` (Phase 2 step 4b), `variant-matrix-build` (Phase 2 step 4c), `cross-spec-reconcile` (Phase 2 step 4e + Phase 3 step 1d light, Phase 3+ Audit `CROSS_SPEC_CONSISTENCY` full — FR-17), `task-board-forms` (Phase 3 step 1b), `research-workflow` (Phase 1 step 5), `architecture-decision-builder` (Phase 1.75, greenfield only — enumerate + per-axis).

> **Pre-STOP semantic check:** before each `ConfirmStop` (#1/#2/#3), run `Skill("spec-review")` to catch external-claim drift, name collisions, antipattern violations, and 10 other categories that `audit-spec.ts` does not detect. See [`.claude/skills/spec-review/SKILL.md`](../spec-review/SKILL.md).

## Алгоритм запуска

1. **Если запрос на создание новой спеки** ("сделай спеку для X", "create spec for X" и т.д.):
   - Получи feature-slug от пользователя (kebab-case)
   - Запусти `tools/specs-generator/scaffold-spec.ts -Name "{slug}"`
   - Покажи Starter Message (см. ниже)
   - Прочти `references/phase1_discovery.md` и следуй Phase 1

2. **Если запрос на продолжение существующей спеки** ("продолжи спеку X", "обнови X"):
   - Прочти `.specs/{slug}/.progress.json` чтобы определить currentPhase
   - Прочти соответствующий `references/phaseN_*.md` файл
   - Продолжи с текущей фазы

3. **Если запрос на чтение/просмотр** ("покажи спеку", "статус"):
   - Запусти `spec-status.ts -Path ".specs/{slug}"`
   - НЕ запускай scaffold-spec; не модифицируй файлы

## Progress display

После каждого заполненного spec файла выводи (≤4 строки):

```
📊 Spec Progress: {slug} — Phase N/4: {phase_name}
Files: {done}/{total} complete — Next: {next_action}
```

Перед каждой STOP-точкой выводи Executive Summary (`## 💬 Ключевые решения фазы` с 3-5 bullets, детали по ссылкам на FR.md / DESIGN.md). Подробнее про формат — `references/phase1_discovery.md`.

## Starter Message (при первом запуске)

```
📊 Создаём спеку: {feature-slug}
4 фазы с подтверждением на каждой:
1️⃣ Discovery — определяем кто, зачем, что (USER_STORIES, USE_CASES, RESEARCH)
2️⃣ Context — ограничения проекта, существующие паттерны
3️⃣ Requirements — формальные FR/AC/NFR + DESIGN + BDD .feature
4️⃣ Finalization — план задач TASKS + README + CHANGELOG
+ Phase 3+ Audit (автоматически после STOP #3)

⚠️ Pre-Write Verification Checklist — ОБЯЗАТЕЛЬНО в Phase 1 (3 пункта)
   и Phase 2 (8 пунктов). Цель: поймать факты-ошибки на генерации, не на ревью.
   - CL-1: Read project memory feedback_*.md перед первым Write
   - CL-2: Каждый file path — Read first, без verification claim не пишется
   - CL-3: Каждая CLI команда — Bash --help first
   (Phase 2 добавляет: API verify, namespace collision, cross-ref consistency)
   См. references/phase1_discovery.md и references/phase2_requirements-and-design.md.

Начинаем с Phase 1: Discovery.
```

## Conditional Jira-first mode

Если `.specs/{slug}/JIRA_SOURCE.md` существует — активируется Jira-first workflow. Каждая фаза начинается со Step 0 (re-read 3 Jira-артефактов: `JIRA_SOURCE.md`, `ATTACHMENTS.md`, `.jira-cache.json`). Markdown-скелеты Jira/audit-артефактов живут рядом со skill-ом в `references/templates/` (`JIRA_SOURCE.md.template`, `ATTACHMENTS.md.template`, `AUDIT_REPORT.md.template`), потому что их создают jira-intake / Phase 3+ audit, а не base scaffold. Полная семантика и format Jira trace в FR/AC/BDD/TASKS — см. [`references/jira-mode.md`](references/jira-mode.md). Если файла нет — раздел no-op.

## Topic references (loaded on demand)

- [`bdd-enforcement.md`](references/bdd-enforcement.md), [`no-mocks-fallbacks.md`](references/no-mocks-fallbacks.md), [`specs-validation.md`](references/specs-validation.md), [`feature-creation-rules.md`](references/feature-creation-rules.md), [`validation-rules.md`](references/validation-rules.md), [`jira-mode.md`](references/jira-mode.md)

## Запреты

- НЕ создавай/редактируй `.progress.json` через Write/Edit/MCP; только engine CLI writers: `scaffold-spec.ts` (initial scaffold) и `spec-status.ts` (state/STOP updates).
- НЕ копируй секции из других спек — каждая создаётся с нуля
- НЕ пиши тесты без `.feature` сценария (TDD: Red → Green → Refactor; см. [`references/phase3_finalization.md`](references/phase3_finalization.md))
