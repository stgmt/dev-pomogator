# spec-generator-v4 — что не сделали / упустили / недодумали (2026-06-10)

User ask: после enforce-флипа и live CRUD e2e — глубокий анализ всего, что по v4
осталось, забыто или недодумано. Метод: 4 параллельных Explore-агента (FR-перекличка,
NFR-комплаенс, deferred-свип, adversarial-обзор операционки двери) + детерминированные
сверки каждого спорного утверждения + ОДНА живая находка, сделанная прямо во время
прогона.

## META-находка №0: LLM-перекличка FR врёт в обе стороны — нужна детерминированная

Агент-1 (FR-by-FR census) отрапортовал «все 44 FR + 27 подпунктов IMPLEMENTED, 0 гапов».
Детерминированная сверка опровергла за минуту: **FR-43 (legacy-триаж) НЕ реализован** —
P18-1/P18-2 оба `Status: TODO` в TASKS.md (агент перепутал delete_spec_doc с триажем).
Агент-3 (deferred-свип) ошибся в обратную сторону: половина его «забытого» (P19-5
producer, G2/G3, test-quality stage, P19-6 consumers) закрыта в последних коммитах — он
начитался УСТАРЕВШИХ audit-reports. Урок (тот же, что verify-against-real-artifact):
перекличка статусов must be детерминированной (graph/get_coverage/TASKS-парсер), LLM —
только для интерпретации. Кандидат: маленький `fr-census.ts` поверх графа.

## P0 — ЖИВАЯ находка: singleton MCP-лок × параллельные сессии × enforce

Поймано на live CRUD e2e: spawned `claude -p` не получил дверь — «No such tool
available». Корень (доказан стдио-пробой бандла): **FR-14 lock-manager держит ОДИН
MCP-сервер на репо** («MCP lock already held by pid 5908»). Пока сессия-первенец жива,
КАЖДАЯ другая сессия (headless-прогоны, параллельные окна юзера — а они в этом дереве
норма) получает `✘ Failed to connect` = работает БЕЗ двери. До enforce это деградация;
**ПОСЛЕ enforce это полная блокировка спек для всех сессий, кроме первой** (raw запрещён,
дверь недоступна). Это надо чинить ДО того, как enforce станет ежедневной реальностью:
варианты — (a) read-only второй инстанс (query-тулы лок не требуют, лок только на
mutation), (b) lock per WRITE-операция вместо per-process, (c) брокер/очередь. Записано
как P21-1.

**РЕЗОЛЮЦИЯ (2026-06-10) — выбран вариант (a):** `acquireLockOrReadOnly` (lock-manager)
при живом владельце возвращает `reader`+holder вместо throw; `startLifecycle({onLockContention:
'readonly'})` поднимает дверь READ-ONLY (граф+watcher живут → reads свежие; heartbeat
пропущен — reader ничего не владеет, его `release()`/`heartbeat()` — no-op, чтобы не
затереть/снести лок владельца). Три write-тула (`apply_spec_change`/`delete_spec_doc`/
`create_spec`) рефьюзят `WRITE_LOCK_HELD` с именем держателя (pid+env); read-тулы и
`propose_spec_change` dry-run остаются живыми; writes сериализуются на единственного
владельца лока. Покрыто: SPECGEN004_149 (@feature14, реальная цепочка acquireLock→
acquireLockOrReadOnly→registry refusal + файл на диске нетронут), unit lock-manager
(writer/reader/stale/envMismatch), lifecycle integration (второй инстанс boots readOnly,
reader-shutdown НЕ снимает лок владельца), tools.test (3 write-тула рефьюзят, propose не
гейтится, writable-дверь не короткозамыкается). FR-14 обновлён: «DENY whole-server» →
read-only fallback. Singleton-kill держателя в crud-e2e больше НЕ нужен.

Сопутствующее: у `claude -p` дверь не грузится и без лока, пока не передан
`--mcp-config .mcp.json` (project-scope MCP в headless не подхватился автоматически,
несмотря на enabledMcpjsonServers) — задокументировать в skill/доке оркестратора.

## Enforce-эргономика (сегодняшние укусы — реальные, не теоретические)

- **git над .specs** — `git add/commit/status .specs/...` содержит `.specs` в тексте →
  DENY (git не в engine-whitelist). Коммит изменений, записанных ЧЕРЕЗ дверь, требует
  escape-hatch. Porcelain-git — не content-доступ; нужен узкий carve-out для
  `git (add|commit|diff|status|restore --staged)` (НЕ для `git show`/`checkout` контента).
- **Heredoc-харнессы** — `cat > x.mjs <<EOF` с `.specs` в теле героки → DENY (правильно
  по букве, больно по жизни; обход: Write-тул). Задокументировать паттерн.
- **Inline-escape НЕ РАБОТАЕТ (живой укус)** — `SPEC_ACCESS_SKIP=1 rm -rf .specs/x` всё
  равно DENY: hook-процесс читает env из НАСТРОЕК сессии, а не из префикса команды;
  задокументированный escape недоступен агенту per-command (settings self-edit заблокирован
  классификатором). Фикс: guard должен распознавать inline-префикс в ТЕКСТЕ команды (как
  commit-маркеры у sibling-гейтов) ЛИБО дать `[skip-spec-access: reason]` маркер. Заодно
  зафиксирован фундаментальный предел text-матчера: скрипт с путями ВНУТРИ файла невидим
  для PreToolUse (известно по MUST_DENY-пину `node /tmp/t.mjs .specs/demo` — ловится только
  явный аргумент).
- **read_spec_doc без пагинации** — FR.md v4 = 77KB (≈19K токенов), RESEARCH.md бывает
  295KB: один read токен-бомбит контекст агента, а raw-grep под enforce запрещён. Нужны
  `offset/limit` или `section` (заголовок) у read_spec_doc. (Агент-4, подтверждено
  размерами реальных файлов.)

## Дверь: чего в ней нет (агент-4, сверено с кодом)

- **rename/move** дока или slug — операции НЕТ; delete+create теряет историю и рвёт
  cross-spec якоря (delete-гейт ловит graph-рёбра, но НЕ markdown-якоря из чужих спек).
- **Doc-level конкуренция** — лок только per-process; внутри одного сервера два
  apply_spec_change на один док = read-validate-write без CAS → last-write-wins. Нужен
  optimistic-CAS (`expected_sha` параметр) — дёшево и закрывает класс.
- **Аудит-лог без читателя** — spec-access.jsonl пишется+ротируется (10MB/30d,
  best-effort), но НИ ОДНОГО тула запросить его; под enforce даже raw-чтение лога…
  разрешено (он в .dev-pomogator, не .specs) — ок, но query-тул всё равно напрашивается
  (LOW).
- **Циклическая валидация без гранулярного вейвера** — apply отказ требует чинить A,
  чей фикс требует B, чей фикс требует A; единственный обход — SPEC_ACCESS_SKIP=1
  (выключает ВСЁ). Нужен per-finding waiver или транзакционный multi-doc apply (LOW-MED,
  пока гипотетический — ни одного живого инцидента).

## Сценарная гниль (semantic-drift инвентарь fr8 — судья уже находил, никто не чинил)

- **FR-19 blanket-тег**: 11 сценариев legacy-v3.feature помечены @FR-19, тестируя НЕ
  двухуровневую failure-policy, а form-guards/discovery/task-board (решение P14-2
  «перешироко»). Чинится ре-тегом.
- **FR-7 Marksman**: сценарии тестируют РЕТАЙРНУТЫЙ standalone-binary подход, не текущую
  нативную LSP-интеграцию.
- **legacy-v3.feature: 28 вечных not_run** — фича не в cucumber paths; каждый verdict
  тащит ноту. Резолюция уже запланирована в P18-2 (и блокируется FR-43 триажем — Phase 18
  её и закрывает).

## Реально несделанное (план, не баги)

- **Phase 18 / FR-43 целиком** (P18-1 классификатор 4 состояний, P18-2 HITL-маркер +
  резолюция legacy-v3) — TODO, зависел от p17-enforce, который СЕГОДНЯ закрыт → Phase 18
  разблокирована.
- **T0-05 «Verify Phase 0»** — древний TODO-хвост, вероятно DRIFTED (Phase 0 давно
  зелёная) — кандидат на закрытие фактом.
- **Burn-down INFO-долга без владельца**: 7 TASK_NO_REQUIREMENT + 72 ORPHAN_PROJECT_TEST
  + 538 FR_NO_RESEARCH + 459 UPSTREAM_UNLINKED + 1251 UNTAGGED_SCENARIO (corpus-wide) —
  счётчики светятся (P20-x), но НИ У КОГО нет задачи их снижать; promote-to-gate (P20-5
  критерий) без чистки не наступит никогда.
- **13 предсуществующих красных Docker-тестов** (hyperv 2, plan-validator 2, scope-gate,
  spec-v3, spec-status, sro-stubs 4, steps-validator, anchor-templates) — базлайн, на
  который все ссылаются и который никто не чинит. + eslint v10 без flat-config (lint
  мёртв), + YamlWriter ENOENT в хвосте docker-прогонов, + wrapper падает на node24
  strip-types (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` в yaml_writer.ts — parameter
  properties). Гигиена, не v4-ядро — но шумит в каждом прогоне.

## Закрыто в последних коммитах (чтобы устаревшие отчёты больше не путали)

P19-1/2/3/5/6 ✅, P20-1..5 ✅, G2/G3 ✅, test-quality producer+stage ✅ (SPECGEN004_87/
137/142), субдир-дверь+read_attachment ✅, D-дверь delete_spec_doc ✅, enforce-флип ✅
(сегодня; guard живой — отденаил собственную команду автора в этой же сессии),
**P21-1 multi-session read-only door ✅** (read-only fallback, SPECGEN004_149),
P21-2 git VCS-plumbing carve-out ✅ (SPECGEN004_148).

## Приоритет (рекомендация)

1. ~~**P21-1 multi-session door**~~ ✅ ЗАКРЫТО (read-only fallback — см. РЕЗОЛЮЦИЯ в P0-секции).
2. **P21-2 остаток** (пагинация read_spec_doc + рабочий inline-escape; git-carve-out уже ✅) —
   ежедневная боль, укушен в первый же час.
3. **Phase 18 (FR-43)** — разблокирована, закрывает и legacy-v3 ноту.
4. **P21-3 сценарная гниль** (FR-19 ре-тег, FR-7 пересъёмка) — честность тегов.
5. **P21-4/5 door-полнота** (rename/CAS) — по мере появления живых инцидентов.
6. Burn-down INFO-долга — назначить владельца/каденцию (иначе P20-5 promote мёртв).
