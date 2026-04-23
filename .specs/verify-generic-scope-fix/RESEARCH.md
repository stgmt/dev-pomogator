# Research

## Контекст

Спека создаётся в ответ на инцидент **MR !100 / PRODUCTS-20218 / webapp**: Claude Code agent добавил `stocktaking` в `isOutboundDocument()` enum в `src/services/StockValidationService.ts:53`. Tech-lead evolkov на ревью вернул MR с замечанием:

> «Убрать stock taking! Ну и очевидно, что сделать это нужно не только здесь, а вычистить во всем мерже. Stock taking это совершненно другая история. У него даже форма создания документа другая, никакие остатки там не валидируются при создании.»

Причина факапа — не code-monkey mode "по умолчанию", а **over-correction от прошлой feedback memory** + **noticed-but-didn't-act**. Цель спеки — спроектировать процедурный gate (skill + hook) который механически превращает diagnosis → action.

**Reference memories** (в dev-pomogator auto-memory):
- `reference_stocktaking-incident-products-20218.md` — полная H1–H8 root cause taxonomy
- `feedback_code-evidence-trumps-domain-sense.md` — LLM структурно не "чувствует" домен; primary lever = mechanical code-evidence grep
- `feedback_single-incident-rules-over-generalize.md` — feedback memory без секции "invalidating evidence" → over-general application

---

## Incident Report: stocktaking в MR !100 (verbatim timeline по артефактам)

### Факты (реконструкция по артефактам)

| Момент | Действие | Артефакт |
|--------|----------|----------|
| Discovery | В RESEARCH.md добавил Stock Taking в scope как "4-й недостающий enum" | `.specs/products-20218-validate-stock-non-inbound/RESEARCH.md:34,48,67,82` |
| Там же | Секция "Concerns for Review-after-Ship" пункт 1: «Если evolkov скажет что Stock Taking должен работать иначе — открыть отдельную задачу» | тот же файл, секция Concerns |
| Implementation | Вписал `stocktaking` в `isOutboundDocument()` | `StockValidationService.ts:53` |
| Test | 16 кейсов, включая `stocktaking → true` | `stockValidationService-doctype.test.ts:14` |
| Manual verify | Сам написал в отчёте к задаче: «Stock Taking — по сценарию создания qty не достижим; enum-тест покрывает» | Jira PRODUCTS-20218 comment 2026-04-21 |
| Ship | MR !100, запушил | — |
| Review | evolkov: «Убрать. Stock Taking — другая история, форма другая, остатки при создании не валидируются» | MR !100 note 2026-04-23 |
| Fix | stocktaking вычищен из enum + тестов + спеки | Commit ef4aec40 + последующий review-fix |

### Ключевой код-факт, проигнорированный

**`src/components/StartStockTakingModal.tsx`** — у Stock Taking отдельная форма создания (не `DocumentForm`). Qty генерится на сервере равным `available` ("Full Inventory Adjustment" через `DocumentOperations.generateInventoryAdjustment({locationId})`). User qty на создании не вводит. Валидация `qty > available` для этого flow **структурно недостижима**. Grep `"StartStockTaking"` → 2 минуты работы — не сделано.

### 5 code-signals, доступных локально за 30 секунд грепа (все пропущены)

| # | Signal | Location | Почему сигнал |
|---|--------|----------|---------------|
| 1 | `isExpectedReadOnly = canonicalDocumentType === 'stock-taking'` | `DocumentForm.tsx:912` | Прямой флаг: для stock-taking expected items **READ-ONLY**. Если qty нельзя редактировать — валидировать нечего. В том самом файле, который Claude уже процитировал (строки 886–903) |
| 2 | `StartStockTakingModal.tsx` существует | 293-строчный отдельный компонент | Отдельный create flow → другая семантика |
| 3 | `generateInventoryAdjustment({ locationId })` | `DocumentOperations.ts:505-521` | Endpoint принимает **только warehouse**, не items. Server сам генерит строки с `qty = available` |
| 4 | Комментарий в CreateNewModal | `:367` | `// Stock Taking Modal - same flow as on Stock Taking page (warehouse selection + generateInventoryAdjustment)` — дословно "separate flow" |
| 5 | Семантика домена | — | "Inventory reconciliation" = процесс **обнаружения** расхождений; валидация `qty ≤ available` противоречит цели процесса. evolkov: "очевидно из смысла" |

---

## Hypotheses — корни факапа (ранжированы по вкладу)

### H1 — Over-correction от предыдущей feedback memory (HIGHEST)

Ранее в этой же задаче я пытался исключить Stock Taking на бизнес-рассуждениях ("а как же пересчёт физически найденных товаров"). Был резко остановлен пользователем → сохранил `feedback_jira_literal_scope.md`: «не придумывай concerns против явной Jira». **Правило не различало:**
- (a) «бизнес-сомнение в воздухе» — против которого оно было сформулировано
- (b) «объективный код-факт» (отдельная форма) — который должен был перевесить литеральность

Single-incident rule пересабрал в over-generalization, задавил собственные код-находки.

### H2 — Noticed-but-didn't-act (HIGH)

Словесно зафиксировал диагноз («случай не стандартный — qty не достижим»), но не сделал следующий шаг («значит фикс no-op → исключить»). Выбрал fallback «enum-тест покрывает» — тавтологичный: тест проверяет содержимое списка (что я сам туда добавил), а не что fix реально что-то fixит. **Это не незнание — это missing action hook.** Evidence был в руках, дальше нужен был один `if`.

### H3 — Concerns-as-offload (HIGH)

Секция «Concerns for Review-after-Ship» + строка «если evolkov скажет иначе» = явный паттерн сбрасывания ответственности на ревьюера. Systematic: у меня есть эвакуационный выход из сомнений. Надо либо разрешать concerns до ship, либо задавать вопрос — не «note and pray».

### H4 — Enum-completeness thinking vs codepath-reach thinking (MED-HIGH)

Думал: «non-INBOUND типов 8, в enum пока 4, надо 8». Целевая функция — полнота списка по доменному признаку. Правильная целевая функция — для каждого типа достижим ли фикс. Разный фрейминг → разные действия.

### H5 — Test coverage illusion (MED)

16/16 GREEN создали ощущение «покрыто». Но unit-тест проверял `isOutboundDocument('stocktaking') === true` — то что я САМ туда добавил. Это не behavior test, это tautological test. TypeScript не знает доменной семантики.

### H6 — Domain-sense blindness (MED, но STRUCTURAL)

evolkov: «очевидно из смысла инвентаризации». У меня этого smell нет и не будет — LLM не «чувствует» что инвентаризация семантически другая операция. **Structural limit:** не полагаться на «подумать про смысл», полагаться на код-эвиденс (отдельный компонент формы, автогенерация значений, отдельный endpoint mapping). Код — единственный сигнал который у меня надёжный.

### H7 — Rush to close (LOW-MED)

После «долбоёб»-инцидента (H1 event) хотел закрыть фрт. Это сократило верификацию до минимума.

### H8 — Grep не сделан (CONTRIBUTING)

Единственная мини-проверка которая закрывала всё — `grep -r "StartStockTaking"` → сразу находит `StartStockTakingModal.tsx` → видно отдельный flow. Стоимость: 30 секунд. Не выполнено потому что H1+H3 отключили «а проверь-ка ещё раз».

### Антипаттерн в явном виде

> **«Я зафиксировал, что проверка не достижима, и всё равно добавил её в enum.»**

Это не рассеянность. Это последствие правила «следуй букве Jira» без оговорки «если код противоречит букве — код приоритетнее». **Формула катастрофы:** `прошлая ошибка → гипер-правило → игнор код-факта → noted concern → ship → reviewer catch`.

---

## Best practices research — Claude Code skill/hook design

### Источники (Phase 1 web research)

1. **Claude Code Hooks reference** — https://code.claude.com/docs/en/hooks
   - `exit code 2` = deterministic hard stop (hook deny-ит tool use)
   - `exit code 1` = non-blocking error (warning, proceeds)
   - `exit code 0` = pass
   - Hook input schema: `{tool_name, tool_input, cwd, session_id}` via stdin JSON
   - `hookSpecificOutput.permissionDecision: "deny"` для structured deny reason

2. **Skill design guide** (Anthropic engineering) — `disable-model-invocation: true` в frontmatter форсит user-only invocation. Критично для procedural gates: модель не может "решить пропустить" skill, предотвращает H2-style self-override.

3. **TypeScript switch-exhaustiveness-check** (typescript-eslint) — прецедент exhaustiveness checking, но только **type-level** (union completeness). Не покрывает **behavioral** exhaustiveness (case добавлен, type-check passes, но нет handler в ветке кода). Наш case — behavioral.

4. **lint-staged pattern** (github.com/lint-staged/lint-staged) — `git diff --cached` гейт во время hook гарантирует что gate работает только на staged content. Заимствуем.

5. **Anthropic research** на "silent failures" в LLM code generation — класс багов где type-check passes, но поведение неверно. Recommendation: behavioral-path verification через mechanical checks, не через self-report.

### GitHub ecosystem — prior art поиск (Phase 1)

**Вывод: прямого аналога в Claude Code экосистеме НЕТ.** Ближайшие компоненты:

| Source | URL | Что даёт | Applicability |
|---|---|---|---|
| `@typescript-eslint/switch-exhaustiveness-check` | https://typescript-eslint.io/rules/switch-exhaustiveness-check/ | Compile-time union completeness | Заимствовать логику; не покрывает behavioral |
| `disler/claude-code-hooks-mastery` | github.com — hook patterns | Структура PreToolUse hooks + UV-based Python shims | Заимствовать shape — stdin JSON + exit codes |
| anthropics/claude-code issues #651 #32163 | github.com/anthropics/claude-code/issues | Community запрос "hard-enforce CRITICAL rules via hooks" | Подтверждает gap — not built-in |

**Решение:** invent gate, но заимствуем архитектуру:
- stdin JSON parse + exit 2 pattern → из `plan-gate.ts:200-231` (dev-pomogator)
- cwd scoping для marker-файлов → `.claude/rules/gotchas/hook-global-state-cwd-scoping.md`
- atomic write → `.claude/rules/atomic-config-save.md`
- Weighted suspicion score — собственный design (no direct prior art)

---

## Technical findings

### Structurally no-op fix

Новый термин для документирования: **fix который type-check-ается, но один из покрываемых cases не проходит через изменённый code path** (separate creation flow, auto-generated values, read-only fields, different endpoint). В нашем случае — stocktaking через `StartStockTakingModal` + `generateInventoryAdjustment({locationId})` никогда не доходит до `StockValidationService.isOutboundDocument()`, потому что проходит через свой endpoint.

**Detection signals** (код-evidence, ranked by signal strength):
1. Отдельный creation component (`Start<V>Modal.tsx`, `<V>Form.tsx`, `New<V>.tsx`)
2. Отдельный endpoint / Operation call (не generic POST items)
3. Read-only / disabled флаги на key fields (`isExpectedReadOnly === '<v>'`)
4. Auto-generated values на server (qty/params генерятся сервером, не юзером)
5. Separate data flow (`generate<V>`, `auto<V>`, `batch<V>`)

### Skill ≠ Hook semantic split

| Component | Role | Invocation |
|---|---|---|
| Skill `verify-generic-scope-fix` | **Guidance** — учит Claude как проверять, 5-step mechanical checklist | User-invocable через `/verify-generic-scope-fix` (`disable-model-invocation: true`) |
| Hook `scope-gate-guard` | **Enforcement** — блокирует commit при detection и отсутствии свежего marker-а | PreToolUse на Bash, matcher `"Bash"` + argv parsing |

Pair это покрывает оба failure modes: H2 (noticed-but-didn't-act — hook заставляет action) + H3 (concerns-as-offload — нельзя обойти через note, только через explicit escape hatch с audit trail).

### Where implementation lives

- Extension: **`extensions/scope-gate/`** (new, не засоряет `specs-workflow` / `plan-pomogator` / `suggest-rules`)
- Skill: `extensions/scope-gate/skills/verify-generic-scope-fix/SKILL.md` + `scripts/analyze-diff.ts`
- Hook: `extensions/scope-gate/tools/scope-gate/scope-gate-guard.ts` (вместе с `score-diff.ts` shared lib + `marker-store.ts`)
- Rules: `.claude/rules/scope-gate/when-to-verify.md` + `escape-hatch-audit.md`
- Installed layout (target project): `.claude/skills/verify-generic-scope-fix/`, `.dev-pomogator/tools/scope-gate/`

---

## Rejected alternatives (deep analysis per user request)

### A. Domain Knowledge Base (warehouse.md glossary + invariants)

**Отвергнуто per H6.** Идея: написать `.claude/domain/warehouse.md` с glossary доктайпов + invariants ("Stock Taking = reconciliation, не outbound"). Tech lead evolkov "чувствует" смысл — дадим Claude те же факты.

**Почему не работает:**
- H6 structural limit: LLM не feel-ит semantics так же как человек с 10 годами опыта в домене. Glossary помогает маргинально.
- H1 prepend-risk: добавление ещё одного set of rules может вызывать новую over-generalization в других задачах ("glossary говорит X — всегда применяю").
- Glossary устаревает при изменении домена; maintenance cost высокий.
- Primary lever должен быть — code evidence (надёжный для LLM), не human-style semantic intuition.

**Секундарный вклад OK:** glossary может помогать в interpretation of findings, но не prevent в одиночку. Не в scope этой spec.

### B. Only-rule (без hook)

**Отвергнуто per H2.** Идея: написать rule "при scope expansion проверь каждый case". Claude подгружает rule в контекст, применяет.

**Почему не работает:**
- H2 noticed-but-didn't-act ровно про это: правило было в контексте через `proactive-investigation.md` ("evidence required"), но Claude всё равно shipнул с noted concern. Правила не enforce-ятся.
- Без hook — skill invocation opt-in → Claude может забыть/решить skip.

### C. Only-hook (без skill, просто блок)

**Отвергнуто per UX.** Идея: hook блокирует на pattern match, user сам пишет escape rationale.

**Почему не работает:**
- Без skill — нет процедурного checklist, Claude не знает **как** verify каждый case. Hook deny без skill = "concern-offload 2.0" — Claude напишет в escape "confirmed benign" без real verification.
- Skill + hook — skill даёт структуру verification, hook enforce-ит что skill был запущен.

### D. Выбранный подход: Skill + Hook + Feedback memory refinement

- Skill — `disable-model-invocation: true`, 5-step mechanical checklist, outputs marker
- Hook — PreToolUse Bash, weighted `scoreDiff()`, marker check, escape hatch with audit log
- Memory — `feedback_jira_literal_scope.md` обновлён nuance-section "invalidating evidence" (code-evidence trumps literal Jira)
- Rule — `.claude/rules/scope-gate/when-to-verify.md` trigger map + hard-OUT signals (prevent H1 over-application)

---

## Выводы

1. Корень факапа — **не отсутствие knowledge**, а **over-correction from prior rule + missing diagnosis→action conversion**. Prevention = procedural gate, не больше философии.
2. **Code evidence > domain sense** (H6 structural). Skill checks должны быть mechanical grep-based, не "подумай про смысл".
3. Skill + Hook пара покрывает ортогональные failure modes: H2 (skill даёт процедуру) + H3 (hook enforce-ит что процедура была выполнена).
4. Escape hatch критичен, иначе gate становится H1 2.0 (over-applied, frustrating, faked).
5. dev-pomogator extension architecture позволяет доставить skill+hook как отдельный installable `extensions/scope-gate/`; не влияет на другие extensions.

---

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| cross-scope-coverage | `.claude/rules/plan-pomogator/cross-scope-coverage.md` | Multi-scope coverage matrix (scope×variant) для multi-scope фич | Работа с фичей которая реализована в >1 scope (сервисы/модули/endpoints) | Adjacent — покрывает **test coverage**, не **codepath reach**. Cross-link из scope-gate rules |
| proactive-investigation | `.claude/rules/plan-pomogator/proactive-investigation.md` | Не спрашивать разрешение исследовать; evidence per claim; `[UNVERIFIED]` для непроверяемого | Любая task где нужны факты | Основа для skill's "mechanical grep" подхода. `[UNVERIFIED]` paradigm расширяется до "unreachable" в skill output |
| plan-pomogator | `.claude/rules/plan-pomogator/plan-pomogator.md` | Единый формат планов разработки | Plan mode | Ссылка на `plan-gate.ts` как реузабельный template для `scope-gate-guard.ts` |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | temp file + atomic move для JSON configs | Write to .json configs | Marker файлы пишутся atomic'но |
| atomic-update-lock | `.claude/rules/atomic-update-lock.md` | `flag: 'wx'` O_EXCL pattern | Lock files | Может применяться для marker-store concurrency (если несколько skill invocations параллельно) |
| no-unvalidated-manifest-paths | `.claude/rules/no-unvalidated-manifest-paths.md` | Path traversal protection через resolve + startsWith | Любое чтение paths | Marker path validation (prevent escape из `.claude/.scope-verified/`) |
| hook-global-state-cwd-scoping | `.claude/rules/gotchas/hook-global-state-cwd-scoping.md` | Hooks ДОЛЖНЫ использовать `data.cwd` для per-project state | Hooks читающие глобальные директории | Marker files под `{cwd}/.claude/.scope-verified/`, не `~/.claude/` |
| installer-hook-formats | `.claude/rules/gotchas/installer-hook-formats.md` | 3 формата hook registration в extension.json | extension.json creation | Используется Object format для `PreToolUse` с matcher + command + timeout |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | В `extensions/**/*.ts` relative imports ОБЯЗАНЫ с `.ts` расширением | Write TS files в extensions/ | `scope-gate-guard.ts` imports from `./score-diff.ts` и `./marker-store.ts` (не `.js`) |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | Manifest = источник истины для updater | Extension changes | `extension.json` обновляется при каждом добавлении tool/skill/hook файла |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Тесты через `runInstaller`/`spawnSync`, не mock unit | Test writing | E2E test — hook spawn as child, не mocked |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| plan-gate.ts (plan-pomogator) | `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:200-231` | Stdin JSON read, fail-open на parse errors, tool_name filter, denyAndExit pattern, `isTTY` check | **Direct template** для `scope-gate-guard.ts` main() функции |
| scorePromptRelevance (plan-pomogator) | `plan-gate.ts:164-188` | Weighted word overlap scoring pattern | Shape для `scoreDiff()` weighted heuristic (filename + pattern + predicate) |
| hook input schema (Claude Code) | stdin JSON: `{tool_name, tool_input, cwd, session_id}` | Canonical PreToolUse input | Documented в `scope-gate_SCHEMA.md` |
| extension.json PreToolUse Object form | `extensions/reqnroll-ce-guard/extension.json:22-24` (Write\|Edit matcher) + `extensions/tui-test-runner/extension.json:79` (Bash matcher) | Object-form hook registration | Pattern для `extensions/scope-gate/extension.json` hooks.claude.PreToolUse |
| dev-pomogator-uninstall skill | `.claude/skills/dev-pomogator-uninstall/SKILL.md` | Frontmatter shape: `name`, `description`, `allowed-tools` | Baseline для `verify-generic-scope-fix` SKILL.md; `disable-model-invocation: true` — NEW для dev-pomogator, документируется как reusable pattern |
| auto-commit core | `extensions/auto-commit/tools/auto-commit/auto_commit_core.ts` | `getGitDiff()`, `getChangedFiles()` | Возможный reuse для diff parsing в `scope-gate-guard.ts` (не blocking — если логика простая, inline) |
| installer-hook-formats rule | `.claude/rules/gotchas/installer-hook-formats.md` | 3 format support reference | Compatibility guarantee для `extension.json` |
| atomic-config-save rule | `.claude/rules/atomic-config-save.md` | temp + move pattern | `marker-store.ts` atomic write |
| Feature test infrastructure | `tests/e2e/helpers.ts` | `runInstaller`, `spawnSync` wrappers | E2E test reuse |

### Architectural Constraints Summary

- **Extension home:** `extensions/scope-gate/` (new). Не кладём в specs-workflow (тематически shift) или plan-pomogator (adjacent но разный matcher domain). Отдельный extension = install opt-in, чистая граница.
- **Hook matcher:** `"Bash"` (не `"Bash git commit"` — нет precedent для sub-command matcher в dev-pomogator, `plan-gate.ts:229` показывает filter внутри кода, не в matcher).
- **Fail-open everywhere:** JSON parse error, exec error, unknown tool_name → exit 0. Hook ломаться silent-но = лучше чем false positive deny.
- **Cwd-scoped marker files:** `{cwd}/.claude/.scope-verified/` не `~/.claude/`. Prevent сторонний-session / сторонний-project contamination.
- **Performance budget:** hook < 500ms cold-start (стрикт than plan-gate's 2s) потому что fires на каждый Bash, включая innocuous commands. Большая часть ответа — score computation на маленьком diff.
- **Disable-model-invocation:** skill SHALL have `disable-model-invocation: true` — новый паттерн для dev-pomogator, документируется в DESIGN.md как reusable pattern для будущих procedural gates.
- **Rule ecosystem cross-link:** `cross-scope-coverage.md` остаётся owner для multi-scope coverage matrix; новая rule `scope-gate/when-to-verify.md` owner для per-case codepath reach. Одна строка "See also" в `cross-scope-coverage.md` для navigation.
- **Memory refinement:** `feedback_jira_literal_scope.md` (в webapp's memory store) ДОЛЖНА быть дополнена секцией "Invalidating evidence" per `feedback_single-incident-rules-over-generalize.md` принципа — отдельная task после dev-pomogator scope-gate release, not в dev-pomogator spec scope.
