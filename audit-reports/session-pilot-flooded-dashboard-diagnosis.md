# session-pilot — диагностика «работает как говно» (308 worktrees, всё LIVE, постоянное дёрганье)

> **СТАТУС 2026-06-04: ИСПРАВЛЕНО + ЗАДЕПЛОЕНО + ПРОВЕРЕНО НА РЕАЛЬНЫХ ДАННЫХ (v0.6.1).**
> Фикс: `entrypoint`-фильтр headless-сессий (indexer.py) + render-churn/git-dedup (frontend.py)
> + **S4: ложный LIVE — per-session mtime сохраняется через /api/claude merge** (frontend.py) + bump 0.6.1.
> Тесты: 25/25 pass (`tools/session-pilot/tests/test_per_session_index.py`, +6 новых).
> Live `/api/index` (:8083): total **365 → 27**, `/app` **338 → 0**, cold 157ms / warm 3ms.
> Реальные интерактивные сессии целы (lm-saas/dev-pomogator/presentation-reels с правильными repo/branch).
> Код задеплоен копированием 3 файлов в живой ворктри `dev-pomogator-session-pilot` (там dirty, detached HEAD);
> durable-источник — uncommitted в `D:\repos\dev-pomogator` (ветка feat/phase-2a). НЕ закоммичено (юзер не просил).
> Деталь реализации: entrypoint уезжает до ~1MB при огромном первом сообщении → 64KB head + bounded deep-scan;
> минимальные/без-entrypoint сессии → default SHOW (никогда не прятать на догадке).


Дата: 2026-06-04. Скрин: 308 worktrees, generated 06:50:49, основная масса строк = `/app` с пустыми
Repo/Branch/HEAD, статус LIVE, Msgs=2, last message = JSON-фрагменты (`{ "verdicts": [...]`,
`{ "perFrame": [...]`, `{ "reason": ...`).

## Evidence (реальное окружение сервера, PowerShell `$env:USERPROFILE`)

```
C:\Users\stigm\.claude\projects   (= server Path.home()/.claude/projects)
  -app                                   282 jsonl   ← 81% всех сессий
  C--Users-stigm--claude-mem-observer..   53 jsonl   ← отфильтровано meta-фильтром
  D--repos-dev-pomogator                    6
  C--Users-stigm-Desktop                    2
  D--repos-presentation-reels               2
  D--                                       1
  D--repos-finance                          1
  D--repos-lm-saas                          1
  TOTAL                                   348 jsonl
/app on Windows drive → НЕ существует (is_stale=True для всех 282)
server.py PID 5276 listen 127.0.0.1:8083 (alive)
```

282 (`/app` orphans) + ~26 строк (реальные worktrees, exploded 1-row-per-jsonl + другие orphans) ≈ 308.
Совпадает со скрином точь-в-точь.

## ⚠️ ПОПРАВКА (после user feedback + чтения содержимого JSONL)

Первая версия отчёта называла `/app`-сессии «эфемерным мусором» и предлагала blanket-hide. **Это
неверно** — юзер поправил: «в докере есть сессии норм». Проверка СОДЕРЖИМОГО 338 файлов это подтвердила:

```
все 338 -app файлов: РЕАЛЬНЫЕ Claude Code сессии (line-types: user, assistant, last-prompt,
  ai-title, queue-operation; есть cwd, gitBranch, version — у всех 338/338)
извлечённые из содержимого (cwd, gitBranch): 338× ("/app", "HEAD")  ← все одинаковы
первый user-message: "Ты — фактчекер. Проверь сцены reel против source.json..." /
  "Given the answer relevancy score..." / "determine whether each statement is relevant..."
  → это presentation-reels eval/sub-agent fan-out (фактчекер + DeepEval-метрики через Claude SDK
    headless в контейнере), по 1-2 хода на сессию
длина: свежие 7-12 строк; самый длинный за всё время — 31 строка
```

Это НЕ мусор-по-форме и НЕ junk-по-пути. Это настоящие, но короткие SDK-сессии, ВСЕ на одном
контейнерном контексте `/app`@`HEAD`. Легитимный девконтейнер (напр. `/workspaces/dev-pomogator`
@ `feat/x`) был бы ДРУГОЙ группой (cwd,branch) и должен показываться нормально. Поэтому фильтрация
по пути/существованию — ловушка (спрячет легит работу).

## ✅ ОКОНЧАТЕЛЬНЫЙ ДИСКРИМИНАТОР (user: «мой LangGraph пайплайн запускает claude -p, я б такое не хотел видеть»)

Источник 338 `-app` сессий — **LangGraph-пайплайн юзера через `claude -p` / Claude Agent SDK** (headless).
Юзер их видеть НЕ хочет вообще. Дискриминатор — НЕ путь, НЕ collapse, а **headless vs interactive**.
Найдено однопольное, 100%-чистое на реальных данных разделение:

```
поле entrypoint (из содержимого JSONL):
  -app (338/338)         entrypoint = "sdk-ts"   ← Claude Agent SDK (LangGraph claude -p)
  dev-pomogator (6/6)    entrypoint = "cli"
  lm-saas (1/1)          entrypoint = "cli"
  Desktop (2/2)          entrypoint = "cli"

cross-check «нет line-type mode/permission-mode = headless»:
  -app                          338/338 headless
  ВСЕ реальные worktree-папки     0/N    headless  (вкл. presentation-reels 0/2 — ручная работа цела)
  claude-mem-observer            34/57   headless  (MCP observer — и так отфильтрован meta-фильтром)
```

Интерактивная CLI-сессия всегда пишет UI-состояние (line-types `mode`/`permission-mode`) и имеет
`entrypoint:"cli"`; headless `claude -p`/SDK — `entrypoint:"sdk-ts"`, без `mode`/`permission-mode`.
Поля `promptSource`/`mode`/`attachment`/`hookCount` есть только у CLI-сессий — вторичные сигналы.

## Root cause (архитектурный): дашборд взрывает 1-строку-на-JSONL и выбрасывает реальный branch

Две ошибки в `indexer.py build_session_index()` (FR-26):

1. **1 строка на каждый JSONL-UUID** (Source A и Source B). 338 SDK-сессий с ОДИНАКОВЫМ контекстом
   `/app`@HEAD → 338 идентичных строк. Для «Worktree Dashboard» единица должна быть worktree (или
   worktree+активная сессия), а не каждый исторический/эфемерный JSONL.
2. **Реальный `gitBranch`/`cwd` берётся из ИМЕНИ ПАПКИ, не из содержимого.** Source B ставит
   `repo=""`, `branch=""` (indexer.py:603-605), хотя ВНУТРИ каждого JSONL есть настоящий gitBranch.
   → все 338 строк пустые/неразличимые, реальную сессию не отличить от шума.

Единственный orphan-фильтр — meta-dir (`"--claude-" in name and "Users" in name`, indexer.py:559).
`-app` под него не попадает. Семантический дрейф: модель стала «1 строка на session JSONL». Тот же
класс бага, что в `.specs/session-pilot/POSTMORTEM-duplicate-rows.md` и `output-invariants-first.md`:
индекс конфузит сущности (1 контейнерный контекст → 338 «ворктри»).

## Три симптома → причины

### S1. «308 worktrees / работает как говно»
RC1. 282 эфемерных `/app` orphan-строки топят список. Реальных worktrees ~4-12, они погребены.
Лейбл «N worktrees» (frontend.py:234) врёт — это сессии, не worktrees.

### S2. «все сессии LIVE»
RC2 (следствие RC1 + широкое окно). `RUNNING_THRESHOLD_SEC=300` (server.py:41). 282 сессии записаны
активным workflow за последние минуты → все `age < 300` → все зелёные. Это НЕ логический баг
(idle реальные worktrees корректно не-LIVE: status formatter frontend.py:480 берёт age из
`claude_max_mtime`, у idle он старый). Проблема — флуд genuinely-recent эфемерных сессий.

**ЭМПИРИЧЕСКОЕ подтверждение:** на скрине (06:50, workflow АКТИВЕН) почти все LIVE. Замер в idle-момент
(07:04, workflow закончился): из 337 строк `claude_running_now=true` всего **33**. То есть «все LIVE»
строго трекает число эфемерных сессий, записанных за последние 5 мин — во время прогона их сотни.

### S3. «постоянно дёргается как будто перезагружается»
RC3 (render-churn). `render()` = `_tabulator.replaceData(_rows)` — полный ре-рендер DOM всех ~337
строк + пересчёт колонок (`layout: fitColumns`). За ОДИН `loadIndex()` вызывается ~5 раз:
- `loadIndex()` → render (frontend.py:260)
- `enrichClaude()` → render каждые 3 фетча + финал (frontend.py:343)
- `enrichGitStatus()` → render в конце (frontend.py:371)

Триггеры loadIndex: `setInterval(loadIndex, 30000)` (frontend.py:733) + `visibilitychange` focus
(frontend.py:736, КАЖДЫЙ возврат фокуса окна → loadIndex) + после launch (frontend.py:773).
Нет guard против конкурентных loadIndex и нет инкрементального `updateData`.

**ЭМПИРИЧЕСКИ замерено (живой сервер PID 5276, 337 строк):**
- `/api/index` cold = **1003ms**, warm = 12ms (5s cache)
- `/api/claude?path=/app` (парс 282+ jsonl) = **686ms**
- `/api/git-status?path=/app` = 25ms × 310 строк / 4 worker ≈ ~1.9s
- → полный цикл ≈ **3-4s, сильно МЕНЬШЕ интервала 30s**.

**Вывод: теория «циклы перекрываются» — ОПРОВЕРГНУТА** (цикл 3-4s << 30s). Реальный механизм —
всплеск из ~5 полных `replaceData` по 337 строк (+ fitColumns recalc, + тяжёлые HTML-форматтеры:
action-кнопки с JSON.stringify, git-спаны) за каждый `loadIndex` — каждые 30s, плюс лишний всплеск
на КАЖДЫЙ `visibilitychange`. На 337 строк это видимый jank-burst. RC4/RC5 ниже — не причина
перекрытия (его нет), а просто перегруз/нарушение perf-budget, который удлиняет каждый burst:
- RC4: `/api/claude?path=/app` парсит ВСЕ 282+ jsonl полностью (head 64KB + tail 256KB + построчный
  msg_count-луп) → 686ms против бюджета <300ms (`.claude/rules/session-pilot/perf-budget.md`).
- RC5: `enrichGitStatus()` итерирует ВСЕ `_rows` (310 строк `/app`) и спавнит `git -C /app status`
  на каждую (frontend.py:357-361) — 310 git-subprocess'ов на несуществующем пути за цикл, без дедупа
  по worktree_path.

**Reload-loop (инцидент single-instance-launcher) ОПРОВЕРГНУТ:** отданный сервером HTML несёт
`FRONTEND_VERSION='0.5.0'` == live `/api/health` `'0.5.0'`; `/` отдаётся с `no-store` → свежая
загрузка в `checkServerVersion` НЕ делает `location.href='/?v=...'`. (Наблюдение в живом браузере
через `mcp__claude-in-chrome__*` — правило `mcp-chrome-only` — в этой сессии не проведено: MCP не
подключён. Если после hard-reload / переоткрытия окна дёрганье исчезает — это был stale-cached JS;
если остаётся — это render-churn, как выше.)

### S4. «4 окна открыто, а ~10 строк горят LIVE» (отдельный баг, вскрылся после очистки флуда)
RC6 (per-session mtime clobber). `/api/index` отдаёт per-session `claude_max_mtime` (= mtime
конкретного JSONL) и `claude_running_now` (= age<300 per-session) — **корректно**. Но фронт затем
обогащает строки из `/api/claude`, чей `claude_max_mtime` = **МАКСИМУМ по всей папке-воркtree**
(`build_claude_for_path` → `claude_max_mtime_for` = max). `Object.assign(row, c)` (frontend.py
applyCachedClaude + enrichClaude) затирает per-session mtime этим максимумом. `claude_running_now`
восстанавливался (`liveBefore`), а `claude_max_mtime` — нет. Клиентский LIVE-override
(`ageS = now - claude_max_mtime; if ageS < 300 → LIVE`, frontend.py status formatter) брал затёртый
максимум → **каждая** сессия в воркtree с одной свежей сессией показывала LIVE.

**ЭМПИРИЧЕСКОЕ подтверждение (живой API):** dev-pomogator — 6 сессий, per-session running_now: 2 true
(age 23s/59s), 4 false (age 1000s/8ч/12ч/29ч). `/api/claude` worktree-max age = 23s. → 5 строк
running_now=false получали age 23s < 300 → **5 ложных LIVE**. Совпало со скрином (старый Last activity
00:03 / вчера 19:30 / 06/02, а статус LIVE).

**Фикс:** сохранять per-session `claude_max_mtime` после `Object.assign` (как `claude_running_now`) в
обеих ветках (applyCachedClaude + enrichClaude); idle-ветка использует per-session mtime раньше
per-worktree `claude_last_modified`. Тесты: `test_live_uses_per_session_mtime_not_worktree_max`
(Python-реплика логики) + `test_frontend_preserves_per_session_mtime_after_merge` (string-guard).
Был всегда (FR-26), но прятался за 338-строчным флудом; вскрылся когда дашборд стал чистым.

## Что НЕ причина (исключено)
- Reload-loop от рассинхрона версий (инцидент single-instance-launcher): `FRONTEND_VERSION='0.5.0'`
  (frontend.py:129) == health `'0.5.0'` (handlers.py:150). Совпадают → не оно.
- `tools/session-pilot/extension.json` отсутствует на диске (правило ссылается на него, но файла нет —
  doc drift, к багу не относится).

## Направление фикска (по приоритету)

1. **Скрыть headless `claude -p`/SDK сессии: фильтр `entrypoint != "cli"`** (закрывает S1+S2, убирает
   ~95% нагрузки за S3, 337→~12 строк). Это прямой запрос юзера («не хочу видеть `claude -p` сессии»)
   и сохраняет интерактив (девконтейнер `entrypoint:cli` остаётся):
   - В `_claude_jsonls_lightweight` / Source B читать `entrypoint` из содержимого (cheap: head ~4-8KB
     + regex `"entrypoint":"cli"`; отсутствие/`sdk-*` → headless → skip). Не эмитить headless-строки.
   - Env-override `SP_SHOW_HEADLESS=1` чтобы при отладке вернуть их (по умолчанию скрыты).
   - Fallback-сигнал если `entrypoint` когда-нибудь пропадёт: отсутствие line-type `mode`/
     `permission-mode` во всём файле = headless (тоже 100% на текущих данных).
   - Это снимает нужду в collapse-по-(cwd,branch) и в чтении branch из содержимого — 338 SDK-сессий
     просто исчезают. (Collapse оставить как опцию на будущее, если появятся МНОГО интерактивных
     сессий в одном worktree — сейчас не нужно.)
   - ❌ НЕ фильтровать по пути (`/app`)/существованию decoded cwd — спрячет легит девконтейнер.
2. **Убрать render-churn (прямая причина S3, overlap НЕ причём):** свести ~5 `render()` за loadIndex
   к одному в конце (или throttle), заменить `replaceData` на инкрементальный `updateOrAddData` где
   можно, убрать/дебаунсить `visibilitychange→loadIndex` (frontend.py:343,371,736). После фикса #1
   строк ~12 — даже текущий churn почти незаметен, но это убирает корень.
3. **Дедуп git-status по worktree_path** + не дёргать git для path вне реальных worktrees (RC5,
   frontend.py:357 — сейчас 310 git-спавнов на `/app` за цикл).
4. **Не full-parse 282+ jsonl в /api/claude** для collapsed-группы; хватает lightweight stat
   (как `_claude_jsonls_lightweight`) — RC4, восстановит perf-budget <300ms.
5. Поправить лейбл «N worktrees» → честно «N sessions across M worktrees».

> ❌ НЕ делать: blanket-hide `/app`, blocklist container-cwd, «не эмитить если decoded path не
> существует» — спрячет легит девконтейнер-сессии (user feedback 2026-06-04). Дискриминатор —
> `entrypoint` (headless `sdk-ts` vs интерактив `cli`), НЕ путь, НЕ collapse.
>
> Anti-overlap guard для loadIndex — тоже НЕ нужен: цикл 3-4s << интервал 30s, перекрытия нет (замерено).

Тесты-инварианты (output-invariants-first): «1 git worktree → ровно 1 worktree-сущность в выдаче»,
«orphan с несуществующим cwd → 0 строк в основном списке», «N jsonl под одной orphan-папкой →
≤ cap строк». Прогон против РЕАЛЬНОГО `~/.claude/projects` (282 `/app`) как ground-truth, не синтетика
(`verify-against-real-artifact`).
