# Fixtures

## Overview

BDD-тесты для chrome-devtools-mcp-mux требуют 3 fixture artifacts: pre-existing `.mcp.json` снимки (для smart-merge и conflict сценариев) и stub `cdmcp-mux` бинарь (для smoke-test без spawning real Chrome). Все fixtures static read-only — каждый тест copies в свою tmpdir, не модифицирует source.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | existing-mcp-json | static file | `tests/fixtures/chrome-devtools-mcp-mux/existing-mcp-json/.mcp.json` | per-scenario | beforeEach в installer.test.ts |
| F-2 | claude-in-chrome-mcp-json | static file | `tests/fixtures/chrome-devtools-mcp-mux/claude-in-chrome-mcp-json/.mcp.json` | per-scenario | beforeEach в installer.test.ts |
| F-3 | fake-cdmcp-mux | static binary | `tests/fixtures/chrome-devtools-mcp-mux/fake-cdmcp-mux.mjs` | per-scenario | spawned by smoke.test.ts |

## Fixture Details

### F-1: existing-mcp-json

- **Type:** static file
- **Format:** JSON
- **Setup:** `fs.copyFileSync(F-1.path, tmpdir + '/.mcp.json')` в beforeEach каждого smart-merge сценария
- **Teardown:** afterEach через `fs.rmSync(tmpdir, recursive)` — fixture-source not modified
- **Dependencies:** none
- **Used by:** PLUGIN017_02 (smart merge с existing keys)
- **Assumptions:** fixture содержит ровно один pre-existing mcpServer ключ `"user-server-foo"` с минимальной валидной shape `{"command": "echo", "args": ["dummy"]}` чтобы smart-merge имел что preserve.

### F-2: claude-in-chrome-mcp-json

- **Type:** static file
- **Format:** JSON
- **Setup:** `fs.copyFileSync(F-2.path, tmpdir + '/.mcp.json')` в beforeEach сценариев конфликта
- **Teardown:** as F-1
- **Dependencies:** none
- **Used by:** PLUGIN017_07 (conflict warning), PLUGIN017_08 (doctor co-existence warning)
- **Assumptions:** fixture содержит ключ `"claude-in-chrome"` mcpServers entry; в PLUGIN017_08 тест дополнительно injects `chrome-devtools-mcp-mux` ключ программно перед running doctor для симуляции "обе записи присутствуют".

### F-3: fake-cdmcp-mux

- **Type:** static binary (Node.js script)
- **Format:** TypeScript/JavaScript (.mjs ESM)
- **Setup:** spawn through `child_process.spawn('node', [F-3.path], {stdio: 'pipe'})`
- **Teardown:** `child.kill('SIGTERM')` в afterEach + 1s grace; SIGKILL если timeout
- **Dependencies:** none
- **Used by:** PLUGIN017_11 (smoke test on CI tier — fast, no real Chrome download)
- **Assumptions:** stub script отвечает на JSON-RPC `initialize` методом возвращающим `{result: {protocolVersion: "2024-11-05", capabilities: {}, serverInfo: {name: "fake-cdmcp-mux", version: "0"}}}` и на `tools/list` методом возвращающим `{result: {tools: [{name: "navigate_page", description: "stub"}, {name: "take_screenshot", description: "stub"}]}}`. Stub НЕ запускает Chrome.

## Dependencies Graph

Все fixtures независимы друг от друга. Нет cascade зависимостей.

```
F-1 (independent)
F-2 (independent)
F-3 (independent)
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | PLUGIN017_01 (installer creates files) | none — runs against fresh tmpdir | none |
| @feature2 | PLUGIN017_02 (smart merge) | F-1 | none |
| @feature2 | PLUGIN017_03 (create from scratch) | none — runs against fresh tmpdir | none |
| @feature3 | PLUGIN017_04 (SKILL.md content) | none — reads source SKILL.md from repo | none |
| @feature4 | PLUGIN017_05 (5 doctor checks) | none — uses real installer + tmpdir | gap: real `npx -y` slow; mitigated by F-3 swap option |
| @feature4 | PLUGIN017_06 (skip when not installed) | none | none |
| @feature5 | PLUGIN017_07 (conflict warning CI) | F-2 | none |
| @feature5 | PLUGIN017_08 (doctor co-existence) | F-2 + programmatic mux entry inject | none |
| @feature6 | PLUGIN017_09 (uninstall preserves other servers) | F-1 + install-then-uninstall flow | none |
| @feature7 | PLUGIN017_10 (pinned version regex) | none — reads `extension.json` from repo | none |
| @feature8 | PLUGIN017_11 (smoke test) | F-3 (CI tier) OR real `npx -y` (slow tier marked `slow`) | none |

## Notes

- **Cleanup order:** afterEach для каждого test — tmpdir rm recursive. Test НЕ shared state.
- **Real `npx -y` smoke test tier:** marked vitest `test.concurrent.skip` или `describe.skipIf(!process.env.CI_SLOW_TESTS)` — runs только когда `CI_SLOW_TESTS=true` env set. Default CI suite uses F-3 stub.
- **fake-cdmcp-mux script size budget:** ≤80 строк JS, no deps кроме `node:readline` для line-delimited JSON-RPC. Goal — instant spawn (< 100ms) для test stability.
