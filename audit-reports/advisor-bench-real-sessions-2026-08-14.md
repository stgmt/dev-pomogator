# Бенч адвизора на реальных сессиях + живой self-invocation test

**Дата:** 2026-08-14 · **Инструменты:** `tools/advisor/bench/real-sessions.mjs` (новый), MCP-сервер
`mcp-server.mjs` (digest + two-pass + repo-rules + self-check).

---

## 1. Бенч: сжатие контекста на реальных транскриптах (offline)

Бенч-харнесс: `npx tsx tools/advisor/bench/real-sessions.mjs` с флагами `--top N` (крупные),
`--limit N` (мелкие), `--all`, `--live`. Метрики: ratio (сжатие), q-счёт (сколько ключевых слоёв
выжило минус штраф за omitted), planSteps, repoRules, recurring, gitLines, kept/compact/omitted.

### Крупные сессии (до 16 МБ), budget 3000

| Сессия | raw → digest | ratio | q | kept/c/om | planSteps | repoRules | recurring |
|---|---|---|---|---|---|---|---|
| 19098939 | 16.3MB → 12 183 | **0.1%** | 3.20 | 5/1/4 | 20 | 15 | 12 |
| 9b3144da | 13.8MB → 12 000 | **0.1%** | 3.60 | 6/1/2 | 20 | 15 | 6 |
| 09d94b50 | 11.2MB → 12 096 | **0.1%** | 3.80 | 7/1/1 | 20 | 15 | 12 |

### Средние (3–7 МБ)

| Сессия | ratio | q | kept/c/om | planSteps | repoRules | recurring |
|---|---|---|---|---|---|---|
| 05a4ea19 | 0.2% | 3.60 | 7/1/2 | 18 | 15 | 12 |
| 79b94d39 | 0.2% | 3.60 | 8/0/2 | 7 | 15 | 12 |
| 566c382b | 0.3% | 2.60 | 7/0/2 | 0 | 15 | 8 |

Вывод: **сжатие 300–1000×** (0.1–0.3%). Крупные сессии с планом+ошибками дают q 3.2–3.8;
мелкие без плана — q ~2.0. Репо-правила (15) и git-self-check — во всех. Бюджет+приоритет
работает: важные секции полностью (kept 5–8), хвосты compact/omitted.

## 1b. Live two-pass на крупных сессиях (что адвизор реально отвечает)

| Сессия | raw → digest | liveMs | liveOk | guidance | evidence |
|---|---|---|---|---|---|
| 19098939 | 16.3MB → 12.2k | 40 s | true | 2 415 | yes |
| 9b3144da | 13.8MB → 12.0k | 29 s | true | 2 181 | yes |
| 09d94b50 | 11.2MB → 12.1k | 40 s | true | 2 659 | yes |

Реальные советы:
- **19098939: scope drift** — «Stop scope drift: declared goal WP-2/FR-56/P29, но текущая работа
  WP-4/FR-11 в `tools/bdd-migrator/repository-census.ts`, `spec-verdict.ts`…» (дельта план↔факт);
- **9b3144da: не путать авторизацию** — «ExitPlanMode был явно отвергнут с STOP…and wait; treating
  validated plan as authorization would violate…»; также «нельзя valid/clean только по
  `validate-plan → OK` — repo-rules требуют smart `spec-verdict.ts`» (цитата AGENTS.md);
- **09d94b50: фича недобита** — «no paginated GitHub issue/comment inventory, normalized
  CARL/ADJACENT classifications, provenance map, canonical…».

Все три совета evidence-based, ссылаются на файлы/правила/план — это работа бенч-движка вживую.

## 2. Live two-pass: что адвизор отвечает (по 2 сессиям)

`npx tsx tools/advisor/bench/real-sessions.mjs --live --limit 2`

| Сессия | liveMs | liveOk | guidance | evidence |
|---|---|---|---|---|
| ff82b802 (13k) | 28 714 ms | true | 2 223 симв. | yes |
| d37a44a6 (64k) | 28 414 ms | true | 2 291 симв. | yes |

Примеры guidance (реальные):
- «Do not declare this done yet: there is no recorded diff review, command output, test run, or smart verdict … map the 16 modified files before proceeding.»
- «Do not declare any spec valid/clean/done: digest contains no `spec-verdict.ts` execution, while `no-structural-valid` explicitly requires the smart verdict — not merely `validate-spec`…» — **прямая ссылка на AGENTS.md-правило**.

Полный двухпроход ~28 s на сессию (deценный суммаризатор + сильный адвизор). Стоимость: 2 small-модельных вызова.

## 3. Живой self-invocation test: вызывает ли Claude сам?

**Методика:** `claude -p` с `--append-system-prompt-file` (официальный nudge из доки advisor-tool,
leaderс "лги" не трогал — MCP-тул доступен, но ни одного слова «ОБЯЗАТЕЛЬНО вызови» в задаче нет).

**Результат — ДА, сам, дважды:** транскрипт `3e4755db-50ea-40cf-afe7-ae27211e768a`:
- `L30 tool_use mcp__dev-pomogator-advisor__advisor input={}` — вызов **без параметров**;
- trace содержит **2 вызова** за сессию:
  1. когда в истории был только `ToolSearch` (адвизор: «не объявляй done — нет доказательств чтения»),
  2. после прочтения файлов (адвизор: «собери evidence по правилу claims-need-evidence, не трогай
     dirty-дерево», ссылаясь на `git status` 32 строки).

Это буквально сценарий доки: «on tasks longer than a few steps, call advisor at least once before
committing to an approach and once before declaring done», реализованный нашим клиентским MCP-тулом.

Что адвизор реально отвечал (trace): «Не объявлять задачу выполненной: обзор всё ещё не дан; промпт
в USER PROMPTS обрывается на "…и из"; восстанови точное окончание инструкции… Повторно открой
README целиком либо убедись что доступен полный результат предыдущего Read… Для
session-digest.mjs/fast-evidence.mjs — опираться строго на прочитанные первые 30 строк, не
приписывая деталей за пределами заголовков. Dirty working tree (git status: 32 строки) — не трогать».

## 4. Как воспроизвести

```bash
# бенч на реальных сессиях (offline)
npx tsx tools/advisor/bench/real-sessions.mjs

# + live two-pass на N сессиях (нужен ANTHROPIC_BASE_URL/token)
npx tsx tools/advisor/bench/real-sessions.mjs --live --limit 2

# живой self-invocation: в .mcp.json подключить dev-pomogator-advisor, затем
claude -p --settings <overlay> --append-system-prompt-file nudge.txt --model gpt-5.6-luna "<задача>"
```

## 5. Честные ограничения бенча

- Выборка «--limit 2» в live берёт **самые маленькие** сессии (мелкие, без плана). Для широкого
  бенча нужен флаг отбора по размеру/наличию плана (`--live --top`).
- ~28 s/сессия полного two-pass — это задержка на реальной задаче; при «консультация на каждый
  done» это будет заметно → нужен cost-gate (max_uses/лимит вызовов на сессию).
- Транскрипт читается с диска: если вызов происходит в самом начале хода, свежий tool_result может
  не успеть попасть в digest (в self-invocation прогоне после чтения файлов — успел).

## 5b. Оптимизация скорости: асинхронно внутри синхронного тула

Тул остаётся **синхронным** (MCP call ждёт результат), но **внутри digest-движка всё, что можно,
теперь асинхронно и параллельно**:
- `runSelfCheck`: `spawnSync` → **async `spawn`**, git-подкоманды в `Promise.all`;
- дорогой `git diff --check` вынесен из критического пути (`ADVISOR_GIT_DIFF_CHECK=1` включает)
  — вместо 4 git-вызовов теперь 2 (`status --porcelain --branch` + `diff --stat`);
- чтение транскрипта (`fs.promises`), repo-rules и git self-check — **параллельно**;
- проверка существования touched-файлов вынесена в `checkTouchedFiles` (без повторного git).

Измерено на самой тяжёлой сессии (09d94b50, 11MB): digest-сборка **9–11s → 0.4–1.3s**
(git self-check 1041 → 189 ms). Полный бенч на 10–16MB сессиях: **310–1159 ms**, качество
(ratio/q/план/repo-rules/recurring) не изменилось. Остаточная стоимость — только два
последовательных model-вызова two-pass (pass1→pass2 обязательны по дизайну).

## 5c. Совет адвизора: «не done» убирается из шаблона (skeptic strict → balanced)

Проблема прошлых прогонов: каждый совет начинался с «Do not declare completion yet…» даже на
завершённых/пустых задачах — это дефолт-скепсис промпта, а не реальная находка. Добавлен режим
`ADVISOR_SKEPTIC`:
- `strict` (старый): «double-check BEFORE declaring done» — био существующим, склоняет блок.
- `balanced` (новый дефолт): адвизор судит вердикт по делу — «не done» ТОЛЬКО когда есть причина
  (отсутствующая улика, goal-drift, нарушение repo-правила, повторяющиеся ошибки); иначе прямо
  говорит «работа выглядит sound» и называет 1 проверку.

A/B (`bench/skeptic-ab.mjs` — один и тот же digest, оба промпта, pass1 общий):

| Сессия | strict len | balanced len | Режим на упражнении |
|---|---|---|---|
| 19098939 (scope drift, реальный) | 2 436 | 1 559 | оба блокируют (есть причина) |
| 468506c4 (auditor, 0 tool_use) | 1 827 | 999 | оба блокируют (нет улик) |
| 3e4755db (обзор не дан) | 1 216 | 949 | оба блокируют (нет обзора) |
| c9868f08 (file missing-per self-check) | 1 323 | 788 | оба блокируют (реальный баг) |

Вывод A/B:
- **balanced стабильно на ~30–40% короче** и структурнее (bold-буллеты, «Most important next
  verification» в конце).
- На всех реально-проблемных сессиях **блок срабатывает одинаково** — потому что причина есть;
  разница не в том, что balanced «пропускает», а в том, что он не блокирует кардumed-ly.
- balanced честнее про грязное дерево: «dirtiness сама по себе не нарушение» (в strict «32 строки
  git status» подавалось как тревога даже в read-only задаче).

## Артефакты

- `tools/advisor/bench/real-sessions.mjs` — бенч-харнесс (offline + `--live`).
- `session-digest.mjs` — контекстный движок (слои + приоритет/токен-бюджет + repo-rules + two-pass).
- Транскрипты: `3e4755db` (self-invocation), rest — бенч-выборка `~/.claude/projects/…`.
- `.mcp.json` восстановлен к исходному виду; включение MCP-сервера — 6 строк, см. README.