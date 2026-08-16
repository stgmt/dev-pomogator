# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

> ⚠️ `edit`/`delete` — только для СУЩЕСТВУЮЩИХ на диске путей (audit FILE_CHANGES_VERIFY бьёт HARD ERROR-ом по edit-строке с несуществующим путём). Для планируемых файлов — `create`.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `tools/out-session-advisor/tail_session.py` | edit | [FR-1](FR.md#fr-1-tail-главного-транскрипта-живых-subagents-снятие-слепоты) |
| `tools/out-session-advisor/strip_ansi.py` | edit | [FR-1](FR.md#fr-1-tail-главного-транскрипта-живых-subagents-снятие-слепоты) |
| `tools/out-session-advisor/pty_daemon.py` | edit | [FR-2](FR.md#fr-2-управление-воркером-stream-json-primary-conpty-fallback) (fallback) |
| `tools/out-session-advisor/worker_driver.py` | edit | [FR-2](FR.md#fr-2-управление-воркером-stream-json-primary-conpty-fallback) (PRIMARY, stream-json) |
| `tools/out-session-advisor/verify_claims.ts` | edit | [FR-3](FR.md#fr-3-факт-проверка-отчётов-воркера-verifyclaims) |
| `tools/out-session-advisor/consult.mjs` | create | [FR-3](FR.md#fr-3-факт-проверка-отчётов-воркера-verifyclaims) (модель-консультация, модель-пара) |
| `tools/out-session-advisor/lock.ts` | edit | [FR-7](FR.md#fr-7-атомарный-лок-сервис-с-владельцем-и-stale-восстановлением) |
| `tools/out-session-advisor/git-guard.ts` | edit | [FR-6](FR.md#fr-6-git-гейт-против-add-a-и-чужих-staged-runtime-слой-no-git-add-all-shared-tree) |
| `tools/out-session-advisor/inventory.ts` | edit | [FR-8](FR.md#fr-8-инвентаризация-сессий-по-нескольким-репо) |
| `tools/out-session-advisor/diag.ts` | edit | [FR-9](FR.md#fr-9-диагностика-кто-писал-файл-single-writer-для-адвизора), [FR-10](FR.md#fr-10-сводная-диагностика-параллельности-okdirtyconflict) |
| `tools/out-session-advisor/README.md` | edit | NFR-US-1..4 |
| `.claude/skills/out-session-advisor/SKILL.md` | edit | [FR-5](FR.md#fr-5-канонический-skillmd-зеркало-доменные-истины) |
| `.agents/skills/out-session-advisor/SKILL.md` | edit | [FR-5](FR.md#fr-5-канонический-skillmd-зеркало-доменные-истины) (зеркало) |
| `.claude-plugin/hooks.json` | edit | FR-6 git-guard hook registration (существует) |
| `.claude/settings.json` | edit | FR-6 dogfood hook (существует) |
| `tests/features/plugins/out-session-advisor/OUTSESS001_out-session-advisor.feature` | create | FR-1..10 BDD |
| `tests/step_definitions/out-session-advisor.ts` | edit | FR-1..10 step-defs |
| `tests/support/out-session-advisor-hooks.ts` | create | TEST_DATA lifecycle |
| `tests/features/plugins/out-session-advisor/fixtures/E--main-session/main-session.jsonl` | edit | FR-1 (фикстура реального транскрипта) |
| `tests/features/plugins/out-session-advisor/fixtures/E--main-session/main-session/subagents/agent-test.jsonl` | edit | FR-1 (фикстура живого субагента) |
| `tests/features/plugins/out-session-advisor/fixtures/events.jsonl` | edit | FR-1/FR-2 (фикстура событийного лога stream-json, реальный формат) |
| `tests/features/plugins/out-session-advisor/fixtures/E--session-a/session-A.jsonl` | edit | FR-9 (транскрипт сессии A) |
| `tests/features/plugins/out-session-advisor/fixtures/E--session-b/session-B.jsonl` | edit | FR-9 (транскрипт сессии B) |
| `tests/features/plugins/out-session-advisor/fixtures/git-fixture/` | edit | FR-6 (git-репо со staged-путями) |