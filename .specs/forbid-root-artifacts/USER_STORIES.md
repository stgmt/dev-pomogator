# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).
> Skill `discovery-forms` auto-populates this file during Phase 1. Hook `user-story-form-guard` enforces the form at Write/Edit time.

### User Story 1: Trash-aware configure.py (Priority: P1)

As a developer installing dev-pomogator on a legacy repository, I want `configure.py` to refuse adding obvious trash files (*.log, *.testsettings, *.vssscc, UpgradeLog.htm) to the `allow:` list, so that the plugin does not legalize the very artifacts it was designed to forbid.

**Why:** В инциденте MR-5993 (MS-18576) configure.py добавил `Local.testsettings`, `MobileSmarts.Common.vssscc`, `UpgradeLog.htm` в whitelist через `--non-interactive` / "all" shortcut. Внешний reviewer Лазарев квалифицировал это как «шум, который не должен быть в fix-MR» — плагин подорвал доверие к самому себе.

**Independent Test:** На pre-existing legacy репозитории с VS-артефактами (`*.testsettings`, `*.vssscc`, `UpgradeLog.htm`) запустить `python configure.py --non-interactive`. Проверить итоговый `.root-artifacts.yaml`: VS-артефакты НЕ в `allow:`, в stdout напечатаны hint'ы вида «add to .gitignore».

**Acceptance Scenarios:**

Given репозиторий содержит `Local.testsettings` в корне
And `.root-artifacts.yaml` отсутствует
When developer запускает `python configure.py --non-interactive`
Then `Local.testsettings` НЕ появляется в `allow:` сохранённого YAML
And stdout содержит строку «`Local.testsettings`: trash — add to .gitignore instead»

Given репозиторий содержит `pyproject.toml` (legitimate config) и `*.vssscc` (VS legacy)
When developer запускает `python configure.py --non-interactive`
Then `pyproject.toml` добавлен в `allow:` (config classification)
And `*.vssscc` НЕ добавлен в `allow:` (trash classification)

Given developer всё-таки хочет whitelist trash файл (legitimate edge case)
When он запускает `python configure.py --non-interactive --allow-trash`
Then trash files тоже добавлены в `allow:` (override flag respected)

---

### User Story 2: Auto-prune stale allow entries в pre-commit (Priority: P1)

As a developer working in a long-lived repository, I want `check.py` (pre-commit hook) to automatically remove `allow:` entries that no longer exist on disk, so that `.root-artifacts.yaml` stays continuously in sync with reality without me running maintenance commands or external reviewers seeing «files we don't have».

**Why:** В инциденте MR-5993 (MS-18576) reviewer увидел в `.root-artifacts.yaml` записи `Local.testsettings`, `MobileSmarts.Common.vssscc`, `UpgradeLog.htm` и квалифицировал как «у нас нет таких файлов / шум, не должно быть в fix-MR». Без auto-prune drift между YAML и реальностью растёт незаметно до code review где это бьёт по trust. Auto-fix в pre-commit (как у `prettier`/`black`/`ruff format`) делает sync continuous.

**Independent Test:** Создать `.root-artifacts.yaml` с `allow: [foo.testsettings, README.md]` (foo.testsettings не существует, README.md есть). Запустить `python check.py` как pre-commit hook (auto_prune.enabled default true). Проверить: exit code 1, yaml переписан без foo.testsettings, stderr содержит actionable hint про `git add` + retry.

**Acceptance Scenarios:**

Given `.root-artifacts.yaml` содержит `allow: [foo.testsettings, README.md]`
And `foo.testsettings` отсутствует в репозитории
And `README.md` существует
And `auto_prune.enabled` is true (default)
When developer запускает `python check.py` (pre-commit hook)
Then exit code is 1 (pre-commit framework signal: files modified)
And `.root-artifacts.yaml` is rewritten без foo.testsettings (atomic save)
And stderr содержит «forbid-root-artifacts auto-pruned 1 stale entries»
And stderr содержит «Run: git add .root-artifacts.yaml && git commit»

Given `.root-artifacts.yaml` содержит `auto_prune: { enabled: false }`
And в YAML есть stale entries
When developer запускает `python check.py`
Then yaml mtime НЕ меняется
And exit code 0 (если нет других violations)

Given allow entry содержит path traversal characters (`../escape.txt`)
When check.py обрабатывает entry
Then entry пропускается (НЕ удаляется как stale)
And stderr содержит «WARNING: skipping non-basename allow entry: ../escape.txt»

---

### User Story 3: LLM-driven classification через Claude Code subscription (Priority: P1)

As a developer using Claude Code CLI subscription, I want optional LLM-driven classification of unknown root files via `claude -p '<prompt>'` subprocess, so that ambiguous files (not in static patterns) get smart trash/config decisions without me adding API keys or external services.

**Why:** Hardcoded TRASH_PATTERNS не покрывают edge cases (новые форматы, custom build artifacts конкретного проекта). User уже залогинен в Claude Code subscription — естественно использовать её для классификации, без отдельных API keys. `mode: hybrid` = static patterns first (fast/offline), LLM только для truly unknown — оптимальный баланс между UX, скоростью и stability.

**Independent Test:** Создать fake `claude` бинарь в test PATH который возвращает `{"result":"trash"}`. Настроить `.root-artifacts.yaml` с `classifier: { mode: hybrid }`. Создать файл `weird.unknownext` (не matched static patterns). Запустить `python configure.py --non-interactive`. Проверить: claude CLI invoked один раз, файл НЕ в allow, cache содержит entry для weird.unknownext.

**Acceptance Scenarios:**

Given `.root-artifacts.yaml` содержит `classifier: { mode: hybrid }`
And файл «weird.unknownext» не matched static patterns
And `claude` бинарь доступен в PATH
And cache не содержит entry для «weird.unknownext»
When configure.py classifies «weird.unknownext»
Then `claude -p '<prompt>' --output-format json` вызывается subprocess'ом
And `<prompt>` contains "weird.unknownext"
And результат сохраняется в `.dev-pomogator/.classifier-cache.json`

Given `shutil.which('claude')` returns None (CI без Claude Code)
And classifier.mode = hybrid
When configure.py classifies unmatched file
Then classify returns `'unknown'` без crash
And stderr содержит one-time WARN «claude CLI not in PATH; LLM classification disabled»

Given cache содержит valid entry для «cached.unknownext» младше TTL
When configure.py classifies «cached.unknownext»
Then claude subprocess НЕ вызывается
And classify возвращает cached результат

---

### User Story 4: Shared classifier module + yaml-driven configuration (Priority: P1)

As a maintainer of the forbid-root-artifacts plugin, I want classification logic consolidated в `_classifier.py` shared module + ВСЕ patterns (trash/config) приходят из yaml (`.root-artifacts.yaml` + `default-whitelist.yaml`), не из hardcoded Python constants, so that adding a new pattern requires no code change AND user сам решает что считать мусором (per «мусор не мусор решают юзеры»).

**Why:** Сейчас `TRASH_PATTERNS` живёт только в `check.py:157-181`, hardcoded в Python; `configure.py` не импортирует — drift risk. Добавление паттерна требует code release. User direction: user-side initiative — решение «что мусор» должно быть в config, не baked-in opinion разработчика плагина. VS legacy patterns переезжают в `default-whitelist.yaml` как opinionated default который user может выключить.

**Independent Test:** `grep -rn "^TRASH_PATTERNS = " extensions/forbid-root-artifacts/tools/forbid-root-artifacts/*.py` → пусто (кроме `_FALLBACK_TRASH_PATTERNS` в check.py для graceful degradation). `default-whitelist.yaml` содержит `trash_patterns_default:` секцию. И `check.py`, и `configure.py` импортируют `from _classifier import classify_file, load_classifier_config`.

**Acceptance Scenarios:**

Given исходники плагина после рефакторинга
When maintainer запускает `grep -rn "^TRASH_PATTERNS = " на .py files`
Then результат пуст (ни одного hardcoded TRASH_PATTERNS list в Python)
And `default-whitelist.yaml` содержит `trash_patterns_default:` секцию
And `check.py` содержит `from _classifier import`
And `configure.py` содержит `from _classifier import`
And `_classifier.py` экспортирует `load_classifier_config`, `classify_file`, `find_stale_allow_entries`

Given maintainer добавляет новый pattern `*.cache` в `default-whitelist.yaml → trash_patterns_default`
When он запускает `python configure.py` без других изменений
Then новый pattern применяется (file `weird.cache` НЕ добавлен в allow)
When он запускает `python check.py` без других изменений
Then тот же pattern применяется (yaml-driven hot reload)

Given кто-то накатил старую версию `check.py` поверх новой (broken upgrade)
And `_classifier.py` отсутствует
When `check.py` запускается
Then graceful fallback — embedded `_FALLBACK_TRASH_PATTERNS` (минимальный набор) используется как safety net
And в stderr WARN «classifier module missing — using fallback»
