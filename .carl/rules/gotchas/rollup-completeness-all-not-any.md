# Rollup completeness = ВСЕ юниты, не ЛЮБОЙ (anti-false-green агрегация)

Когда строишь rollup / census / aggregate, который выдаёт **completeness-вердикт**
(«готово / реализовано / покрыто») по N юнитам — вердикт «complete» ОБЯЗАН требовать
**ВСЕ** юниты complete (AND), а НЕ «хотя бы один» (OR). Один готовый юнит среди
незавершённых НЕ должен схлопывать весь объект в «готово» — это ровно тот false-green,
который врущая status-перекличка и делает.

## Антипаттерн

```typescript
// ❌ OR-агрегация — один done юнит зеленит весь объект
let anyDone = false;
for (const t of units) if (t.status === 'done' && verified(t)) anyDone = true;
verdict = anyDone ? 'COMPLETE' : ...;   // FR с [todo,todo,done,in-progress] → COMPLETE (ложь)
```

## Как правильно

```typescript
// ✅ AND-агрегация — COMPLETE только если ВСЕ юниты done И verified
const allDone     = units.length > 0 && units.every(t => t.status === 'done');
const allVerified = allDone && units.every(t => verified(t));   // evidence, не «помечено»
verdict = units.length === 0 ? 'NONE'
        : allVerified         ? 'COMPLETE'
        : allDone             ? 'DONE_UNVERIFIED'   // помечено done, тест не доказывает
        : someStarted(units)  ? 'IN_PROGRESS'
        :                       'PLANNED';
```

Два независимых требования к «complete»:
1. **AND, не OR** — любой открытый юнит → не complete.
2. **verified, не claimed** — «done» юнит должен быть подтверждён уликой (прошедший
   сценарий/тест), а не просто помечен галочкой. «Все done» + «хоть один не verified»
   = отдельный честный статус (`DONE_UNVERIFIED`), не `COMPLETE`.

## Инцидент (2026-06-11, fr-census)

Детектор false-green (`fr-census`, который сам про «не помечать готовым без улики») на
первом смоуке выдал **FR-43 → IMPLEMENTED**, хотя deep-gap-analysis прямо говорит «FR-43
НЕ реализован, P18 todo». Причина: одна tangentially-done задача (delete_spec_doc рефала
FR-40/FR-43) среди `[todo,todo,done,in-progress]` → `anyImplemented → IMPLEMENTED`. Мой
анти-false-green инструмент **сам false-green'нул**. Фикс — AND-агрегация: IMPLEMENTED
только если ВСЕ задачи done+verified; теперь FR-43 честно IN_PROGRESS.

## Триггеры — когда применять
- Функция возвращает per-объект статус, агрегируя N под-юнитов (задачи/шаги/требования/чеки).
- Видишь `any*`/`some(...)`/`||` в выводе completeness-вердикта → красный флаг, проверь не должно ли быть `every`/`&&`.
- Строишь «census / roll-call / coverage / progress» — любую перекличку, где «сколько готово».

## Чеклист
- [ ] Completeness-вердикт = `every(complete)`, не `some(complete)`
- [ ] «done» юнит требует evidence (verified), не только флаг
- [ ] Есть отдельный статус для «все done, но не доказано» (DONE_UNVERIFIED) — не схлопывать в COMPLETE
- [ ] Смоук на РЕАЛЬНЫХ данных, где заведомо есть незавершённый объект (поймает OR-ложь)

## Связанные
- `.claude/rules/testing/output-invariants-first.md` — инварианты коллекций (этот gotcha — про инвариант агрегации статуса)
- `.claude/rules/spec-verdict/no-structural-valid.md` — false-green как класс
- `.claude/rules/testing/verify-against-real-artifact.md` — смоук на реальном артефакте ловит такие OR-ложь
