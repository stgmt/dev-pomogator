# Design

## Реализуемые требования

- FR-1: Hook intercept — see [FR.md](FR.md)
- FR-2: TypeScript staleness check — see [FR.md](FR.md)
- FR-3: Docker SKIP_BUILD block — see [FR.md](FR.md)
- FR-4: dotnet no-build block — see [FR.md](FR.md)
- FR-5: Framework detection — see [FR.md](FR.md)
- FR-6: Deny message with fix command — see [FR.md](FR.md)
- FR-7: SKIP_BUILD_CHECK bypass — see [FR.md](FR.md)

## Компоненты

- `build-staleness.ts` — модуль проверки staleness: mtime comparison для TypeScript, flag detection для Docker/dotnet
- `build_guard.ts` — PreToolUse hook: stdin parse → test command detect → framework extract → staleness check → deny/allow

## Где лежит реализация

- Hook: `extensions/tui-test-runner/tools/tui-test-runner/build_guard.ts`
- Staleness module: `extensions/tui-test-runner/tools/tui-test-runner/build-staleness.ts`
- Manifest: `extensions/tui-test-runner/extension.json`
- Pattern reference: `extensions/tui-test-runner/tools/tui-test-runner/test_guard.ts`

## Директории и файлы

- `extensions/tui-test-runner/tools/tui-test-runner/build-staleness.ts`
- `extensions/tui-test-runner/tools/tui-test-runner/build_guard.ts`
- `extensions/tui-test-runner/extension.json`
- `extensions/_shared/hook-utils.ts` (reuse)

## Алгоритм

### build_guard.ts (PreToolUse hook)

1. Read stdin JSON → parse `tool_input.command`
2. Check: command contains `test_runner_wrapper` or `docker-test.sh`? No → exit 0 (passthrough)
3. Check: `SKIP_BUILD_CHECK=1` in env? Yes → exit 0 + stderr warning
4. Extract framework from `--framework <name>` in command. Docker detected by `docker-test.sh`
5. Call `checkStaleness(framework, command, cwd)`
6. If `stale === true` → stdout JSON `{ permissionDecision: 'deny', reason: ... }`, exit 2
7. If `stale === false` → exit 0 (allow)
8. Any error → exit 0 (fail-open)

### build-staleness.ts (staleness module)

```typescript
interface StalenessResult {
  stale: boolean;
  reason?: string;
  fixCommand?: string;
}

function checkStaleness(framework: string, command: string, cwd: string): StalenessResult
```

Framework dispatch:
- **vitest/jest**: `getMaxMtime(path.join(cwd, 'src'), ['.ts'])` vs `stat(path.join(cwd, 'dist/index.js')).mtimeMs`
- **dotnet**: check `--no-build` in command string
- **docker**: check `SKIP_BUILD=1` in `process.env` or command string
- **pytest/go/rust**: return `{ stale: false }`

### Hook Registration (extension.json)

```json
{
  "hooks": {
    "claude": {
      "PreToolUse": [
        {
          "matcher": "Bash",
          "command": "npx tsx .dev-pomogator/tools/tui-test-runner/build_guard.ts",
          "timeout": 30
        },
        {
          "matcher": "Bash",
          "command": "npx tsx .dev-pomogator/tools/tui-test-runner/test_guard.ts",
          "timeout": 30
        }
      ]
    }
  }
}
```

build_guard ПЕРЕД test_guard: сначала проверяем build, потом блокируем прямые команды.

## BDD Test Infrastructure

**Classification:** TEST_DATA_NONE
**Evidence:** Hook не создаёт/изменяет данные (1: НЕТ), не меняет состояние системы (2: НЕТ), BDD сценарии не требуют предустановленных данных — только stdin JSON mock (3: НЕТ), не взаимодействует с внешними сервисами (4: НЕТ). Hook читает только mtime файлов через fs.statSync.
**Verdict:** Hooks/fixtures не требуются. Тесты stateless — spawnSync hook с mock stdin.
