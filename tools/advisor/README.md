# tools/advisor — PoC «Адвизор» для Claude Code (на своём транспорте)

PoC клиентского аналога Anthropic Advisor tool: модель-пара «executor + advisor».
Адвизор сам решает, когда звать (MCP-тул без параметров), и собирает для себя **структурированный
контекст сессии** — не тащит весь транскрипт. Не спека, не канон — исследовательский артефакт.

## Режимы (ADVISOR_MODE)

1. **`digest` (default) — Structured Session Digest + two-pass.** Контекстный движок
   (`session-digest.mjs`) из одного снапшота транскрипта собирает слои:
   - **GOAL / план** — из `ExitPlanMode.input.plan` (markdown прямо в транскрипте) + первый/последний
     user-запросы + дельта «цель в начале vs сейчас» (goal drift);
   - **RECENT ACTIVITY** — asymmetric окно: последние N tool-событий детально, старые — сжато;
   - **ERROR SIGNALS / FILES / COMMANDS** — из `fast-evidence.mjs` (паттерны, параллельные чанки,
     дедуп, повторяющиеся ошибки);
   - **REPO RULES** — конвенции из `AGENTS.md`/`CLAUDE.md` (только таблица правил/запретов,
     token-bounded; pr-agent v0.39 behavior);
   - **SELF-CHECK** — read-only пробы: `git status/diff/diff --check`, существование touched-файлов;
     fail-open вне git-репо.
   Затем **two passes**: дешёвый суммаризатор (`ADVISOR_SUMMARIZER_MODEL`, gpt-5.6-luna) строит
   situation report (цели/прогресс/риски/недостающее), а адвизор (`ADVISOR_MODEL`, gpt-5.6-sol)
   советует по отчёту + digest.
   **Приоритет + токен-бюджет (pr-agent compression)**: `renderDigestPrioritized` собирает секции
   digest с приоритетами (план/цели > self-check-problems > repo-rules > ошибки > активность >
   git > файлы > промпты), оценивает токены (`estimateTokens`, chars/4) и впихивает в бюджет
   `ADVISOR_DIGEST_MAX_TOKENS` (default 3000): важные — полностью, менее важные — compact-списком,
   не поместившиеся — счётчиком «…и N больше». Это заменяет сырой `slice(-N)`: при сжатии бюджета
   цель/план и свежая активность остаются, хвосты слетают/сжимаются.
   Само-вызов консультации исключается из digest (иначе адвизор видит собственный ещё-не-завершённый
   вызов как «пустой `{}`»).
2. **`fast`** — детерминированная паттерн-выборка (`fast-evidence.mjs`), один вызов.
3. **`full`** — последние блоки транскрипта verbatim (legacy).

## Как работает

```
[агент] → вызывает mcp__dev-pomogator-advisor__advisor (без аргументов)
        → MCP-сервер: resolveTranscriptPath() (CLAUDE_CODE_SESSION_ID + CLAUDE_PROJECT_DIR)
        → mode=digest: buildSessionDigest → слои (план/цели, активность, ошибки, self-check)
        → pass1: gpt-5.6-luna → situation report
        → pass2: gpt-5.6-sol → guidance по отчёту+digest
        → guidance → tool_result, агент продолжает с учётом совета
```

MCP-сервер получает от Claude Code `CLAUDE_CODE_SESSION_ID` и `CLAUDE_PROJECT_DIR`
(проверено env-probe) — этого достаточно, чтобы найти транскрипт
`~/.claude/projects/<encoded-dir>/<session-id>.jsonl`.

## Включение

```jsonc
// .mcp.json (проект)
{ "mcpServers": { "dev-pomogator-advisor": {
    "type": "stdio", "command": "node",
    "args": ["<repo>/tools/advisor/mcp-server.mjs"] } } }
```

```bash
claude -p --settings overlay-settings.json --permission-mode bypassPermissions \
  "--model gpt-5.6-luna  сделай <задача>, перед финальным ответом вызови адвизора mcp__dev-pomogator-advisor__advisor"
```

Трейс живого вызова: `ADVISOR_TRACE=1` → `%TEMP%\advisor-mcp-trace.log`.

## Stop-hook (дополнительный режим)

`advisor_stop.ts` — детерминированный Stop-hook: на Stop ловит ключевые точки
(DONE_CLAIM / RECURRING_ERROR / PLAN_APPROACH) и возвращает неблокирующий совет через
`systemMessage` («🧭 Advisor (KIND): …»). Fail-open, cooldown + маркер-файл.

## Конфиг (env)

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `ADVISOR_MODE` | `digest` | `digest` (дефолт, two-pass+self-check) / `fast` / `full` |
| `ADVISOR_MODEL` | `gpt-5.6-sol` | модель-адвизор (pass-2; для пары должна быть «Opus-класса») |
| `ADVISOR_SUMMARIZER_MODEL` | `gpt-5.6-luna` | дешёвый суммаризатор (pass-1, digest) |
| `ADVISOR_SELF_CHECK` | `1` | `0` выключить read-only git/файл пробы (digest) |
| `ADVISOR_GIT_DIFF_CHECK` | — | `1` включить дорогой `git diff --check` в self-check (по умолчанию off — только status+diff --stat, быстрее) |
| `ADVISOR_TWOPASS` | `1` | `0` — один вызов по digest вместо двух |
| `ADVISOR_SKEPTIC` | `balanced` | `balanced` (новый дефолт — «не done» только при реальной причине: нет улики/дрейф/нарушение правила/ошибки) / `strict` (старый, шаблонный «двойная проверка перед done») |
| `ADVISOR_SESSION_SUMMARY` | `0` | `1` включить Rolling Session Summary: Stop-hook ведёт 10-секционный `summary.md`, MCP-консультация читает summary+delta вместо полного транскрипта |
| `ADVISOR_SUMMARY_FORCE` | `0` | `1` — обновлять summary сразу (аналог `--force` ccjr), минуя гейт (для тестов/демо) |
| `ADVISOR_DIGEST_MAX_TOKENS` | `3000` | бюджет digest (приоритет+compact, см. выше) |
| `ADVISOR_TIMEOUT_MS` | `45000` | таймаут вызова модели |
| `ADVISOR_TRACE` | — | `1` → трейс консультации в `%TEMP%\advisor-mcp-trace.log` |
| `ADVISOR_ENABLED` (только Stop-hook) | `true` | `true`/`shadow`/`false` |
| `ADVISOR_COOLDOWN_MS` (только Stop-hook) | `300000` | анти-спам Stop-хука |

Транспорт: `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` (прокси Claude Code этого окружения).

## Rolling Session Summary (порт нативной Session Memory)

Включение: `ADVISOR_SESSION_SUMMARY=1`. Поведение (порт `ccjr-state-manager` / нативного
`sessionMemory.ts`):
- **Stop-hook** на каждом ходе по гейту (инициализация ≥5K контент-токенов; обновление при ≥5K
  нового контента **И** ≥3 tool calls ИЛИ последний ход без тулов) вызывает дешёвую модель
  (gpt-5.6-luna) и обновляет **10-секционный `summary.md`** атомарно (temp+rename, `wx`-lock).
- Файл: `.dev-pomogator/advisor/summary/<session-id>.md` (gitignored, переживает `/compact`/`--resume`).
- **MCP-консультация** (`ADVISOR_SESSION_SUMMARY=1`) читает этот summary + маленький delta-хвост
  (`buildSummaryPacket`), а не пересобирает полный транскрипт: на тесте 109K raw → 2.3K пакета
  (**~48× меньше**). Если summary ещё нет — честный фолбэк на полный digest.
- Структура summary сохраняется жёстко (`verifyStructure` проверяет все 10 заголовков + italic
  описания; при потере — предыдущая версия не перезаписывается).

## Проверка

```bash
# offline-бенч детектора Stop-хука (7 синтетических + 30 реальных транскриптов)
npx tsx tools/advisor/bench/bench.ts

# live-замеры Stop-хука (3 ключевые точки: латентность, токены)
npx tsx tools/advisor/bench/bench.ts --live

# fast-паттерн выборка на реальном транскрипте (ошибки/файлы/команды/промпты)
npx tsx tools/advisor/bench/bench.ts --fast --fast-sample

# offline digest-сборка на реальном транскрипте (слои + self-check, без сети)
node -e "import('file:///E:/repos/dev-pomogator/tools/advisor/session-digest.mjs').then(async m=>{
  const d=await m.buildSessionDigest({transcriptPath:'<path-to-.jsonl>',repoRoot:'E:/repos/dev-pomogator'});
  console.log(m.renderDigest(d).slice(0,2400))})"
```

## Доказанный результат (живой прогон, режим `digest`)

Реальная мини-сессия `claude -p` (задача: прочитать `fast-evidence.mjs`, `ls mcp-server.mjs`, затем
вызвать адвизора без параметров). MCP-сервер по `CLAUDE_CODE_SESSION_ID` нашёл транскрипт, собрал
**digest: 106k raw-символов → ~1.7k chars пакета**, self-check: `git status` грязный на `main`
(включая `.mcp.json`, `.specs/spec-generator-v4/*` — чужие для этой задачи). Two-pass
(`twoPass:true`): суммаризатор → situation report, адвизор → evidence-based пункты:
- не объявлять done: `ToolSearch` только нашёл тул, но не вызвал его;
- **честно отметил, что Bash-вывод в digest усечён и нет доказательства, что все 40 строк вывелись** —
  рекомендовал опираться на реальный результат (поведение subagent-brief: недостающее → сказать,
  не выдумывать);
- не трогать/чистить dirty-дерево (нет доказательств, что изменения принадлежат этой задаче);
- после обязательного вызова подтвердить отсутствие оставшихся требований.

Ранний прогон поймал self-reference-баг: адвизор увидел в дигесте собственный ещё-не-завершённый
вызов и принял его за пустой `{}`. Фикс: `advisor` tool_use исключается из digest.

## Ограничения (честно)

- **Транскрипт с диска может отставать от in-memory контекста** (Claude Code пишет лениво;
  нативный адвизор видит живой контекст, у нас — то, что уже сфлашнуто в `.jsonl`).
- digest брит по признакам, а не по всей сессии — редкие, но критичные детали могут не попасть
  в слои (это осознанный компромисс за размер/стоимость).
- Само-вызов консультации отфильтровывается (self-reference), но ToolSearch, ведущий к нему,
  остаётся в слое активности.
- Вне запроса: `/advisor`-конфиг, модели-пары по рангу, cost-gate (max_uses), nudge-промпт
  для Haiku-экзекуторов (всё это в доке).

## Related

- Отчёты: `audit-reports/advisor-poc-2026-08-14.md`, `audit-reports/advisor-model-driven-2026-08-14.md`.
- Источник задачи: `E--repos-lm-saas/877f2911-…` (ресерч «эксперементальный адвизор»).