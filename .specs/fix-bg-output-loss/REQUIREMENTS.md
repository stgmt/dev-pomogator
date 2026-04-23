# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-persistent-log-для-docker-testsh-output) | Persistent log для docker-test.sh output | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1), [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-1) | @feature1 | Draft |
| [FR-2](FR.md#fr-2-обновить-rule-no-blocking-on-tests--запрет-naked--tail-в-bg) | Rule update — anti-pattern `\| tail` в bg | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-2) | @feature2 | Draft |
| [FR-3](FR.md#fr-3-directory-lifecycle--dev-pomogatordocker-status-создаётся-безопасно) | Safe directory creation (`mkdir -p`) | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-3) | @feature1 | Draft |
| [FR-4](FR.md#fr-4-log-rotation--gitignore--не-коммитить-test-run-log) | Gitignore verification | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-4) | @feature3 | Draft |
| [FR-5](FR.md#fr-5-exit-code-preservation--regression-guard) | Exit code preservation через pipefail | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-5) | @feature1 | Draft |
| [FR-6](FR.md#fr-6-feedback-memory--anti-pattern-зафиксирован-в-personal-memory--out-of-scope-частично) | Feedback memory | N/A | N/A | OUT OF SCOPE |

## Functional Requirements

- [FR-1: Persistent log для docker-test.sh output](FR.md#fr-1-persistent-log-для-docker-testsh-output)
- [FR-2: Обновить rule `no-blocking-on-tests`](FR.md#fr-2-обновить-rule-no-blocking-on-tests--запрет-naked--tail-в-bg)
- [FR-3: Directory lifecycle — `.dev-pomogator/.docker-status/`](FR.md#fr-3-directory-lifecycle--dev-pomogatordocker-status-создаётся-безопасно)
- [FR-4: Log rotation / gitignore](FR.md#fr-4-log-rotation--gitignore--не-коммитить-test-run-log)
- [FR-5: Exit code preservation](FR.md#fr-5-exit-code-preservation--regression-guard)
- [FR-6: Feedback memory (OUT OF SCOPE)](FR.md#fr-6-feedback-memory--anti-pattern-зафиксирован-в-personal-memory--out-of-scope-частично)

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
