# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/_classifier.py` | create | [FR-4](FR.md#fr-4-shared-classifier-module--extended-yaml-config) — новый shared module: ClassifierConfig dataclass + load_classifier_config() + classify_file() + llm_classify() (Claude CLI subprocess) + find_stale_allow_entries() + cache I/O |
| `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/check.py` | edit | [FR-1](FR.md#fr-1-auto-prune-stale-allow-entries-в-checkpy) + [FR-4](FR.md#fr-4-shared-classifier-module--extended-yaml-config) — заменить inline TRASH_PATTERNS на `from _classifier import ...` с graceful fallback (`_FALLBACK_TRASH_PATTERNS`); добавить auto-prune logic (после load yaml → find_stale → if stale: atomic save + exit 1) |
| `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/configure.py` | edit | [FR-2](FR.md#fr-2-user-configurable-trash-classification) + [FR-3](FR.md#fr-3-llm-driven-classification-через-claude-code-cli-subscription) + [FR-4](FR.md#fr-4-shared-classifier-module--extended-yaml-config) — `from _classifier import ...`; trash filter в `find_files_not_in_whitelist()` через layered classify_file; `--allow-trash` flag; atomic save fix для existing `save_user_config()` |
| `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/default-whitelist.yaml` | edit | [FR-4](FR.md#fr-4-shared-classifier-module--extended-yaml-config) — добавить `trash_patterns_default:` секцию с VS legacy (vssscc, vspscc, testsettings, UpgradeLog*, suo, user) per RESEARCH.md |
| `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/.root-artifacts.yaml.template` | edit | [NFR-Usability-3](NFR.md#usability) — добавить commented-out примеры новых секций (trash_patterns, classifier, auto_prune, use_default_trash_patterns) для discoverability |
| `extensions/forbid-root-artifacts/extension.json` | edit | [FR-4](FR.md#fr-4-shared-classifier-module--extended-yaml-config) — `toolFiles[]` += `_classifier.py`; bump version 1.0.0 → 1.1.0; description mention auto-prune + LLM |
| `tests/e2e/forbid-root-artifacts.test.ts` | edit | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-cross-cutting-verification) — добавить describe-блоки `Auto-Prune` (PLUGIN004_AUTOPRUNE_01..03), `Trash Classification` (PLUGIN004_TRASH_01..03), `LLM Classification` (PLUGIN004_LLM_01..03), `Shared Classifier` (PLUGIN004_CLASS_01..03) |
| `tests/features/plugins/forbid-root-artifacts/PLUGIN004_forbid-root-artifacts.feature` | edit | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-cross-cutting-verification) — расширить existing 9 Scenarios новыми (12 новых per CHK matrix); 1:1 mapping с it() в test файле |
| `.specs/forbid-root-artifacts/forbid-root-artifacts.feature` | edit | spec-test-sync — заполнить spec .feature scenarios per FR-1..FR-4 с @feature1..@feature4 теги (12 scenarios) |
| `extensions/forbid-root-artifacts/README.md` | edit | [NFR-Usability-3, NFR-Usability-5](NFR.md#usability) — задокументировать новые yaml секции (trash_patterns, classifier mode, auto_prune); раздел «Auto-prune behavior» (как pre-commit modifies yaml + atomic re-stage workflow); link на Microsoft SettingsMigrator; CHANGELOG entry |
| `.gitignore` (target projects) | document only | NFR-Security-5 — `.dev-pomogator/.classifier-cache.json` должен быть в .gitignore (уже покрыт через managed gitignore marker block в personal-pomogator) |
| `.specs/forbid-root-artifacts/CHANGELOG.md` | edit | spec changelog: добавить entry «v1 — Phase 2 complete: auto-prune in pre-commit + user-configurable classification + Claude CLI LLM integration + shared classifier module» с reference на MR-5993 incident |
