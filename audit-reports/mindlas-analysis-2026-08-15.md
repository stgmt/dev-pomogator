# MINDLAS + inner-advisor: анализ и план работ

**Дата:** 2026-08-15 · **MINDLAS:** `Evolutionairy-AI/MINDLAS` (30★, Apache-2.0, Python ≥3.11)

## 1. Что такое MINDLAS (по README, честно)

MINDLAS (Mind-Atlas) — **детерминистический** инструмент мониторинга/коррекции для Claude Code.
«The agent said done. The tests disagree.» — ловит ухудшение агента **до** того, как плохой код
ляжет.

Ключевая цитата (прямо из README):
> There is no model and no network call anywhere in the scoring path — a model grading another
> model's session is non-reproducible, expensive, and circular.

- **Подход:** «measure → trigger → explain → correct → remeasure → report».
- **4 гейджа** (детерминированные чистые функции из event-ledger):
  1. **Context Rot (ROT)** — деградация контекста: полнота окна лишь 1 из 6 сигналов (turns, большие tool-output, возраст task-contract, нерешённые корректировки, turns since repair).
  2. **Verification Debt (VERIFY)** — код изменён без свежих доказательств (AST/ruff/pytest-targeted/Verify Gate).
  3. **Change Blast Radius (BLAST)** — насколько широкий разлёт патча.
  4. **Tool Failure Loop (LOOP)** — повторяющийся однотипный fail без новых улик.
- **4 коррекции** (парой preview/apply, записывают before/after): Context Repair, Verify Gate, Patch Splitter, Loop Stop.
- **Plugin-обвязка:** `.claude-plugin/plugin.json` + 8 hooks (SessionStart/UserPromptSubmit/PreToolUse/PostToolUse/PostToolUseFailure/Stop/PreCompact/PostCompact) + 5 slash-команд (`/mindlas-repair`, `/mindlas-verify`, `/mindlas-blast-split`, `/mindlas-loop-stop`, `/mindlas-loop-release`).
- **Установка:** `claude --plugin-dir <MINDLAS>` (plugin) или `pip install mindlas && mindlas install-hooks / install-statusline` (PyPI CLI). ОБЯЗАТЕЛЕН Python ≥3.11, venv, `mindlas` на PATH, git.
- **Конфиг:** env — `MINDLAS_HOME` (~/.mindlas), `MINDLAS_PROJECT_ROOT`, `MINDLAS_GATE` (shadow/live), `MINDLAS_LOOP_GUARD` (warn/block), `MINDLAS_INTERCEPT_COMPACT`, `MINDLAS_TESTTIER`, `MINDLAS_TEST_PATTERNS`, `MINDLAS_BAR`; Claude: `CLAUDE_CONFIG_DIR`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_SESSION_ID`.
- **Состояние:** machine-ledger в `~/.mindlas/`, project-артефакты в `<project>/.mindlas/` (repair packs, splits, stops, reports).

## 2. Есть ли у MINDLAS «рефлексия» skill/harness?

**НЕТ в виде skill-обёртки.** У него есть slash-команды коррекций и детерминированные
scorecard/gauge, но **отсутствует agent-facing reflection skill** (например, skill «порефлексируй
над сессией: сверь с планом, найди drift»). Это открытая ниша для нашей интеграции.

## 3. Сравнение с нашим inner-advisor (комплиментарность, не дубль)

| Ось | MINDLAS | inner-advisor (мы) |
|---|---|---|
| Кто «мыслит» | **никакой модели** — чистые функции из event-ledger | **две модели**: luna→выжимка, sol→совет |
| Задача | детерминированные гейджи + механическая коррекция состояния | evidence-based совет + суждение «не done» по делу |
| Стоимость | 0 (локально, без сети) | зависит от модели |
| Инструменты | hooks+CLI+statusline, правят `.mindlas/` | MCP-тул + rolling summary, read-only (FR-9) |
| Роль | «термометр/мётрика + автоматический фикс состояния» | «вторая голова: ревью, смысл, дрейф» |

**Вывод:** MINDLAS даёт **детерминированные метрики и мехапоправки состояния**; наш адвизор —
**умную интерпретацию и решение**. Не конфликтуют: разные скоусы, оба сами по себе. Могут жить
параллельно (у них свои hooks/commands, у нас свой MCP-тул/Stop-хук).

## 4. Что нужно для «установка вместе + настройка + рефлексия-skill»

### 4a. Установка (у нас)

Оба ставятся в одну сессию. Варианты без конфликта:
- **MINDLAS** (plugin): `claude --plugin-dir <clone-of-MINDLAS>` ИЛИ PyPI CLI (`pip install mindlas && mindlas install-hooks`).
- **inner-advisor** (plugin dev-pomogator): `claude --plugin-dir <dev-pomogator>` (или marketplace install).
- При запуске с обоими `--plugin-dir` CD-аргументами — оба загружаются (plugin-dir поддержка
  нескольnies). НО: **оба регистрируют Stop/PreCompact hooks** → проверить, что не задваиваются
  события (у MINDLAS свои matcher на `PreToolUse/Stop`, у нас свои). Для канона — привязать
  inner-advisor к подавлению при `MINDLAS_HOME`? НЕТ: они раздельны, hooks-матче отражают свой
  scope; просто проверяем отсутствие конфликта в BDD.

### 4b. Настройка

- MINDLAS: env (MINDLAS_GATE, MINDLAS_LOOP_GUARD, MINDLAS_BAR…) — документировано в
  `docs/configuration.md`; наш порт-конфиг `.dev-pomogator/advisor/config.json` НЕ пересекается.
- Нужно зафиксировать **рекомендуемый совместный конфиг** (пример для юзера): оба продукта +
  какие env для MINDLAS + как включить inner-advisor в той же сессии.

### 4c. Рефлексия-harness (skill) — если у MINDLAS нет (а его нет)

Сделать наш **`.claude/skills/mindlas-reflect/`** (или завязать на `inner-advisor` как module):
- skill «отрефлексируй сессию»: читает `mindlas scorecard --json` + наш rolling summary/digest +
  repo-rules, и отдаёт coherent вывод: где по MINDLAS-метрикам аномалия (ROT/VERIFY/BLAST/LOOP),
  что говорит наш sol-адвизор, какое решение принять.
- harness: slash `/reflect` (или команда внутри нашего плагина), который вызывает `mindlas
  scorecard --latest --json` → передаёт в `buildSummaryPacket` → двухпроход → совет+scorecard.
- Явно читать из MINDLAS: `verify ... --latest`, `loop status`, `blast status` — чтобы адвизор
  учитывал **детерминированные** метрики MINDLAS вместе со **смысловой** интерпретацией.

## 5. План работ

| Шаг | Что | Результат |
|---|---|---|
| 1 | Установить/запустить MINDLAS в isolate (WSL/Docker), `mindlas status --demo`, `pytest` (476 pass) | проверено, что продукт рабочий |
| 2 | Совместный bootstrap в dev-pomogator: steam — оба plugin-dir, проверить hooks без двойного сбора | конфиг-пример + BDD «не конфликтуют» |
| 3 | Скил `mindlas-reflect` (отражение: mindlas scorecard + наш digest+advise) | new `.claude/skills/mindlas-reflect/SKILL.md` |
| 4 | Harness интеграции: MCP/Stop-хук inner-advisor читает `mindlas *.json`, передаёт адвизору | обновлённый `session-digest.mjs`/mcp (опциональный источник) |
| 5 | BDD-тесты + live прогон: реальная сессия, MINDLAS-метрики в совете адвизора | спека inner-advisor + bench |
| 6 | Документация установки обоих + конфиг-пример | README/отчёт |

## 6. Открытые вопросы / риски

- **ООЗ**: MINDLAS требует Python ≥3.11 + venv + `mindlas` на PATH. У нас Node-плагин; порог
  установки выше. Вариант: рекомендуемый путь = две команды (pip для mindlas, plugin для нас).
- **Windows/MAX_PATH**: в README предупреждают о long-path на Windows — у нас Windows → учесть
  `LongPathsEnabled`/короткие пути.
- **Двойной Stop-hook**: оба плагина слушают Stop — проверить отсутствие шума/двойного логирования
  в BDD (их hooks fail-open/exit 0, наши тоже fail-open → риск низкий).
- **Лицензия**: MINDLAS Apache-2.0 — можно заимствовать приёмы легально; но мы не копируем код,
  только оформляем интеграцию. В спеке фиксировать attribution.

## Артефакты

- Cёрчевые: MINDLAS README, docs/configuration.md, .claude-plugin/plugin.json (essaper raw).
- Наш статус: `tools/advisor/*`, `.specs/inner-advisor/*`.
- (Может пригодиться: README MINDLAS прямо советует «no LLM in scoring» — argумент, почему у нас
  адвизор И важен, И не заменит метрики MINDLAS.)