# Changelog

All notable changes to this feature will be documented in this file.

## [Unreleased]

### Added
- Спека architecture-decision-builder: 11 FR, 11 AC (EARS), 15 CHK, 6 Key Decisions, SCHEMA (6 JSON envelopes + pipeline), 11 BDD scenarios (@feature1..@feature11), 30 TASKS (TDD-порядок)
- FR-11 Eval suite: 2-слойный debug/benchmark (deterministic CLI evals + qualitative rubric R1-R9 с R3 anti-hallucination); golden bench scenario-bhph

### Changed
- FR-4 + FR-7: Phase 1.75 теперь auto-mode по умолчанию — авто-применение рекомендации без блокирующего STOP на каждой оси (паттерн «делай/начинай»); interactive-mode opt-in через `--interactive`. Override через финальный batch-review

### Fixed
- N/A

## [0.1.0] - TBD

### Added
- Initial implementation (планируется): subskill + 9 helper scripts + 2 rules + 2 templates + create-spec Phase 1.75 integration + ARCHITECTURE_COVERAGE audit category
