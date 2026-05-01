---
name: transitive-references-fixture
description: This skill references A.md which references B.md (depth-2 chain). Anthropic anti-pattern. Triggers on "transitive test".
allowed-tools: Read
---

# Transitive References (Fixture: nested chain anti-pattern)

## Mission

Test fixture для transitive references audit warning. Anthropic explicit guidance: references one-level-deep only. Chain `SKILL.md → A.md → B.md` — violation.

## References

- See [references/A.md](references/A.md) for the first-level extension.
