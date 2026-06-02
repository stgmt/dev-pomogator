# Reqnroll sample NDJSON fixture

Test fixture for `tests/e2e/multilang-ingest-roundtrip.test.ts` (FR-31, AC-31.1/2).

## Status: **handcrafted to schema**

This fixture is **handcrafted** to the canonical `@cucumber/messages` NDJSON
envelope schema (protocol version 32.2.0). It is **not** the live output of a
Reqnroll process executed on the CI runner, because:

- A full Reqnroll regeneration requires a minimal .NET solution (`.csproj` +
  `MessagesPlugin` + bound step definitions); shipping that subtree just for
  one fixture would balloon the repo.
- CI hosts are not guaranteed to have `dotnet` SDK 9.x + the `Reqnroll`
  templates installed; the spec calls out (FR-31) that test infrastructure
  must ship as committed fixtures, not gated on runner availability.

The fixture is, however, **schema-correct** — every envelope (`meta`,
`source`, `gherkinDocument`, `pickle`, `testCase`, `testCaseStarted`,
`testStepStarted`, `testStepFinished`, `testCaseFinished`, `testRunStarted`,
`testRunFinished`) matches the structure Reqnroll v3 emits when invoked with
the messages plugin, and `meta.implementation.name = "Reqnroll"` so
`detectRunner()` returns `'reqnroll'` per
`tools/spec-graph/parsers/multilang.ts:47`.

## Expected scenarios

| pickle id        | name                  | status  |
| ---------------- | --------------------- | ------- |
| `pk-login-ok`    | Login OK              | PASSED  |
| `pk-login-fail`  | Login wrong password  | FAILED  |

Failing step error message includes
`Reqnroll.AssertionException: Expected response to be rejected but got 200 OK`.

## Regeneration with a real Reqnroll runner (optional)

If you want to refresh this fixture from a real Reqnroll project, the
minimal recipe is:

```bash
# 1. Scaffold (one-off)
dotnet new install Reqnroll.Templates.DotNet
dotnet new reqnroll-project -n AuthSample
cd AuthSample
dotnet add package Reqnroll.xUnit
dotnet add package Reqnroll.Messages

# 2. Drop the same Feature + step bindings as the fixture above
#    (Auth.feature with "Login OK" + "Login wrong password").

# 3. Run with the messages plugin pointed at this dir
dotnet test --logger "reqnroll;messages=output.ndjson"

# 4. Copy AuthSample/bin/Debug/<tfm>/output.ndjson to this directory.
```

Runner command + version used to assemble the schema reference:

- **Reqnroll** 3.0.0 (https://www.nuget.org/packages/Reqnroll)
- **.NET SDK** 9.0.10
- **Cucumber Messages protocol** 32.2.0

The handcrafted fixture mirrors the envelope sequence Reqnroll 3.0.0 emits;
if the upstream schema bumps to 33+ and a field changes shape, this fixture
will need to be updated alongside `tools/spec-graph/parsers/ndjson.ts`.
