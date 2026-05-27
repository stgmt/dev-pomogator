# Stryker baseline на meridian — BLOCKED: Bun test runner

> Real-world finding во время H6 attempt. Skill assumes vitest/jest dispatchable test runner. Reality — multiple TS projects use **Bun** runner which Stryker не supports out-of-box.

## What was attempted

Run Stryker baseline on meridian (TS proxy, 93 tests, 95% Unit classified by skill) per H6 plan.

## What was found

`meridian/package.json` scripts:

```json
"test": "bun test --path-ignore-patterns '**/*session-store*' --path-ignore-patterns ..."
```

Test runner: **Bun** (`bun test` command).

Stryker.js officially supports:
- `@stryker-mutator/karma-runner` — Karma
- `@stryker-mutator/jest-runner` — Jest
- `@stryker-mutator/vitest-runner` — Vitest
- `@stryker-mutator/mocha-runner` — Mocha
- `@stryker-mutator/cucumber-runner` — Cucumber

**No `@stryker-mutator/bun-runner`** exists. Per Stryker GitHub issue tracker, Bun support is community-requested but not implemented.

## Implications для strong-tests skill

`run-mutation.ts detectStack()` для TypeScript относит ВСЕ TS проекты к Stryker. Should detect Bun signals:
- `bun.lock` file present
- `package.json scripts.test` starts with `bun test`
- `bunfig.toml` present

If Bun detected — emit warning "Stryker не supports Bun. Workarounds: (a) migrate to vitest, (b) use Stryker command-runner with `bun test` wrapper".

## Workaround option (untested)

Stryker has generic `command-runner` plugin:

```json
{
  "testRunner": "command",
  "commandRunner": {
    "command": "bun test"
  }
}
```

This invokes raw command per mutant. **Limitations**:
- No per-test coverage analysis (Stryker can't know which tests cover which mutants)
- Slower (full test suite per mutant)
- For meridian 93 tests × 200+ mutants → potentially hours

Not validated в this session — would require installing Stryker в meridian which I don't have permission to do без user discussion.

## What skill produced anyway

Even без Stryker baseline:
- Classifier output: 93 tests → 88 Unit / 4 Integration / 1 E2E (95% Unit ready)
- Detector found 4 production files with `extractFileChangesFromToolUse` collection-returning function
- Audit found gap: only 1/4 branches tested in transform-parity.test.ts
- Recommended 12 invariant tests per function = ~48 missing tests across 4 adapters

## Recommended skill v0.6.1+ update

Update `run-mutation.ts detectStack()`:

```typescript
// TS branch detection — add Bun check
if (pkg.devDependencies?.['typescript'] || pkg.scripts?.test) {
  const usesBun = pkg.scripts?.test?.startsWith('bun ') ||
                  fs.existsSync(join(cwd, 'bunfig.toml')) ||
                  fs.existsSync(join(cwd, 'bun.lock'));
  if (usesBun) {
    return { stack: 'ts', tool: null, warnings: ['Bun test runner detected. Stryker does not support Bun natively. Workarounds: (a) migrate to vitest, (b) use Stryker command-runner.'] };
  }
  // ... existing vitest/jest detection
}
```

## Pragmatic alternative for meridian

Skill provided **actionable insight** даже без Stryker:
1. Gap analysis (REAL_TASK_MERIDIAN.md) с 12 specific tests per function
2. Classification ready for `--include-integration` / `--include-e2e` flag application when Stryker available
3. Recommendation: migrate to vitest OR command-runner для Stryker compatibility

User can apply skill recommendations manually:
1. Write 12 invariant tests in `src/__tests__/crush-adapter.test.ts`
2. Run `bun test src/__tests__/crush-adapter.test.ts` to verify they pass
3. Mutation testing remains future work blocked on Bun ↔ Stryker integration
