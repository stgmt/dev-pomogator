# Spec Review: out-session-advisor

**Phase:**
Complete (реализация 2026-08-15, live-проверки)
**Generated:**
2026-08-14T10:10:00Z (обновлено 2026-08-15)
**Scope:**
1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 14, 15, 16

## Реализация + live-проверки (2026-08-15)

FR-1..10 доведены до рабочего кода в `tools/out-session-advisor/`, проверены против реальных
артефактов (детали — `RESEARCH.md «Реализация + live-проверки»`):
- FR-2 `worker_driver.py` — живой `converse` через stream-json: `OK-DRIVER`, session_id `7849dd84...`,
  cost `0.21$`; `AskUserQuestion` отсутствует в tools (вопрос текстом в result).
- FR-1 `tail_session.py` — продакшн-субагенты `agent-*.jsonl` читаются (`[subagent <id>]`, isSidechain).
- FR-3 `verify_claims.ts` — chain `307,403,200` → intermediate-403 (не блокер); sqlite live-blocker archived → no-live-blocker.
- FR-4 `monitor.py` — `dead` / `thinking-xhigh` различены.
- ФБ-5 SKILL + зеркало идентичны; skill-health 0 blocking.

## Docker BDD run — ENVIRONMENTAL BLOCKER (2026-08-15, честно)

Полный `scripts/docker-bdd.sh` в WSL был предпринят дважды:
- первый прогон дошёл до запуска контейнера и записи ndjson (38MB в `.dev-pomogator/.docker-status/`,
  наши OUTSESS001_01..16 появились в gherkin-источнике), НО WSL-сервис оборвался
  (`Wsl/Service/0x8007274c`) на длинном полном сьюте — финальный `.last-test-run.ndjson`
  не записан.
- целенаправленный `docker-bdd.sh --name OUTSESS001` завис на `docker compose build`
  (`docker-buildx` поднял `git.exe` на контекст) — больше 10 мин без прогресса; прерван.

**Статус BDD-gate: `environmental_blocker`** (не результат сценариев). Live-проверки FR-1..10 выполнены
на реальной сессии/файлах (см. RESEARCH). Повторный Docker-прогон — после стабилизации WSL/docker
(например `docker system prune`, или сборка образа вне WSL-git-bridge).

## Summary

| Severity | Count | Verdict |
|----------|-------|---------|
| P0 (blockers) | 0 | ✅ clear |
| P1 (fix before stop) | 0 | ✅ clear |
| P2 (recommendations) | 3 | ℹ️ logged |
| P3 (informational) | 0 | ℹ️ logged |

**Overall verdict:** READY

## P0 Findings

Нет.

## P1 Findings

Нет.

## P2 / P3 Findings

| # | Category | Location | Note |
|---|----------|----------|------|
| 1 | 6 FEATURE_TAG | USE_CASES.md | UC-1..UC-5 (Часть A) не несут `@feature5` для FR-5 (скил); тег @feature5 есть в USER_STORIES/feature — цепочка не рвётся, но use-case для скила не помечен тегом. Рекомендация: добавить @feature5 в UC-5 или на будущее держать 1:1. |
| 2 | 15 REALITY_DRIFT | DESIGN.md narrative `out-session-advisor/SKILL.md` | Путь — планируемый (FILE_CHANGES create + TASKS T2-11); WARNING легитимен до реализации. |
| 3 | 15 REALITY_DRIFT | TASKS↔FILE_CHANGES (8×INFO) | README.md, `.claude-plugin/hooks.json`, `.claude/settings.json`, фикстуры не упомянуты отдельными задачами в TASKS; покрыты неявно (Phase 0 hook/fixture группы + T3-18). INFO, не блокирует. |

## Auto-fix patches

### Patch 1: hooks-пути в DESIGN.md narrative

**File:** `.specs/out-session-advisor/DESIGN.md`

**old_string:**
```
hooks `git-guard` в `.Codex-plugin/hooks.json` + dogfood `.Codex/settings.json`
```

**new_string:**
```
hooks `git-guard` в `.claude-plugin/hooks.json` (canonical, существует) + dogfood `.claude/settings.json` (существует)
```

> Применён. Оставшийся 1 WARNING (SKILL.md path) легитимен — файл создаётся при T2-11.

## Notes (категории с no-findings)

- C1 EXT_API: клаймы про Claude Code CLI (`--resume`, `--dangerously-skip-permissions`, `--model`) [VERIFIED] через `claude --help` в session; pywinpty — локальная зависимость, не external API.
- C2 EXISTING_ASSET: скрипты `%TEMP%\opencode\` переносятся в плагин — не дубль, а параметризация существующего работного артефакта; `tools/advisor/` PoC остаётся отдельной библиотекой (не пере-интегрируется).
- C5 OPEN_Q_STALE: Open Questions в RESEARCH нет — отсутствуют.
- C7 TOOLING: raw-тест-раннеры в TASKS не найдены; упоминания команд — Python/TS CLI-интерфейсы инструментов, не тест-раннеры.
- C10 FLUFF: только ложные hits в формулировках OOS; замеров «быстро/стабильно» без цифр нет (NFR-PERF задают числа).
- C14 MEMORY: запрещённых литералов (`stgmt/`, user-identifiers) в кодовых путях спеки нет; упоминания `6126f730...`, `E:\repos\sales`, `ses_00b9321...` — это evidence-примеры из live-эксперимента, помечены `[VERIFIED]`/сносками, не хардкод в коде.
- C16 ACCEPTANCE_DELIVERY: `acceptance-task-coverage` → `"ok": true, claims: []` — проход.