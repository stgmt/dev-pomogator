# Non-Functional Requirements (NFR)

## Performance

- Сборка одного digest сессии 10-16MB должна занимать ≤2s (этапы: чтение + git self-check async + repo-rules параллельно; измерено: 0.3-2.5s, после оптимизации git-части 310-1159ms).
- Сжатие raw→digest для крупных сессий ≤0.3% (0.1-0.3% фактически при `ADVISOR_DIGEST_MAX_TOKENS=3000`); summary-консультация ≤~9K× (109K→2.3K, 90MB→9.9K).
- Модельный вызов каждого прохода: fail-open timeout 30-45s; консультации не виснуть дольше.
- Тул `advisor` остаётся синхронным; внутри сборки digest — параллельно (async git spawn, Promise.all).

## Security

- Никаких секретов в коде/логи: ключи только из env (`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY`); не логировать полные промпты с токенами (trace кладёт метаданные/пакет, не секреты).
- `summary.md` — локальный файл в `.dev-pomogator/` (gitignored); пароли/секреты в транскрипте не должны попадать в summary (дельта bounded, секции пересказываются, не копируются слепо).
- Read-only self-check: только `git status/diff` чтение, `wx`-lock — только по сессии, никаких write-команд из адвизора.

## Reliability

- Fail-open по всей цепочке: нет токена/эндпоинта/таймаут/HTTP!=200/битый транскрипт/потеря структуры — вернуть `{}`/короткую ошибку, Stop не блокируется.
- Атомарные записи: `summary.md` и `session-state.json` — temp + rename (правило atomic-config-save); lock `wx`/O_EXCL по сессии (правило atomic-update-lock).
- При недоступности sub2api — fail-open, не паника (инцидент во время разработки: таймаут без AbortController → фикс).
- `verifyStructure` защищает summary от битой перезаписи (при потере заголовка — предыдущая версия сохраняется).

## Usability

- Активация через файл конфига `.dev-pomogator/advisor/config.json` + env override (`ADVISOR_SESSION_SUMMARY`), fail-open — нет двойных настроек.
- Режимы `ADVISOR_MODE=digest|fast|full` и `ADVISOR_SKEPTIC=balanced|strict` — понятные дефолты, к docs.
- Консультация без параметров (как нативный); может быть вызвана агентом сам по nudge; не требует ручных шагов от юзера при установке плагина.
- Не пересекаться с `out-session-advisor`: отдельные имена, пути, хуки, данные.