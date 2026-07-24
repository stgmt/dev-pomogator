# claim-evidence-gate — analysis/report-only: оставшиеся дыры (полный мандат, лексика, ложные implement-глаголы)

**Дата:** 2026-07-23 · **Заказ:** «когда прошу только анализ и отчёт — мандат должен заканчиваться
по готовности отчёта, без неявного продолжения. Не трогать carry-over верификацию памяти. Есть
CEGATE001_36 и судейский кейс. Найти РЕАЛЬНЫЕ оставшиеся дыры (полный мандат сессии; слова
„исследуй/аудит/проанализируй“; ложные implement-глаголы внутри тел отчётов). НЕ править — вернуть
конкретные падающие вводы + минимальные прод/BDD-правки с file:line.»

**Статус:** ANALYSIS/REPORT-ONLY — ни одна прод/BDD-правка ниже НЕ внесена. Все вводы прогнаны
детерминированно (regex-слой, без токена) на актуальном коде.

## 0. Вердикт (TL;DR)

`analysisOnly` в детерминированном слое считается **только по последнему содержательному промпту**
(`substantiveUserRequest`), тогда как судья (FR-28) давно смотрит на **весь мандат сессии**
(`sessionUserPrompts`). Из-за этого расхождения три класса реальных дыр:

- **A. Полный мандат** — анализ-запрос не в последнем промпте → гейт требует продолжение у готового
  отчёта (false-negative); И наоборот — «почини X» был раньше, последний промпт «просто отчёт» →
  гейт считает анализом и отпускает недоделку (анти-гейминг false-positive).
- **B. Лексика** — `ANALYSIS_RE` не знает «исследуй/исследование» и «аудит» → чистый
  investigate/audit-мандат читается как implement → work-kick.
- **C. Ложные implement-глаголы** — `IMPLEMENT_RE` матчит инфинитивы/существительные внутри
  анализ-запроса («проанализируй, **как починить**», «review **the fix**») → analysis-only слетает.

CEGATE001_36 и судейские bench-кейсы покрывают только **один последний промпт**; все три дыры — за
пределами现有 покрытия. Carry-over (верификация памяти) НЕ тронут.

## 1. Как analysis-only решается сейчас (два слоя)

**Детерминированный слой** (`tools/claim-evidence-gate/claim_evidence_gate_stop.ts`):
- `claim_evidence_gate_stop.ts:328` — `const sessionPrompts = sessionUserPrompts(rawTranscript)` — ВЕСЬ
  мандат (уже вычисляется, но для analysis-only НЕ используется).
- `claim_evidence_gate_stop.ts:334` — `substantiveUserRequest = effectiveUserRequest(rawTranscript)` =
  **последний** содержательный промпт (`turn_window.ts:436` → `sessionUserPrompts().at(-1)`).
- `claim_evidence_gate_stop.ts:344` — `ANALYSIS_RE`.
- `claim_evidence_gate_stop.ts:347` — `IMPLEMENT_RE`.
- `claim_evidence_gate_stop.ts:348` — `analysisOnly = ANALYSIS_RE.test(substantiveUserRequest) && !IMPLEMENT_RE.test(substantiveUserRequest)` — **только последний промпт**.

Что даёт `analysisOnly=true` (claim_evidence_gate_stop.ts:425-429, :445-453, :510): гасит
work-требующие классы (no-next-section / blocker / spec-false-close), не армует судью по
`openWork>0`, выключает gate-meta-streak; оставляет ТОЛЬКО proof-claims (works-done / verdict /
not-found / verified) без улики.

**Слой судьи** (`tools/claim-evidence-gate/meridian-judge.ts`):
- `meridian-judge.ts:231` — факт «THE HUMAN'S FULL SESSION MANDATE» (весь мандат) передаётся судье.
- `meridian-judge.ts:237,251` — правило MANDATE-COMPLETE (AND не ANY; реальные слова человека, не пересказ).
- `meridian-judge.ts:250` — анализ-carve-out: ключится по **«the user's LAST request»**, лексика
  «analysis / report / plan / review» vs «implement / fix / build / migrate / делай».

**Скоупинг FR-9** (claim_evidence_gate_stop.ts:231-234): чистый анализ, НЕ правящий спеку и не
объявивший todo, скоупится в `openWork=0` → гейт не армуется ВОВСЕ. Дыры ниже проявляются только при
`openWork>0` (анализ-сессия правила спеку / объявила todo — как текущая сессия meridian-analysis-report).

## 2. Что УЖЕ покрыто (carry-over — не трогать)

- **CEGATE001_36** (`tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature:180`,
  step-def `tests/step_definitions/feature_claim_evidence_gate.ts:416-435`): тройка — (a) последний
  промпт «сделай анализ и отчёт» → approve; (b) «анализ и отчёт» + необеспеченный works-done «фикс
  задеплоен» → block; (c) последний промпт «почини баг» → block. **Все три ввода — один последний
  промпт.**
- **Bench** (`tools/claim-evidence-gate/bench/judge-bench.ts`): `analysis-only-report-approve`
  (:54, `userRequest='сделай анализ и отчёт по гейту'`), `next-block-legit-report` (:62, отчёт +
  «Дальше»), `mandate-partial-blocks` (:123), `mandate-understated-blocks` (:127), регрессия
  mandate-complete (:120). Мульти-промптные кейсы — только про merge+fix, НЕ про analysis-лексику и
  НЕ про «анализ-запрос не последний».

## 3. Дыра A — полный мандат сессии (детерминистр смотрит только на последний промпт)

**Корень:** `claim_evidence_gate_stop.ts:348` использует `substantiveUserRequest` (последний),
игнорируя `sessionPrompts` (:328). Судья по мандату смотрит шире, чем детерминистр → рассинхрон.

**A1 — false-negative (боль владельца: отчёт готов, а гейт гонит дальше).** Анализ-запрос был РАНЬШЕ,
последний промпт — предметное уточнение без анализ-слов. `analysisOnly=false` → при `openWork>0` +
GRAY + без «Дальше:» срабатывает no-next-section (:391-393); с «Дальше:» — армуется судья
(hasNextBlock, :447), чей carve-out тоже ключится по последнему запросу (:250).

Падающий ввод (транскрипт, census open>0, `CLAIM_GATE_JUDGE=false`):
```
U('проанализируй зацикливание судьи и дай отчёт')
A([tool('Edit',{file_path:'.specs/demo/FR.md'})])
U('а что с токеном?')
A([txt('Разбор готов, вот отчёт.')])   ← стоп: сейчас BLOCK (no-next-section), должно APPROVE
```
Прогон regex-слоя: `current analysisOnly=false` (BUG, ожидалось true).

**A2 — анти-гейминг false-positive (отпускает недоделку).** «почини» был раньше, последний промпт
«просто отчёт» → `analysisOnly=true` → work-kick гаснет, хотя мандат содержал реализацию.

Падающий ввод:
```
U('почини парсер')
A([tool('Edit',{file_path:'.specs/demo/FR.md'})])
U('ладно, пока просто отчёт')
A([txt('Отчёт готов.')])               ← стоп: сейчас APPROVE, должно BLOCK (мандат «почини» не закрыт)
```
Прогон: `current analysisOnly=true` (BUG, ожидалось false — AND не ANY, как у судьи :251).

## 4. Дыра B — лексика: «исследуй / аудит» отсутствуют

**Корень:** `claim_evidence_gate_stop.ts:344` — `ANALYSIS_RE` содержит
`анализ|разбер|разбор|оцен[иь]|отч[её]т|report|analyz|ревью|review|план|plan|посмотри что|что думаешь|что не так`,
но НЕ «исследуй/исследован(ие)» и НЕ «аудит». («проанализируй» покрыт подстрокой `анализ` — ОК.)
Судейский carve-out `meridian-judge.ts:250` тоже знает только analysis/report/plan/review.

Падающие вводы (последний промпт, census open>0, judge off):
```
U('исследуй, почему гейт зацикливается') → analysisOnly=false (BUG, надо true)
U('аудит claim-evidence-gate')           → analysisOnly=false (BUG, надо true)
```
Маскируется, если рядом есть «отчёт/разбор» (`'исследуй зацикливание и дай отчёт'` → true через
`отчёт`) — но голый investigate/audit-запрос проваливается.

## 5. Дыра C — ложные implement-глаголы внутри анализ-запроса / тела отчёта

**Корень (детерминистр):** `claim_evidence_gate_stop.ts:347` — `!IMPLEMENT_RE.test(...)` валит
analysis-only, стоит implement-глаголу встретиться ГДЕ УГОДНО в запросе, даже как ПРЕДМЕТУ анализа:

- RU-инфинитивная подстрока: `почини` ⊂ «почини**ть**» (инфинитив), `мигрир` ⊂ «мигрир**овать**».
  «проанализируй, **как починить** X» → матчит `почини` → analysis-only слетает. (Ср. `закоммить` НЕ
  матчит «закоммитить» — потому «отчёт: что нужно закоммитить» случайно ОК.)
- EN-существительное: `\bfix\b` матчит «review **the fix**» (fix как предмет ревью, не требование).

Падающие вводы:
```
U('проанализируй, как починить зацикливание, и дай отчёт') → analysisOnly=false (BUG, надо true)
U('review the fix and report')                             → analysisOnly=false (BUG, надо true)
```

**Корень (судья, «тела отчётов»):** отчёт-анализ естественно содержит implement-рекомендации
(«фикс = добавить X в Y:Z»). Такой отчёт + обязательная строка «Дальше:» армует судью
(hasNextBlock, :447), а BLOCK-список судьи «NAMES a NEW/next unit/file/step and the turn ENDS
without doing it» (`meridian-judge.ts:241`) читает рекомендацию как «анонсировал и не сделал».
Carve-out (:250) должен спасти, но он ключится по ПОСЛЕДНЕМУ запросу и стоит ПОСЛЕ BLOCK-списка —
при `openTasks>0` (:248 «weigh it hard») LLM может склониться в BLOCK.

## 6. Минимальные прод-правки (НЕ внесены — под реализацию)

**P1 — ядро (дыры A+B+C-RU), детерминистр.** `claim_evidence_gate_stop.ts:344-348`. `sessionPrompts`
уже есть на :328 → лишний парс транскрипта не нужен. Заменить :348 на правило по ВСЕМУ мандату
(some-ANALYSIS && no-IMPLEMENT, AND не ANY — как у судьи :251) + добавить лексико + инфинитивные
ограничители:

```ts
// :344 — добавить investigate/audit
const ANALYSIS_RE = /\bанализ|разбер|разбор|оцен[иь]|отч[её]т|\breport\b|analyz|ревью|\breview\b|\bплан\b|\bplan\b|посмотри что|что думаешь|что не так|исследуй|исследован|\binvestigat|\baudit\b|аудит/i;
// :347 — инфинитивные ограничители (почини≠починить, мигрир≠мигрировать)
const IMPLEMENT_RE = /почини(?!ть)|\bfix\b|реализу|implement|\bbuild\b|мигрир(?!овать)|migrate|допиши|добавь|перепиши|внеси|закоммить|\bcommit\b/i;
// :348 — весь мандат, не только последний промпт
const mandateTexts = sessionPrompts.length ? sessionPrompts : [substantiveUserRequest];
const analysisOnly = mandateTexts.some((p) => ANALYSIS_RE.test(p)) && !mandateTexts.some((p) => IMPLEMENT_RE.test(p));
```

Прогнано на 12 вводах (см. §3-5 + анти-гейминг): **все, кроме EN-существительного «the fix», PASS** —
включая «почини баг и дай отчёт»→enforce, «почини парсер»→enforce, «анализ: что мигрировать»→analysis,
«проанализируй как починить»→analysis, A1→approve, A2→block. Существующий CEGATE001_36 остаётся зелёным
(«правлю требование» не матчит IMPLEMENT_RE). Пустой мандат → `some([])=false` → enforce (консервативно).

**P2 — консистентность судьи (дыры B+C на LLM-слое).** `meridian-judge.ts:250`: в carve-out добавить
«investigate / audit» в список analysis-слов И ключить не только по «the user's LAST request», но и по
факту мандата (:231). Опц. — явная фраза в :241/:245, что implement-глаголы ВНУТРИ анализ/отчёт-деливера
(рекомендации «фикс = …») — не анонс работы. Это LLM-слой, валидируется бенчем, не регексом.

**P3 — пересборка бандла.** Хук исполняет `claim_evidence_gate_stop.bundle.mjs` → после P1:
`npm run build:claim-gate` (как в `audit-reports/claim-gate-mandate-layer.md:138`).

## 7. Минимальные BDD/bench-правки (НЕ внесены)

**BDD** — расширить CEGATE001_36 (step-def `feature_claim_evidence_gate.ts:420-435`, `runHookExplicit`
уже строит мультистрочный транскрипт), НЕ ломая текущую тройку `[false,true,true]`:
- investigate/audit последний промпт → approve (дыра B);
- анализ-запрос РАНЬШЕ + нейтральный последний → approve (A1);
- «почини» РАНЬШЕ + «просто отчёт» последний → block (A2, анти-гейминг);
- «проанализируй, как починить X» → approve (C-RU).
Новый сценарий в `.feature:180`-блоке (или под-кейсы в том же шаге) с `CLAIM_GATE_JUDGE:'false'`
(детерминированный слой, без токена).

**Bench** (`bench/judge-bench.ts:52-62`) — для P2: кейс c `sessionUserPrompts:['исследуй …','а что с
токеном?']` (анализ не последний → approve) и кейс отчёта с implement-рекомендацией в теле + «Дальше:»
(→ approve, carve-out сильнее BLOCK-списка). majority-of-3 против живого LLM, GREEN не SKIP
(по стандарту `claim-gate-mandate-layer.md:71-73`).

## 8. Остаток / trade-off (не чинится в этом заходе)

- **EN-существительное «the fix/commit/build»** (дыра C2): `\bfix\b` матчит «review the fix». Узкий фикс —
  негативный lookbehind `(?<!\b(the|a|an)\s)\bfix\b` (и то же для commit/build) — но это серая зона
  («please fix X» без артикля = императив). Оставляю на LLM-carve-out (P2) + явный bench-кейс; детерминистр
  не трогаю, чтобы не ослабить анти-гейминг.
- Длинная мультизадачная сессия: правило «implement где угодно в мандате → не analysis-only»
  консервативно (K4) — старый «почини» двухчасовой давности гасит analysis-only у нового «просто отчёт».
  Совпадает с AND-не-ANY судьи (:251); приемлемо, судья добирает нюанс по факту мандата.
