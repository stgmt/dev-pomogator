# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output) | Persistent log для docker-test.sh output | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests-запрет-naked-tail-в-bg) | Rule update — anti-pattern `\| tail` в bg | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-directory-lifecycle-dev-pomogatordocker-status-создаётся-безопасно) | Safe directory creation (`mkdir -p`) | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3) | @feature1 | Draft |
| [FR-4](FR.md#fr-4-log-rotation-gitignore-не-коммитить-test-run-log) | Gitignore verification | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-4) | @feature3 | Draft |
| [FR-5](FR.md#fr-5-exit-code-preservation-regression-guard) | Exit code preservation через pipefail | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-5) | @feature1 | Draft |
| [FR-6](FR.md#fr-6-feedback-memory-anti-pattern-зафиксирован-в-personal-memory-out-of-scope-частично) | Feedback memory | N/A | N/A | OUT OF SCOPE |
| FR-7 | ~~Generic bg-log.sh wrapper~~ DEPRECATED v0.3.0 | ~~AC-7~~ | ~~@feature7~~ | DEPRECATED (replaced by FR-11) |
| FR-8 | Rule update — confirmed Anthropic bug citations | [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8) | N/A | v0.2.0 |
| FR-10 | Cleanup duplicate bg-log.sh (refactor) | [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-cleanup-duplicate-verified) | N/A | v0.3.0 |
| FR-11 | Generic passthrough adapter | [AC-11](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-generic-adapter-integration) | @feature11 | v0.3.0 |
| FR-12 | Smart converter hook | [AC-12](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-smart-converter-deny-message) | @feature12 | v0.3.0 |
| FR-13 | /run-tests SKILL.md description | [AC-13](ACCEPTANCE_CRITERIA.md#ac-13-fr-13-skillmd-description-improvements) | N/A | v0.3.0 |
| FR-14 | Skill trigger analysis report | [AC-14](ACCEPTANCE_CRITERIA.md#ac-14-fr-14-analysis-report-saved) | N/A | v0.3.0 |
| FR-15 | Three-benchmark report | [AC-15](ACCEPTANCE_CRITERIA.md#ac-15-fr-15-benchmark-report-saved) | N/A | v0.3.0 |
| FR-16 | Installer hook path fix (conditional) | [AC-16](ACCEPTANCE_CRITERIA.md#ac-16-fr-16-conditional-installer-hook-path-bug) | N/A | conditional |

## Functional Requirements

- [FR-1: Persistent log для docker-test.sh output](FR.md#fr-1-persistent-log-для-docker-testsh-output)
- [FR-2: Обновить rule `no-blocking-on-tests`](FR.md#fr-2-обновить-rule-no-blocking-on-tests-запрет-naked-tail-в-bg)
- [FR-3: Directory lifecycle — `.dev-pomogator/.docker-status/`](FR.md#fr-3-directory-lifecycle-dev-pomogatordocker-status-создаётся-безопасно)
- [FR-4: Log rotation / gitignore](FR.md#fr-4-log-rotation-gitignore-не-коммитить-test-run-log)
- [FR-5: Exit code preservation](FR.md#fr-5-exit-code-preservation-regression-guard)
- [FR-6: Feedback memory (OUT OF SCOPE)](FR.md#fr-6-feedback-memory-anti-pattern-зафиксирован-в-personal-memory-out-of-scope-частично)
- ~~FR-7: Generic bg-log.sh wrapper (v0.2.0)~~ DEPRECATED v0.3.0 — replaced by FR-11
- FR-8: Rule update — confirmed Anthropic bug citations (v0.2.0)
- FR-10: Cleanup duplicate bg-log.sh (v0.3.0 refactor)
- FR-11: Generic passthrough adapter (v0.3.0)
- FR-12: Smart converter hook (v0.3.0)
- FR-13: /run-tests SKILL.md description (v0.3.0)
- FR-14: Skill trigger analysis report (v0.3.0)
- FR-15: Three-benchmark report (v0.3.0)
- FR-16: Installer hook path fix (v0.3.0 conditional)

## Non-Functional Requirements

- [Performance](NFR.md#performance)
- [Security](NFR.md#security)
- [Reliability](NFR.md#reliability)
- [Usability](NFR.md#usability)

## Acceptance Criteria

- [AC-1 (FR-1): tee создаёт log файл](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)
- [AC-2 (FR-1): output дублируется в log + stdout](ACCEPTANCE_CRITERIA.md#ac-2-fr-1)
- [AC-3 (FR-2): rule содержит anti-pattern секцию](ACCEPTANCE_CRITERIA.md#ac-3-fr-2)
- [AC-4 (FR-3): mkdir -p перед write'ом](ACCEPTANCE_CRITERIA.md#ac-4-fr-3)
- [AC-5 (FR-4): gitignore проверен](ACCEPTANCE_CRITERIA.md#ac-5-fr-4)
- [AC-6 (FR-5): exit code сохраняется](ACCEPTANCE_CRITERIA.md#ac-6-fr-5)
- ~~AC-7 (FR-7): bg-log.sh smoke + exit code + mkdir + sanitization + no-args~~ DEPRECATED v0.3.0 (replaced by AC-11)
- [AC-10 (FR-10): cleanup verified](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-cleanup-duplicate-verified)
- [AC-11 (FR-11): generic adapter smoke + integration](ACCEPTANCE_CRITERIA.md#ac-11-fr-11-generic-adapter-integration)
- [AC-12 (FR-12): smart converter deny-message](ACCEPTANCE_CRITERIA.md#ac-12-fr-12-smart-converter-deny-message)
- [AC-13 (FR-13): SKILL.md keywords + Generic mode section](ACCEPTANCE_CRITERIA.md#ac-13-fr-13-skillmd-description-improvements)
- [AC-14 (FR-14): analysis report saved](ACCEPTANCE_CRITERIA.md#ac-14-fr-14-analysis-report-saved)
- [AC-15 (FR-15): benchmark report saved](ACCEPTANCE_CRITERIA.md#ac-15-fr-15-benchmark-report-saved)
- [AC-16 (FR-16): installer hook path bug (conditional)](ACCEPTANCE_CRITERIA.md#ac-16-fr-16-conditional-installer-hook-path-bug)
- [AC-8 (FR-8): rule 4 issue links + file-redirect pattern + bg-log.sh reference](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)
