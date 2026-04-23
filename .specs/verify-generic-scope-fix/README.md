# Verify Generic Scope Fix

**Feature slug:** `verify-generic-scope-fix` | **Domain code:** VSGF | **Extension home:** `extensions/scope-gate/`

## TL;DR

Skill + PreToolUse hook pair для **механической** верификации что каждый элемент, добавленный в enum/switch/array-gate, реально проходит через code path, который правится. Блокирует класс багов "structurally no-op scope expansion" — когда fix type-check-ается, но один из покрываемых cases никогда не доходит до изменённой функции (как `stocktaking` → `StartStockTakingModal` в webapp MR !100).

## Проблема

В webapp MR !100 (PRODUCTS-20218) Claude Code agent добавил `stocktaking` в `isOutboundDocument()` enum. У Stock Taking **отдельная** форма создания (`StartStockTakingModal.tsx`) с auto-generated qty — валидация `qty > available` для этого flow структурно недостижима. Fix был **no-op** для stocktaking. Reviewer (tech-lead evolkov) поймал на code review, MR вернулся на доработку.

Полный root-cause анализ (H1-H8 + 5 пропущенных code-signals): [RESEARCH.md](RESEARCH.md).

## Ключевые идеи

- **Code-evidence > domain sense** — LLM структурно не "чувствует" семантику как tech lead с 10 годами опыта в домене. Primary prevention lever = mechanical code grep (отдельный creation component / auto-generated values / separate endpoint / read-only flags), не domain glossary. Подтверждено инцидентом и research.
- **Skill = guidance, Hook = enforcement** — skill даёт процедурный 5-step checklist для каждого добавленного variant; hook блокирует commit если процедура не была пройдена. Пара покрывает H2 (noticed-but-didn't-act → процедура конвертирует diagnosis в action) + H3 (concerns-as-offload → нельзя обойти через "note and pray", только через explicit escape hatch с audit trail).
- **`disable-model-invocation: true`** — первый precedent в dev-pomogator. Модель не может self-invoke skill; только user или rule явно invoke-ает. Предотвращает self-override (H2 regression).
- **Escape hatch with audit** — `[skip-scope-verify: <reason ≥8 chars>]` в commit message → логируется в `.claude/logs/scope-gate-escapes.jsonl`. Legitimate bypass доступен, но grep-абельный для reviewer.
- **Anti-over-application** — docs/test-only diff dampening (FR-4) + hard-OUT signal list в rule `when-to-verify.md` — prevents H1 regression ("новое правило применяется слишком широко").

## Где лежит реализация

- **Source of truth** (dev-pomogator):
  - `extensions/scope-gate/tools/scope-gate/{scope-gate-guard,score-diff,marker-store}.ts`
  - `extensions/scope-gate/skills/verify-generic-scope-fix/SKILL.md` + `scripts/analyze-diff.ts`
  - `extensions/scope-gate/rules/{when-to-verify,escape-hatch-audit}.md`
  - `extensions/scope-gate/extension.json`
- **Target project after install**:
  - Skill → `.claude/skills/verify-generic-scope-fix/`
  - Hook scripts → `.dev-pomogator/tools/scope-gate/`
  - Rules → `.claude/rules/scope-gate/`
  - Hook registration → `.claude/settings.local.json` (per personal-pomogator contract)
- **Wiring**:
  - Installer copies per `extension.json` manifest (existing dev-pomogator contract)
  - User enables via `npx dev-pomogator install --extension scope-gate`

Полный список файлов: [FILE_CHANGES.md](FILE_CHANGES.md).

## Architecture summary

```
User /verify-generic-scope-fix → skill reads git diff --cached
  → for each added variant: grep dedicated flow / dataflow trace / value reachability
  → classify traced / unreachable / conditional
  → write marker .claude/.scope-verified/<sid>-<sha>.json
  → report to user

Later: Bash "git commit -m ..." → PreToolUse hook fires (matcher: "Bash")
  → score = scoreDiff(staged diff) with dampening
  → if score < 2 → pass
  → if escape-hatch regex → log + pass
  → if fresh marker matching session+hash+TTL<30min+should_ship=true → pass
  → else → deny (exit 2) with actionable message
```

Подробнее: [DESIGN.md](DESIGN.md).

## Reference incident + root cause taxonomy

- [RESEARCH.md](RESEARCH.md) — incident timeline, H1–H8 root causes, 5 code-signals missed, rejected alternatives (domain glossary / only-rule / only-hook), relevant rules inventory
- Memory cross-references (dev-pomogator auto-memory):
  - `reference_stocktaking-incident-products-20218.md` — full case study
  - `feedback_code-evidence-trumps-domain-sense.md` — H6 structural LLM limit
  - `feedback_single-incident-rules-over-generalize.md` — invalidating-evidence section requirement

## Где читать дальше

### Discovery (proglemma + stories)
- [USER_STORIES.md](USER_STORIES.md) — 4 stories (US-1 protected from no-op; US-2 auditable escape; US-3 not blocked on trivial; US-4 no self-override)
- [USE_CASES.md](USE_CASES.md) — 5 UCs (happy / docs-only / missing-verify / stale-marker / escape-hatch) + 4 edge cases

### Requirements
- [REQUIREMENTS.md](REQUIREMENTS.md) — traceability matrix FR ↔ AC ↔ UC ↔ @featureN
- [FR.md](FR.md) — 9 FRs
- [NFR.md](NFR.md) — Performance/Security/Reliability/Usability + Assumptions/Risks/OutOfScope
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — EARS per FR

### Design + BDD
- [DESIGN.md](DESIGN.md) — architecture, algorithms, Reuse Plan, BDD Test Infrastructure
- [verify-generic-scope-fix_SCHEMA.md](verify-generic-scope-fix_SCHEMA.md) — marker JSON schema, hook I/O, extension.json schema
- [FIXTURES.md](FIXTURES.md) — 7 fixtures F-1..F-7
- [verify-generic-scope-fix.feature](verify-generic-scope-fix.feature) — 11 VSGF001_NN scenarios

### Execution
- [FILE_CHANGES.md](FILE_CHANGES.md) — все files create/edit
- [TASKS.md](TASKS.md) — TDD Phase 0-6 execution plan
- [CHANGELOG.md](CHANGELOG.md) — version log

### Audit (Phase 3+)
- [AUDIT_REPORT.md](AUDIT_REPORT.md) — создаётся автоматически после Phase 3 Finalization

## Related rules

- `.claude/rules/plan-pomogator/cross-scope-coverage.md` — adjacent rule (multi-scope test coverage matrix); scope-gate = per-case codepath reach; cross-linked в `when-to-verify.md`
- `.claude/rules/plan-pomogator/proactive-investigation.md` — основание для "mechanical grep" подхода; `[UNVERIFIED]` paradigm расширяется до `unreachable` в skill output

## Status

- Phase 1 Discovery: ✓ complete
- Phase 1.5 Context: ✓ complete
- Phase 2 Requirements: ✓ complete
- Phase 3 Finalization: ⚙ in progress
- Phase 3+ Audit: ⏳ pending
