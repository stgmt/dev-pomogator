# Ревью создающей стороны спек-генератора (creation pipeline) — 2026-06-07

**Запрос:** «надо заняться ревью того что спеки создаёт — мы делали в основном трассировку
и работу с уже готовыми спеками». Поверхность: `create-spec` SKILL + 23 references,
`scaffold-spec` + 19+ шаблонов, form-скиллы (discovery-forms / requirements-chk-matrix /
task-board-forms / variant-matrix-build / architecture-decision-builder), form-guards.
Метод: 3 параллельных Explore-разведки → ручная верификация каждого критичного
заявления живыми прогонами (находки разведчиков НЕ принимались на веру — одна
опровергнута).

## Вердикт одним абзацем

Создающая сторона была в заметно худшем состоянии, чем трассирующая: **весь
enforcement-слой (5 form-guards) оказался мёртвым** — код и тесты существовали, но ни
одной живой регистрации в манифестах; meta-guard охранял регистрации, которых нет;
скиллы обещали «guard will deny», а ничего не срабатывало. Поверх этого — два
guard-дедлока (скилл инструктирует формат, который его же guard режет), фантомный
dry-run CLI в трёх скиллах, остатки псевдо-тегов и до-v4 семантика вердикта в финале
аудита. Всё подтверждённое исправлено в этой же сессии.

## Подтверждённые находки → фиксы (все в этом проходе)

| # | Находка | Evidence | Фикс |
|---|---------|----------|------|
| 1 | **Все 5 v3 form-guards — dead integration**: ни одной регистрации в `.claude/settings.json` / `.claude-plugin/hooks.json` (grep = 0); никогда не fire-или | grep манифестов; 23 нарушения в живом v4 TASKS.md как симптом | `form-guards-dispatch.ts` — ОДИН живой PreToolUse-хук, маршрутизирует Write по basename к каноничному guard-у (1 спавн на Write, guard только при матче); регистрация в обоих манифестах; самозащита в meta-guard PROTECTED_HOOKS; пин в SPECGEN004_52; vitest 4/4 + живые пробы deny=2/allow=0 |
| 2 | **CHK-NFR дедлок**: requirements-chk-matrix:70 инструктировал `CHK-FR{n}-NFR`, а guard-контракт `/^CHK-FR\d+-\d{2}$/` режет буквенный суффикс → DENY на каждой спеке с NFR-связанными FR | живой CLI-прогон: `CHK-FR1-NFR` → violation exit 1 | скилл переписан на числовой id + NFR-маркер в Notes; guard-контракт (пиненный тестами) не тронут |
| 3 | **task-board-forms Jira-shape дедлок**: рекомендованная heading-форма с lowercase `**status:**`/`**done when:**` против регистро-зависимых `Status:`/`**Done When:**` в guard-е | spec-form-parsers.ts:99-131 (без `/i`) | пример в скилле переписан в guard-проходную форму + явное предупреждение о регистро-зависимости |
| 4 | **Фантомный dry-run CLI**: 3 скилла инструктировали `spec-form-parsers.ts --check ...`, а CLI не существовало (модуль без main) | grep argv/main = 0 | CLI построен (`runCheckCli` + import-guard): `--check user-stories\|tasks\|decisions\|chk-rows <file>`, exit 1 на нарушениях; живые пробы |
| 5 | **Псевдо-теги `# @featureN`** ещё в 2 носителях: specs-validation.md (3 места) + jira-mode.md:110 | grep | реальные Gherkin-теги + объяснение почему |
| 6 | **Verdict финала аудита — до-v4**: phase3plus_audit-overview «все findings закрыты ⇒ Spec is ready» без spec-verdict (нарушение FR-37d) | строки 88-90 | двухусловный вердикт: findings closed И `spec-verdict --no-semantic` GREEN + указатель на MCP `get_spec_status` |
| 7 | **Мёртвый путь** `extensions/specs-workflow/...` в audit-variant-coverage:139 | файл не существует | путь исправлен на канонический |
| 8 | **Противоречие 13 vs 15 файлов**: SKILL.md «до 15», валидатор полноты требует 13 | completeness.ts:4 | обе стороны переформулированы: scaffold создаёт 15, полнота = 13 обязательных, FIXTURES/SCHEMA опциональны |
| 9 | **task-board-forms allowed-tools** без AskUserQuestion при 2 интерактивных ветках в теле | SKILL.md:8 vs :56,:66 | добавлен |
| 10 | **context7-имена захардкожены** в architecture-decision-builder: `mcp__context7__*` не существует в сессиях с claude.ai-коннектором (`mcp__claude_ai_Context7__*`) → весь R15 anti-hallucination гейт тихо деградирует в `[UNVERIFIED]` | allowed-tools vs живой реестр сессии | оба неймспейса в allowed-tools + ToolSearch-fallback инструкция |
| 11 | **Гонка тестов FR-20** (попутная): guard-тесты пишут реальные DENY в домашний form-guards.log → точные счётчики conformance-summary флакают при совместном прогоне | 2 failed при первом общем прогоне | soft-tier лог сделан инжектируемым (`readRecentEvents(h, logFile)`, `SummaryPaths.softLog`, `--soft-log`); 16/16 |

## Опровергнутая находка разведчика

- «FILE_CHANGES placeholder `{путь/к/файлу1}` валит свежий scaffold в RED» — **ложь для
  текущего шаблона**: живой re-run `scaffold-spec` → `spec-verdict` = audit 0 ERROR,
  **GREEN** (фикс 2026-06-06 перевёл placeholder-строку в `create`, который
  existence-check не проверяет). Урок: выводы разведчиков верифицировать прогоном.

## Невзятое (бэклог создающей стороны, по убыванию ценности)

1. **Evals для discovery-forms / requirements-chk-matrix / task-board-forms** — ноль
   поведенческих тестов у трёх LLM-скиллов (контраст: spec-reality-check имеет
   run-evals + bulk-run + bench; architecture-decision-builder и variant-matrix-build —
   iterations/rubric). Дедлоки #2/#3 жили бы меньше при наличии evals.
2. **7 неинстанцируемых шаблонов** (ARCHITECTURE_AXIS/INDEX, ATTACHMENTS, AUDIT_REPORT,
   COMPLETENESS, JIRA_SOURCE, SYNTHESIS) — судьбу решить: переезд к владельцам
   (jira-intake, architecture-decision) или пометка «генерится, не копируется».
3. **feature.template вне anchor-теста** (`templates.test.ts` фильтрует только
   `.md.template`) — @FR-теги шаблона не валидируются при изменении формата заголовков.
4. **audit-overview: 10 категорий vs 5 механических CHECK-ов** — split-responsibility
   (механика vs AI-семантика) нигде не задокументирован явно.
5. **CRLF в `replaceLiteralAll`** (fill-template) — теоретическая порча при смешанных
   концах строк; теста нет.
6. **`.progress.json` создаёт и scaffold, и spec-status** — два писателя при правиле
   «только через spec-status»; контракт уточнить.
7. **STOP-confirm дисциплина** — 9 спек корпуса с неподтверждёнными STOP; механизма,
   мешающего агенту проскочить ConfirmStop, нет (только nag валидатора).

## Верификация прохода

- `npx vitest run tools/specs-validator/__tests__/` — 16/16 (meta-guard 6, dispatch 4, FR-20 6)
- живые пробы dispatcher: bad TASKS → deny exit 2 (verdict guard-а пробрinternalён), clean → 0, не-spec путь → 0 без спавна
- `--check chk-rows` на `CHK-FR1-NFR` → violation, exit 1 (дедлок #2 воспроизведён и закрыт)
- полный BDD + spec-verdict — см. коммит-сообщение
