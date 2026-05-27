# Functional Requirements (FR)

## FR-1: Auto-prune stale allow entries в check.py

`check.py` (pre-commit hook) ОБЯЗАН после загрузки `.root-artifacts.yaml` проверить каждый entry в `allow:` на существование на диске. Если entry указывает на отсутствующий файл — silently удалить из в-памяти копии конфига AND переписать `.root-artifacts.yaml` атомарно (через temp-file + `os.replace`).

Pre-commit framework standard `«hooks that fix or format code»` поведение применяется: при модификации файлов hook-ом коммит фейлится с сообщением «files were modified by this hook». User делает `git add .root-artifacts.yaml` и повторяет `git commit` — изменения yaml попадают в коммит вместе с удалёнными файлами (atomic, git revert friendly).

Auto-prune отключается через `auto_prune: { enabled: false }` в `.root-artifacts.yaml`. Default — `enabled: true`.

При работе только с basenames — entries содержащие `/`, `\`, `..`, `\0` пропускаются с WARN (NFR-Security path traversal protection).

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-1), [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-1)
**Use Case:** [UC-3](USE_CASES.md#uc-3-cleanup-stale-entries-после-удаления-файлов---prune), [UC-4](USE_CASES.md#uc-4-continuous-detection-через-checkpy-pre-commit), [UC-8](USE_CASES.md#uc-8-edge-stale-entries-удалены-интерактивно-при-confirmation-n)
**User Story:** [US-2](USER_STORIES.md#user-story-2---prune-mode-для-cleanup-stale-entries-priority-p1), [US-3](USER_STORIES.md#user-story-3-warn-в-checkpy-о-stale-entries-priority-p1)

## FR-2: User-configurable trash classification

`configure.py` ОБЯЗАН классифицировать root-файлы используя СЛОЯМ конфигурации (priority desc):

1. `classifier.mode` из `.root-artifacts.yaml` (default `hybrid`)
2. User trash patterns: `trash_patterns:` секция в `.root-artifacts.yaml`
3. Default trash patterns: `trash_patterns_default:` из `default-whitelist.yaml` (плагин-поставляемый), активирован если `use_default_trash_patterns: true` (default)
4. (Если mode=llm/hybrid И classify не определилось) — вызов `claude -p` через CLI subscription
5. Final fallback — `unknown`

Классификация решает должен ли файл быть offered в interactive menu / автоматически добавлен в `--non-interactive`:
- `trash` → НЕ predлагается, печатается hint «add to .gitignore» (для `*.testsettings` — ссылка на Microsoft SettingsMigrator)
- `config` → автоматически добавляется (или offered)
- `unknown` → offered в interactive, в `--non-interactive` пропускается (без user decision)

Override flag `--allow-trash` отключает trash filter полностью (legitimate edge case — UC-6).

Хардкод TRASH_PATTERNS в Python запрещён — все patterns приходят из yaml.

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-2), [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-2), [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-2)
**Use Case:** [UC-1](USE_CASES.md#uc-1-первичная-установка-плагина-на-чистый-репозиторий-happy-path), [UC-2](USE_CASES.md#uc-2-установка-на-legacy-vs-репозиторий), [UC-6](USE_CASES.md#uc-6-edge-legitimate-whitelist-trash-файла---allow-trash-override)
**User Story:** [US-1](USER_STORIES.md#user-story-1-trash-aware-configurepy-priority-p1)

## FR-3: LLM-driven classification через Claude Code CLI subscription

Когда `classifier.mode` ∈ {`llm`, `hybrid`} И classification не определилось layered config'ом — плагин ОБЯЗАН вызвать Claude Code CLI: `claude -p '<prompt>' --output-format json`. Промпт фиксированной формы:

```
Classify the file '{filename}' for repository root presence.
Reply with EXACTLY ONE word: trash | config | unknown.
- trash: build artifacts, temp files, IDE state, deprecated formats
- config: legitimate project config or documentation
- unknown: cannot determine
```

Парсинг — first non-whitespace token из stdout JSON `result` field (per Claude Code CLI spec).

**Constraints:**
- 0 API keys, 0 env vars, 0 secrets — только subscription через CLI.
- Если `shutil.which('claude')` is None → graceful fallback `'unknown'` без error (NFR-Reliability).
- Timeout: `classifier.llm.timeout_seconds` (default 30s). При timeout → fallback `'unknown'`.
- Cache results в `.dev-pomogator/.classifier-cache.json`: `{filename: {result, timestamp}}`. TTL `classifier.llm.cache_ttl_seconds` (default 86400 = 24h).
- При cache hit — НЕ вызывать CLI повторно.
- Errors (CLI returns non-zero, malformed JSON, parse failure) → fallback `'unknown'` + log в stderr.

В `mode: hybrid` LLM вызывается ТОЛЬКО для truly unknown файлов (не matched ни trash_patterns ни config_patterns). В `mode: llm` LLM вызывается для всех unmatched файлов.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-3), [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-3), [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-3)
**Use Case:** [UC-9](USE_CASES.md#uc-9-llm-classification-через-claude-cli-subscription), [UC-10](USE_CASES.md#uc-10-edge-llm-fallback-при-отсутствии-claude-cli)
**User Story:** [US-1](USER_STORIES.md#user-story-1-trash-aware-configurepy-priority-p1) (extended)

## FR-4: Shared classifier module + extended yaml config

`_classifier.py` ОБЯЗАН быть консолидированным module для:
- Загрузки classifier config из `.root-artifacts.yaml` + `default-whitelist.yaml` (merge layers)
- Функция `classify_file(filename, classifier_config) → 'trash' | 'config' | 'unknown'` с layered logic
- Опциональный `llm_classify(filename, llm_config, cache) → ...` invocation Claude Code CLI subprocess
- Cache I/O для LLM results
- Graceful fallback при missing CLI / timeout / parse error

И `check.py`, и `configure.py` ОБЯЗАНЫ импортировать: `from _classifier import classify_file, load_classifier_config, find_stale_allow_entries`.

`_classifier.py` ОБЯЗАН быть указан в `extension.json → toolFiles[]`.

**Расширение yaml format** (backward compatible — все новые поля optional):
- `.root-artifacts.yaml` поддерживает: `trash_patterns: [...]`, `config_patterns: [...]`, `classifier: { mode, llm: { cli, timeout_seconds, cache_ttl_seconds } }`, `auto_prune: { enabled }`, `use_default_trash_patterns: bool`
- `default-whitelist.yaml` поддерживает: `trash_patterns_default: [...]` (плагин поставляет VS legacy: `*.vssscc`, `*.vspscc`, `*.testsettings`, `UpgradeLog*.htm`, `UpgradeLog*.XML`, `*.suo`, `*.user`)

При отсутствии `_classifier.py` (broken upgrade) — `check.py` graceful fallback на minimal embedded `_FALLBACK_TRASH_PATTERNS` + WARN в stderr (NFR-Reliability).

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-4), [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-4), [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-4)
**Use Case:** [UC-7](USE_CASES.md#uc-7-edge-graceful-fallback-при-отсутствии-classifier-module)
**User Story:** [US-4](USER_STORIES.md#user-story-4-shared-classifier-module-priority-p1)

## FR-5 (out of scope): Migration helper для существующих stale YAML в downstream repos

> OUT OF SCOPE — Auto-prune в pre-commit (FR-1) сам мигрирует существующие YAMLs при первом коммите downstream-проекта. Дополнительная migration tool не нужна.
>
> Связанные UC, AC и User Stories также должны быть помечены `> OUT OF SCOPE — см. FR-5`.

## FR-6 (out of scope): Multi-LLM provider support (OpenAI, local, etc.)

> OUT OF SCOPE — На старт только Claude Code CLI (subscription). Если в будущем появится потребность в других provider'ах (OpenAI API, local Ollama и т.д.) — отдельная спека. Текущий design `classifier.llm.cli: claude` подразумевает что provider — это бинарь в PATH; при необходимости можно расширить через `provider:` discriminator, но сейчас не делаем.
>
> Связанные UC, AC и User Stories также должны быть помечены `> OUT OF SCOPE — см. FR-6`.
