## Summary

Каждый write-инструмент спек-MCP уже требует `reason` на уровне API, но затем **сворачивает его в необратимый 16-hex срез sha256** и не записывает никакой идентичности — ни actor, ни session, ни commit. В итоге лог аудита не отвечает на вопросы «почему», «кем/какой сессией» и «в каком коммите» изменился документ. Нужно: (1) сделать `reason` обязательной **непустой и осмысленной** (отказ на пустую/мусорную, как git отказывает в пустом commit message), (2) писать plaintext-`reason` + actor/session/time/commit, (3) **санитизировать** reason перед персистентной записью (редукция секретов, ограничение длины), сохранив SOFT-гарантию «лог никогда не ломает вызов инструмента».

## Problem today (конкретный рабочий сценарий + текущие file/symbol)

FR-39b лог доступа — append-only JSONL в `<repo>/.dev-pomogator/logs/spec-access.jsonl` (`tools/spec-mcp-server/spec-access-log.ts:6-7`), одна запись на MCP-вызов (`appendFileSync`, `:60`). Форма события — только:

```ts
// spec-access-log.ts:24-29
export interface SpecAccessEvent {
  ts: string;
  tool: string;
  args_digest: string;
  decision: 'ok' | 'not_found' | 'denied' | 'error';
}
```

`args_digest` — **необратимый** 16-hex срез sha256 от args (`spec-access-log.ts:36-42`):

```ts
return createHash('sha256').update(JSON.stringify(args) ?? 'null').digest('hex').slice(0, 16);
```

При этом `reason` **обязательна** на границе API:
- `rename_spec_doc` — `reason: z.string()` (`tools/spec-mcp-server/tools.ts:2603`);
- `delete_spec_doc` — `({ spec, doc, reason })` (`tools.ts:2516-2517`);
- patch/transaction — `PATCH_SHAPE` несёт `reason: z.string()` (`tools.ts:2082`), пробрасывается в `logSpecAccess(..., { ..., reason: args.reason }, ...)` (`tools.ts:2204,2217`).

Конкретный фейл-сценарий: после кривой массовой миграции владелец открывает `spec-access.jsonl` и видит `{"ts":"…","tool":"rename_spec_doc","args_digest":"3f9a1c0b7d2e44aa","decision":"ok"}`. Ответить на «какая сессия переименовала `FR.md` и зачем?» по артефакту **невозможно**: обоснование сожжено в однонаправленный хеш, актёра нет, коммита нет. Doc-comment самого файла называет лог «контроль + лог, ради которого волна существует» (`spec-access-log.ts:12-13`) — presence-лог не является аудитом.

Дополнительно: `reason` сегодня = `z.string()` — проходит пустая строка, `"."`, `"x"`, `"fix"` (мусор), и нет никакой санитизации: в свободный текст reason легко попадает токен/пароль, который затем оседает в логе навсегда.

Замечание: write-lock **уже** фиксирует identity-поля (`pid`, `env` — `codespaces:`/`container:`/`wsl:`/host, `started_at`, argv) в `tools/spec-mcp-server/lock-manager.ts:124-130`; слой аудита их просто не выносит.

## Before / after example

**Before** (успешный `rename_spec_doc`):

```jsonc
// .dev-pomogator/logs/spec-access.jsonl
{ "ts": "2026-07-23T10:11:12.000Z", "tool": "rename_spec_doc",
  "args_digest": "3f9a1c0b7d2e44aa", "decision": "ok" }
// reason="перенос FR-3 в FR-7 ради слияния дублей" → уничтожена хешем.
// reason="" или reason="." → тоже ok, никакого отказа.
```

**After** (тот же вызов):

```jsonc
{ "ts": "2026-07-23T10:11:12.000Z", "tool": "rename_spec_doc", "decision": "ok",
  "reason": "перенос FR-3 в FR-7 ради слияния дублей",
  "actor": { "pid": 18432, "env": "wsl:dev-pomogator" },
  "session": "213301b9-390a-…",
  "commit": "a1b2c3d",
  "args_digest": "3f9a1c0b7d2e44aa" }   // оставлен для grep/dedup
// reason="" / "." / "xxxxx" → отказ REASON_TOO_SHORT/REASON_MEANINGLESS, запись не прошла.
// reason="…token=sk-ant-…" → записано как "…token=[REDACTED]…".
```

## Proposed behavior (малый data/API output)

1. **Обязательная непустая reason.** Валидатор на границе write-инструментов: trim → минимум N значимых символов (например ≥10) и не «мусорный паттерн» (`.`, `x`×N, `fix`, `test`, `asdf`). Пустая/мусор → `REASON_TOO_SHORT`/`REASON_MEANINGLESS` с подсказкой (fail-closed на запись, как git `--allow-empty-message` по умолчанию выключен).
2. **Plaintext reason в логе.** `SpecAccessEvent` расширяется:

```ts
interface SpecAccessEvent {
  ts: string;
  tool: string;
  decision: 'ok' | 'not_found' | 'denied' | 'error';
  reason?: string;                 // plaintext, обязательная для write-вызовов
  actor: { pid: number; env: string };  // reuse lock record (lock-manager.ts:124-130)
  session?: string;                // из контекста сессии MCP / env
  commit?: string;                 // git rev-parse --short HEAD (best-effort)
  args_digest: string;             // оставлен для обратной совместимости/grep
}
```

3. **Санитизация перед записью.** `sanitizeReason(reason)`: редукция секретов по паттернам (`sk-ant-…`, `ghp_…`, `xox[baprs]-…`, `Bearer …`, `-----BEGIN … PRIVATE KEY-----`, `password=…`, `token=…`) → `[REDACTED]`; схлопывание пробелов; жёсткий cap длины (например 500 символов, хвост → `…`). Редукция детерминированная и покрывает reason **до** хеширования/записи.
4. **SOFT-тир сохранён.** Лог никогда не бросает исключение в путь инструмента (`spec-access-log.ts:11,61-63`); валидация reason бросает **до** записи (это бизнес-правило записи, а не логгирование). Ротация 10MB/30-day сохранена (`:21-22`).
5. **commit — best-effort.** MCP коммит-агностичен: `git rev-parse --short HEAD` берётся opportunistically (вне git-репо — `commit: null`, не ошибка; помним, что Docker-тесты без `.git`).

```jsonc
// отказ на мусорную reason
{ "ok": false, "error": "REASON_MEANINGLESS",
  "got": "x", "hint": "reason must be ≥10 meaningful chars describing WHY" }
```

## Scope in / out

**In:** валидация непустой/осмысленной reason на write-инструментах; plaintext `reason` + `actor`(pid/env из lock) + `session` + `commit`(best-effort) в `spec-access.jsonl`; `sanitizeReason` (redact secrets, cap length); сохранение SOFT-тира и ротации; обратная совместимость `args_digest`; BDD-сценарии.

**Out:** отпечаток/безопасность самих рёбер (#tier1-6); типизация отношений (#tier1-8); endpoint constraints (#tier1-9); provenance тест-доказательств (#tier1-10); внешняя SIEM-выгрузка лога; криптографическая подпись записей аудита (можно отдельным issue).

## Likely implementation touchpoints (проверенные пути)

- `tools/spec-mcp-server/spec-access-log.ts:24-29` — `SpecAccessEvent` (расширить полями); `:36-42` — расчёт `args_digest` (оставить, reason больше не хешировать); `:60` `appendFileSync`; `:11,61-63` SOFT-гарантия; `:21-22` ротация; `:12-13` doc-comment.
- `tools/spec-mcp-server/tools.ts:2603` `rename_spec_doc` `reason: z.string()`; `:2516-2517` `delete_spec_doc`; `:2082` `PATCH_SHAPE.reason`; `:2204,2217` `logSpecAccess(..., reason)` — точки, где валидация reason и санитизация встраиваются до записи.
- `tools/spec-mcp-server/lock-manager.ts:124-130` — источник `pid`/`env`/`started_at`/argv для поля `actor` (уже собирается, не дублировать).
- Новый хелпер `sanitizeReason` + `validateReason` рядом с `spec-access-log.ts` (или в `mutations.ts`), покрытый Docker-BDD Scenario Outline на каждый redact-паттерн.

## Observable end-to-end acceptance checklist

- [ ] Успешный `apply_spec_change`/`delete_spec_doc`/`rename_spec_doc` пишет строку, чья `reason` **в точности равна** строке вызывающего (plaintext, не digest).
- [ ] Каждая write-запись несёт `actor.pid` + разрешённый `actor.env` из lock-записи и `session`; `commit` = текущий `git rev-parse --short HEAD` (или `null` вне git-репо — не ошибка).
- [ ] `reason` = `""`/`"."`/`"xxxxx"`/`"fix"` → отказ `REASON_TOO_SHORT`/`REASON_MEANINGLESS`, документ **не изменён**, строка с `decision:"ok"` не появляется.
- [ ] `reason` с `sk-ant-…`/`ghp_…`/`Bearer …`/`password=…` → в логе `[REDACTED]`; исходный секрет в файле отсутствует (grep по jsonl = 0 совпадений секрета).
- [ ] Сбой записи лога (нет прав/диск полон) **не** ломает вызов инструмента (SOFT-тир); мутация проходит, лог пропускается.
- [ ] `args_digest` по-прежнему присутствует (обратная совместимость grep/dedup).
- [ ] **BDD (Docker-only, `scripts/docker-bdd.sh`):** новые сценарии `SPECGEN004_NN` в `.specs/spec-generator-v4/spec-generator-v4.feature` (шаги в `tests/step_definitions/`, рядом с `feature40_mutation_edges.ts`): (a) reason попала plaintext + actor/session, (b) мусорная reason отказана, (c) секрет редуктирован, (d) SOFT-сбой лога не ломает мутацию; прогон `scripts/docker-bdd.sh --name "SPECGEN004_…"`, сверка `lastResult===PASSED` по slug-id; фильтрованный прогон не трогает канон `.dev-pomogator/.last-test-run.ndjson`.

## Compatibility / migration

- Существующие клиенты, шлющие reason, не ломаются: форма лога расширяется добавлением полей (`reason`/`actor`/`session`/`commit`), `args_digest` сохранён.
- **Поведенческое изменение:** пустые/мусорные reason, которые раньше проходили, теперь отказывают write-вызов. Это осознанный fail-closed; для совместимости — явное сообщение об ошибке с подсказкой, без тихого acceptance.
- Старые строки лога (без новых полей) читаются как есть; потребители парсят опциональные поля.
- `commit: null` вне git-репо (Docker-тесты без `.git`) — норма, не ошибка.

## Related issues

- **#162** — spec-generator-v4 closure program (родительская программа).
- **#tier1-6** — безопасная мутация связей (тот же write-путь; reason+audit логируют link-мутации).
- **#tier1-10** — provenance тест-доказательств (аудит «кто/когда/почему» дополняет «чем подтверждено»).
- **#171** — schema-validated requirement metadata (структурные метаданные требований; аудит-идентичность — смежный, но отдельный слой).
- **#169** — объявленные типы артефактов поставки (что должно быть; аудит фиксирует, кто это внёс и зачем).

## Prior art (проверенные прямые ссылки + заимствуемая механика)

- **git: отказ в пустом commit message по умолчанию** (override — явный `--allow-empty-message`); коммит несёт author/committer/log message. → обязательная непустая осмысленная reason + identity. [VERIFIED] https://git-scm.com/docs/git-commit
- **Datomic transaction metadata** — каждая транзакция получает `:db/txInstant`; произвольные tx-данные крепятся через tempid `"datomic.tx"`. → «нет изменения без записанного почему» + timestamped identity. [VERIFIED] https://docs.datomic.com/cloud/transactions/transaction-data-reference.html
- **Event Sourcing (Fowler)** — «все изменения … хранятся как последовательность событий», «purely additive» лог. → append-only аудит, который не перезаписывается и не теряет reason. [VERIFIED] https://martinfowler.com/eaaDev/EventSourcing.html

