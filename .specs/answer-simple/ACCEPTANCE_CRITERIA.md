# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-always-apply-шаблон-самопроверки-агента-перед-отправкой-ответа)

WHEN агент готовит содержательный ответ пользователю (не тривиальное "ок"/"да"/"yes") THEN агент SHALL прогнать 5-шаговый шаблон самопроверки до отправки ответа.

WHEN финальный ответ содержит внутренние коды (формат "Wave N", "FR-N", "AC-N", "CHK-FRn-nn", library names как multi-select опции) без расшифровки в скобках ИЛИ multi-select с >3 опциями THEN агент SHALL переписать в формат микроистории либо сократить опции до ≤2 до отправки.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-slash-команда-answer-simple-для-ручного-аудита-черновика)

WHEN пользователь вызывает `/answer-simple <черновик>` с непустым аргументом THEN skill SHALL вернуть структурированный output из двух блоков с заголовками "Переформулировано:" и "Найдено проблем:".

WHEN входной черновик уже соответствует шаблону микроистории (5 опорных точек присутствуют, нет внутренних кодов без расшифровки, нет multi-select >2) THEN skill SHALL вернуть "Проблем не найдено" с краткой подсказкой какие критерии пройдены.

IF `/answer-simple` вызван без аргумента THEN skill SHALL вернуть usage-summary (one paragraph что делает + 1-2 примера вызова) и не должен зависать или генерировать пустой ответ.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-extension-следует-конвенциям-extension-layout)

IF installer dev-pomogator запущен с extension answer-simple в active plugin list (`--claude --plugins=answer-simple` или `--claude --all`) THEN target-проект SHALL содержать файлы по путям из manifest: `.claude/rules/answer-simple/clear-questions-to-user.md` И `.claude/skills/answer-simple/SKILL.md`, оба с SHA-256 хешами записанными в `~/.dev-pomogator/config.json` `managedFiles`.

WHEN validator `extensions/_shared/extension-layout-validate.ts` запущен после изменений extension THEN validator SHALL вернуть exit 0 (no layout violations — все rules в `.claude/rules/answer-simple/`, все skills в `.claude/skills/answer-simple/`, никаких файлов в `extensions/answer-simple/rules/` или `extensions/answer-simple/skills/`).

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-триггер-инцидента-запрет-нового-вопроса-при-сигнале-непонимания)

WHEN последнее user message содержит одну из триггерных подстрок ("не понял", "сложно", "что это", "ты не понял", "ниче не понял" — case-insensitive russian; либо "i don't understand", "too complex", "what does X mean" — english) THEN агент SHALL не задавать новый уточняющий вопрос в текущем turn И SHALL перечитать копипаст пользователя за последние 2-3 turn.

WHEN агент выполнил re-read копипаста после триггера инцидента THEN агент SHALL действовать из контекста (выводить ответ если он выводится) ИЛИ задать ОДНУ свободную фразу без multi-select опций если действительно требуется уточнение.

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-skill-consistency-reformulation-findings)

WHEN skill расшифровывает термин inline в блоке "Переформулировано:" THEN finding для этого термина в блоке "Найдено проблем:" SHALL содержать явное упоминание что расшифровка от skill (формулировки типа "в источнике без объяснения; я добавил inline расшифровку") И НЕ SHALL содержать формулировку "X без расшифровки" которая создаёт self-contradiction.

WHEN финальный output содержит расшифровку термина в reformulation и любой finding для того же термина THEN текст finding SHALL описывать состояние source, не результат работы skill.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-различение-internal-codes-vs-general-engineering-vocabulary)

WHEN skill обрабатывает черновик содержащий общеупотребительные engineering термины (staging, prod, deploy, migration, rollback, CI, QPS, SLO, JSON, schema, validation, helper, validator, etc.) THEN skill SHALL НЕ flag эти термины как "internal codes без расшифровки" по умолчанию (technical audience default).

WHEN skill обрабатывает черновик содержащий project-specific коды (FR-N, AC-N, Wave-N, имена spec slugs типа foo-bar, custom категории типа VARIANT_COVERAGE) THEN skill SHALL flag эти коды как требующие расшифровки.

IF в исходнике явно указан non-technical reader (контекст содержит "для PM" / "для маркетинга" / "для бизнеса") THEN skill SHALL расширить flag scope на wider vocabulary включая staging / deploy / etc.

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-миграция-существующего-rule-с-обновлением-claudemd-глоссария)

WHEN миграция rule выполнена THEN путь `.claude/rules/clear-questions-to-user.md` SHALL не существовать в файловой системе dev-pomogator repo И путь `.claude/rules/answer-simple/clear-questions-to-user.md` SHALL содержать тот же content byte-for-byte что был в source до миграции.

WHEN миграция завершена THEN строка в CLAUDE.md глоссарий-таблице (always-apply rules секция) SHALL указывать на новый путь `.claude/rules/answer-simple/clear-questions-to-user.md` И не должно быть orphan строки на старый путь.

WHEN миграция завершена THEN memory `~/.claude/projects/D--repos-dev-pomogator/memory/feedback_no-jargon-questions-to-user.md` cross-reference в body к rule path SHALL быть обновлён на новый путь.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-runtime-принуждение-простого-языка-через-stop-hook)

WHEN финальный ответ агента содержит >2 различных внутренних кода в прозе THEN Stop-hook SHALL вернуть `{"decision":"block"}` с reason на простом русском, начинающимся «Перепиши ответ проще».

WHEN ответ — чистая проза без кодов ИЛИ преимущественно code-блок/таблица ИЛИ короткий и чистый THEN Stop-hook SHALL вернуть `{}` (разрешить) — ложноположительные исключены.

IF тот же текст ответа приходит повторно (hash совпал) ИЛИ превышен лимит попыток в окне cooldown ИЛИ `stop_hook_active=true` THEN Stop-hook SHALL вернуть `{}` (anti-loop, не блокировать снова).

IF при выполнении хука возникла ошибка THEN хук SHALL завершиться exit 0 (fail-open) и не блокировать ответ.
