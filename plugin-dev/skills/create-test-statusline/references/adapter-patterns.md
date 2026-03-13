# Framework Adapter Patterns

Adapters parse test runner stdout line-by-line and emit structured TestEvent objects. Each adapter is specific to one test framework's output format.

## TestEvent Interface

```typescript
interface TestEvent {
  type: 'suite_start' | 'suite_end' | 'test_start' | 'test_pass'
      | 'test_fail' | 'test_skip' | 'summary' | 'error' | 'log';
  suiteName?: string;
  suiteFile?: string;
  testName?: string;
  duration?: number;      // milliseconds
  errorMessage?: string;
  stackTrace?: string;
  summary?: { total: number; passed: number; failed: number };
}
```

**Event flow per test:** `suite_start` -> (`test_pass` | `test_fail` | `test_skip`)* -> `suite_end` -> `summary`

## Adapter Base Pattern

Every adapter implements one function:

```javascript
// State (minimal — just enough to associate errors with tests)
let currentSuite = '';
let pendingError = null;

function parseLine(line) {
  // Check regex patterns in priority order
  // Return TestEvent or null for unrecognized lines
}
```

**Design principles:**
- One function, minimal state
- Check patterns in order: suite -> pass -> fail -> skip -> summary -> error
- Return `null` for unrecognized lines (most lines won't match)
- Track pending errors to attach to the next `test_fail` event

## Dispatch Table

Command and filter format for each supported framework:

| Framework | Base Command | Filter Argument | Example |
|-----------|-------------|-----------------|---------|
| vitest | `npx vitest run` | `--grep "{filter}"` | `npx vitest run --grep "auth"` |
| jest | `npx jest` | `--testNamePattern "{filter}"` | `npx jest --testNamePattern "login"` |
| pytest | `python -m pytest` | `-k "{filter}"` | `python -m pytest -k "test_auth"` |
| dotnet | `dotnet test` | `--filter "{filter}"` | `dotnet test --filter "Auth"` |
| rust | `cargo test` | `-- {filter}` | `cargo test -- auth` |
| go | `go test ./...` | `-run "{filter}"` | `go test ./... -run "TestAuth"` |

**Usage in wrapper:**
```javascript
const DISPATCH = {
  vitest: { cmd: 'npx vitest run', filter: (f) => `--grep "${f}"` },
  jest:   { cmd: 'npx jest',       filter: (f) => `--testNamePattern "${f}"` },
  pytest: { cmd: 'python -m pytest', filter: (f) => `-k "${f}"` },
  dotnet: { cmd: 'dotnet test',     filter: (f) => `--filter "${f}"` },
  rust:   { cmd: 'cargo test',      filter: (f) => `-- ${f}` },
  go:     { cmd: 'go test ./...',   filter: (f) => `-run "${f}"` },
};
```

## Auto-Detect Algorithm

Check config files in priority order; first match wins:

```javascript
const INDICATORS = [
  { framework: 'vitest', files: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts'] },
  { framework: 'jest',   files: ['jest.config.ts', 'jest.config.js', 'jest.config.cjs'] },
  { framework: 'pytest', files: ['pytest.ini', 'pyproject.toml', 'conftest.py'] },
  { framework: 'rust',   files: ['Cargo.toml'] },
  { framework: 'go',     files: ['go.mod'] },
  // dotnet: glob for *.csproj or *.sln after the above checks
];
```

**Special case — pytest + pyproject.toml:** Only match if file contains `[tool.pytest` or `pytest` substring. Many Python projects have pyproject.toml without pytest.

**Environment override:**
```javascript
const envFramework = process.env.TEST_STATUSLINE_FRAMEWORK;
if (envFramework && envFramework !== 'auto') return envFramework;
```

## Regex Patterns by Framework

### Vitest

```javascript
const RE_SUITE_START = /^\s*(?:❯|>)\s+(.+\.(?:test|spec)\.\w+)/;
const RE_TEST_PASS  = /^\s*(?:✓|√|PASS)\s+(.+?)(?:\s+(\d+)\s*ms)?$/;
const RE_TEST_FAIL  = /^\s*(?:✗|×|FAIL)\s+(.+?)(?:\s+(\d+)\s*ms)?$/;
const RE_TEST_SKIP  = /^\s*(?:○|↓|SKIP|skipped)\s+(.+)$/;
const RE_SUMMARY    = /Tests?\s+(\d+)\s+(passed|failed)/i;
```

### Jest

```javascript
const RE_SUITE_START = /^(?:PASS|FAIL)\s+(.+\.(?:test|spec)\.\w+)/;
const RE_TEST_PASS  = /^\s*✓\s+(.+?)(?:\s+\((\d+)\s*ms\))?$/;
const RE_TEST_FAIL  = /^\s*✕\s+(.+?)(?:\s+\((\d+)\s*ms\))?$/;
const RE_TEST_SKIP  = /^\s*○\s+(?:skipped\s+)?(.+)$/;
const RE_SUMMARY    = /Tests:\s+(\d+)\s+passed/;
```

### pytest

```javascript
const RE_TEST_PASS  = /^(.+\.py)::(.+)\s+PASSED/;
const RE_TEST_FAIL  = /^(.+\.py)::(.+)\s+FAILED/;
const RE_TEST_SKIP  = /^(.+\.py)::(.+)\s+SKIPPED/;
const RE_SUMMARY    = /(\d+)\s+passed/;
const RE_COLLECTING = /^collecting\s+\.\.\./;
```

### dotnet test

```javascript
const RE_TEST_PASS  = /^\s*Passed\s+(.+)/;
const RE_TEST_FAIL  = /^\s*Failed\s+(.+)/;
const RE_TEST_SKIP  = /^\s*Skipped\s+(.+)/;
const RE_SUMMARY    = /Total tests:\s*(\d+)/;
```

### Cargo test (Rust)

```javascript
const RE_TEST_PASS  = /^test\s+(.+)\s+\.\.\.\s+ok$/;
const RE_TEST_FAIL  = /^test\s+(.+)\s+\.\.\.\s+FAILED$/;
const RE_TEST_SKIP  = /^test\s+(.+)\s+\.\.\.\s+ignored$/;
const RE_SUMMARY    = /test result:\s*(ok|FAILED)\.\s+(\d+)\s+passed;\s+(\d+)\s+failed/;
```

### Go test

```javascript
const RE_TEST_PASS  = /^---\s+PASS:\s+(\S+)\s+\((\d+\.\d+)s\)/;
const RE_TEST_FAIL  = /^---\s+FAIL:\s+(\S+)\s+\((\d+\.\d+)s\)/;
const RE_TEST_SKIP  = /^---\s+SKIP:\s+(\S+)/;
const RE_SUMMARY    = /^(?:ok|FAIL)\s+(\S+)\s+(\d+\.\d+)s/;
```

## Adding a New Adapter

### 1. Study Framework Output

Run the framework and capture stdout:
```bash
npx vitest run 2>&1 | tee output.txt
```

Identify patterns for: suite start, test pass/fail/skip, summary, errors.

### 2. Write Regex Patterns

Test against real output. Account for:
- Unicode markers and ASCII fallbacks (`✓` vs `√`)
- Optional duration formats (`3ms`, `(3 ms)`, `0.003s`)
- Indentation variations

### 3. Implement parseLine

```javascript
function parseLine(line) {
  const suiteMatch = line.match(RE_SUITE_START);
  if (suiteMatch) return { type: 'suite_start', suiteName: suiteMatch[1] };
  // ... check pass, fail, skip, summary, error in order
  return null;
}
```

### 4. Register in Dispatch Table

```javascript
DISPATCH['myframework'] = { cmd: 'myframework test', filter: (f) => `--filter "${f}"` };
```

### 5. Add Auto-Detection

```javascript
INDICATORS.push({ framework: 'myframework', files: ['myframework.config.js'] });
```

## Fallback Mode

When no adapter exists, the wrapper operates without real-time progress:
- State `running` when process starts (total/passed/failed stay 0)
- State `passed`/`failed` from exit code when process ends
- Still provides basic "running/done" indication
