# Requirements Index

## Traceability Matrix

| ID | Name | Linked AC | @featureN | Status |
|----|------|-----------|-----------|--------|
| [FR-1](FR.md#fr-1-remove-cursor-only-functions-from-memoryts) | Remove Cursor-only functions | [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-no-cursor-exports-in-memoryts) | @feature1 | Done |
| [FR-2](FR.md#fr-2-remove-dead-helper-functions-from-memoryts) | Remove dead helpers | [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-no-dead-helpers-in-memoryts) | @feature2 | Done |
| [FR-3](FR.md#fr-3-remove-dead-cursor-code-from-updaterindexts) | Remove updater dead code | [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-no-cursor-code-in-updater) | @feature3 | Done |
| [FR-4](FR.md#fr-4-simplify-unreachable-ternary-branches) | Simplify ternary | [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-no-cursor-ternary) | @feature4 | Done |
| [FR-5](FR.md#fr-5-update-outdated-comments) | Update comments | [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-fr-6-shared-functions-intact) | @feature5 | Done |
| [FR-6](FR.md#fr-6-preserve-shared-functions) | Preserve shared functions | [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-regression-safety) | @feature6 | Done |

## NFR Summary

| Category | Requirement |
|----------|-------------|
| Reliability | Build и тесты не ломаются |
| Usability | memory.ts уменьшается на 39% |
