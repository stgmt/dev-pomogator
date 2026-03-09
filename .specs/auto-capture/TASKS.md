# Tasks

## TDD Workflow

> Задачи организованы по TDD: Red -> Green -> Refactor.
> Каждый этап реализации начинается с .feature сценария (Red), затем реализация (Green), затем рефакторинг.

## Phase 0: BDD Foundation (Red)

> Создать .feature файл, step definitions, и BDD hooks ПЕРЕД реализацией бизнес-логики.
> Все сценарии должны FAIL (Red) на этом этапе.

- [ ] Скопировать `.specs/auto-capture/auto-capture.feature` в `tests/features/plugins/suggest-rules/PLUGIN009_auto-capture.feature`
  _Requirements: все FR/AC_

- [ ] Создать `tests/e2e/auto-capture.test.ts` со step definitions (заглушки с throw "Not implemented")
  _Requirements: все FR/AC_

- [ ] Создать fixture: `tests/fixtures/learnings-capture/empty-queue.json`
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_

- [ ] Создать fixture: `tests/fixtures/learnings-capture/populated-queue.json` (5 entries, mixed status)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_

- [ ] Создать fixture: `tests/fixtures/learnings-capture/corrupted-queue.json` (invalid JSON)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_

- [ ] Создать fixture: `tests/fixtures/learnings-capture/hook-input-correction.json` (UserPromptSubmit T2)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_

- [ ] Создать fixture: `tests/fixtures/learnings-capture/hook-input-stop.json` (Stop with transcript_path)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_

- [ ] Создать fixture: `tests/fixtures/learnings-capture/sample-transcript.jsonl` (T2, T3, T6 signals)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_

- [ ] Создать fixture: `tests/fixtures/learnings-capture/existing-rule.md` (rule for dedupe overlap test)
  _Source: DESIGN.md "BDD Test Infrastructure" > "Test Data & Fixtures"_

- [ ] Создать hook: `tests/e2e/fixtures/queue-setup.ts` (BeforeEach, per-test) — setup learnings-queue.json
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_

- [ ] Создать hook: `tests/e2e/fixtures/queue-cleanup.ts` (AfterEach, per-test) — cleanup queue + lock + tmp + bak
  _Source: DESIGN.md "BDD Test Infrastructure" > "Новые hooks"_

- [ ] Verify: все 21 testable сценарий FAIL (Red), 11 @agent-behavior = documentation only

## Phase 1: Types + Queue (Green) @feature2 @feature3

> Реализовать базовые типы и атомарные операции с очередью.

- [ ] Создать `.dev-pomogator/tools/learnings-capture/types.ts` — TypeScript interfaces (QueueEntry, Queue, Signal, OverlapResult) @feature2
  _Requirements: [FR-2](FR.md#fr-2-queue-schema)_
  _Leverage: DESIGN.md TypeScript Interfaces_

- [ ] Создать `.dev-pomogator/tools/learnings-capture/queue.ts` — readQueue, appendEntries, updateEntries, removeByStatus, acquireLock, releaseLock @feature2 @feature3
  _Requirements: [FR-2](FR.md#fr-2-queue-schema), [FR-3](FR.md#fr-3-atomic-queue-operations)_
  _Leverage: `.claude/rules/atomic-config-save.md`, `.claude/rules/atomic-update-lock.md`_

- [ ] Добавить fingerprint, count, lastSeen в QueueEntry type @feature1a
  _Requirements: [FR-2](FR.md#fr-2-queue-schema)_
  _Source: claude-reflect-system fingerprint dedup_

- [ ] Реализовать generateFingerprint() в queue.ts @feature1a
  _Requirements: [FR-3](FR.md#fr-3-atomic-queue-operations)_

- [ ] Обновить appendEntries() для fingerprint dedup @feature1a
  _Requirements: [FR-3](FR.md#fr-3-atomic-queue-operations)_
  _Source: claude-reflect-system learning_ledger.py_

- [ ] Verify: сценарии @feature2 (Queue schema), @feature3 (Atomic write, Recovery) переходят из Red в Green

## Phase 2: Regex Detection (Green) @feature1 @feature1a

> Реализовать regex-based detection для UserPromptSubmit hook.

- [ ] Создать `.dev-pomogator/tools/learnings-capture/capture.ts` — hook entry point с regex detection @feature1 @feature1a
  _Requirements: [FR-1](FR.md#fr-1-capture-hook-script), [FR-1a](FR.md#fr-1a-regex-based-detection)_
  _Leverage: `.dev-pomogator/tools/specs-validator/validate-specs.ts` (паттерн UserPromptSubmit hook)_

- [ ] Добавить threshold check в capture.ts после appendEntries @feature5
  _Requirements: [FR-10](FR.md#fr-10-auto-suggest-threshold-feature5)_

- [ ] Добавить approval regex patterns в capture.ts @feature6
  _Requirements: [FR-1a](FR.md#fr-1a-regex-based-detection)_
  _Source: claude-reflect-system MEDIUM approval patterns_

- [ ] Реализовать approval boost logic для existing entries @feature6
  _Requirements: [FR-1a](FR.md#fr-1a-regex-based-detection)_

- [ ] Verify: сценарии @feature1 (Capture T2, No capture), @feature1a (T2 EN/RU, T6, explicit marker, fingerprint dedup), @feature5 (threshold notification), @feature6 (approval boost) переходят из Red в Green

## Phase 3: Semantic Detection (Green) @feature1b

> Реализовать AI-powered semantic detection для Stop hook.

- [ ] Создать `.dev-pomogator/tools/learnings-capture/semantic.ts` — LLM detection + fallback @feature1b
  _Requirements: [FR-1b](FR.md#fr-1b-ai-powered-semantic-detection)_
  _Leverage: `.dev-pomogator/tools/auto-commit/auto_commit_core.ts` (LLM call + transcript reading)_

- [ ] Расширить LLM prompt template self-evaluation gates в semantic.ts @feature1b
  _Requirements: [FR-1b](FR.md#fr-1b-ai-powered-semantic-detection)_
  _Source: Claudeception self-evaluation gates_

- [ ] Verify: сценарии @feature1b (Semantic detection, Fallback to regex, Self-evaluation gates) переходят из Red в Green

## Phase 4: Dedupe (Green) @feature3

> Реализовать auto-dedupe логику для Phase 2.5 и Phase 6.

- [ ] Создать `.dev-pomogator/tools/learnings-capture/dedupe.ts` — checkOverlap, findMergeCandidates @feature3
  _Requirements: [FR-5](FR.md#fr-5-auto-dedupe-in-phase-25-feature3), [FR-7](FR.md#fr-7-auto-dedupe-rules-in-phase-6-feature3)_
  _Leverage: `extensions/suggest-rules/skills/rules-optimizer/scripts/audit.ts` (dedupe logic)_

- [ ] Verify: сценарии @feature3 (Auto-dedupe DUP, MERGE, Phase 6 dedupe) переходят из Red в Green

## Phase 5: Suggest-Rules Integration + Reflect (Green) @feature4 @feature2

> Интегрировать Phase -1.5 в suggest-rules и создать /reflect command.

- [ ] Редактировать `extensions/suggest-rules/claude/commands/suggest-rules.md` — добавить Phase -1.5 @feature4
  _Requirements: [FR-4](FR.md#fr-4-suggest-rules-phase--15-integration)_

- [ ] Редактировать `extensions/suggest-rules/cursor/commands/suggest-rules.md` — добавить Phase -1.5 @feature4
  _Requirements: [FR-4](FR.md#fr-4-suggest-rules-phase--15-integration)_

- [ ] Создать `extensions/suggest-rules/claude/commands/reflect.md` — /reflect command @feature2
  _Requirements: [FR-6](FR.md#fr-6-reflect-command)_

- [ ] Создать `extensions/suggest-rules/cursor/commands/reflect.md` — /reflect command @feature2
  _Requirements: [FR-6](FR.md#fr-6-reflect-command)_

- [ ] Добавить descriptionHint к pre-candidates из queue @feature4
  _Requirements: [FR-4](FR.md#fr-4-suggest-rules-phase--15-integration)_
  _Source: Claudeception description optimization_

- [ ] Добавить ACCUMULATED_EVIDENCE и CROSS_SESSION_REPEAT scoring bonuses @feature4
  _Requirements: [FR-4](FR.md#fr-4-suggest-rules-phase--15-integration)_
  _Source: claude-reflect-system count-based promotion_

- [ ] Verify: сценарии @feature4 (Phase -1.5 consumes, skips empty, descriptionHint), @feature2 (/reflect table, reject, empty) переходят из Red в Green

## Phase 6: Extension Manifest + Verification (Green) @feature4

> Обновить extension.json и добавить verification checks.

- [ ] Редактировать `extensions/suggest-rules/extension.json` — hooks, toolFiles, commands, version bump @feature4
  _Requirements: [FR-8](FR.md#fr-8-extension-manifest-update)_

- [ ] Добавить auto-capture checks в verify-install @feature4
  _Requirements: [FR-9](FR.md#fr-9-installation-verification)_

- [ ] Редактировать `CLAUDE.md` — добавить /reflect в Commands таблицу @feature2
  _Requirements: [FR-6](FR.md#fr-6-reflect-command)_

- [ ] Verify: сценарии @feature4 (Hooks registered, Verify-install) переходят из Red в Green

## Phase 7: Refactor & Polish

- [ ] Все 21 testable BDD сценария GREEN (11 @agent-behavior = documentation, not tested)
- [ ] Рефакторинг общих утилит между capture.ts, queue.ts, semantic.ts
- [ ] NFR проверки: UserPromptSubmit < 500ms, queue read < 100ms
- [ ] E2E тест-план выполнен через `npm test`
