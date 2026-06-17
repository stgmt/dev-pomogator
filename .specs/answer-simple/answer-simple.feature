Feature: PLUGIN017_answer-simple

  Background:
    Given dev-pomogator extension answer-simple установлен в текущем проекте
    And правило `.claude/rules/answer-simple/clear-questions-to-user.md` присутствует
    And skill `.claude/skills/answer-simple/SKILL.md` присутствует

  # @feature1 — US-1 / FR-1 / FR-4 / AC-1 / AC-4 (always-apply self-check + incident trigger)

  @wip
  Scenario: PLUGIN017_01: агент молча применяет шаблон самопроверки перед содержательным ответом
    Given пользователь задал агенту нетривиальный вопрос требующий ответа
    And в reasoning context агента подгружено правило clear-questions-to-user
    When агент готовит черновик ответа содержащий внутренние коды "Wave 14" и "FR-12" без расшифровки
    Then перед отправкой агент SHALL прогнать 5-шаговый шаблон самопроверки
    And финальный ответ SHALL не содержать необъяснённых внутренних кодов формата "Wave N" или "FR-N"
    And финальный ответ SHALL иметь структуру микроистории с минимум 3 из 5 опорных точек

  @wip
  Scenario: PLUGIN017_02: триггер инцидента — агент не задаёт новый вопрос при сигнале "не понял"
    Given в прошлом turn агент задал жаргонный multi-select вопрос пользователю
    When пользователь в текущем turn ответил "ниче не понял слишком сложно"
    Then агент SHALL не задавать новый уточняющий вопрос в текущем turn
    And агент SHALL перечитать копипаст пользователя за последние 2-3 turn
    And агент SHALL действовать из контекста или задать одну свободную фразу без multi-select опций

  # @feature2 — US-2 / FR-2 / AC-2 (slash-команда explicit invocation)

  @wip
  Scenario: PLUGIN017_03: slash-команда /answer-simple возвращает структурированный output на жаргонном черновике
    Given пользователь набирает в чате команду `/answer-simple "Wave 14 (gates+OpenRouter) ПЕРЕД Wave 11 — Keep / Swap / Parallel?"`
    When Claude Code находит skill `.claude/skills/answer-simple/SKILL.md` и активирует его
    Then skill SHALL вернуть output содержащий заголовок "Переформулировано:"
    And output SHALL содержать заголовок "Найдено проблем:"
    And блок "Найдено проблем:" SHALL включать упоминания "Wave 14" "Wave 11" "gates" "OpenRouter" как жаргон и multi-select с 3 опциями как превышение порога 2

  @wip
  Scenario: PLUGIN017_04: slash-команда /answer-simple на чистом черновике возвращает "Проблем не найдено"
    Given черновик соответствует шаблону микроистории и не содержит внутренних кодов
    When пользователь вызывает `/answer-simple <чистый-черновик>`
    Then skill SHALL вернуть output "Проблем не найдено"
    And output SHALL включать краткий список пройденных критериев

  # @feature3 — US-3 / FR-3 / FR-5 / AC-3 / AC-5 (installer + migration)

  @wip
  Scenario: PLUGIN017_05: установка extension создаёт корректную структуру файлов и миграция rule выполнена атомарно
    Given fresh target-проект без установленного dev-pomogator
    And dev-pomogator source repo с уже выполненной миграцией rule (atomic 3-step)
    When запущена команда `npx github:<owner>/dev-pomogator --claude --plugins=answer-simple` в target-проекте
    Then target-проект SHALL содержать файл `.claude/rules/answer-simple/clear-questions-to-user.md`
    And target-проект SHALL содержать файл `.claude/skills/answer-simple/SKILL.md`
    And `~/.dev-pomogator/config.json` SHALL содержать SHA-256 хеши обоих файлов в managedFiles
    And валидатор `extensions/_shared/extension-layout-validate.ts` SHALL вернуть exit 0
    And dev-pomogator source repo SHALL содержать CLAUDE.md глоссарий-запись с путём `.claude/rules/answer-simple/clear-questions-to-user.md`
    And dev-pomogator source repo SHALL не содержать старый путь `.claude/rules/clear-questions-to-user.md`

  # @feature4 — US-1 / FR-8 / AC-8 (Stop-hook runtime enforcement of plain language)

  @feature4
  Scenario: PLUGIN017_06: детектор блокирует ответ-стену из внутренних кодов независимо от длины
    Given финальный ответ агента содержит >2 различных внутренних кода (FR-N, ARCH-N, SCREAMING_CODE) в прозе
    When detectJargon анализирует текст
    Then результат SHALL иметь block=true
    And reasons SHALL называть найденные коды бытовой формулировкой "стена внутренних кодов"

  @feature4
  Scenario: PLUGIN017_07: детектор пропускает чистую прозу и hard-OUT для кода/короткого
    Given ответ — чистая проза без внутренних кодов, либо преимущественно блок кода, либо короткий и чистый
    When detectJargon анализирует текст
    Then результат SHALL иметь block=false (ложноположительные исключены)

  @feature4
  Scenario: PLUGIN017_08: Stop-хук блокирует жаргонную стену с понятной причиной, пропускает чистый ответ
    Given answer_simple_stop.ts установлен и подключён как Stop-hook
    When на Stop приходит финальный ответ-стена из кодов
    Then хук SHALL вернуть `{"decision":"block"}` с reason на простом русском "Перепиши ответ проще"
    And на чистый ответ хук SHALL вернуть `{}` (разрешить)

  @feature4
  Scenario: PLUGIN017_09: Stop-хук защищён от петли — повтор того же текста и stop_hook_active пропускаются
    Given хук уже заблокировал конкретный ответ один раз
    When тот же текст приходит повторно ИЛИ stop_hook_active=true
    Then хук SHALL вернуть `{}` (не блокировать снова, исключая бесконечный цикл)
