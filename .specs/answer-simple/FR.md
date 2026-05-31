# Functional Requirements (FR)

## FR-1: Always-apply шаблон самопроверки агента перед отправкой ответа

Агент ОБЯЗАН перед отправкой любого содержательного ответа пользователю молча прогнать 5-шаговый шаблон самопроверки, определённый в правиле `clear-questions-to-user.md`: (1) "что я понял" — перефразировать запрос пользователя в 1-2 строки бытовым языком без терминов проекта; (2) черновик ответа или вопроса; (3) самооценка "поймёт ли пользователь" — есть ли жаргон, внутренние коды (Wave-N, FR-N, library names как опции), multi-select с >3 опциями; (4) шаблон ответа в формате микроистории с 5 опорными точками (откуда пришли → что юзер сказал → что сделал и почему → где сейчас → что дальше) со связками "потому что / поэтому / в итоге / дальше"; (5) переписать если шаг 3 завален, не отправлять. Тривиальные ответы (одно слово, простое подтверждение типа "ок"/"да") освобождаются от шаблона.

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
**Use Case:** [UC-1](USE_CASES.md#uc-1-агент-молча-предотвращает-жаргонный-ответ-happy-path-для-us-1)

## FR-2: Slash-команда /answer-simple для ручного аудита черновика

Skill, доступный как slash-команда `/answer-simple <черновик>`, ОБЯЗАН принимать на вход произвольный текстовый черновик и возвращать структурированный ответ из двух блоков: (a) "Переформулировано:" с версией черновика в формате микроистории; (b) "Найдено проблем:" с bullet-list конкретных проблемных фрагментов исходного черновика (внутренние коды без расшифровки, жаргонные термины, multi-select с >3 опциями, отсутствие причинно-следственных связок между предложениями). Если черновик уже соответствует шаблону (5 опорных точек присутствуют, нет жаргона, нет multi-select >2) — skill ОБЯЗАН вернуть "Проблем не найдено" с кратким списком пройденных критериев. Если `/answer-simple` вызван без аргумента — вернуть usage-summary (что делает + пример).

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)
**Use Case:** [UC-2](USE_CASES.md#uc-2-пользователь-явно-вызывает-answer-simple-для-аудита-черновика-happy-path-для-us-2)

## FR-3: Extension следует конвенциям extension-layout

Extension answer-simple ОБЯЗАН следовать конвенциям dev-pomogator (см. правило `.claude/rules/extension-layout.md`): manifest `extensions/answer-simple/extension.json` перечисляет `ruleFiles.claude[]` и `skills."answer-simple"` со SOURCE paths указывающими на `.claude/rules/answer-simple/*.md` и `.claude/skills/answer-simple/`; rules живут в `.claude/rules/answer-simple/` корня dev-pomogator (НЕ в `extensions/answer-simple/rules/` — installer silently skips такое расположение); skill живёт в `.claude/skills/answer-simple/` корня dev-pomogator (НЕ в `extensions/answer-simple/skills/`). Никаких TypeScript tools (`extensions/answer-simple/tools/`) extension не содержит — это чисто declarative rule+skill bundle, аналогичный по структуре `extensions/auto-simplify/`. Manifest integrity per `.claude/rules/extension-manifest-integrity.md` — все rule-файлы и skill-файлы перечислены byte-for-byte.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)
**Use Case:** [UC-4](USE_CASES.md#uc-4-установка-extension-в-target-проект-через-installer-happy-path-для-us-3)

## FR-4: Триггер инцидента — запрет нового вопроса при сигнале непонимания

Когда последнее user-message содержит триггер инцидента (точные подстроки case-insensitive russian: "не понял", "сложно", "что это", "ты не понял", "ниче не понял"; либо явный английский: "i don't understand", "too complex", "what does X mean") — агент ОБЯЗАН активировать ветку "no new question": (1) не задавать никаких новых уточняющих вопросов в текущем turn; (2) перечитать копипаст пользователя за последние 2-3 turn; (3) выполнить шаг 1 шаблона самопроверки честно без додумывания того что хочет пользователь; (4) действовать из контекста — если ответ выводится, выводить; (5) если действительно нужно уточнение — задать ОДНОЙ свободной фразой без multi-select опций.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)
**Use Case:** [UC-3](USE_CASES.md#uc-3-триггер-инцидента-—-пользователь-говорит-не-понял-edge-case-для-us-1)

## FR-6: Skill consistency reformulation ↔ findings

Если в блоке "Переформулировано:" skill сам расшифровал термин inline (например, "AJV → валидатор JSON-схем"), то finding для этого термина в блоке "Найдено проблем:" ОБЯЗАН звучать иначе чем для нерасшифрованных терминов. Запрещён self-contradiction (skill одновременно расшифровывает термин И flag-ит его как "без расшифровки"). Finding ДОЛЖЕН описывать состояние исходника, не результат работы skill. Если расшифровка пришла от skill — finding явно отмечает это формулировкой типа "термин X в источнике без объяснения; я добавил inline расшифровку". Источник требования — iter-3 evals выявили self-contradiction в eval-8 (AJV).

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)
**Use Case:** [UC-2](USE_CASES.md#uc-2-пользователь-явно-вызывает-answer-simple-для-аудита-черновика-happy-path-для-us-2)

## FR-7: Различение internal codes vs general engineering vocabulary

Skill ОБЯЗАН различать project-specific internal codes (которые flag-ятся как требующие расшифровки) и общеупотребительную engineering лексику (которая НЕ flag-ится для технической аудитории по умолчанию).

**Flag:** project-specific коды — FR-N, AC-N, Wave-N, PLUGIN-N, CHK-FR-N-NN, Issue [A-Z], @feature1, имена spec'ов / file slugs (foo-bar, baz-quux), custom audit categories / modules / abbreviations известные только в проекте (VARIANT_COVERAGE, MATRIX_COMPLETE).

**НЕ flag (общий engineering vocabulary):** staging, prod, dev, qa, prod deploy, migration, deploy, rollback, CI, CD, QPS, RPS, SLO, SLA, downtime, planned downtime, helper, validator, schema, module, service, component, library, merge, commit, PR, review, branch, hotfix, JSON, YAML, regex, API, SDK, CLI, JSON schema, JSON schema validation.

Правило применения: если термин знаком engineer/dev/ops — НЕ flag; если требуется domain-specific контекст проекта — flag. Исключение: если из контекста явно non-technical reader (PM / маркетинг / бизнес) — flag wider vocabulary включая staging/deploy/etc. Источник требования — iter-3 evals выявили over-flagging staging/prod/QPS/SRE/planned-downtime в eval-6.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
**Use Case:** [UC-1](USE_CASES.md#uc-1-агент-молча-предотвращает-жаргонный-ответ-happy-path-для-us-1), [UC-2](USE_CASES.md#uc-2-пользователь-явно-вызывает-answer-simple-для-аудита-черновика-happy-path-для-us-2)

## FR-5: Миграция существующего rule с обновлением CLAUDE.md глоссария

Реализация extension ОБЯЗАНА мигрировать существующий файл `.claude/rules/clear-questions-to-user.md` (созданный ранее в этой же сессии 2026-05-23) в новое место `.claude/rules/answer-simple/clear-questions-to-user.md` с сохранением content byte-for-byte. После миграции: (a) старый путь `.claude/rules/clear-questions-to-user.md` НЕ должен существовать в файловой системе; (b) CLAUDE.md глоссарий-таблица ОБЯЗАН содержать обновлённую ссылку на новый путь (per `.claude/rules/claude-md-glossary.md` rule); (c) memory-файл `~/.claude/projects/D--repos-dev-pomogator/memory/feedback_no-jargon-questions-to-user.md` cross-reference к rule path ОБЯЗАН быть обновлён. Миграция атомарна — неполное состояние (например файл перемещён, но CLAUDE.md не обновлён) запрещено.

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)
**Use Case:** [UC-4](USE_CASES.md#uc-4-установка-extension-в-target-проект-через-installer-happy-path-для-us-3)

## FR-8: Runtime-принуждение простого языка через Stop-hook

Extension ОБЯЗАН включать Stop-hook (`tools/answer-simple/answer_simple_stop.ts`), который на каждом завершении хода агента инспектирует финальный ответ пользователю и блокирует его (`{"decision":"block","reason":...}`), если ответ — «стена внутренних кодов» (>2 различных project-кодов формата FR-N/AC-N/ARCH-N/@featureN/Wave-N/Phase-N/SCREAMING_CODE в прозе, code-блоки и таблицы исключены из подсчёта) ИЛИ чрезмерно длинная проза (> порога слов при отсутствии кода). `reason` пишется простым русским языком и возвращается агенту как инструкция переписать. Детекция детерминирована (regex + подсчёт слов, без второго LLM-вызова) и вынесена в чистую функцию `detectJargon` (`jargon_detector.ts`) для unit-тестируемости.

**Anti-loop (BLOCKING):** хук НЕ должен зацикливаться. Тот же текст повторно (hash совпал) → пропустить; превышен лимит попыток в окне cooldown → пропустить; `stop_hook_active=true` → пропустить. Маркер-файл `.dev-pomogator/.answer-simple-marker.json` (atomic write). Fail-open: любая ошибка хука → разрешить (exit 0), никогда не блокировать из-за бага хука.

**Hard-OUT (не блокировать — против over-application H1):** ответ преимущественно код/диффы/таблицы (prose:total ratio низкий); короткий чистый ответ (мало слов И кодов нет). Цель — бить по реальному провалу (стена кодов в ответе пользователю), не мешать нормальному техническому выводу.

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
**Use Case:** [UC-1](USE_CASES.md#uc-1)

## FR-12: [TBD title]

[TBD description — replace with actual requirement text]

### Citations

- **.specs\answer-simple\USE_CASES.md:7:7** — `- Шаг 1: Агент готовит черновик "Готово. Обновил extension.json. Добавил FR-12. `
- **.specs\answer-simple\USE_CASES.md:7:8** — `- Шаг 2: Срабатывает always-apply rule answer-simple, шаг 3 самопроверки "поймёт`
- **.specs\answer-simple\USE_CASES.md:7:9** — `- Шаг 3: Срабатывает шаг 5 "переписать". Агент формирует микроисторию: "После то`
