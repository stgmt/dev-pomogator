# Testing Guide

Test each component independently using fixture-based testing. This approach is fast, deterministic, and independent of framework installation.

## Fixture-Based Approach

Create test fixtures (mock YAML status files and JSON stdin) rather than running real test suites.

### YAML Status Fixtures

Place in `tests/fixtures/{extension-name}/`:

```yaml
# mock-status-running.yaml
version: 2
session_id: "abc12345"
pid: __PID__
started_at: "2026-03-09T19:30:00Z"
updated_at: "2026-03-09T19:31:15Z"
state: running
framework: "vitest"
total: 50
passed: 38
failed: 2
skipped: 0
running: 10
percent: 76
duration_ms: 45000
error_message: ""
log_file: ".dev-pomogator/.test-status/test.abc12345.log"
```

**PID placeholder:** Use `__PID__` and replace at test time:
- With `process.pid` to test alive PID detection
- With `99999` (dead PID) to test dead process detection

### JSON Stdin Fixtures

```json
{
  "session_id": "abc12345def67890ghijklmnop",
  "cwd": "/test/project"
}
```

## Testing the Render Script

Invoke via `spawnSync` with fixture data:

```typescript
function renderWithFixture(stdinJson: string, statusYaml: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-sl-'));
  const statusDir = path.join(tmpDir, '.dev-pomogator', '.test-status');
  fs.mkdirSync(statusDir, { recursive: true });

  const parsed = JSON.parse(stdinJson);
  const prefix = parsed.session_id.substring(0, 8);
  fs.writeFileSync(
    path.join(statusDir, `status.${prefix}.yaml`),
    statusYaml.replace('__PID__', String(process.pid))
  );

  const result = spawnSync('node', ['statusline_render.cjs'], {
    input: JSON.stringify({ ...parsed, cwd: tmpDir }),
    encoding: 'utf-8',
    timeout: 5000,
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result.stdout;
}
```

### Assertions

```typescript
// Running state
expect(output).toContain('76%');
expect(output).toContain('38');
expect(output).not.toContain('\n');  // single line

// Idle state (no status file)
expect(output).toContain('no test runs');

// Dead PID detection
const deadYaml = yaml.replace('__PID__', '99999');
expect(renderWithFixture(stdin, deadYaml)).toContain('failed');

// Color coding (ANSI escape codes)
// Green: \x1b[32m  Yellow: \x1b[33m  Red: \x1b[31m
```

## Testing the Wrapper

Run wrapper with a trivial command, verify YAML output:

```typescript
function testWrapper(framework: string, testCommand: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-wr-'));

  spawnSync('node', [
    'test_runner_wrapper.cjs',
    '--framework', framework,
    '--', testCommand,
  ], {
    encoding: 'utf-8',
    timeout: 30000,
    env: {
      ...process.env,
      TEST_STATUSLINE_SESSION: 'abc12345',
      TEST_STATUSLINE_PROJECT: tmpDir,
    },
  });

  const statusDir = path.join(tmpDir, '.dev-pomogator', '.test-status');
  const files = fs.readdirSync(statusDir);
  const statusFile = files.find(f => f.startsWith('status.'));
  const yaml = fs.readFileSync(path.join(statusDir, statusFile), 'utf-8');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return yaml;
}

// Assertions
expect(testWrapper('vitest', 'echo "ok"')).toContain('state: passed');
expect(testWrapper('vitest', 'exit 1')).toContain('state: failed');
```

## Testing Adapters

Feed known lines through `parseLine`:

```typescript
describe('VitestAdapter', () => {
  it('parses test pass', () => {
    const event = parseLine(' ✓ should handle login 3ms');
    expect(event).toEqual({
      type: 'test_pass',
      testName: 'should handle login',
      duration: 3,
    });
  });

  it('parses test fail', () => {
    const event = parseLine(' ✗ should reject invalid input 5ms');
    expect(event?.type).toBe('test_fail');
  });

  it('returns null for unrecognized lines', () => {
    expect(parseLine('some random output')).toBeNull();
  });
});
```

**Capture real output** for test data:
```bash
npx vitest run 2>&1 | tee tests/fixtures/vitest-output.txt
```

## Testing the SessionStart Hook

```typescript
it('writes env vars to CLAUDE_ENV_FILE', () => {
  const envFile = path.join(tmpDir, 'env');
  fs.writeFileSync(envFile, '');

  spawnSync('node', ['session_start_hook.cjs'], {
    input: JSON.stringify({ session_id: 'abc12345xyz', cwd: tmpDir }),
    env: { ...process.env, CLAUDE_ENV_FILE: envFile },
    encoding: 'utf-8',
  });

  const content = fs.readFileSync(envFile, 'utf-8');
  expect(content).toContain('TEST_STATUSLINE_SESSION=abc12345');
  expect(content).toContain(`TEST_STATUSLINE_PROJECT=${tmpDir}`);
});
```

## Testing the Statusline Wrapper

```typescript
it('combines user and managed output', () => {
  const result = spawnSync('node', [
    'statusline_wrapper.cjs',
    '--user-b64', Buffer.from('echo "user-status"').toString('base64'),
    '--managed-b64', Buffer.from('echo "test-status"').toString('base64'),
  ], {
    input: '{}',
    encoding: 'utf-8',
  });

  expect(result.stdout).toContain('user-status');
  expect(result.stdout).toContain('test-status');
  expect(result.stdout).toContain('|');
});
```

## BDD Integration

Link tests to scenarios with `@featureN` tags:

```gherkin
# @feature1
Scenario: Statusline renders running state
  Given a YAML status file with state "running"
  When the render script executes
  Then stdout contains percent and progress bar
```

```typescript
// @feature1
describe('Render running state', () => {
  it('shows percent and progress bar', () => { /* ... */ });
});
```

## Test Organization

```
tests/
  e2e/
    test-statusline.test.ts
  fixtures/
    test-statusline/
      mock-status-running.yaml
      mock-status-passed.yaml
      mock-status-failed.yaml
      mock-stdin.json
  features/
    plugins/test-statusline/
      PLUGIN011_test-statusline.feature
```
