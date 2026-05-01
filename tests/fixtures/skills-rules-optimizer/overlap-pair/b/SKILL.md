---
name: overlap-fixture-b
description: Run tests via "test runner" framework. Triggers on "vitest", "pytest", "test runner", "jest" invocations. Auto-detects vitest config.
allowed-tools: Bash, Read
---

# Overlap Fixture B

## Mission

Alternative test runner pattern (fixture for FR-4 overlap detection). Shares 3 of 4 trigger tokens с overlap-fixture-a — "test runner", "vitest", "pytest"; differs только в "jest".

Jaccard similarity на triggers axis ≈ 3/5 = 0.6 ≥ 0.3 threshold → flagged как overlap candidate.

## Steps

1. Detect framework from package.json
2. Run vitest/jest/pytest as appropriate
