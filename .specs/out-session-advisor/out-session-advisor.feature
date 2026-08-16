@out-session-advisor
Feature: OUTSESS001_session_advisor_and_parallel_safety
  Адвизор-сессия наблюдает живую воркер-сессию (Claude Code или подобную): видит хвост транскрипта
  (включая ход мысли субагентов), управляет воркером через stream-json мост (ConPTY — fallback), перепроверяет
  отчёты на «пиздёж» сверкой с файлами/БД/live. Параллельная безопасность: git-гейт против `git add -A`
  и чужих staged-путей, атомарные локалы с владельцем и stale-восстановлением, инвентаризация сессий
  по репо, диагностика «кто писал <файл>» и сводка ok/dirty/conflict.

  Background:
    Given временный каталог транскрипта "transcript-dir" существует
    And главный JSONL "main-session.jsonl" содержит события user и assistant с tool_use
    And субагентный JSONL "subagents/agent-test.jsonl" содержит ход мысли субагента

# Часть A — Адвизор

  @feature1 @FR-1 @AC-1
  Scenario: OUTSESS001_01 живые субагенты видны в хвосте транскрипта
    When адвизор снимает хвост транскрипта из "transcript-dir"
    Then в выводе присутствуют текстовые и tool-события файла subagents субагента
    And каждая строка субагента имеет временной штамп
    And строка главного файла не дублируется при повторном хвосте

  @feature1 @FR-1 @AC-1
  Scenario: OUTSESS001_02 завершённый субагент помечается закрытым и не повторяется
    Given subagents/agent-test.jsonl больше не растёт (субагент завершён)
    When адвизор снимает следующий хвост транскрипта
    Then блок субагента помечен как закрытый
    And ранее показанные строки не повторяются

  @feature1 @FR-1 @AC-1
  Scenario: OUTSESS001_17 tail видит live-события stream-json воркера из event-log
    Given событийный лог "events.jsonl" содержит send, session_start, tool_use и result
    When адвизор снимает хвост с event-log "events.jsonl"
    Then в выводе видны live-события tool_use и result
    And live-событие SEND не дублирует файловый транскрипт

  @feature3 @FR-3 @AC-3
  Scenario: OUTSESS001_18 consult fail-open без ANTHROPIC creds
    Given переменные ANTHROPIC_BASE_URL и ANTHROPIC_AUTH_TOKEN не заданы
    When адвизор запускает consult на отсутствующем транскрипте
    Then consult выводит честный fail-open текст и завершается с кодом 0

  @feature3 @FR-3 @AC-3
  Scenario: OUTSESS001_03 verify_claims возвращает CONFIRMED с evidence
    When адвизор запускает verify_claims с путями реальных файлов из отчёта воркера
    Then вердикт содержит status CONFIRMED
    And evidence содержит пути вида path/to/file
    And reason поясняет, что проверялось

  @feature3 @FR-3 @AC-3
  Scenario: OUTSESS001_04 verify_claims ловит ложный claim (GAP)
    Given воркер утверждает факт про отсутствующий путь "missing.json"
    When адвизор запускает verify_claims --claim file --paths missing.json
    Then вердикт содержит status GAP
    And reason содержит точную причину (нет файла / hash не совпал)

  @feature3 @FR-3 @AC-3
  Scenario: OUTSESS001_05 промежуточный 403 в цепочке НЕ считается блокером
    Given capture-status.json содержит document_response_chain [307, 403, 200] с финальным 200
    When адвизор оценивает «есть ли live-блокер» по отчёту воркера
    Then вердикт НЕ помечает 403 блокером
    And блокер засчитывается только при финальном document статусе >=400 с совпадением url

  @feature2 @FR-2 @AC-2
  Scenario: OUTSESS001_06 промпт доставляется в воркер через stream-json
    Given воркер запущен через stream-json с --dangerously-skip-permissions
    When адвизор шлёт send с utf8-промптом через worker_driver
    Then result содержит ответ воркера и session_id
    And промпт без искажения спецсимволов

  @feature2 @FR-2 @AC-2
  Scenario: OUTSESS001_06b адвизор отвечает на текстовый вопрос воркера
    Given воркер задал вопрос владельцу обычным текстом в result (вариант A)
    When адвизор читает result и отвечает через send
    Then диалог продолжается без перехвата AskUserQuestion

  @feature4 @FR-4 @AC-4
  Scenario: OUTSESS001_07 адвизор не останавливается на долгом думающем ходе
    Given воркер в думающем ходе без записей более N минут
    When истекает интервал мониторинга
    Then адвизор выполняет следующий ход: проверку живости процесса и новый снапшот
    And помечает состояние «думает», а не «повис»

  @feature5 @FR-5 @AC-5
  Scenario: OUTSESS001_08 SKILL и зеркало идентичны и проходят parity
    When проверяются discovery/parity-чекеры скилов
    Then .claude/skills/out-session-advisor/SKILL.md и .agents/skills/out-session-advisor/SKILL.md идентичны
    And parity-чек завершается без ошибок

# Часть B — Параллельная безопасность

  @feature6 @FR-6 @AC-6
  Scenario: OUTSESS001_09 git add -A блокируется гейтом
    When git-guard видит команду "git add -A" в общем дереве
    Then вердикт содержит decision warn или block
    And запрос override логируется в escape-audit

  @feature6 @FR-6 @AC-6
  Scenario: OUTSESS001_10 чужой staged-путь помечается conflict
    Given инвентаризация относит "src/foo.py" к сессии A (не нашей)
    When сессия B пытается закоммитить staged, включающий foo.py
    Then git-guard помечает foo.py как conflict и требует подтверждения владельца

  @feature7 @FR-7 @AC-7
  Scenario: OUTSESS001_11 атомарный лок не даёт второму процессу перезаписать
    Given лок "locks-dir/lock1.lock" не существует
    When процесс A создаёт лок через writeFile(flag wx) и процесс B пытается снова
    Then процесс B получает отказ EEXIST и не перезаписывает лок процесса A

  @feature7 @FR-7 @AC-7
  Scenario: OUTSESS001_12 stale-лок восстанавливается атомарно
    Given лок "locks-dir/lock2.lock" имеет мёртвого владельца (pid не жив)
    When сервис обнаруживает stale-лок
    Then лок удаляется и пересоздаётся атомарно с новым владельцем
    And факт восстановления логируется в audit

  @feature8 @FR-8 @AC-8
  Scenario: OUTSESS001_13 инвентаризация относит процессы к репо standalone
    Given активны процессы в двух репо "repo-a" и "repo-b", dashboard не запущен
    When запускается parallel-session-inventory
    Then результат содержит строки {repo, pid, session, ts}
    And каждый процесс отнесён к repo или unknown

  @feature9 @FR-9 @AC-9
  Scenario: OUTSESS001_14 кто писал <файл> через транскрипты
    When адвизор запрашивает "кто писал "src/foo.py""
    Then ответ содержит сессию A с временем последнего Edit/Write и последним писателем
    And если сессия A пишет сейчас, то помечается конфликт single-writer (read-only)

  @feature10 @FR-10 @AC-10
  Scenario: OUTSESS001_15 сводная диагностика ok/dirty/conflict
    Given запущены параллельные сессии с одним спорным файлом "src/foo.py"
    When запускается parallel-session-diag
    Then вывод содержит сессии (repo/sid/pid), локалы с владельцем, писателей foo.py
    And вердикт по конфликту содержит причину

  @feature10 @FR-10 @AC-10
  Scenario: OUTSESS001_16 пустая сводка без шума
    Given нет активных чужих сессий
    When запускается parallel-session-diag
    Then выводится короткая сводка "0 active, 0 locks, 0 conflicts"