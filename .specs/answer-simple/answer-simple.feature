Feature: PLUGIN017_answer-simple

  Background:
    Given dev-pomogator extension answer-simple установлен в текущем проекте
    And правило `.claude/rules/answer-simple/clear-questions-to-user.md` присутствует
    And skill `.claude/skills/answer-simple/SKILL.md` присутствует

  # @feature1 — US-1 / FR-1 / FR-4 / AC-1 / AC-4 (always-apply self-check + incident trigger)

  @feature1
  Scenario: PLUGIN017_01: правило answer-simple несёт 5-шаговый шаблон самопроверки и микроисторию
    Given содержимое правила clear-questions-to-user прочитано
    Then правило SHALL содержать все 5 шагов шаблона самопроверки
    And правило SHALL перечислять 5 опорных точек микроистории

  @feature1
  Scenario: PLUGIN017_02: правило несёт секцию триггера инцидента с мандатом не задавать новый вопрос
    Given содержимое правила clear-questions-to-user прочитано
    Then правило SHALL содержать секцию Триггер инцидента с ключевыми словами не понял и сложно
    And правило SHALL содержать мандат СТОП не задавать новый вопрос

  # @feature2 — US-2 / FR-2 / AC-2 (slash-команда explicit invocation)

  @feature2
  Scenario: PLUGIN017_03: skill answer-simple несёт корректный frontmatter и критерии workflow
    Given содержимое skill answer-simple прочитано
    Then skill SHALL содержать frontmatter с name answer-simple и allowed-tools и упоминание slash-команды
    And skill SHALL перечислять фиксированные заголовки output Переформулировано Найдено-проблем и Проблем-не-найдено

  @manual
  Scenario: PLUGIN017_04: slash-команда /answer-simple на чистом черновике возвращает "Проблем не найдено"
    Given черновик соответствует шаблону микроистории и не содержит внутренних кодов
    When пользователь вызывает `/answer-simple <чистый-черновик>`
    Then skill SHALL вернуть output "Проблем не найдено"
    And output SHALL включать краткий список пройденных критериев

  # @feature5 — US-3 / FR-5 / AC-5 (atomic migration of rule + CLAUDE.md update)

  @feature5
  Scenario: PLUGIN017_05: v2-проводка и атомарная миграция rule выполнены в репозитории
    Given репозиторий dev-pomogator после атомарной миграции rule (v2 canonical)
    Then Stop-хук answer-simple SHALL быть подключён в `.claude-plugin/hooks.json`
    And файл `tools/answer-simple/answer_simple_stop.ts` SHALL присутствовать
    And старый путь правила `.claude/rules/clear-questions-to-user.md` SHALL отсутствовать
    And новый путь правила `.claude/rules/answer-simple/clear-questions-to-user.md` SHALL присутствовать
    And `CLAUDE.md` SHALL ссылаться на новый путь и не содержать старый путь в backticks

  # @feature8 — US-1 / FR-8 / AC-8 (Stop-hook runtime enforcement of plain language)

  @feature8
  Scenario: PLUGIN017_06: детектор блокирует ответ-стену из внутренних кодов независимо от длины
    Given финальный ответ агента содержит >2 различных внутренних кода (FR-N, ARCH-N, SCREAMING_CODE) в прозе
    When detectJargon анализирует текст
    Then результат SHALL иметь block=true
    And reasons SHALL называть найденные коды бытовой формулировкой "стена внутренних кодов"

  @feature8
  Scenario: PLUGIN017_07: детектор пропускает чистую прозу и hard-OUT для кода/короткого
    Given ответ — чистая проза без внутренних кодов, либо преимущественно блок кода, либо короткий и чистый
    When detectJargon анализирует текст
    Then результат SHALL иметь block=false (ложноположительные исключены)

  @feature8
  Scenario: PLUGIN017_08: Stop-хук блокирует жаргонную стену с понятной причиной, пропускает чистый ответ
    Given answer_simple_stop.ts установлен и подключён как Stop-hook
    When на Stop приходит финальный ответ-стена из кодов
    Then хук SHALL вернуть `{"decision":"block"}` с reason на простом русском "Перепиши ответ проще"
    And на чистый ответ хук SHALL вернуть `{}` (разрешить)

  @feature8
  Scenario: PLUGIN017_09: Stop-хук защищён от петли — повтор того же текста и stop_hook_active пропускаются
    Given хук уже заблокировал конкретный ответ один раз
    When тот же текст приходит повторно ИЛИ stop_hook_active=true
    Then хук SHALL вернуть `{}` (не блокировать снова, исключая бесконечный цикл)

  # @feature8 — FR-8 / AC-8 (regression tokens that slipped through before the 2026-06-11 fix)

  @feature8
  Scenario: PLUGIN017_10: детектор ловит конкретные токены FR-43c P18-1 SUPERSEDED HITL not_run SPECGEN003
    Given тексты с токенами FR-43c и P18-1 и SUPERSEDED и HITL и not_run и SPECGEN003 встроены в длинную прозу
    When detectJargon анализирует каждый текст
    Then каждый токен SHALL быть обнаружен в stats.codes

  # @feature7 — FR-7 / AC-7 (universal engineering vocabulary must not be flagged)

  @feature7
  Scenario: PLUGIN017_11: детектор не флагует общеупотребительные аббревиатуры JSON API HTTP GREEN OK DONE
    Given текст содержит только общеупотребительные аббревиатуры JSON API HTTP GREEN OK DONE в прозе
    When detectJargon анализирует текст
    Then stats.codes SHALL быть пустым массивом
