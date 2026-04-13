# Fixtures

## Overview

Personal-pomogator BDD тесты требуют temp file system state для проверки installer behavior в target projects. Все фикстуры per-scenario scope с cleanup в afterEach. Нет внешних сервисов (in-process тесты через `runInstaller` helper). Fake HOME изолируется через env var override где нужно.

## Fixture Inventory

| ID | Name | Type | Path | Scope | Owner |
|----|------|------|------|-------|-------|
| F-1 | Fresh target project | factory | `${APP_DIR}/personal-pomogator-test-{uuid}/` | per-scenario | beforeEach |
| F-2 | Fake `.gitignore` with user entries | seed | `${targetDir}/.gitignore` | per-scenario | beforeEach |
| F-3 | Fake `.git/` directory | factory | `${targetDir}/.git/` | per-scenario | beforeEach (via `initGitRepo`) |
| F-4 | Fake team `.claude/settings.json` | seed | `${targetDir}/.claude/settings.json` | per-scenario (FR-2, FR-3) | beforeEach |
| F-5 | Pre-existing `.claude/settings.local.json` | seed | `${targetDir}/.claude/settings.local.json` | per-scenario (FR-2 AC) | beforeEach |
| F-6 | Fake `.mcp.json` with secrets | seed | `${targetDir}/.mcp.json` | per-scenario (FR-10) | beforeEach |
| F-7 | Fake `.mcp.json` without secrets | seed | `${targetDir}/.mcp.json` | per-scenario (FR-10 negative) | beforeEach |
| F-8 | User-committed `.claude/commands/create-spec.md` | seed + git add | `${targetDir}/.claude/commands/create-spec.md` | per-scenario (FR-7) | beforeEach |
| F-9 | Fake `~/.dev-pomogator/scripts/tsx-runner.js` | factory | `${fakeHome}/.dev-pomogator/scripts/tsx-runner.js` | per-scenario (FR-6) | beforeEach |
| F-10 | Fake dev-pomogator source repo | factory | `${APP_DIR}/fake-dev-pomogator-{uuid}/` | per-scenario (FR-4) | beforeEach |
| F-11 | Stripped dist (no tsx-runner.js) | factory | tmp dev-pomogator copy без `dist/tsx-runner.js` | per-scenario (FR-5) | beforeEach |
| F-12 | Post-install installed state | dependent | Result of `runInstaller` — referenced by subsequent assertions | per-scenario | installer call |

## Fixture Details

### F-1: Fresh target project

- **Type:** factory (in-memory + filesystem)
- **Format:** directory structure
- **Setup:** `fs.mkdirSync(appPath('personal-pomogator-test-' + crypto.randomUUID()), { recursive: true })`
- **Teardown:** `fs.rmSync(targetDir, { recursive: true, force: true })` в afterEach
- **Dependencies:** none
- **Used by:** all @feature1..@feature9 сценарии
- **Assumptions:** `APP_DIR` env var set (via helpers.ts), writable temp location

### F-2: Fake `.gitignore` with user entries

- **Type:** seed
- **Format:** plain text
- **Setup:**
  ```
  node_modules/
  dist/
  *.log
  # User comment — personal-pomogator should preserve this
  .env
  ```
  `fs.writeFileSync(path.join(targetDir, '.gitignore'), content)`
- **Teardown:** deleted with F-1 target dir
- **Dependencies:** F-1
- **Used by:** PERSO_10, PERSO_11 (user entries preserved), PERSO_13 (Windows paths), PERSO_14 (stale drop), PERSO_15 (settings.local first)
- **Assumptions:** File content tests check exact lines for regression

### F-3: Fake `.git/` directory

- **Type:** factory (minimal structure)
- **Format:** directory + HEAD file + config file
- **Setup:** `initGitRepo(targetDir)` из `tests/e2e/helpers.ts` — creates `.git/HEAD` (`ref: refs/heads/main`) + `.git/config`
- **Teardown:** deleted with F-1
- **Dependencies:** F-1
- **Used by:** PERSO_60..63 (collision detection needs git), PERSO_70..73 (uninstall git status verify)
- **Assumptions:** Minimal git structure is enough for `git ls-files` to not error

### F-4: Fake team `.claude/settings.json`

- **Type:** seed
- **Format:** JSON
- **Setup:**
  ```json
  {
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "Bash",
          "hooks": [
            { "type": "command", "command": "node .claude/hooks/block-dotnet-test.js" }
          ]
        }
      ]
    }
  }
  ```
  `fs.writeJsonSync(path.join(targetDir, '.claude/settings.json'), content, { spaces: 2 })`
- **Teardown:** deleted with F-1
- **Dependencies:** F-1
- **Used by:** PERSO_21 (existing settings.json with team hook split), PERSO_26 (no team hooks touched)
- **Assumptions:** Content mimics real smarts settings.json structure

### F-5: Pre-existing `.claude/settings.local.json`

- **Type:** seed
- **Format:** JSON
- **Setup:**
  ```json
  {
    "theme": "dark",
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "Read",
          "hooks": [
            { "type": "command", "command": "node .claude/hooks/user-log.js" }
          ]
        }
      ]
    }
  }
  ```
- **Teardown:** deleted with F-1
- **Dependencies:** F-1
- **Used by:** PERSO_22 (preserve user keys)
- **Assumptions:** Theme key is a simple non-hook value, user hooks distinct from ours

### F-6: Fake `.mcp.json` with secrets

- **Type:** seed
- **Format:** JSON
- **Setup:**
  ```json
  {
    "mcpServers": {
      "mcp-atlassian": {
        "command": "docker",
        "args": ["run", "-e", "JIRA_API_TOKEN=fake-token-12345", "-e", "CONFLUENCE_API_TOKEN=fake-conf-678", "image"]
      }
    }
  }
  ```
- **Teardown:** deleted with F-1
- **Dependencies:** F-1
- **Used by:** PERSO_82 (secrets warn)
- **Assumptions:** Fake tokens don't match real credentials (obviously fake)

### F-7: Fake `.mcp.json` without secrets

- **Type:** seed
- **Format:** JSON
- **Setup:**
  ```json
  {
    "mcpServers": {
      "context7": {
        "command": "npx",
        "args": ["-y", "@upstash/context7-mcp@latest"]
      }
    }
  }
  ```
- **Teardown:** deleted with F-1
- **Dependencies:** F-1
- **Used by:** PERSO_83 (no-warn negative case)
- **Assumptions:** Context7 config doesn't match secret patterns

### F-8: User-committed `.claude/commands/create-spec.md`

- **Type:** seed + git add
- **Format:** markdown
- **Setup:**
  ```
  # User's own create-spec command
  Custom team implementation.
  ```
  Then: `git add .claude/commands/create-spec.md && git commit -m "user command"` (или `git update-index --add --cacheinfo` для ускорения без real commit)
- **Teardown:** deleted with F-1
- **Dependencies:** F-1, F-3
- **Used by:** PERSO_60..63 (collision tests)
- **Assumptions:** File must be tracked in git (not just on disk) for `git ls-files` to return it

### F-9: Fake `~/.dev-pomogator/scripts/tsx-runner.js`

- **Type:** factory (copy from real dist)
- **Format:** JavaScript
- **Setup:**
  1. `process.env.HOME = path.join(APP_DIR, 'fake-home-{uuid}')` (override)
  2. `fs.mkdirSync(path.join(fakeHome, '.dev-pomogator', 'scripts'), { recursive: true })`
  3. `fs.copyFileSync(realDistPath + '/tsx-runner.js', fakeHome + '/.dev-pomogator/scripts/tsx-runner.js')`
- **Teardown:** restore `process.env.HOME`, delete fakeHome dir
- **Dependencies:** F-1
- **Used by:** PERSO_50..52 (fail-soft wrapper)
- **Assumptions:** Fake HOME override works on Windows (HOMEDRIVE + HOMEPATH might need override too)

### F-10: Fake dev-pomogator source repo

- **Type:** factory
- **Format:** directory + package.json + extensions/ + src/installer/ dirs
- **Setup:**
  ```
  targetDir/
  ├── package.json  ({"name": "dev-pomogator"})
  ├── extensions/   (empty dir, just for detection)
  └── src/installer/  (empty dir, just for detection)
  ```
- **Teardown:** deleted with F-1
- **Dependencies:** F-1
- **Used by:** PERSO_30..33 (self-guard tests)
- **Assumptions:** Three conditions (package.json name + 2 dirs) are sufficient for detection

### F-11: Stripped dist (no tsx-runner.js)

- **Type:** factory
- **Format:** tmp copy of dev-pomogator с удалённым `dist/tsx-runner.js` И удалённым `src/scripts/tsx-runner.js`
- **Setup:** cp -r realDevPomogatorPath tmpDevPomogator && rm dist/tsx-runner.js src/scripts/tsx-runner.js
- **Teardown:** delete tmpDevPomogator
- **Dependencies:** F-1
- **Used by:** PERSO_40..42 (loud-fail tests)
- **Assumptions:** Removing both primary and fallback causes `copyBundledScript` to throw (с FR-5 implementation)

### F-12: Post-install installed state

- **Type:** dependent (result of runInstaller)
- **Format:** filesystem state after `runInstaller('--claude')` completes
- **Setup:** Called by `runInstaller` in test body after beforeEach sets up other fixtures
- **Teardown:** implicit via F-1 cleanup
- **Dependencies:** F-1 (+ F-2..F-11 depending on test)
- **Used by:** assertions in all tests (check what installer produced)
- **Assumptions:** Installer completes successfully (positive path) or fails loudly (negative path)

## Dependencies Graph

```
F-1 (target dir)
├── F-2 (.gitignore with user entries)
├── F-3 (.git/)
│   └── F-8 (git-tracked user command)
├── F-4 (team settings.json)
├── F-5 (pre-existing settings.local.json)
├── F-6 (.mcp.json with secrets)
├── F-7 (.mcp.json without secrets)
├── F-9 (fake ~/.dev-pomogator/scripts/)
├── F-10 (fake dev-pomogator source)
└── F-11 (stripped dist)

F-12 (installed state) depends on: F-1 + subset of F-2..F-11 per test
```

## Gap Analysis

| @featureN | Scenario | Fixture Coverage | Gap |
|-----------|----------|-----------------|-----|
| @feature1 | PERSO_10 marker block written | F-1, F-2 | none |
| @feature1 | PERSO_11 user entries preserved | F-1, F-2 | none |
| @feature1 | PERSO_12 collapse per-tool | F-1 | none |
| @feature1 | PERSO_13 Windows forward slashes | F-1 | only runs on Windows — conditional test skip on other platforms |
| @feature1 | PERSO_14 stale entries dropped | F-1 | none |
| @feature1 | PERSO_15 settings.local.json first | F-1, F-2 | none |
| @feature1 | PERSO_16 idempotent | F-1, F-2 | none |
| @feature2 | PERSO_20 fresh install settings.local | F-1 | none |
| @feature2 | PERSO_21 team hook split | F-1, F-4 | none |
| @feature2 | PERSO_22 preserve user settings.local | F-1, F-5 | none |
| @feature2 | PERSO_23 env vars routed | F-1 | env vars defined в extension — fixture covered |
| @feature2 | PERSO_24 idempotent reinstall | F-1 | none |
| @feature2 | PERSO_25 legacy migration | F-1, F-4 (seeded with dev-pomogator hook) | need variant F-4 with our hook |
| @feature2 | PERSO_26 no team hooks touched | F-1, F-4 | none |
| @feature3 | PERSO_30 self-guard gitignore | F-10 | none |
| @feature3 | PERSO_31 self-guard settings.local | F-10 | none |
| @feature3 | PERSO_32 tools still copied | F-10 | none |
| @feature3 | PERSO_33 info line logged | F-10 | none |
| @feature4 | PERSO_40 missing tsx-runner throws | F-11 | none |
| @feature4 | PERSO_41 fallback missing throws | F-11 | none |
| @feature4 | PERSO_42 post-install verification | F-11 (partial strip) | custom variant needed |
| @feature5 | PERSO_50 runner missing exit 0 | F-9 (then delete runner) | none |
| @feature5 | PERSO_51 diagnostic stderr | F-9 | none |
| @feature5 | PERSO_52 real errors propagate | F-9 (with syntax-error runner) | custom variant |
| @feature6 | PERSO_60 git-tracked skipped | F-1, F-3, F-8 | none |
| @feature6 | PERSO_61 WARN in output | F-1, F-3, F-8 | none |
| @feature6 | PERSO_62 no .git skip | F-1 (without F-3) | none |
| @feature6 | PERSO_63 batched call | F-1, F-3, F-8 (multiple) | performance assertion |
| @feature7 | PERSO_70 uninstall files removed | F-1, F-12 (post-install) | depends on installer success |
| @feature7 | PERSO_71 gitignore block stripped | F-1, F-12 | none |
| @feature7 | PERSO_72 settings.local cleaned | F-1, F-12 | none |
| @feature7 | PERSO_73 config updated | F-1, F-12 | none |
| @feature7 | PERSO_74 refuse in dev-pomogator repo | F-10 | none |
| @feature8 | PERSO_80 setup-mcp force-global w/ project file | F-1, F-6 or F-7 | requires setup-mcp.py subprocess invocation |
| @feature8 | PERSO_81 setup-mcp no project file still global | F-1 | none |
| @feature8 | PERSO_82 secrets warn | F-1, F-6 | none |
| @feature8 | PERSO_83 no-secret no-warn | F-1, F-7 | none |
| @feature8 | PERSO_84 claude-mem MCP invariant | F-1 + claude-mem-health extension enabled | none |
| @feature9 | PERSO_90 skill installed | F-1 + personal-pomogator extension | none |
| @feature9 | PERSO_91 frontmatter trigger words | F-1 + skill installed | none |
| @feature9 | PERSO_92 CLI-first + manual fallback mentioned | F-1 + skill installed | none |
| @feature9 | PERSO_93 safety checks mentioned | F-1 + skill installed | none |

## Notes

- **Cleanup order**: target dir → fake HOME → restore env → restore config. Wrap в try/catch чтобы одна failed cleanup не блокировала другие.
- **HOME override pattern**: set `process.env.HOME = fakeHome` перед test, restore после. На Windows также override `HOMEDRIVE` + `HOMEPATH` для full coverage.
- **Git fixtures**: `initGitRepo` создаёт минимальные `.git/HEAD` + `.git/config`. Для FR-7 collision detection нужно также вызвать `git update-index --add --cacheinfo` чтобы файл был tracked без real commit.
- **Performance**: temp dirs per-scenario добавляют overhead. Acceptable так как integration-first rule требует real filesystem interaction. Не использовать mocks.
- **CI concerns**: tests создают файлы в `APP_DIR` — убедиться что CI runner имеет writable temp location. На Windows убедиться что long paths enabled или paths короткие.
- **Migration plan**: after phase 0 passes, add more fixtures if implementation reveals gaps. Document in this file.
