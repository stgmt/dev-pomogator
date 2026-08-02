---
name: dynamic-workflow-engineering
description: Проектирует, запускает и проверяет Dynamic Workflow для нетривиальной разработки, исследования, аудита и миграций. Использовать, когда задача требует параллельных агентов, multi-agent review, workflow/ultracode, fan-out, verifier, synthesizer или когда нужно оценить качество, стоимость, зависание и false-positive результаты workflow.
---

# Dynamic Workflow Engineering

## Назначение

Dynamic Workflow — исполняемый JavaScript-план оркестрации. Он запускает агентов, но не гарантирует истинность их выводов. Этот skill задаёт обязательный процесс:

```text
scope
→ decomposition
→ bounded agent prompts
→ parallel/pipeline execution
→ adversarial verification
→ deterministic checks
→ synthesis
→ main-agent acceptance
```

Настройка `workflowSizeGuideline` управляет рекомендуемым числом агентов, но не ограничивает время и токены одного агента. Больше агентов не означает выше качество; несколько узких агентов обычно лучше нескольких широких.

## 1. Когда запускать Workflow

Запускать для содержательной задачи, если есть хотя бы одно:

- 3+ независимых направления исследования или разработки;
- несколько файлов/подсистем с независимыми ownership scopes;
- широкий review/audit, где нужны разные lenses;
- миграция набора объектов;
- необходимость независимых finder/verifier/synthesizer;
- пользователь прямо попросил Dynamic Workflow, fan-out, orchestration или ultracode.

Не запускать для:

- одной тривиальной правки;
- одного факта в известном файле;
- задачи, где параллельные редакторы неизбежно конфликтуют и работу нельзя разделить;
- внешнего действия, которое требует одного serial browser/cart/checkout writer.

## 2. Сначала построить карту работы

До Workflow определить:

1. Цель и проверяемый итог.
2. Независимые work packages.
3. Зависимости между ними.
4. Какие агенты read-only, какие меняют файлы.
5. Где нужен общий барьер, а где `pipeline()`.
6. Как будет проверяться результат каждого агента.
7. Критерий остановки.

Нельзя запускать N одинаковых агентов с промптом «полностью исследуй репозиторий». Каждому агенту назначать уникальный scope или уникальную проверочную роль.

## 3. Размер workflow

При `medium` ориентир — меньше 15 агентов. Рекомендуемые формы:

### Узкая нетривиальная задача: 4–6

```text
2–3 scoped worker/finder
1–2 verifier
1 synthesizer
```

### Средняя разработка: 7–10

```text
3–5 implementer по независимым ownership scopes
2 adversarial verifier
1 integration tester
1 completeness critic
1 synthesizer
```

### Широкий audit/migration: 10–14

```text
4–6 finder/worker
по 1–2 verifier на свежие находки
1 regression/integration verifier
1 completeness critic
1 synthesizer
```

Не доводить количество до числа искусственно. Если независимых work packages только три, запустить три агента и verifier stage, а не клонировать одинаковые промпты.

## 4. Bounded prompt каждого агента

Каждый spawn prompt обязан содержать:

1. **Role** — одна конкретная функция.
2. **Scope** — точные файлы, сущности или источник.
3. **Question** — что именно установить/изменить.
4. **Constraints** — read-only/ownership/security/no-secret/no-bypass.
5. **Evidence standard** — что считается подтверждением.
6. **Output schema** — структурированный результат.
7. **Stop condition** — когда немедленно закончить.

Шаблон review-агента:

```text
Role: correctness reviewer.
Scope: только src/a.py и tests/test_a.py.
Проверь: X, Y, Z.
Не читай весь репозиторий, data/runs и внешнюю документацию.
Finding допустим только с file:line, достижимым input/state и неправильным output.
Попытайся опровергнуть собственную находку.
Максимум 5 findings; если подтверждённых нет — пустой массив.
Read-only. Закончи после назначенного scope.
```

Шаблон implementer:

```text
Ownership: изменяй только перечисленные файлы.
До правки воспроизведи дефект тестом.
После правки запусти только focused tests.
Не коммить, не трогай общие файлы, не расширяй scope.
Верни changed files, тесты и открытые риски.
```

## 5. Выбор `parallel()` и `pipeline()`

### `pipeline()` — по умолчанию

Использовать для независимых объектов, каждый из которых проходит цепочку:

```text
item A: inspect → change → verify
item B: inspect → change → verify
```

Следующий stage конкретного item начинается сразу после предыдущего; не ждать остальные items.

### `parallel()` — только при настоящем барьере

Использовать, когда следующий шаг требует всех результатов:

- дедупликация findings по всему набору;
- выбор победителя из нескольких designs;
- synthesizer должен увидеть все reports;
- надо остановиться, если общий discovery пуст.

Запах плохого дизайна:

```javascript
const found = await parallel(...)
const transformed = found.flatMap(...)
const verified = await parallel(...)
```

Если transform не использует cross-item context, делать pipeline, а не общий barrier.

## 6. Изменение файлов без конфликтов

### Общая working tree допустима

Только когда ownership scopes не пересекаются и явно перечислены в промптах.

### `isolation: "worktree"` обязательно

Когда агенты могут менять одни и те же файлы, выполнять широкие refactors или выбирать альтернативные implementations.

### Serial single-writer обязательно

Для:

- ledger/delta/current-state commit;
- cart/checkout;
- одной общей конфигурации;
- итогового merge нескольких worktrees;
- outward-facing publish/deploy.

Capture можно распараллелить; admission/commit оставить single-writer.

## 7. Structured output не доказывает истину

JSON Schema проверяет только форму. Он не доказывает:

- существование файла/строки;
- достижимость состояния;
- неправильный output;
- severity;
- отсутствие предыдущего или следующего gate.

Любой agent finding сначала имеет статус `HYPOTHESIS`.

Допустимые verdicts после main-agent/verification stage:

- `CONFIRMED` — воспроизводимый сценарий или падающий regression test;
- `PLAUSIBLE` — аргумент есть, но live/external proof недоступен;
- `REFUTED` — gate/test/code path опроверг finding;
- `BLOCKED` — доказательство невозможно из-за auth/CAPTCHA/provider/outage/missing fixture.

## 8. Защита от false positives

Для каждого свежего finding:

1. Проверить, что file/line/symbol существуют.
2. Проверить allowed input и schema.
3. Проверить достижимость ветки.
4. Найти предыдущие validators/gates.
5. Найти последующие validators/gates.
6. Построить конкретный state/input → wrong output.
7. Попытаться опровергнуть finding отдельным adversarial verifier.
8. Добавить regression test, падающий до исправления.
9. После исправления выполнить focused и integration/full tests.

Для критичных findings использовать разные lenses:

```text
correctness verifier
reachability verifier
reproduction verifier
```

Голосование агентов — не доказательство. Два агента одной модели могут повторить одну ошибочную предпосылку. Детерминированный test сильнее majority vote.

Verifier prompt формулировать как:

```text
Попытайся опровергнуть finding. Считай его ложным, пока не доказан достижимый неправильный результат. Не исправляй код.
```

Не писать «подтверди найденную ошибку».

## 9. Monitoring и предупреждения

Строка:

```text
N/M agents done · elapsed · tokens · ⚠ Large workflow
```

показывает progress, не качество.

`Large workflow` — advisory warning, а не автоматический verdict о зависании и не команда остановки. Точные числовые пороги и привязку к версии нельзя вшивать в shipped skill без актуальной официальной цитаты или real-host evidence; если такого доказательства нет, порог считается неизвестным и выводится только фактическая метрика UI.

Разделять в отчёте:

- **FACT:** точная метрика UI, документированный threshold, фактические completed/failed agents;
- **INFERENCE:** расход/длительность выглядят чрезмерными;
- **UNKNOWN:** агент завис, крутится полезно или скоро завершится;
- **ACTION:** stop/resume только после проверки progress/journal и ожидаемой пользы.

Нельзя говорить «runaway» или «надо остановить» только из-за `Large workflow`.

Перед stop проверить:

1. `/workflows` progress по фазам.
2. Есть ли новые agent completions.
3. `journal.jsonl`: есть ли завершённые returns/errors.
4. Внешняя ли это задержка или model/tool loop.
5. Нужны ли незавершённые результаты для следующего barrier.
6. Сохранены ли полезные completed results.

Stop рекомендовать как оценку только с основанием, например:

```text
За 20 минут нет новых journal events, один и тот же tool/error повторяется, а уже завершённые результаты закрывают scope.
```

## 10. Token discipline

Чтобы 3 широких агента не съели больше 10 узких:

- перечислять файлы, не говорить «исследуй весь репозиторий»;
- запретить чтение `data/runs`, browser captures и больших logs без необходимости;
- не дублировать web research;
- ограничивать findings/attempts/rounds;
- использовать low effort для механики;
- давать verifier только finding + минимальный code context;
- применять loop-until-dry только для реального unknown-size discovery;
- логировать coverage bounds и dropped work;
- ставить явный stop condition.

При пользовательском token budget использовать `budget.remaining()` и не создавать новые agents ниже safety reserve.

## 11. Synthesis

Synthesizer не должен просто объединять отчёты. Он обязан:

1. удалить дубли;
2. отбросить findings без failure scenario;
3. сохранить verifier verdicts;
4. разделить confirmed/plausible/refuted/blocked;
5. сопоставить findings с tests;
6. перечислить непроверенные scopes;
7. не закрывать open questions самостоятельно.

Главный агент после Workflow обязан самостоятельно прочитать критичные места и выполнить детерминированные проверки. Final response нельзя основывать только на словах synthesizer.

## 12. Definition of done

Workflow считается полезно завершённым, когда:

- все заявленные scopes либо проверены, либо явно marked blocked/dropped;
- нет findings без verdict;
- confirmed defects имеют reproduction/test;
- изменения прошли focused tests;
- integration/full tests и audits выполнены или явно пропущены с причиной;
- completeness critic не нашёл незаявленную дыру либо она добавлена в open work;
- main agent сообщает факты отдельно от inference.

## 13. Рекомендуемый workflow review-скрипт

```javascript
export const meta = {
  name: 'bounded-review',
  description: 'Scoped review with adversarial verification',
  phases: [
    {title: 'Find', detail: 'independent scoped finders'},
    {title: 'Verify', detail: 'try to refute every fresh finding'},
    {title: 'Synthesize', detail: 'retain only verified results'},
  ],
}

const FOUND = await parallel(SCOPES.map(scope => () =>
  agent(finderPrompt(scope), {
    label: `find:${scope.key}`,
    phase: 'Find',
    schema: FINDINGS_SCHEMA,
  })
))

const fresh = dedupe(FOUND.filter(Boolean).flatMap(x => x.findings))

const verified = await pipeline(
  fresh,
  finding => agent(refutePrompt(finding), {
    label: `verify:${finding.file}`,
    phase: 'Verify',
    schema: VERDICT_SCHEMA,
  }),
  (verdict, finding) => ({finding, verdict}),
)

return agent(synthesisPrompt(verified), {
  label: 'synthesis',
  phase: 'Synthesize',
  schema: SYNTHESIS_SCHEMA,
})
```

Конкретная реализация должна объявить schemas и dedupe; пример показывает форму, а не готовый самостоятельный script.

## Источники

- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agents
- https://code.claude.com/docs/en/agent-teams
