# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/architecture-decision-builder/SKILL.md` | create | [FR-7](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175) — skill core, 4 команды |
| `.claude/skills/architecture-decision-builder/references/axis-catalog.md` | create | [FR-1](FR.md#fr-1-axis-enumeration-из-prd) — BMAD seed + cascading map |
| `.claude/skills/architecture-decision-builder/references/variant-format-spec.md` | create | [FR-2](FR.md#fr-2-per-axis-artefact-markdown--self-contained-html) — per-variant skeleton |
| `.claude/skills/architecture-decision-builder/references/html-style-guide.md` | create | [FR-2](FR.md#fr-2-per-axis-artefact-markdown--self-contained-html) — color tokens |
| `extensions/specs-workflow/tools/specs-generator/architecture-decision/architecture-decision-cli.ts` | create | [FR-7](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175) — CLI dispatcher |
| `extensions/specs-workflow/tools/specs-generator/architecture-decision/axis-detector.ts` | create | [FR-1](FR.md#fr-1-axis-enumeration-из-prd) — 3-layer detection |
| `extensions/specs-workflow/tools/specs-generator/architecture-decision/artefact-generator.ts` | create | [FR-2](FR.md#fr-2-per-axis-artefact-markdown--self-contained-html) — md+html randomized |
| `extensions/specs-workflow/tools/specs-generator/architecture-decision/html-renderer.ts` | create | [FR-2](FR.md#fr-2-per-axis-artefact-markdown--self-contained-html) — self-contained HTML |
| `extensions/specs-workflow/tools/specs-generator/architecture-decision/index-compiler.ts` | create | [FR-5](FR.md#fr-5-index-compile-idempotent-status-matrix) — idempotent INDEX |
| `extensions/specs-workflow/tools/specs-generator/architecture-decision/open-in-browser.ts` | create | [FR-3](FR.md#fr-3-browser-auto-open-cross-platform-enoent-safe) — cross-platform launch |
| `extensions/specs-workflow/tools/specs-generator/architecture-decision/live-fetch.ts` | create | [FR-8](FR.md#fr-8-anti-bias-guardrails) — версии + 24h cache |
| `extensions/specs-workflow/tools/specs-generator/architecture-decision/escape-log.ts` | create | [FR-10](FR.md#fr-10-escape-hatch-с-audit-trail) — JSONL writer |
| `extensions/specs-workflow/tools/specs-generator/architecture-decision/audit.ts` | create | [FR-9](FR.md#fr-9-audit-category-architecture_coverage) — ARCHITECTURE_COVERAGE |
| `extensions/specs-workflow/tools/specs-generator/templates/ARCHITECTURE_AXIS.md.template` | create | [FR-2](FR.md#fr-2-per-axis-artefact-markdown--self-contained-html) — per-axis skeleton |
| `extensions/specs-workflow/tools/specs-generator/templates/ARCHITECTURE_INDEX.md.template` | create | [FR-5](FR.md#fr-5-index-compile-idempotent-status-matrix) — INDEX skeleton |
| `.claude/rules/specs-workflow/architecture-decision/when-to-build-architecture.md` | create | [FR-1](FR.md#fr-1-axis-enumeration-из-prd) — trigger map + hard-OUT |
| `.claude/rules/specs-workflow/architecture-decision/escape-hatch-audit.md` | create | [FR-10](FR.md#fr-10-escape-hatch-с-audit-trail) — escape audit |
| `.claude/skills/create-spec/references/phase1.75_architecture-decisions.md` | create | [FR-7](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175) — Phase 1.75 spec |
| `.claude/skills/create-spec/references/phase3plus_audit-architecture-coverage.md` | create | [FR-9](FR.md#fr-9-audit-category-architecture_coverage) — audit reference |
| `.claude/skills/create-spec/SKILL.md` | edit | [FR-7](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175) — Phase 1.75 в navigation |
| `.claude/skills/create-spec/references/phase1.5_project-context.md` | edit | [FR-7](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175) — переход в 1.75 |
| `.claude/skills/create-spec/references/phase3plus_audit-overview.md` | edit | [FR-9](FR.md#fr-9-audit-category-architecture_coverage) — 9-я категория |
| `extensions/specs-workflow/tools/specs-generator/spec-status.ts` | edit | [FR-7](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175) — Architecture phase + v4 guard |
| `extensions/specs-workflow/extension.json` | edit | [FR-7](FR.md#fr-7-два-режима-запуска-standalone--create-spec-phase-175) — регистрация skill/rules/tools |
| `tests/e2e/architecture-decision/axis-detector.test.ts` | create | [FR-1](FR.md#fr-1-axis-enumeration-из-prd) — ARCH001 |
| `tests/e2e/architecture-decision/artefact-generator.test.ts` | create | [FR-2](FR.md#fr-2-per-axis-artefact-markdown--self-contained-html) — ARCH002 |
| `tests/e2e/architecture-decision/index-compiler.test.ts` | create | [FR-5](FR.md#fr-5-index-compile-idempotent-status-matrix) — ARCH003 |
| `tests/e2e/architecture-decision/open-in-browser.test.ts` | create | [FR-3](FR.md#fr-3-browser-auto-open-cross-platform-enoent-safe) — ARCH004 |
| `tests/e2e/architecture-decision/cli-integration.test.ts` | create | [FR-4](FR.md#fr-4-итеративный-выбор-через-askuserquestion) — ARCH005 |
| `tests/e2e/architecture-decision/architecture-decision-builder.feature` | create | BDD @feature1..@feature10 |
| `tests/fixtures/architecture-decision/greenfield-prd.md` | create | Fixture — greenfield detection |
| `tests/fixtures/architecture-decision/brownfield-prd.md` | create | Fixture — hard-OUT skip |
| `tests/fixtures/architecture-decision/expected-axes.json` | create | Golden output axis-detector |
| `.claude/skills/architecture-decision-builder/evals/evals.json` | create | [FR-11](FR.md#fr-11-eval-suite--debug--benchmark-качества-2-слоя) — deterministic eval contract |
| `.claude/skills/architecture-decision-builder/evals/rubric.json` | create | [FR-11](FR.md#fr-11-eval-suite--debug--benchmark-качества-2-слоя) — R1-R9 qualitative rubric |
| `.claude/skills/architecture-decision-builder/evals/artifact-bench/scenario-bhph/ARCHITECTURE_PROPOSAL.md` | create | [FR-11](FR.md#fr-11-eval-suite--debug--benchmark-качества-2-слоя) — golden bench (из bhph dry-run) |
| `tests/e2e/architecture-decision/eval-suite.test.ts` | create | [FR-11](FR.md#fr-11-eval-suite--debug--benchmark-качества-2-слоя) — ARCH006 eval runner + rubric |
| `tools/eval-runner-adb.py` | create | [FR-11](FR.md#fr-11-eval-suite--debug--benchmark-качества-2-слоя) — deterministic eval runner (копия eval-runner-svm.py) |
| `CLAUDE.md` | edit | Добавить 2 новых rule в таблицу Rules (claude-md-glossary) |
