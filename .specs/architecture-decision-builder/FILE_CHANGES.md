# File Changes

Список файлов фичи. **Статус: FR-1..FR-16 shipped.** FR-1..FR-12 — коммиты `83b66e3` (ядро) + `d58b9d0` (non-webapp catalog). FR-13..FR-16 (synthesis / correction-log / live-context7 / selection-policy) — реализованы по плану `~/.claude/plans/jolly-snacking-plum.md` (eval 29/29). Action `edit` = файл существовал, дальнейшие изменения правкой; `create` = новый файл этой фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.claude/skills/architecture-decision-builder/SKILL.md` | edit | [FR-7](FR.md#fr-7-два-режима-запуска-standalone-create-spec-phase-175) — skill core; + [FR-13/14/15/16](FR.md#fr-16-selection-policy-default-mvp-poc): policy step 1.5, synthesis step 3.5, live-context7 + correction дисциплины, allowed-tools += context7 MCP (shipped) |
| `.claude/skills/architecture-decision-builder/references/axis-catalog.md` | edit | [FR-1](FR.md#fr-1-axis-enumeration-из-prd) — BMAD seed + cascading (shipped; non-webapp в d58b9d0) |
| `.claude/skills/architecture-decision-builder/references/variant-format-spec.md` | edit | [FR-2](FR.md#fr-2-per-axis-artefact-markdown-self-contained-html) — per-variant skeleton; + [FR-16](FR.md#fr-16-selection-policy-default-mvp-poc) policy_fit + [FR-14](FR.md#fr-14-correction-log-reasoning-journey) correction_log поля (shipped) |
| `.claude/skills/architecture-decision-builder/references/html-style-guide.md` | edit | [FR-2](FR.md#fr-2-per-axis-artefact-markdown-self-contained-html) — color tokens (shipped) |
| `tools/specs-generator/architecture-decision/architecture-decision-cli.ts` | edit | [FR-7](FR.md#fr-7-два-режима-запуска-standalone-create-spec-phase-175) — CLI dispatcher; + [FR-13](FR.md#fr-13-cross-axis-synthesis) `synthesis` команда (shipped) |
| `tools/specs-generator/architecture-decision/synthesis.ts` | create | [FR-13](FR.md#fr-13-cross-axis-synthesis) — cross-axis synthesis helper (collectAxisIds/validateInsights/synthesize → SYNTHESIS.md+html, ≥2-axis инвариант) (shipped) |
| `tools/specs-generator/architecture-decision/full-report.ts` | create | [FR-19](FR.md#fr-19-единый-self-contained-architecturehtml-full-report) — buildFullReport: AXIS-*.model.json + insights + COMPLETENESS.md → ARCHITECTURE.html via renderers (shipped) |
| `extensions/specs-workflow/tools/specs-generator/templates/SYNTHESIS.md.template` | create | [FR-13](FR.md#fr-13-cross-axis-synthesis) — cross-axis synthesis skeleton (shipped) |
| `tools/specs-generator/architecture-decision/axis-detector.ts` | edit | [FR-1](FR.md#fr-1-axis-enumeration-из-prd) — 3-layer detection + non-webapp (shipped) |
| `tools/specs-generator/architecture-decision/artefact-generator.ts` | edit | [FR-2](FR.md#fr-2-per-axis-artefact-markdown-self-contained-html) — md+html randomized; + [FR-16](FR.md#fr-16-selection-policy-default-mvp-poc) policy-aware recommended + demonstration-таблица в md, [FR-14](FR.md#fr-14-correction-log-reasoning-journey) Corrections секция (shipped) |
| `tools/specs-generator/architecture-decision/html-renderer.ts` | edit | [FR-2](FR.md#fr-2-per-axis-artefact-markdown-self-contained-html) — self-contained HTML; + [FR-16](FR.md#fr-16-selection-policy-default-mvp-poc)/[FR-14](FR.md#fr-14-correction-log-reasoning-journey)/[FR-13](FR.md#fr-13-cross-axis-synthesis): PolicyId, policy_fit/correction_log, pickRecommended, policy-badge, demonstration-таблица, renderSynthesisHtml (shipped) |
| `tools/specs-generator/architecture-decision/index-compiler.ts` | edit | [FR-5](FR.md#fr-5-index-compile-idempotent-status-matrix) — idempotent INDEX (shipped) |
| `tools/specs-generator/architecture-decision/open-in-browser.ts` | edit | [FR-3](FR.md#fr-3-browser-auto-open-cross-platform-enoent-safe) — cross-platform launch (shipped) |
| `tools/specs-generator/architecture-decision/live-fetch.ts` | edit | [FR-8](FR.md#fr-8-anti-bias-guardrails) — версии + 24h cache (shipped) |
| `tools/specs-generator/architecture-decision/escape-log.ts` | edit | [FR-10](FR.md#fr-10-escape-hatch-с-audit-trail) — JSONL writer + COMPLETENESS log (shipped) |
| `tools/specs-generator/architecture-decision/audit.ts` | edit | [FR-9](FR.md#fr-9-audit-category-architecturecoverage) + [FR-12](FR.md#fr-12-audit-category-completenesscoverage-completeness-ledger) — ARCHITECTURE + COMPLETENESS coverage (shipped) |
| `extensions/specs-workflow/tools/specs-generator/templates/ARCHITECTURE_AXIS.md.template` | edit | [FR-2](FR.md#fr-2-per-axis-artefact-markdown-self-contained-html) — per-axis skeleton (shipped) |
| `extensions/specs-workflow/tools/specs-generator/templates/ARCHITECTURE_INDEX.md.template` | edit | [FR-5](FR.md#fr-5-index-compile-idempotent-status-matrix) — INDEX skeleton (shipped) |
| `extensions/specs-workflow/tools/specs-generator/templates/COMPLETENESS.md.template` | edit | [FR-12](FR.md#fr-12-audit-category-completenesscoverage-completeness-ledger) — 8-dimension ledger skeleton (shipped) |
| `.claude/rules/specs-workflow/architecture-decision/when-to-build-architecture.md` | edit | [FR-1](FR.md#fr-1-axis-enumeration-из-prd) — trigger map + hard-OUT (shipped) |
| `.claude/rules/specs-workflow/architecture-decision/escape-hatch-audit.md` | edit | [FR-10](FR.md#fr-10-escape-hatch-с-audit-trail) — escape audit + completeness sibling (shipped) |
| `.claude/skills/create-spec/references/phase1.75_architecture-decisions.md` | edit | [FR-7](FR.md#fr-7-два-режима-запуска-standalone-create-spec-phase-175) — Phase 1.75 spec; + [FR-16](FR.md#fr-16-selection-policy-default-mvp-poc) policy step 1.5 + [FR-13](FR.md#fr-13-cross-axis-synthesis) synthesis step (shipped) |
| `.claude/skills/create-spec/references/phase3plus_audit-architecture-coverage.md` | edit | [FR-9](FR.md#fr-9-audit-category-architecturecoverage) — 9-я audit категория ref (shipped) |
| `.claude/skills/create-spec/references/phase3plus_audit-completeness-coverage.md` | edit | [FR-12](FR.md#fr-12-audit-category-completenesscoverage-completeness-ledger) — 10-я audit категория ref (shipped) |
| `.claude/skills/create-spec/SKILL.md` | edit | [FR-7](FR.md#fr-7-два-режима-запуска-standalone-create-spec-phase-175) — Phase 1.75 в navigation (shipped) |
| `.claude/skills/create-spec/references/phase1.5_project-context.md` | edit | [FR-7](FR.md#fr-7-два-режима-запуска-standalone-create-spec-phase-175) — переход в 1.75 (shipped) |
| `.claude/skills/create-spec/references/phase3plus_audit-overview.md` | edit | [FR-9](FR.md#fr-9-audit-category-architecturecoverage) + [FR-12](FR.md#fr-12-audit-category-completenesscoverage-completeness-ledger) — 9-я + 10-я категории (shipped) |
| `extensions/specs-workflow/extension.json` | edit | [FR-7](FR.md#fr-7-два-режима-запуска-standalone-create-spec-phase-175) — регистрация skill/rules/tools; + [FR-13](FR.md#fr-13-cross-axis-synthesis) synthesis.ts + SYNTHESIS.md.template в toolFiles, bump v1.22.0 (shipped) |
| `tests/e2e/architecture-decision.test.ts` | edit | ARCH001-005 (консолидированы) + invariants; + ARCH007_01-04 (synthesis/correction/context7/policy) 1:1 с @feature14-17 — закрывает тест-пробро FR-13..16 (shipped) |
| `tests/fixtures/architecture-decision/greenfield-prd.md` | edit | Fixture — greenfield detection (shipped) |
| `tests/fixtures/architecture-decision/brownfield-prd.md` | edit | Fixture — hard-OUT skip (shipped) |
| `tests/fixtures/architecture-decision/expected-axes.json` | edit | Golden output axis-detector (shipped) |
| `tests/fixtures/architecture-decision/sample-axis-model.json` | edit | Sample AxisModel для generate-axis / ARCH002 (shipped) |
| `tests/fixtures/architecture-decision/vpn-router-prd.md` | edit | Non-webapp fixture для eval-9 (shipped d58b9d0) |
| `.claude/skills/architecture-decision-builder/evals/evals.json` | edit | [FR-11](FR.md#fr-11-eval-suite-debug-benchmark-качества-2-слоя) — deterministic eval contract; + [FR-13](FR.md#fr-13-cross-axis-synthesis) eval-10 synthesis + [FR-16](FR.md#fr-16-selection-policy-default-mvp-poc) eval-11 policy (11 cases, shipped) |
| `.claude/skills/architecture-decision-builder/evals/rubric.json` | edit | [FR-11](FR.md#fr-11-eval-suite-debug-benchmark-качества-2-слоя) — rubric R1-R20; + R21 policy-selected, R22 policy-demonstration, R23 cross-axis-synthesis (shipped) |
| `.claude/skills/architecture-decision-builder/evals/artifact-bench/scenario-bhph/ARCHITECTURE_PROPOSAL.md` | edit | [FR-11](FR.md#fr-11-eval-suite-debug-benchmark-качества-2-слоя) — golden bench (shipped) |
| `tools/eval-runner-adb.py` | edit | [FR-11](FR.md#fr-11-eval-suite-debug-benchmark-качества-2-слоя) — deterministic eval runner; + grade_synthesis/grade_policy + synthesis/generate-axis-policy command branches (shipped) |
| `CLAUDE.md` | edit | 2 новых rule в таблицу Rules (claude-md-glossary, shipped) |
