# User Stories

> Фича обслуживает **две роли**: human developer (initial setup, debug deep dive) и AI agent (повторяемое автоматизированное тестирование). Long-term цель — освободить human от рутины, оставив за ним только **первичный** setup и debug нестандартных случаев.

## Human developer

- Как **human developer**, я хочу один раз настроить Hyper-V VM с предустановленным Node.js + Claude Code + git, чтобы не повторять этот процесс перед каждым тестом dev-pomogator.
- Как **human developer**, я хочу иметь несколько именованных checkpoints VM (`baseline-clean`, `with-dpv-1.4.x`, `bug-X-repro`), чтобы откатываться к нужному состоянию за секунды и тестировать regression'ы.
- Как **human developer**, я хочу подключаться к VM через GUI (VMConnect Enhanced Session) и через RDP (`mstsc`), чтобы видеть реальный экран и экспериментировать руками когда автоматизация недостаточна.
- Как **human developer**, я хочу видеть ясный roadmap эволюции (от ручного запуска до полностью автоматизированного AI), чтобы понимать какой шаг автоматизации делать следующим и не потеряться в scope.
- Как **human developer**, я хочу набор PowerShell-скриптов для lifecycle VM (create, post-install, checkpoint, restore-and-launch, cleanup), чтобы любую операцию можно было выполнить одной командой и идемпотентно.

## AI agent

- Как **AI agent**, я хочу skill `hyperv-test-runner` с чётким алгоритмом и triggers, чтобы знать когда вызывать VM testing и как именно прогнать сценарий end-to-end.
- Как **AI agent**, я хочу читать test catalog (YAML/MD сценарии) и выбирать нужный сценарий по имени или по триггеру задачи, чтобы переиспользовать готовые рецепты вместо изобретения велосипеда каждый раз.
- Как **AI agent**, я хочу запускать PowerShell-скрипты на хосте для управления VM (revert checkpoint, start, копировать fixture, выполнить команду внутри VM, screenshot), чтобы оркестрировать полный test cycle без вмешательства human.
- Как **AI agent**, я хочу делать screenshots окна VM и читать их через multimodal Read, чтобы визуально проверять то что нельзя проверить через `Get-Content` или exit codes (statusline, TUI, ошибки в UI, диалоги).
- Как **AI agent**, я хочу сравнивать актуальный экран с ожиданием в формате CONFIRMED / DENIED + описание расхождения, чтобы human получал actionable отчёт без необходимости лезть в скриншоты вручную.
- Как **AI agent**, я хочу при появлении новой фичи в dev-pomogator (новые FR/FILE_CHANGES) автоматически генерировать кандидата нового сценария в test catalog и предлагать его human-у на review, чтобы catalog рос вместе с продуктом без отдельной задачи "обновить тесты".
- Как **AI agent**, я хочу гарантированно откатывать VM к `baseline-clean` после каждого сценария (даже при крахе), чтобы следующий тест начинался с известного состояния и не накапливалась грязь.

## Совместные

- Как **human + AI**, мы хотим единый источник truth для test scenarios (один YAML каталог), чтобы human мог писать сценарии руками, а AI мог их выполнять и расширять — без двух разных форматов.
- Как **human + AI**, мы хотим логи и screenshots каждого test run в `.dev-pomogator/hyperv-runs/<timestamp>/`, чтобы post-mortem был возможен через несколько дней без воспроизведения.
