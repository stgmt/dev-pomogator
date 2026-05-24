# Use Cases

## UC-1: Standalone — выбор стека для greenfield-проекта (happy path)

Разработчик с новым проектом (только PRD) просит "выбери стек". Связано с US-1, US-2.

- Юзер пишет "выбери стек для проекта" / "спроектируй архитектуру" → skill auto-trigger
- Skill читает PRD (или спрашивает путь если standalone без spec) → команда `enumerate`
- Детектит decision-axes (3 слоя), показывает tier-grouped список → AskUserQuestion подтверждение
- Для каждой оси: `next-axis` → генерит md+html → открывает html в браузере
- AskUserQuestion "решение по оси?" → юзер выбирает `[Беру рекомендацию]` или другой вариант
- Skill пишет выбор в frontmatter оси + регенерит INDEX.md/html
- Результат: `architecture-decisions/{slug}/` с per-axis файлами + INDEX

_Covers: @feature1, @feature2, @feature3, @feature4, @feature8_

## UC-2: Inside create-spec — Phase 1.75 (happy path)

Пользователь создаёт спеку для greenfield-фичи через create-spec. Связано с US-3.

- create-spec проходит Phase 1 Discovery → Phase 1.5 Project Context
- Detection: нет build-manifest в repo root → greenfield → переход в Phase 1.75
- create-spec вызывает `Skill("architecture-decision-builder")` команда `enumerate`
- Loop: для каждой оси `next-axis` (create-spec оркестрирует loop, subskill stateless через QUEUE.json)
- Все оси решены → STOP #1.75 (`spec-status.ts -ConfirmStop Architecture`)
- Результат: `.specs/{slug}/ARCHITECTURE/` + переход в Phase 2 с зафиксированным стеком

_Covers: @feature5, @feature7, @feature9_

## UC-3: Cascading implications (BMAD pattern)

Выбор одного варианта открывает новую decision-ось. Связано с US-1.

- Юзер на оси "hosting" выбирает "Cloudflare Workers"
- Cascading check (axis-catalog map): Workers → новая ось "Workers KV vs D1 vs external Postgres"
- Skill добавляет новую ось в QUEUE.json (depth cap 2)
- На границе depth-2 → AskUserQuestion "расширить дальше?"
- Результат: очередь осей растёт согласованно с принятыми решениями

_Covers: @feature6, @feature10_

## UC-4: Eval/debug прогон качества скила

Разработчик прогоняет eval-suite чтобы убедиться скил не галлюцинирует и выдаёт качественные варианты. Связано с US-4.

- Запустить deterministic evals (8 cases) → grading.json + aggregate.json
- Прогнать qualitative artifact-bench на golden scenario-bhph → rubric R1-R9
- При fail R3 (тех-заявление без [VERIFIED]/[UNVERIFIED]) → grading показывает строку
- iteration-N diff ловит регрессию против golden bench
- Результат: pass/fail отчёт + debug-сигнал какой criterion провалился

_Covers: @feature11_

## Edge Cases

- **PRD не найден / не markdown:** `enumerate` возвращает `{error: PRD_NOT_FOUND, suggested_paths}`; standalone fallback на inline-paste пути через AskUserQuestion
- **Brownfield (есть build-manifest):** hard-OUT skip — skill возвращает `{axes_detected: 0, skipped_reason: "brownfield-signals"}`, Phase 1.75 авто-skip
- **Reject-all variants:** опция `[Отвергнуть все]` → 1 retry с `mode: alternates` (exclude текущие) → после 2-го отказа AskUserQuestion "skip / задать вручную / отменить ось"
- **Browser launch fail (WSL/headless):** `open-in-browser` возвращает `{launched:false, fallback}`, печатает путь, продолжает
- **Mermaid CDN заблокирован (proxy):** HTML рендерится, mermaid-блоки показываются как code + noscript fallback
- **Cascading cycle:** axis-id set membership detection + depth cap 2 предотвращают бесконечный loop
- **Спека version < 4:** Phase 1.75 пропускается no-op (migration guard)
- **Existing ARCHITECTURE/ с user-контентом:** preserve non-`AXIS-*` файлы, не перезаписывать
