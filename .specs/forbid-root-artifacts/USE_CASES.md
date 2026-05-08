# Use Cases

## UC-1: Первичная установка плагина на чистый репозиторий (happy path)

Developer устанавливает `dev-pomogator` с плагином `forbid-root-artifacts` на новый/чистый репозиторий. `configure.py` запускается в postInstall.

- Developer запускает `npx dev-pomogator install --plugins=forbid-root-artifacts`
- postInstall выполняет `python configure.py`
- `configure.py` сканирует root, находит конфиг-файлы (`pyproject.toml`, `Makefile`)
- Trash-aware filter определяет: `pyproject.toml` → CONFIG, `Makefile` → CONFIG (через CONFIG_PATTERNS)
- Все CONFIG-файлы предложены developer'у в интерактивном меню
- Developer выбирает «all» — config files добавлены в `allow:`
- Pre-commit hook установлен
- **Ссылки:** US-1, US-4

## UC-2: Установка на legacy VS-репозиторий

Developer устанавливает плагин на старый репозиторий с Visual Studio артефактами в корне (`Local.testsettings`, `*.vssscc`, `UpgradeLog.htm`). Этот сценарий — прямая регрессия инцидента MR-5993.

- Developer запускает установку
- `configure.py` сканирует root, находит trash files (`Local.testsettings`, `*.vssscc`, `UpgradeLog.htm`) и config files (`*.csproj`, `*.sln`)
- Trash-aware filter: `Local.testsettings` → trash, `*.vssscc` → trash, `UpgradeLog.htm` → trash, `*.csproj`/`*.sln` уже в default-whitelist через patterns
- Trash files НЕ предлагаются в интерактивном меню; в stdout печатается hint: «`Local.testsettings`: trash — add to .gitignore instead»
- Developer видит чистый список (только non-trash) для добавления
- Если developer запустил `--non-interactive` — trash files всё равно пропущены
- **Ссылки:** US-1, US-4

## UC-3: Auto-prune stale entries при pre-commit (после удаления файлов)

Developer удалил файл `foo.testsettings` из репозитория (`git rm foo.testsettings`). При следующем коммите `check.py` (pre-commit hook) автоматически чистит stale entry.

- В `.root-artifacts.yaml` лежит `allow: [foo.testsettings, README.md]`
- `foo.testsettings` удалён, `README.md` существует
- Developer делает `git commit -m "remove foo.testsettings"`
- Pre-commit hook запускает `check.py`
- check.py видит: `foo.testsettings` отсутствует на диске
- check.py атомарно переписывает `.root-artifacts.yaml` без `foo.testsettings`
- Stderr: «forbid-root-artifacts auto-pruned 1 stale entries from .root-artifacts.yaml. Run: git add .root-artifacts.yaml && git commit»
- Exit code 1 (pre-commit framework signal: files were modified)
- Developer делает `git add .root-artifacts.yaml && git commit -m "remove foo.testsettings"`
- Атомарный commit: yaml diff + удаление файла в одном snapshot
- **Ссылки:** US-2 (rewritten as auto-flow), FR-1

## UC-4: Auto-prune disabled — opt-out для juzers, которые не хотят modifying hook

Developer не хочет, чтобы pre-commit hook модифицировал yaml (например использует strict pre-commit policy без auto-fix workflow). Выключает auto-prune.

- `.root-artifacts.yaml` содержит `auto_prune: { enabled: false }`
- Stale entry `foo.testsettings` присутствует в `allow:`, файл удалён с диска
- Pre-commit hook запускает `check.py`
- check.py видит `auto_prune.enabled: false` → skip prune logic
- yaml mtime НЕ меняется
- Exit code 0 (если нет других violations)
- Developer вручную чистит yaml когда удобно
- **Ссылки:** UC-3 (opt-out path), FR-1

## UC-5: Unattended mode для CI/automation

CI пайплайн или automation скрипт запускает install/configure без interactive prompts.

- CI запускает `python configure.py --non-interactive`
- Все CONFIG-файлы добавлены в `allow:`
- Все TRASH-файлы пропущены (даже в non-interactive — это safety default)
- CI получает exit 0
- Если CI хочет принудительно whitelist trash (legitimate edge case) — флаг `--allow-trash`
- Auto-prune активируется через `auto_prune: { enabled: true }` в `.root-artifacts.yaml` (opt-in). При коммите check.py silently удаляет stale entries.
- **Ссылки:** US-1, US-2

## UC-6 (edge): Legitimate whitelist trash файла (--allow-trash override)

Развелось редкое требование — developer хочет whitelist `*.log` файл (например `INSTALL.log` который commited intentionally).

- Repository содержит `INSTALL.log` (intentional commit)
- Developer хочет добавить его в `allow:`
- Default behavior: `configure.py` классифицирует `*.log` как trash, не предлагает
- Developer запускает `python configure.py --allow-trash`
- `INSTALL.log` теперь в interactive menu
- Developer выбирает его, файл добавлен в `allow:`
- **Ссылки:** US-1 (override path)

## UC-7 (edge): Graceful fallback при отсутствии classifier module

После обновления плагина у кого-то остался старый `check.py` без `_classifier.py` (broken upgrade, manual file copy).

- `check.py` пытается `from _classifier import classify_file`
- Import fails (`_classifier.py` отсутствует или corrupt)
- `check.py` логирует в stderr: «WARNING: classifier module missing — using fallback»
- Использует embedded fallback `TRASH_PATTERNS` (минимальный набор)
- Продолжает работать как pre-commit hook
- Не блокирует коммит из-за impedance mismatch
- **Ссылки:** US-4 (failure mode)

## UC-8 (edge): Atomic rollback через git revert

Developer случайно потерял intentional entry — auto-prune удалил из yaml entry, файл которого ещё не закоммичен. Откатывает через git.

- Developer добавил `bar.txt` в `allow:` намереваясь создать файл, но забыл; сделал commit
- На следующем коммите check.py видит `bar.txt` отсутствует → auto-prune удалил
- Developer заметил после `git push`: «упс, я хотел оставить bar.txt»
- Developer делает `git revert HEAD` (последний коммит)
- Atomic rollback: и `bar.txt` восстанавливается в allow, и any deleted files restored
- Это работает потому что auto-prune изменения попали в тот же commit что delete (NFR-Reliability-7)
- **Ссылки:** UC-3 (rollback path), FR-1

## UC-9: LLM classification через Claude CLI subscription

Developer установил плагин с `classifier.mode: hybrid`. В корне файл `weird.unknownext` который не matched ни user trash_patterns, ни default trash patterns, ни config patterns. Hybrid mode дёргает Claude CLI чтобы classify.

- `.root-artifacts.yaml` содержит `classifier: { mode: hybrid }`
- Developer запускает `python configure.py --non-interactive`
- classify_file проходит layered config — `weird.unknownext` не matched
- classify_file видит mode=hybrid → вызывает `llm_classify()`
- `llm_classify` проверяет cache — miss
- `shutil.which('claude')` — found (developer залогинен в Claude Code subscription)
- subprocess: `claude -p "Classify 'weird.unknownext' for repository root presence..." --output-format json`
- Claude отвечает (через subscription): `{"result": "trash"}`
- _classifier парсит → returns `'trash'` → cache put
- configure.py НЕ добавляет `weird.unknownext` в allow:
- На следующем запуске — cache hit, без LLM call
- **Ссылки:** US-1 (extended), FR-3

## UC-10 (edge): LLM fallback при отсутствии Claude CLI (CI без подписки)

Developer запускает плагин в CI окружении где Claude Code CLI не установлен. `mode: hybrid` должен gracefully fallback.

- CI runner запускает `python check.py` в pre-commit
- `.root-artifacts.yaml` содержит `classifier: { mode: hybrid }`
- file `weird.unknownext` в корне (unmatched)
- llm_classify: `shutil.which('claude')` returns None
- Stderr (one-time): «WARNING: claude CLI not in PATH; LLM classification disabled»
- llm_classify returns `'unknown'` для всех unmatched files
- check.py продолжает работу (treats as 'unknown' — добавит к violations или нет в зависимости от whitelist)
- 0 crashes, 0 errors propagated
- **Ссылки:** UC-7 (similar fallback pattern), FR-3, NFR-Reliability-5
