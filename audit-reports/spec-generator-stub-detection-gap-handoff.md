# Handoff — spec-generator не ловит незаполненные scaffold-заглушки (stub-detection gap)

**Дата:** 2026-07-01
**Автор находки:** сессия по `.specs/forbid-root-artifacts`
**Тип:** баг генератора спек (missing validation), не баг конкретной спеки
**Для:** агента, который возьмётся чинить `tools/specs-generator`

---

## 1. Симптом (одной фразой)

Спека может пройти ВСЕ проверки здоровья и числиться **GREEN**, при этом её
документы (`README.md`, `TASKS.md`, `FIXTURES.md`, …) остаются нетронутым
scaffold'ом с плейсхолдерами `{Краткое описание фичи}`, `{first task}`, `TBD-1`,
`{Название фикстуры}`. Ни один валидатор этого не замечает.

## 2. Доказательство, что баг реален (не предположение)

- **Живой кейс:** `.specs/forbid-root-artifacts` на момент находки имел
  `README.md` / `TASKS.md` / `FIXTURES.md` целиком из плейсхолдеров, но
  `get_spec_status view=status` → `lifecycle: GREEN`, `gaps` все 0.
  (после этой сессии три документа уже дописаны — чтобы воспроизвести баг, смотри
  git-историю ДО коммита финализации forbid-root-artifacts, или любую свежую
  свежескаффолженную спеку.)
- **`validation-report.md` перегенерился `2026-07-01T15:00:45Z`** поверх спеки с
  тремя заглушками и НЕ пометил их — прямое свидетельство, что pipeline валидации
  слеп к плейсхолдерам.
- **Греп по валидаторам пуст:** `validate-spec.ts`, `audit-spec.ts`,
  `spec-verdict.ts` не содержат ни одной проверки на плейсхолдеры/scaffold
  (совпадения по `\{` в `spec-verdict.ts` — это backtick-`${...}` в строках
  ошибок, не детект заглушек).

## 3. Почему проскакивает (root cause)

Существующие проверки заточены на СТРУКТУРУ и ТРАССИРУЕМОСТЬ, а не на «дописан ли
документ»:

| Проверка | Что проверяет | Ловит ли заглушку |
|----------|---------------|-------------------|
| `validate-spec.ts` | формат, секции, ссылки | ❌ нет |
| `audit-spec.ts` | кросс-ссылки, coverage-категории | ❌ нет |
| `spec-verdict.ts` | audit + traceability + conformance + semantic | ❌ нет (композирует над теми, что не ловят) |
| `get_spec_status` | lifecycle из прогона тестов + FR-37b gaps | ❌ нет |

Плейсхолдер валиден структурно: `| TBD-1 | {first task} | TODO | … |` — это
корректная строка таблицы, `{Краткое описание фичи}` — валидный markdown-текст.

## 4. Что сделать (actionable)

### 4.1 Где вешать проверку

**Основное:** новая audit-категория в `tools/specs-generator/audit-spec.ts`
(например `SCAFFOLD_PLACEHOLDER`, severity ERROR). Тогда она автоматически
поднимется в `spec-verdict.ts` (hard gate) → спека с заглушками станет **RED**, и
`get_spec_status`/STOP #3 перестанут её пропускать.

### 4.2 ЧТО матчить — сентинелы из шаблонов, НЕ blanket `{...}`

⚠️ **Ловушка ложных срабатываний (H1 over-generalization).** Наивный regex
`\{[^}]+\}` даст ложные позитивы на легитимных фигурных скобках:

- EARS-шаблоны и примеры в теле спеки;
- fenced code blocks (` ``` `) с реальным кодом (`module.exports = {}`,
  `reqnroll.json` `{}`);
- Cucumber-параметры в `.feature` / step-defs: `{int}`, `{string}`, `{word}`;
- JSON-примеры в `DESIGN.md` / `SCHEMA.md`.

**Безопасный подход — извлекать точные сентинелы из самих `.template`-файлов:**

1. Прочитать `tools/specs-generator/templates/*.template`.
2. Извлечь литеральные scaffold-маркеры, которые генератор эмитит дословно:
   - брейс-плейсхолдеры: `{Краткое описание фичи}`, `{Идея 1}`, `{путь/к/коду}`,
     `{Название фикстуры}`, `{first task}`, `{Задача 1.1}`, `{Этап реализации 1}`, …
   - НЕ-брейс маркеры: `TBD-1`, `TBD-2`, `{first task}` в auto-gen блоке таблицы.
3. Флагать документ спеки, если он **дословно содержит** любой из этих
   template-сентинелов. Дословное совпадение = документ провабельно не дописан,
   и ложных позитивов на легитимных `{}` нет by construction.
4. Указывать в finding: файл + номер строки + сам сентинел + подсказку «дописать
   через соответствующий автозаполнитель (`discovery-forms` /
   `requirements-chk-matrix` / `task-board-forms`) либо вручную через дверь».

Дополнительный слабый сигнал (можно учесть, не обязателен): спека, у которой
`phase Finalization` `stop_confirmed: false` И остались template-сентинелы —
почти наверняка брошенный scaffold.

### 4.3 Не забыть исключения (чтобы не переусердствовать)

- Сами `templates/*.template` — источник сентинелов, их флагать НЕЛЬЗЯ.
- `__fixtures__/**` спек-генератора (напр. `task-table-input/TASKS.md`) —
  тестовые данные, могут легитимно содержать сентинелы.
- `.specs/backlog/**` — never-built scaffolding (см. правило `bdd-only-tests`
  про backlog): решить осознанно, флагать ли (вероятно WARNING, не ERROR).

## 5. Definition of Done для фикса

- [ ] Новая проверка (в `audit-spec.ts`) флагает документ с дословным
      template-сентинелом; severity ERROR (или WARNING для backlog).
- [ ] `spec-verdict.ts` показывает RED на спеке с заглушками; GREEN когда дописано.
- [ ] Ноль ложных позитивов на: EARS-скобках, code fences, `.feature` с
      `{int}`/`{string}`, JSON-примерах (добавить фикстуру с каждым).
- [ ] BDD-сценарий: свежескаффоленная спека → RED по `SCAFFOLD_PLACEHOLDER`;
      после заполнения → категория исчезает.
- [ ] Прогон против реального корпуса `.specs/` (`corpus-health` / bulk) —
      посмотреть, сколько ещё спек всплывёт как недописанные (ожидаемо >1).
- [ ] Исключения из §4.3 не флагаются.

## 6. Связанные правила/файлы

- `.claude/rules/spec-verdict/no-structural-valid.md` — «structural pass ≠ здоровье»;
  этот баг — новый подкласс (scaffold pass ≠ здоровье).
- `.claude/rules/gotchas/rollup-completeness-all-not-any.md` — anti-false-green агрегация.
- `.claude/rules/testing/verify-against-real-artifact.md` — §4.2 fixtures/ложные позитивы.
- `feedback_single-incident-rules-over-generalize.md` (memory) — H1 guardrail, §4.2.
- Источник сентинелов: `tools/specs-generator/templates/*.template`.
- Точка внедрения: `tools/specs-generator/audit-spec.ts` (+ композиция в `spec-verdict.ts`).
