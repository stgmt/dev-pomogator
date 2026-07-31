# Phase 3.9 — Independent Adversarial Review (GitHub #153)

**Когда:** после полного черновика FR/AC/DESIGN/TASKS/BDD (Phase 3) и ДО
`ConfirmStop Finalization` / Spec ready / передачи в реализацию.
**Зачем:** структурный аудит, трассируемость и категорийное `spec-review` не
ловят продуктовые/архитектурные ошибки, которые видны только при сверке
предложенного дизайна с реальным репозиторием. Коррелированное self-review
автора сохраняет его собственные допущения — поэтому ревьюер ОБЯЗАН быть
отдельным агентом.

Это НЕ ещё один чек-лист в промпте автора и НЕ замена `spec-review` / Phase 3+
аудита / #142 — это независимый fail-closed гейт готовности.

## Контракт (механически enforce'ится engine)

- Артефакт: `.specs/<slug>/ADVERSARIAL_REVIEW.md` (шаблон:
  [`templates/ADVERSARIAL_REVIEW.md.template`](templates/ADVERSARIAL_REVIEW.md.template)).
- Рецензент: **отдельный агент** `spec-phase-review`
  ([`.claude/agents/spec-phase-review.md`](../../../agents/spec-phase-review.md)).
  Автор speки НЕ пишет и НЕ аппрувит артефакт: `Reviewer run` обязан отличаться
  от `Author run`, иначе engine отклоняет вердикт (self-authored).
- Свежесть: артефакт несёт `**Reviewed revision:**` — sha256 канонических
  доков спеки + `.feature`. Любое изменение спеки после ревью инвалидирует
  вердикт и требует rerun (engine сам отзывает подтверждённый STOP).
- Порядок: findings first, highest severity first (P0 → P3), id подряд
  (`P0-1`, `P0-2`, `P1-1`…).
- Каждая repo-зависимая находка несёт точный `file:line` пруф или явно
  помечена `[UNVERIFIED]` как unverified blocker.
- Нет находок → явное `### No findings` + непустой `## Residual Risks`
  (выдумывать проблемы запрещено).

## Семантика находок

| Severity | Поведение гейта |
|----------|-----------------|
| **P0/P1** | Блокируют `ConfirmStop Finalization`, Spec ready и handoff в реализацию. НЕ waive'ятся — только фикс + rerun ревьюера, который помечает `RESOLVED` c `Resolution evidence` (file/line или `[VERIFIED]`). |
| **P2** | Фикс ИЛИ явный user waiver: `Waiver rationale` (непустое) + `Waiver approver`. Ревьюер сам waiver не выдаёт — только через запрос пользователю, rationale пишем дословно. |
| **P3** | Backlog-рекомендация, не блокирует. |

Loop ограничен **3 раундами**: после 3 раундов с unresolved P0/P1 вердикт
`ESCALATED` — решение выносится пользователю, а не крутится дальше и не
даунгрейдится по severity.

Fail-closed: нет артефакта / битые метаданные / stale revision / self-authored
/ находка без пруфов / relabeling находок (gap в id) → спека НЕ готова,
с actionable причиной.

## Процедура (обязательная)

1. Включить гейт (engine-owned флаг в `.progress.json`, не удаляется вместе с
   артефактом):

   ```
   tools/specs-generator/spec-status.ts -Path ".specs/{feature}" >/dev/null   # прогресс актуален
   node tools/specs-generator/specs-generator-core.mjs adversarial-review require -Path ".specs/{feature}"
   ```

   Команда выводит текущий `specRevision` — он пойдёт в `**Reviewed revision:**`.

2. Запустить НЕЗАВИСИМОГО ревьюера (Agent tool, тип `spec-phase-review`;
   в headless-конвейере это делает `phase-runner` фазой `review`):

   > Review spec `.specs/{feature}` for GitHub #153. User request: {исходный
   > запрос}. Author run: {id этой сессии}. Spec revision: {sha из шага 1}.
   > Follow `.claude/agents/spec-phase-review.md`; write
   > `.specs/{feature}/ADVERSARIAL_REVIEW.md`; fail closed on missing evidence.

   Запрещено вызывать ревью в собственном контексте и помечать результат как
   пройденный — это обход гейта.

3. Разобрать вердикт (`node tools/specs-generator/specs-generator-core.mjs
   adversarial-review evaluate -Path ".specs/{feature}" -Format human`):
   - **P0/P1** → починить спеку/дизайн → rerun ревьюера (Round +1, новый
     `Reviewed revision`, `RESOLVED` только с evidence).
   - **P2** → починить ИЛИ спросить пользователя (AskUserQuestion) и записать
     waiver с его rationale.
   - **P3** → в backlog.
   - **ESCALATED** (раунд >3) → стоп: вынести нерешённое решение пользователю.

4. `ConfirmStop Finalization` пройдёт только при `PASS`/`PASS_WITH_WAIVERS`
   на свежей ревизии от независимого ревьюера — engine проверяет сам:

   ```
   tools/specs-generator/spec-status.ts -Path ".specs/{feature}" -ConfirmStop Finalization
   ```

## Что проверяет ревьюер (минимум)

backwards compatibility существующих API/конструкторов · source-of-truth и
ownership (config-seeded данные vs «вся правда в БД») · семантика метрик и
счётчиков (коллизии имён/смыслов) · auth/IDOR/секреты · реализуемость тестов
(существует ли прописанный runner) · bounded-запросы/N+1 vs pagination ·
исполнимость BDD-шагов · envelope ответов API vs «точные N полей» · scope
creep · непроявленные продуктовые решения (например, unauthenticated UX для
маршрута без PrivateRoute).
