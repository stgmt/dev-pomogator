# Changelog

All notable changes to this feature will be documented in this file.

## [1.1.0] - 2026-05-08

Phase 2 v2 implementation. Motivation: MR-5993 incident (cleverence ms-smarts MS-18576) where external reviewer Лазарев flagged `Local.testsettings`, `MobileSmarts.Common.vssscc`, `UpgradeLog.htm` in `.root-artifacts.yaml` as "files we don't have" — VS legacy artifacts that `configure.py` had whitelisted via `--non-interactive` / "all" shortcut, then accumulated as stale after the files were removed.

### Added

- **FR-1: Auto-prune stale allow entries в pre-commit** — `check.py` теперь при каждом pre-commit запуске silently удаляет из `.root-artifacts.yaml` записи, указывающие на отсутствующие на диске файлы. Atomic save (NFR-Security-3) + actionable stderr message → user делает `git add` + retry, изменения yaml попадают в тот же commit что и удаления (atomic, git revert friendly per NFR-Reliability-7). Opt-out через `auto_prune: { enabled: false }`.
- **FR-2: User-configurable trash classification** — TRASH_PATTERNS теперь yaml-driven (не Python constants):
  - `.root-artifacts.yaml` секции: `trash_patterns:`, `config_patterns:`, `use_default_trash_patterns: bool`
  - `default-whitelist.yaml` секции: `trash_patterns_default:`, `config_patterns_default:`
  - VS legacy patterns (`*.vssscc`, `*.vspscc`, `*.testsettings`, `UpgradeLog*.htm`, `UpgradeLog*.XML`, `*.suo`, `*.user`) переехали в плагин-shipped defaults; user отключает через `use_default_trash_patterns: false`
  - `--allow-trash` flag в configure.py для legitimate edge case override
  - Specialized hint для `*.testsettings` ссылается на Microsoft SettingsMigrator
- **FR-3: LLM-driven classification через Claude Code CLI subscription** — новый hybrid mode (default) вызывает `claude -p '<prompt>' --output-format json` для unmatched файлов:
  - 0 API keys, 0 env vars, 0 secrets — использует существующую Claude Code subscription
  - Cache в `.dev-pomogator/.classifier-cache.json` (24h TTL по default, configurable)
  - Graceful fallback `'unknown'` если `claude` нет в PATH (CI scenarios)
  - Modes: `config` (yaml only), `llm` (always LLM), `hybrid` (default — yaml first, LLM для unknown)
- **FR-4: Shared `_classifier.py` module** — single source of classification truth:
  - `ClassifierConfig` dataclass + `load_classifier_config()` + `classify_file()` + `llm_classify()` + `find_stale_allow_entries()` + cache I/O
  - Both `check.py` and `configure.py` import from `_classifier.py`
  - Embedded `_FALLBACK_TRASH_PATTERNS` в check.py для graceful degradation при broken upgrade (UC-7, NFR-Reliability-1)
- **12 новых BDD сценариев** (PLUGIN004_AUTOPRUNE_01..03, PLUGIN004_TRASH_01..03, PLUGIN004_LLM_01..03, PLUGIN004_CLASS_01..03) + 1:1 mapping с it() в `tests/e2e/forbid-root-artifacts.test.ts`
- **`createFakeClaudeStub` helper** в `tests/e2e/helpers.ts` для cross-platform mocking Claude CLI subprocess в LLM tests (no precedent в codebase до этого)

### Changed

- `extension.json` version 1.0.0 → 1.1.0 (minor — backward compat preserved)
- `extension.json` description расширен mention auto-prune + LLM
- `extension.json` toolFiles[] += `_classifier.py`
- `configure.py save_user_config` теперь atomic (temp + fsync + os.replace) — fix existing pre-fix bug
- `.root-artifacts.yaml.template` расширен commented examples всех новых секций для discoverability
- `default-whitelist.yaml` расширен `trash_patterns_default:` (55 patterns: VS legacy + temp/log/cache + OS junk + IDE junk + spec progress) и `config_patterns_default:` (21 pattern: well-known config files + scripts)
- README: новые разделы про Configuration v1.1.0 secrets, Auto-prune behavior workflow, LLM classification

### Fixed

- **MR-5993 root cause** (cleverence ms-smarts MS-18576): `.root-artifacts.yaml` накапливающий stale entries без auto-cleanup. Auto-prune (FR-1) предотвращает повторение incident-а — yaml continuously синхронизируется с disk state, не уходит в drift до code review.
- Existing bug `save_user_config` non-atomic — могла оставить YAML corrupt при interrupt mid-write. Теперь atomic temp+os.replace.

### Verification

- 27/27 PLUGIN004 scenarios pass (15 existing + 12 new) — `npm test -- forbid-root-artifacts.test.ts` через `/run-tests`
- `validate-spec.ts` — 0 errors
- `audit-spec.ts` — 0 ERRORS (14 LOGIC_GAPS / 7 FANTASIES warnings — non-blocking)
- 12 CHK rows в REQUIREMENTS.md Verification Matrix — все Draft, переходят в Verified после implementation lands в main

### References

- Spec: [`.specs/forbid-root-artifacts/`](./)
- Plan: `~/.claude/plans/imperative-fluttering-hejlsberg.md`
- Incident: cleverence ms-smarts MR-5993 (MS-18576), reviewer Лазарев, 2026-05-06

## [0.1.0] - TBD

### Added
- Initial plugin implementation (pre-MR-5993)
