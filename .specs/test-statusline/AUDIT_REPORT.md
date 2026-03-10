# Аудит спецификации: test-statusline

Дата: 2026-03-09T20:44

## Сводка

| # | Категория | Авто | AI | Итого | Макс. критичность |
|---|-----------|------|----|-------|-------------------|
| 1 | ОШИБКИ (Errors) | 0 | 3 | 3 | ERROR |
| 2 | ЛОГИЧЕСКИЕ ПРОБЕЛЫ (Logic Gaps) | 0 | 0 | 0 | — |
| 3 | НЕКОНСИСТЕНТНОСТЬ (Inconsistency) | 1 | 0 | 1 | INFO |
| 4 | РУДИМЕНТЫ (Rudiments) | 0 | 3 | 3 | ERROR |
| 5 | ФАНТАЗИИ (Fantasies) | 0 | 0 | 0 | — |
| | **ИТОГО** | **1** | **6** | **7** | |

Все 7 findings исправлены. 0 остаточных проблем после re-audit.

---

## Категория 1: ОШИБКИ (Errors)

| # | Критичность | Файл | Проблема | Исправление |
|---|-------------|------|----------|-------------|
| 1 | ERROR | RESEARCH.md:61 | Path `logs/.test-status.{session_id}.yaml` не соответствует DESIGN.md path `.dev-pomogator/.test-status/status.{prefix}.yaml` | Исправлен путь на `.dev-pomogator/.test-status/status.{session_id_prefix}.yaml` |
| 2 | ERROR | RESEARCH.md:62 | Daemon PID path `logs/.test-daemon.{session_id}.pid` — нет в архитектуре (daemon удалён) | Удалена строка |
| 3 | ERROR | USE_CASES.md:40-41 | UC-3 использует `logs/.test-status.{session_id_A}.yaml` вместо `.dev-pomogator/.test-status/` | Исправлен путь |

---

## Категория 2: ЛОГИЧЕСКИЕ ПРОБЕЛЫ (Logic Gaps)

Нет findings. Полная трассировка: FR → AC → BDD → TASKS для всех 9 FR.

---

## Категория 3: НЕКОНСИСТЕНТНОСТЬ (Inconsistency)

| # | Критичность | Файл(ы) | Проблема | Исправление |
|---|-------------|---------|----------|-------------|
| 1 | INFO | FR.md | FR-1 has sub-variant FR-1a but FR-2 does not | Обоснованно: FR-1 = happy path, FR-1a = error handling. FR-2 не требует split. Пропущено. |

---

## Категория 4: РУДИМЕНТЫ (Rudiments)

| # | Критичность | Файл | Проблема | Исправление |
|---|-------------|------|----------|-------------|
| 1 | ERROR | USE_CASES.md UC-2 | Описывает daemon lifecycle (запуск, остановка, PID files) — архитектура изменена на wrapper | Переписан UC-2: теперь описывает SessionStart hook init + cleanup |
| 2 | ERROR | USE_CASES.md UC-4 | Описывает daemon process scanning — нет в финальной архитектуре | Переписан UC-4: теперь описывает test runner wrapper + YAML writes |
| 3 | ERROR | RESEARCH.md:70 | "Daemon подход валиден" — устаревшее утверждение | Заменено на "Wrapper подход валиден" |

---

## Категория 5: ФАНТАЗИИ (Fantasies)

Нет findings. Все технические утверждения подтверждены PoC или документацией.

---

## Рекомендации

Все исправления применены автоматически:

1. **Высокая критичность:** Устранены 3 path inconsistencies (RESEARCH.md, USE_CASES.md) — устаревшие `logs/` пути заменены на `.dev-pomogator/.test-status/`
2. **Высокая критичность:** Устранены 3 daemon-reference rudiments (USE_CASES.md UC-2/UC-4, RESEARCH.md) — заменены на wrapper-based описания
3. **Информационная:** FR split consistency (INFO) — обоснованно, не требует действий
