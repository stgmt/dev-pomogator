# Пинатор = одна фича: анализ разнесения по спекам и план объединения

**Дата:** 2026-07-31  
**Репо:** `stgmt/dev-pomogator`  
**Запрос:** «три разных пинатора — не смешивать» → на самом деле одна фича; сначала свести в одну спеку, если разнесена.  
**Источники:** `.specs/claim-evidence-gate/`, `.specs/prompt-suggest/`, `.specs/spec-generator-v4/` (FR-49), `.specs/bg-task-guard/`, `.env.example`, `package.json`, issues #63/#74/#149/#161/#212/#215, `audit-out/pinator-extraction-blast-radius-2026-07-30.md`.

---

## 1. Вердикт

**Да: по продуктовому смыслу это одна фича.**  
**Нет: в репо она сейчас не одна спека** — контракт размазан по ≥4 спекам + naming collision в build/docs + product-gap без спеки (#63 / #212).

Единый продукт (из #63 + живого поведения + FR claim-gate):

> Пока у сессии есть **явная незакрытая работа** (todo / plan / active spec / `/goal`), агент **не имеет права** остановиться с ленивым hand-off. Система либо **пинает продолжить**, либо **ведёт к следующему шагу**, и **останавливается только** на genuine owner-decision / irreversible / budget.

Всё остальное (prompt «💡 что набрать», census router, bg-wait, orchestrator) — **модули одной фичи**, не отдельные продукты.

---

## 2. Карта «кто где живёт сейчас»

| Слой | Где лежит | Как называется | Роль в единой фиче |
|------|-----------|----------------|--------------------|
| **Stop-judge (ядро)** | `.specs/claim-evidence-gate/` + `tools/claim-evidence-gate/` | В спеке/feature: **Pinator**; в коде: claim-evidence-gate; `.env`: «Pinator» = этот гейт | Негативный драйв: блок premature stop |
| **Next-step router** | FR-49a/h в `.specs/spec-generator-v4/` + shared census; потребляется CEG | «следующее», Pinator fire logs | Общая инфраструктура «куда пинать» |
| **User hint (+) ** | `.specs/prompt-suggest/` + `tools/prompt-suggest/` | README: prompt-suggest; **`build:pinator`** = этот бандл | Позитивный хинт юзеру (другая полярность) |
| **Async wait** | `.specs/bg-task-guard/` | bg-task-guard; README CEG ссылается FR-13/16 | Carve-out: ждать фон ≠ lazy stop |
| **Native `/goal`** | Контракт в CEG FR-6; рантайм Claude | независимо от Pinator | Источник eligibility |
| **Product vision auto-continue** | Issue #63 — **спеки нет** | «плагин пинатор» | Goal once → re-inject continue |
| **Orchestrator successor** | Issues #212/#215 — **спеки нет** | Workflow Orchestrator | Bounded session / PreToolUse |
| **Polarity flip** | Issue #74 — **спеки нет** (есть PoC tools/referent-grounding-guard) | pinator carve-out | После N rejects — спросить, не пинать «не останавливайся» |
| **Хвост политики** | FR-49b/e/g prose в `spec-generator-v4` + `@moved-to-claim-evidence-gate` scenarios | «часть пинатора» | Drift: политика судьи всё ещё в v4-тексте |

### Счётчики упоминаний (файлы `.md`/`.feature`)

| Spec slug | `Pinator`/`пинатор` | `claim-evidence` | `prompt-suggest` |
|-----------|--------------------:|-----------------:|-----------------:|
| claim-evidence-gate | 31 | 48 | 2 |
| spec-generator-v4 | 29 | 66 | 0 |
| prompt-suggest | **0** | 0 | 61 |
| haiku-to-deepseek-migration | 0 | 18 | 23 |
| bg-task-guard | 0 | 2 | 0 |
| claim-sanity-check | 2 | 0 | 0 |
| codex-cli-support / doctor / session-pilot / test-statusline | 0 | 0 | incidental |

**Вывод по имени:** канон в спеках уже говорит **Pinator = claim-evidence-gate** (feature `@pinator`, README «Claim-Evidence Gate (pinator)», `.env.example` строка 11).  
Конфликт: `package.json` → `build:pinator` собирает **prompt-suggest**, а не CEG (`build:claim-gate`). Blast-radius 2026-07-30 ошибочно назвал prompt-suggest «Pinator proper» из‑за этого скрипта.

---

## 3. Почему это одна фича (а не три)

Общий **Definition of Done** и общий **Stop/Submit lifecycle**:

```
eligibility (есть ли активная работа?)
    ├─ нет  → silence / обычный диалог
    └─ да   → drive loop
              ├─ Stop: judge (block lazy stop / approve genuine decision)   ← CEG
              ├─ Next: router (какой шаг дальше)                           ← FR-49a + CEG packet
              ├─ Wait: async/bg не = hand-off                              ← bg-task-guard + CEG FR-9
              ├─ Hint: optional user «+» suggestion                        ← prompt-suggest (модуль)
              └─ Future: auto-continue / orchestrator / referent carve-out ← #63/#212/#74
```

Разделение на «три пинатора» было **артефактом naming + partial extraction**, не продуктовой границы:

1. Issue #63 описал **goal-driven auto-continue** (ещё не спека).  
2. CEG реализовал **анти-стоп** и в спеках назвался Pinator.  
3. prompt-suggest остался sibling «подсказка юзеру», но получил npm-имя `build:pinator`.  
4. FR-49 в v4 держал политику судьи, потом частично перенёс в CEG (`@moved-to-claim-evidence-gate` ×11), но prose FR-49b/e/g всё ещё описывает Pinator-политику.

---

## 4. Где разнесение ломает работу

| Проблема | Улика | Эффект |
|----------|-------|--------|
| Naming collision | `build:pinator` ≠ CEG; CEG = `build:claim-gate` | Extraction/«убери пинатор» бьёт не туда (blast-radius Scope A) |
| Dual ownership FR-49 ↔ CEG | Ownership line в FR.md: политика у CEG; FR-49b/e/g всё ещё про судью/«Дальше» | Агенты правят не ту спеку; false-green status |
| Product gap | #63/#74/#212 без `.specs/` | Vision и successor живут только в GH issues |
| Sibling без общего DoD | prompt-suggest FR не знает eligibility CEG | Хинт юзеру не обязан согласовываться с «пинок агенту» |
| bg-task как отдельная фича | CEG README → bg-task-guard | Легитимный wait то в одном гейте, то в другом |
| Evidence issues (#149/#161) | заведены на claim-evidence-gate | Чинят ядро Pinator, но umbrella-статус невидим |

---

## 5. Что НЕ входит в объединение (оставить снаружи)

- **Census/MCP/status graph** (`task-census`, `spec-status-store`, generic FR-49a plumbing) — shared infra; Pinator **потребитель**, не владелец.  
- **test-quality / anchor Stop-idiom** (FR-34b/35b «modelled on claim-evidence-gate») — другие гейты, тот же паттерн.  
- **haiku-to-deepseek-migration** — consumer model routing; после rename `build:pinator` почистить ссылки.  
- **claim-sanity-check** — соседнее research; не ядро Pinator.

---

## 6. Рекомендуемая целевая структура: одна спека `pinator`

**Slug:** `.specs/pinator/` (или rename `claim-evidence-gate` → `pinator` + redirect).

### Модули внутри одной спеки (не отдельные products)

| Module | Содержание | Источник сегодня |
|--------|------------|------------------|
| **M0 Intent / DoD** | Goal once; drive until genuine decision; no menu-default | Issue #63 (+ #212 framing) |
| **M1 Eligibility** | task/plan/spec/`/goal` activation; silence otherwise | CEG FR-1..7 |
| **M2 Judge + evidence** | classifier, Meridian judge, carry-over evidence, normative blocker, noProgress | CEG FR-8..11 + issues #149/#161 + PR #192 |
| **M3 Next-step contract** | что кладётся в packet/fires как `next*`; **не** владение census | CEG + границы FR-49a/h |
| **M4 Async carve-outs** | bg in-flight / await results | bg-task-guard + CEG FR-9 |
| **M5 User suggest (optional)** | 💡 / `+` hint; rename build away from pinator | prompt-suggest |
| **M6 Polarity flip** | N user-rejects → ask referent (не пинать continue) | Issue #74 |
| **M7 Orchestration (future)** | Dynamic Workflow / PreToolUse fleet bounds | Issues #212/#215 |

### Что сделать с существующими спеками

1. **Канон:** `claim-evidence-gate` → содержимое становится `pinator` M1–M4 (или alias README: «canonical name Pinator»).  
2. **v4 FR-49:** оставить только generic census/router; вырезать/заменить FR-49b/e/g Pinator-policy на ссылку «see pinator M2»; scenarios `@moved-to-*` уже намёк.  
3. **prompt-suggest:** либо submodule M5 с явным OUT_OF_CORE, либо остаётся отдельной спекой **без** слова pinator + rename `build:pinator` → `build:prompt-suggest`.  
4. **bg-task-guard:** либо M4, либо dependency-spec со стабильным API «async in-flight fact».  
5. **Новые:** M0/M6/M7 пока как USER_STORIES + RESEARCH в umbrella (не плодить 3 пустых спеки).

### Naming fixes (обязательны до/вместе с merge спеки)

| Было | Станет |
|------|--------|
| `build:pinator` → prompt-suggest | `build:prompt-suggest` |
| `build:claim-gate` | `build:pinator` **или** оставить claim-gate + alias |
| docs/COMPONENTS «prompt-suggest» vs «Pinator» | одна таблица модулей |
| blast-radius «Pinator proper = prompt-suggest» | отозвать; канон = Stop-judge |

---

## 7. Порядок работ (без реализации в этом отчёте)

1. **Заморозить имя:** решение владельца — канон `pinator` = Stop-judge (+ modules), не prompt-suggest.  
2. **Scaffold** `.specs/pinator/` через create-spec / MCP door (не ручной apply).  
3. **Перенос контракта** CEG → pinator (FR/AC/feature + tags `@pinator`).  
4. **Хирургия FR-49** в v4: policy → link; router остаётся.  
5. **Rename npm** `build:pinator`.  
6. **Ingest** #63/#74/#149/#161/#212/#215 как CHK/US в umbrella.  
7. **spec-verdict** на pinator + v4 после переноса (не validate-spec alone).

---

## 8. Ответ на исходный тезис

| Утверждение | Оценка |
|-------------|--------|
| «Три разных пинатора — не смешивать» | Ложно как продуктовая граница; верно только как описание текущего хаоса имён |
| «Это одна фича» | **Верно** |
| «Сначала объединить в одну спеку» | **Верно и необходимо** — иначе #63/#212/#149 чинятся в разных местах, а `build:pinator` продолжает врать |

**Минимальный KEEP для umbrella:** текущий `claim-evidence-gate` + границы FR-49 + зависимости bg-task + gaps #63/#74/#212.  
**prompt-suggest** — опциональный модуль или rename-out, не «второй пинатор».

---

## 9. Связанные артефакты

- Canvas фильтр issues: `canvases/pinator-issues-filtered.canvas.tsx`  
- Extraction (частично устаревший naming): `audit-out/pinator-extraction-blast-radius-2026-07-30.md`  
- Incidents: `audit-reports/pinator-token-burn-analysis.md`, `pinator-no-kick-analysis.md`  
- GH: #63, #74, #149, #161, #193, #212, #215; PR #192
