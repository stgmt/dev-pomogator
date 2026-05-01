---
name: overlap-fixture-a
description: Run tests through "test runner" wrapper. Triggers on "vitest", "pytest", "test runner" invocations. Auto-detects framework.
allowed-tools: Bash, Read
---

# Overlap Fixture A

## Mission

Centralized test runner pattern (fixture for FR-4 overlap detection). Trigger phrases share 3 of 4 tokens с overlap-fixture-b: "test runner", "vitest", "pytest".

## Steps

1. Detect framework from project config
2. Build invocation command
3. Run via Bash wrapper
