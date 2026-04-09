# Fixtures

## Overview

Эта фича классифицирована как **TEST_DATA_NONE** в [DESIGN.md](DESIGN.md#bdd-test-infrastructure-обязательно). Все 5 регрессионных тестов self-contained: создают временный HOME через `os.tmpdir()` в `beforeEach`, переопределяют `process.env.HOME` и `USERPROFILE` для child process через `spawnSync`, удаляют tmpHome в `afterEach`. Никаких shared fixtures, никаких BDD framework hooks (BeforeScenario/AfterScenario), никаких persisted test data.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | tmpHome (per-test temporary HOME) | factory | `os.tmpdir() + '/plan-prompt-test-' + Date.now()` | per-scenario | beforeEach в describe `PLUGIN007_43` |
| F-2 | inline mix prompts JSON (для FR-5 теста) | inline factory | в самом test body через `fs.writeFileSync` | per-scenario | it `PLUGIN007_43_05` |

## Fixture Details

### F-1: tmpHome (per-test temporary HOME)

- **Type:** factory (создаётся динамически в каждом тесте)
- **Format:** Directory path (string)
- **Setup:** `const tmpHome = path.join(os.tmpdir(), 'plan-prompt-test-' + Date.now() + '-' + Math.random().toString(36).slice(2)); fs.mkdirSync(tmpHome, { recursive: true });`
- **Teardown:** `try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch {}` в `afterEach`
- **Dependencies:** none
- **Used by:** все 5 it-блоков PLUGIN007_43_01..05 (через spawnSync env override `HOME: tmpHome, USERPROFILE: tmpHome` чтобы prompt-capture писал в tmpHome а не в реальный home)
- **Assumptions:** `os.tmpdir()` доступен и writable; `fs.rmSync` с `force: true` не падает на Windows для readonly файлов

### F-2: inline mix prompts JSON

- **Type:** inline factory
- **Format:** JSON string записываемый напрямую через `fs.writeFileSync`
- **Setup:** `fs.writeFileSync(promptFile, JSON.stringify({sessionId: 'mix', prompts: [{ts: 1, text: '<task-notification>spam</task-notification>'}, {ts: 2, text: 'real prompt 1'}, {ts: 3, text: 'real prompt 2'}]}))`
- **Teardown:** удаляется вместе с tmpHome через afterEach (file inside tmpHome)
- **Dependencies:** F-1 (tmpHome для размещения файла)
- **Used by:** PLUGIN007_43_05 (defense filter test)
- **Assumptions:** `formatPromptsFromFile` экспортирован из plan-gate.ts (см. Phase 2 task в TASKS.md)

## Dependencies Graph

```
F-1 (tmpHome) → F-2 (mix prompts JSON inside tmpHome)
```

F-2 зависит от F-1: inline JSON файл создаётся внутри tmpHome директории и cleanup идёт каскадом через rmSync recursive.

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | PLUGIN007_43_01 session-specific write | F-1 | none |
| @feature2 | PLUGIN007_43_02 no write without session_id | F-1 | none |
| @feature3 | PLUGIN007_43_03 task-notification filter on capture | F-1 | none |
| @feature4 | PLUGIN007_43_04 loadUserPrompts empty for unknown session | F-1 | none |
| @feature5 | PLUGIN007_43_05 formatPromptsFromFile defense filter | F-1, F-2 | none |

Все 5 BDD сценариев полностью покрыты фикстурами F-1 и F-2. Gap отсутствует.

## Notes

- Cleanup идёт через каскад: `fs.rmSync(tmpHome, { recursive: true, force: true })` удаляет всю директорию включая F-2 inline JSON файлы
- На Windows возможны race conditions при rm если другой процесс держит handle — `force: true` помогает, плюс `try/catch` в afterEach предотвращает test failure из-за cleanup ошибок
- Известная проблема: если spawnSync child process не успел завершиться к afterEach (async issue) — `force: true` всё равно справится. В тестах используется sync spawnSync, поэтому child process гарантированно завершён к моменту cleanup
- Никаких persisted fixture файлов в `.specs/plan-pomogator-prompt-isolation/fixtures/` директории не нужно — всё inline в test body
