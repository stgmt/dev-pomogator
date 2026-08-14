# Session Advisor + Parallel Session Safety

Единая спека паттерна «двойная сессия + параллельная безопасность»:

**Часть A — Адвизор.** Адвизор-сессия наблюдает живую воркер-сессию (Claude Code или подобную):
видит ход мысли субагентов, перепроверяет отчёты на «пиздёж» сверкой с диском/БД/live, управляет
воркером через ConPTY (ctl/rsp) и не «встаёт» на интервалах. Клиентский аналог стокового
Anthropic Advisor с упором на внешнюю верофикацию.

**Часть B — Параллельная безопасность.** Множественные параллельные сессии в одном репо и
нескольких репо не конфликтуют: git-гейт против `git add -A` и чужих staged-путей, атомарные
локалы с владельцем и stale-восстановлением, инвентаризация процессов/сессий по репо,
диагностика «кто писал <файл>» и сводная сводка `ok/dirty/conflict`.

## Ключевые идеи

- **Слепота на субагентов устранена:** main JSONL + живые `subagents/agent-*.jsonl` в одном хвосте.
- **Факты на диске > слова агента:** `verify_claims` возвращает CONFIRMED/GAP с evidence-путями;
  доменные истины (промежуточный 403 ≠ блокер, бренд со страницы, live vs archived) вшиты в SKILL.
- **Интерактивное управление:** ConPTY (`pty_daemon.py`) с протоколом `claude-ctl.json`/`claude-rsp.json`;
  запуск с `--dangerously-skip-permissions`.
- **Runtime-слой над правилами:** не изобретает новый движок параллелизма — надстройка над
  session-pilot discovery и уже принятыми примитивами (wx-лок, temp+move); read-only для адвизора.
- **Fail-open в неизвестных деревьях:** без транскриптов других сессий — предупреждение, а не
  жёсткий блок (иначе лжеконфликты мешают продуктивной параллельности).

## Где лежит реализация

- **App-код**: `tools/out-session-advisor/`
- **Wiring**: `.claude/skills/out-session-advisor/SKILL.md` + зеркало `.agents/skills/`; hooks `git-guard`
  в `.Codex-plugin/hooks.json` + dogfood `.Codex/settings.json`
- **BDD**: `tests/features/plugins/out-session-advisor/OUTSESS001_*.feature`

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md)
- [USE_CASES.md](USE_CASES.md)
- [REQUIREMENTS.md](REQUIREMENTS.md)
- [DESIGN.md](DESIGN.md)
- [TASKS.md](TASKS.md)
- Аудит-эксперимент: `audit-reports/out-session-advisor-double-session-2026-08-14.md`