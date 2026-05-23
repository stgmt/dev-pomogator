# Fixtures

## Overview

Spec-status skill требует fixtures для integration tests: (a) mock spec со known AC checklist состоянием для UC-1/UC-2 (verified vs claimed scenarios); (b) sample test files с weak/strong/fake-positive assertion patterns для UC-4 (test quality audit); (c) .test-status YAML samples в трёх состояниях (fresh, stale, completed) для UC-3 (environmental block detection).

Все fixtures static — без factory generation. Cleanup per-test через `os.tmpdir()` + `afterEach(fs.rmSync)`.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Mock spec — partially verified | static | `tests/fixtures/spec-status/mock-spec-partial/` | per-scenario | beforeEach copies to tmpdir |
| F-2 | Mock spec — all claimed (no evidence) | static | `tests/fixtures/spec-status/mock-spec-claimed-only/` | per-scenario | beforeEach copies to tmpdir |
| F-3 | Mock spec — all verified (full evidence) | static | `tests/fixtures/spec-status/mock-spec-all-verified/` | per-scenario | beforeEach copies to tmpdir |
| F-4 | Sample test — weak assertions | static | `tests/fixtures/spec-status/sample-tests/weak.test.ts` | shared | beforeAll |
| F-5 | Sample test — strong assertions | static | `tests/fixtures/spec-status/sample-tests/strong.test.ts` | shared | beforeAll |
| F-6 | Sample test — fake-positive (mock-heavy + tautology) | static | `tests/fixtures/spec-status/sample-tests/fake-positive.test.ts` | shared | beforeAll |
| F-7 | YAML — fresh state | static | `tests/fixtures/spec-status/yaml-samples/status.fresh.yaml` | per-scenario | beforeEach с mtime touch |
| F-8 | YAML — stale heartbeat (state=running, mtime old) | static | `tests/fixtures/spec-status/yaml-samples/status.stale.yaml` | per-scenario | beforeEach с mtime set ≥5min ago |
| F-9 | YAML — completed (passed counts) | static | `tests/fixtures/spec-status/yaml-samples/status.completed.yaml` | per-scenario | beforeEach copy |
| F-10 | Docker probe — mock script returns exit 1 | static | `tests/fixtures/spec-status/mock-bin/docker` | per-scenario | beforeEach via PATH override |

## Fixture Details

### F-1: Mock spec — partially verified

- **Type:** static directory
- **Format:** copy of `.specs/{slug}/` template with 5 AC, 3 marked verified (с test file references), 2 marked claimed-only (без references)
- **Setup:** `fs.cpSync(appPath('tests/fixtures/spec-status/mock-spec-partial'), tmpSpecDir, { recursive: true })` в beforeEach
- **Teardown:** `fs.rmSync(tmpSpecDir, { recursive: true, force: true })` в afterEach
- **Dependencies:** none
- **Used by:** `@feature1` (HSCMD001_01 happy path), `@feature2` (HSCMD001_02 user explicit)
- **Assumptions:** `.progress.json` v3, ACCEPTANCE_CRITERIA.md uses standard `## AC-N (FR-N)` headings

### F-2: Mock spec — all claimed (no evidence)

- **Type:** static directory
- **Format:** spec where ALL AC marked `- [x]` в TASKS.md, но no test files / no commits exist
- **Setup:** copy в tmpdir
- **Teardown:** rm tmpdir
- **Dependencies:** none
- **Used by:** `@feature2` (HSCMD001_02 — verify anti-overclaim detection)
- **Assumptions:** sub-agent ОБЯЗАН classify all AC as `claimed_only`, not `verified` — proof of US-1 working

### F-3: Mock spec — all verified

- **Type:** static directory
- **Format:** spec with complete evidence — each AC linked to existing test file + commit SHA
- **Setup:** copy + git init in tmpdir (для git SHA verification)
- **Teardown:** rm tmpdir
- **Dependencies:** none
- **Used by:** baseline test (sanity check sub-agent returns `verified` when evidence present)

### F-4: Sample test — weak assertions

- **Type:** static TypeScript file
- **Format:**
  ```typescript
  describe('weak', () => {
    it('returns defined value', () => {
      expect(getValue()).toBeDefined();        // weak — no value check
    });
    it('returns truthy', () => {
      expect(getValue()).toBeTruthy();         // weak — same
    });
  });
  ```
- **Setup:** static, no setup
- **Teardown:** none (read-only fixture)
- **Used by:** `@feature4` (HSCMD001_04)
- **Assumptions:** sub-agent test quality patterns identify presence-only assertions as WEAK

### F-5: Sample test — strong assertions

- **Type:** static TypeScript file
- **Format:**
  ```typescript
  describe('strong', () => {
    it('returns full structure', () => {
      expect(parse('a=1')).toEqual({ key: 'a', value: '1' });
    });
    it('handles edge cases', () => {
      expect(parse('')).toEqual({ key: '', value: '' });
      expect(parse('a=')).toEqual({ key: 'a', value: '' });
    });
  });
  ```
- **Used by:** `@feature4` (HSCMD001_04)
- **Assumptions:** sub-agent identifies `toEqual()` + edge cases as STRONG

### F-6: Sample test — fake-positive

- **Type:** static TypeScript file
- **Format:**
  ```typescript
  import { vi } from 'vitest';
  vi.mock('../../src/critical-parser.ts');     // production path mock — fake-positive

  describe('fake positive', () => {
    it('tautology', () => {
      expect(true).toBe(true);                 // tautology
    });
  });
  ```
- **Used by:** `@feature4` (HSCMD001_04)
- **Assumptions:** sub-agent identifies `vi.mock` для production + tautology assertions as FAKE-POSITIVE-RISK

### F-7: YAML — fresh state

- **Type:** static YAML file
- **Format:** `state: passed, framework: vitest, total: 6, passed: 6, updated_at: <recent>`
- **Setup:** copy to tmp `.dev-pomogator/.test-status/status.<prefix>.yaml`; `fs.utimesSync` to set mtime now
- **Teardown:** rm tmp dir
- **Used by:** baseline test (fresh classification AC-5.1)

### F-8: YAML — stale heartbeat

- **Type:** static YAML file
- **Format:** `state: running, updated_at: <8 min ago>` (deliberately stale)
- **Setup:** copy + `fs.utimesSync` to set mtime 8 minutes ago
- **Teardown:** rm tmp dir
- **Used by:** `@feature3` (HSCMD001_03 — environmental block detection)
- **Assumptions:** mtime check ≥5 min при `state: running` → classify stale

### F-9: YAML — completed

- **Type:** static YAML file
- **Format:** `state: passed, total: 10, passed: 8, failed: 2, updated_at: <recent>`
- **Used by:** test results section happy path verification

### F-10: Docker probe — mock returns exit 1

- **Type:** static shell script
- **Format:** `#!/bin/bash\necho "Cannot connect to Docker daemon" >&2; exit 1`
- **Setup:** `chmod +x`, prepend dir to PATH в test env (`{...process.env, PATH: mockBinDir + ':' + ...}`)
- **Teardown:** restore PATH
- **Used by:** `@feature3` (HSCMD001_03 Docker unreachable detection)

## Dependencies Graph

```
F-1, F-2, F-3 (mock specs) — independent
F-4, F-5, F-6 (test samples) — independent
F-7, F-8, F-9 (YAML samples) — independent, each used in different scenarios
F-10 (docker mock) — independent; used together с F-8 для environmental block scenarios
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | HSCMD001_01 happy path | F-1, F-7 | none |
| @feature2 | HSCMD001_02 claimed-only detection | F-2 | none |
| @feature3 | HSCMD001_03 environmental block | F-8, F-10 | none |
| @feature4 | HSCMD001_04 test quality audit | F-4, F-5, F-6 | none |

## Notes

- Cleanup order: rm tmp dir в afterEach (atomicity не критична — each test isolated)
- Mock spec fixtures должны быть git-tracked (statically authored) — repeatable across CI
- Docker mock script: на Windows используется `mock-bin/docker.bat` (отдельный wrapper); per-test PATH override standard pattern (see existing `tests/e2e/docker-test-tee.test.ts:23-29` mockBinDir setup)
- YAML mtime manipulation via `fs.utimesSync` cross-platform safe
