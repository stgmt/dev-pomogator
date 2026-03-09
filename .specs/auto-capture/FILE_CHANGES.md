# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `.dev-pomogator/tools/learnings-capture/capture.ts` | create | [FR-1](FR.md#fr-1-capture-hook-script) — Hook entry point |
| `.dev-pomogator/tools/learnings-capture/queue.ts` | create | [FR-2](FR.md#fr-2-queue-schema), [FR-3](FR.md#fr-3-atomic-queue-operations) — Queue operations |
| `.dev-pomogator/tools/learnings-capture/semantic.ts` | create | [FR-1b](FR.md#fr-1b-ai-powered-semantic-detection) — LLM detection |
| `.dev-pomogator/tools/learnings-capture/dedupe.ts` | create | [FR-5](FR.md#fr-5-auto-dedupe-in-phase-25-feature3), [FR-7](FR.md#fr-7-auto-dedupe-rules-in-phase-6-feature3) — Dedup logic |
| `.dev-pomogator/tools/learnings-capture/types.ts` | create | Shared TypeScript interfaces |
| `extensions/suggest-rules/extension.json` | edit | [FR-8](FR.md#fr-8-extension-manifest-update) — hooks, toolFiles, commands, version bump |
| `extensions/suggest-rules/claude/commands/suggest-rules.md` | edit | [FR-4](FR.md#fr-4-suggest-rules-phase--15-integration) — Phase -1.5 |
| `extensions/suggest-rules/cursor/commands/suggest-rules.md` | edit | [FR-4](FR.md#fr-4-suggest-rules-phase--15-integration) — Phase -1.5 |
| `extensions/suggest-rules/claude/commands/reflect.md` | create | [FR-6](FR.md#fr-6-reflect-command) — /reflect command |
| `extensions/suggest-rules/cursor/commands/reflect.md` | create | [FR-6](FR.md#fr-6-reflect-command) — /reflect command |
| `tests/features/plugins/suggest-rules/PLUGIN009_auto-capture.feature` | create | BDD сценарии |
| `tests/e2e/auto-capture.test.ts` | create | E2E тесты |
| `tests/fixtures/learnings-capture/empty-queue.json` | create | Test fixture — empty queue |
| `tests/fixtures/learnings-capture/populated-queue.json` | create | Test fixture — populated queue |
| `tests/fixtures/learnings-capture/corrupted-queue.json` | create | Test fixture — corrupted JSON |
| `tests/fixtures/learnings-capture/hook-input-correction.json` | create | Test fixture — UserPromptSubmit input |
| `tests/fixtures/learnings-capture/hook-input-stop.json` | create | Test fixture — Stop input |
| `tests/fixtures/learnings-capture/sample-transcript.jsonl` | create | Test fixture — transcript |
| `tests/fixtures/learnings-capture/existing-rule.md` | create | Test fixture — rule for dedupe |
| `CLAUDE.md` | edit | Добавить /reflect в Commands таблицу |
| `tests/fixtures/learnings-capture/hook-input-threshold.json` | create | Test fixture — UserPromptSubmit input for threshold test |
| `tests/fixtures/learnings-capture/transcript-no-signals.jsonl` | create | Test fixture — transcript without T1-T6 but with non-trivial investigation |
| `tests/fixtures/learnings-capture/queue-with-fingerprint.json` | create | Test fixture — queue with fingerprint/count fields for dedup test |
