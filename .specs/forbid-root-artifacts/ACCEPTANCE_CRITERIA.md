# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-auto-prune-stale-allow-entries-в-checkpy)

WHEN check.py запускается в pre-commit AND `.root-artifacts.yaml` содержит ≥1 stale entry (запись на отсутствующий файл) AND `auto_prune.enabled` is true (default), THEN check.py SHALL атомарно (через temp-file + os.replace) переписать `.root-artifacts.yaml` без stale entries AND pre-commit framework SHALL вернуть exit code 1 (modified files signal) AND stderr SHALL содержать «forbid-root-artifacts auto-pruned N stale entries from .root-artifacts.yaml».

## AC-2 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-auto-prune-stale-allow-entries-в-checkpy)

IF `.root-artifacts.yaml` содержит `auto_prune: { enabled: false }`, THEN check.py SHALL НЕ переписывать yaml AND SHALL вернуть exit code 0 (если нет других violations) AND `.root-artifacts.yaml` mtime SHALL остаться неизменным.

## AC-3 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-auto-prune-stale-allow-entries-в-checkpy)

WHEN allow entry содержит path traversal characters (`/`, `\`, `..`, `\0`), THEN check.py SHALL пропустить этот entry (НЕ удалять, НЕ помечать как stale) AND SHALL напечатать в stderr «WARNING: skipping non-basename allow entry: ENTRY».

## AC-4 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-user-configurable-trash-classification)

WHEN configure.py запускается AND `.root-artifacts.yaml` имеет `trash_patterns: ["*.testsettings"]` AND repo root содержит «foo.testsettings», THEN configure.py SHALL классифицировать «foo.testsettings» как `trash` AND SHALL НЕ предлагать его в interactive menu AND SHALL печатать в stdout «`foo.testsettings`: trash — add to .gitignore instead».

## AC-5 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-user-configurable-trash-classification)

IF `.root-artifacts.yaml` имеет `use_default_trash_patterns: true` (default) AND `default-whitelist.yaml` содержит `trash_patterns_default: ["*.vssscc"]` AND repo root содержит «foo.vssscc», THEN classify_file SHALL вернуть `trash`. IF user устанавливает `use_default_trash_patterns: false`, THEN тот же файл SHALL вернуть `unknown` (если LLM disabled) или результат LLM call (если enabled).

## AC-6 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-user-configurable-trash-classification)

WHEN configure.py обнаруживает файл `*.testsettings` AND classify_file вернул `trash`, THEN stdout SHALL содержать специализированный hint: «`FILENAME`: deprecated VS test settings — see https://learn.microsoft.com/en-us/visualstudio/test/migrate-testsettings-to-runsettings» (вместо generic «add to .gitignore»).

## AC-7 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-llm-driven-classification-через-claude-code-cli-subscription)

WHEN classifier.mode = `hybrid` AND файл не matched ни trash_patterns ни config_patterns AND `claude` бинарь доступен в PATH AND cache не содержит entry для filename, THEN _classifier SHALL вызвать `claude -p '<prompt>' --output-format json` AND SHALL парсить first non-whitespace token из stdout JSON `result` field AND SHALL сохранить результат в `.dev-pomogator/.classifier-cache.json` с timestamp.

## AC-8 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-llm-driven-classification-через-claude-code-cli-subscription)

IF `shutil.which('claude')` is None AND classifier.mode ∈ {`llm`, `hybrid`}, THEN _classifier SHALL вернуть `unknown` для unmatched файла AND SHALL не падать с error AND SHALL логировать одну informational строку в stderr: «WARNING: claude CLI not in PATH; LLM classification disabled».

## AC-9 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-llm-driven-classification-через-claude-code-cli-subscription)

WHEN `.dev-pomogator/.classifier-cache.json` содержит valid entry для filename younger than `cache_ttl_seconds` (default 86400), THEN _classifier SHALL вернуть cached результат AND SHALL НЕ вызывать `claude` subprocess AND SHALL НЕ модифицировать cache file.

## AC-10 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-shared-classifier-module-extended-yaml-config)

WHEN maintainer запускает `grep -rn "TRASH_PATTERNS\|trash_patterns" extensions/forbid-root-artifacts/tools/forbid-root-artifacts/*.py`, THEN результат SHALL показать NO hardcoded TRASH_PATTERNS list в `*.py` (кроме `_FALLBACK_TRASH_PATTERNS` в check.py для graceful degradation) AND `_classifier.py` SHALL содержать функцию `load_classifier_config(repo_root, plugin_dir) → ClassifierConfig` которая читает obа yaml файла и merges layers.

## AC-11 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-shared-classifier-module-extended-yaml-config)

WHEN maintainer добавляет новый pattern в `default-whitelist.yaml → trash_patterns_default: [...]` (плагин-side config), THEN последующий запуск check.py AND configure.py SHALL применять новый pattern без изменений в `*.py` files (yaml-driven, hot-reload at process start).

## AC-12 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-shared-classifier-module-extended-yaml-config)

IF `_classifier.py` отсутствует (broken upgrade scenario, see UC-7), THEN `check.py` SHALL не crash AND SHALL использовать embedded `_FALLBACK_TRASH_PATTERNS` (минимум 6 universal patterns) AND SHALL напечатать в stderr «WARNING: classifier module missing — using fallback» AND SHALL продолжить работу как pre-commit hook (exit 0/1 normally).

## AC-13: Cross-cutting verification

WHEN developer запускает test suite (`/run-tests` или `npx vitest run tests/e2e/forbid-root-artifacts.test.ts`), THEN ALL existing PLUGIN004 scenarios SHALL pass AND new PLUGIN004_NN scenarios для FR-1..FR-4 SHALL pass.
