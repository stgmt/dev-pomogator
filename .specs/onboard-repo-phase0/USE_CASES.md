# Use Cases

## UC-1: Первый `/create-spec` в новом репо → auto-trigger Phase 0 @feature1

**Actor:** Developer using dev-pomogator.

**Precondition:**
- Dev-pomogator установлен в target repo (`.dev-pomogator/` + `.claude/` существуют)
- `.specs/.onboarding.json` отсутствует
- В репо есть хотя бы `README.md` или манифест (`package.json`/`pyproject.toml`/`*.csproj`/...)

**Main flow:**
1. Developer запускает `/create-spec my-new-feature`
2. `create-spec` skill детектит отсутствие `.specs/.onboarding.json` → triggers Phase 0
3. Phase 0 выполняет 7 шагов (archetype triage → parallel recon → ingestion → baseline tests → scratch findings → text gate → final artifacts)
4. Создаются `.specs/.onboarding.json` + `.specs/.onboarding.md`
5. Рендеринг: `.claude/rules/onboarding-context.md` + PreToolUse hook в `.claude/settings.local.json`
6. Text gate: агент пишет 1 абзац про архитектуру, developer подтверждает
7. `spec-status.ts -ConfirmStop Onboarding` фиксирует переход
8. `/create-spec` продолжает Phase 1 Discovery с pre-populated context из `.onboarding.json`

**Alt flow (baseline тесты fail):**
- 6a. Failed tests → записываются в `onboarding.json.risks` как "существующие проблемы до старта работы"
- 6b. Если `test_commands` не выполняется (missing deps) — Phase 0 прерывается с hint "поставьте зависимости"

**Postcondition:**
- 3 новых артефакта созданы
- 1 hook добавлен в `.claude/settings.local.json`
- State machine → `.progress.json.state == "Discovery"`

---

## UC-2: Последующий `/create-spec` с валидным cache @feature4

**Actor:** Developer.

**Precondition:**
- `.specs/.onboarding.json` существует
- `onboarding.last_indexed_sha == git rev-parse HEAD`

**Main flow:**
1. Developer запускает `/create-spec another-feature`
2. `create-spec` читает `.onboarding.json`, видит валидный SHA
3. Phase 0 **пропускается**. Агент показывает 3-строчный summary: "Используется онбординг от {date}, архетип {type}, {N} tests в baseline"
4. Phase 1 Discovery стартует немедленно с pre-populated context

**Postcondition:** Phase 0 skip, экономия ~15 минут.

---

## UC-3: Git SHA изменился — prompt refresh @feature4

**Actor:** Developer.

**Precondition:**
- `.onboarding.json` существует
- `last_indexed_sha != git rev-parse HEAD`
- Между SHA минимум N коммитов (`N ≥ 5` по умолчанию)

**Main flow:**
1. Developer запускает `/create-spec next-feature`
2. `create-spec` сверяет SHA → drift detected
3. Prompt: "Онбординг устарел на {N} коммитов. Refresh или продолжить с cache?"
4. Developer выбирает:
   - **Refresh** → полный Phase 0 re-run
   - **Continue with cache** → Phase 0 skip, warning в `progress.json.warnings`

**Postcondition:** либо артефакты обновлены, либо явное согласие на stale state.

---

## UC-4: Manual refresh через `--refresh-onboarding` @feature4

**Actor:** Developer (explicit intent).

**Precondition:** любое состояние `.onboarding.json`.

**Main flow:**
1. Developer: `/create-spec feature-x --refresh-onboarding`
2. Phase 0 принудительно запускается
3. Старые артефакты → `.specs/.onboarding-history/{timestamp}/`
4. Новый цикл Phase 0

**Postcondition:** свежие артефакты, история предыдущего онбординга в `.onboarding-history/` (retention: 5 последних).

---

## UC-5: Target repo не имеет установленного dev-pomogator @feature13

**Actor:** Developer.

**Precondition:** нет `.dev-pomogator/` в target repo.

**Main flow:**
1. Developer запускает `/create-spec ...`
2. `create-spec` детектит отсутствие dev-pomogator
3. Error: "Dev-pomogator не установлен. Запустите `npx github:stgmt/dev-pomogator --claude` и повторите."
4. Phase 0 не стартует

**Postcondition:** actionable hint в stdout. State machine в начальном состоянии.

---

## UC-6: Repo имеет repomix CLI — ingestion через compress @feature7

**Actor:** AI agent (implicit в Step 3 Phase 0 алгоритма).

**Precondition:** `which repomix` успешно (глобально или в `node_modules/.bin`).

**Main flow:**
1. Phase 0 Step 3 детектит доступность `repomix`
2. Запускает: `repomix --compress -o /tmp/.onboarding-{repo-slug}.xml`
3. Capture output size + compression ratio
4. Использует XML как input для reasoning

**Alt (fallback):** `repomix` отсутствует → shell-based top-N по (size + recency + grep-based import count)

**Postcondition:** `onboarding.json.ingestion.method == "repomix" | "fallback"` с метриками.

---

## UC-7: Repo без тестов @feature5

**Actor:** Developer.

**Precondition:** Subagent B не нашёл test framework.

**Main flow:**
1. Phase 0 Step 4 skip-ится
2. В `onboarding.json.baseline_tests`: `{"framework": null, "reason": "no test framework detected"}`
3. В `risks`: "Нет тестов — baseline undefined, любые изменения trust-as-is"
4. Phase 0 продолжается без test run

**Postcondition:** онбординг завершается, risk документирован.

---

## UC-8: Text gate не пройден / итеративное уточнение @feature6

**Actor:** Developer + AI agent.

**Precondition:** Phase 0 Step 6 (text gate) активен.

**Main flow:**
1. AI agent пишет 1 абзац резюме проекта
2. Агент задаёт вопрос: "Правильно я понял суть? Что-то нужно поправить?"
3. Developer отвечает "не совсем, X должно быть Y"
4. Агент обновляет резюме с учётом правок
5. Цикл 2-3 пока developer не подтвердит ("да, верно")
6. После подтверждения — `spec-status.ts -ConfirmStop Onboarding`

**Alt (abort):**
- Developer: "не хочу продолжать" → `spec-status.ts -Abort` → артефакты NOT финализируются

**Postcondition:** либо gate passed + финализация, либо abort + временные артефакты.

---

## UC-9: Рендеринг в dual-artifact после text gate @feature15

**Actor:** `render-onboarding` скрипт (автоматический шаг).

**Precondition:** Phase 0 Step 6 passed.

**Main flow:**
1. Скрипт читает `.specs/.onboarding.json`
2. Рендерит prose в `.claude/rules/onboarding-context.md` с marker: `<!-- managed by dev-pomogator onboarding, do not edit -->`
3. Компилирует `hooks.PreToolUse[]` из `onboarding.commands.*.raw_pattern_to_block` регексов
4. Smart-merge hook-блока в `.claude/settings.local.json` (user-hooks preserved)
5. SHA-256 хеши сгенерированных файлов → managed-registry для updater-а

**Postcondition:**
- 2 новых managed файла
- PreToolUse hook активен — raw `npm test`/`pytest`/etc. блокируется

---

## UC-10: Coexistence с Anthropic /init @feature12

**Actor:** Developer.

**Precondition:** В репо уже есть `CLAUDE.md` (от `/init` или написанный вручную).

**Main flow:**
1. Phase 0 запускается нормально
2. Subagent B детектит `CLAUDE.md` → записывает в `onboarding.existing_ai_configs`
3. Phase 0 **НЕ трогает `CLAUDE.md`** — пишет только в свои файлы
4. Рендеринг `.claude/rules/onboarding-context.md` независим от `CLAUDE.md`

**Postcondition:** 2 источника контекста живут параллельно, не пересекаются.

---

## UC-11: Scratch file при крупном repo @feature14

**Actor:** AI agent (implicit during Phase 0).

**Precondition:** Агент детектит >500 файлов.

**Main flow:**
1. Во время parallel recon (Step 2) subagent каждые 2-3 прочитанных файла appends в `.specs/.onboarding-scratch.md`
2. Scratch-файл сохраняется между sub-agent runs
3. После Step 7 scratch-файл **archive-ится** в `.specs/.onboarding-history/scratch-{timestamp}.md` и удаляется из основной директории

**Postcondition:** онбординг завершён, scratch не мусорит, история для retrospective.

---

## UC-12: Archetype routing — Frontend SPA @feature8

**Actor:** AI agent.

**Precondition:** Phase 0 Step 1 детектит signal-файлы: `src/pages/`, `next.config.*`, `src/App.tsx` + `vite.config.*`.

**Main flow:**
1. `archetype == "frontend-spa"` записывается
2. Parallel recon пропускает поиск БД-миграций, Dockerfile server, etc.
3. Фокус: routes, state management, API clients, accessibility configs
4. Report template адаптируется: секция "Routes & state" вместо "API endpoints"

**Postcondition:** `onboarding.json.archetype_specific == {...frontend-specific fields}`, отчёт specific.

---

## UC-13: Partial onboarding (skip baseline tests) @feature5

**Actor:** Developer.

**Precondition:** любое.

**Main flow:**
1. Developer: `/create-spec ... --onboard --skip-baseline-tests`
2. Phase 0 запускается, Step 4 skip-ится
3. В `onboarding.json.baseline_tests`: `{"skipped_by_user": true}`

**Postcondition:** Онбординг частичный. Баннер при следующем `/create-spec`: "Baseline tests skipped — consider full refresh".

---

## Edge Cases

### EC-1: Repo не git-tracked
- `git rev-parse HEAD` fails → fallback cache по mtime манифестов
- Warning в onboarding.json: "not a git repo, cache invalidation via mtime"

### EC-2: Monorepo с несколькими sub-проектами
- Archetype = `"monorepo"` с `sub_archetypes: [{"path": "web/", "archetype": "nodejs-frontend"}, {"path": "api/", "archetype": "python-api"}]`
- Baseline tests per-sub (если detected)

### EC-3: `.cursorignore` / `.aiderignore` в репо
- Phase 0 respect-ит: не читает игнорируемые paths
- Факт игнорирования → `onboarding.json.ignore.external_configs_found`

### EC-4: Минимальный репо (только README)
- Онбординг завершается коротким отчётом, не найденное = `null`/`"N/A"`
- Gate text может быть: "Репо минимальный — README + пара скриптов. Предлагаю сразу в Discovery"

### EC-5: Repo с >10000 файлов
- Warning: "Крупный репо — ingestion может занять 5+ минут"
- Предложение использовать repomix обязательно (не fallback)

### EC-6: Параллельные subagents вернули конфликтующие данные
- Merge strategy: Subagent A (манифесты) приоритетнее для languages/frameworks; Subagent B (тесты/AI-configs) приоритетнее для test_commands; Subagent C (entry points) приоритетнее для architecture_hint
- Конфликты логируются в `.onboarding-scratch.md`
