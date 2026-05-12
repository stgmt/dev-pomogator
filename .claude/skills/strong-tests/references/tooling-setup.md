# Tooling Setup — Per-Stack Matrix

> Loaded on-demand by `strong-tests` SKILL.md Section 3 when the auto-detected stack is NOT TS or Python.
>
> The primary detail is in SKILL.md Section 3 (TS+Python). This file covers the 6-stack matrix in full + the detection signals + install/run commands per stack.

## Detection signals

| Stack | Manifest | Required marker |
|-------|----------|-----------------|
| TypeScript | `package.json` | `"vitest"` or `"jest"` in `devDependencies` |
| Python | `pyproject.toml` or `setup.py` | `pytest` in `[tool.poetry.dev-dependencies]` or `[build-system].requires` or `extras_require` |
| Java | `pom.xml` | `<artifactId>junit-jupiter</artifactId>` |
| C# / .NET | `*.csproj` (any) | `<PackageReference Include="xunit"` or `Include="NUnit"` |
| Rust | `Cargo.toml` | `[dev-dependencies]` block exists |
| Go | `go.mod` + `*_test.go` files | `*_test.go` files in any subdir |

`scripts/run-mutation.ts` checks signals in order TS → Python → Java → C# → Rust → Go and returns the first match. For polyglot repos (≥2 stacks detected) the dispatcher returns the matrix to the skill which then asks via `AskUserQuestion` which stack to target (per FR-4 AC).

---

## TypeScript / vitest

**Install:**
```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner fast-check
```

**Stryker config (`stryker.conf.json`):**
```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "reporters": ["html", "json", "progress"],
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "thresholds": { "high": 80, "low": 60, "break": 70 },
  "mutate": ["src/**/*.ts", "!src/**/*.test.ts"]
}
```

**Run:**
```bash
npx stryker run
# Output: reports/mutation/mutation.html + .json
# JSON parsed by scripts/run-mutation.ts → standardized shape
```

**Threshold default:** 70% (critical path); 50% (standard); 30% (experimental). Per OutSight + Levnikolaevich consensus.

**fast-check (PBT) install + minimal example:** see SKILL.md Section 3 (TS detail).

---

## Python / pytest

**Install:**
```bash
pip install mutmut hypothesis
# or
poetry add --group dev mutmut hypothesis
```

**mutmut config (`setup.cfg` or `pyproject.toml`):**
```toml
[tool.mutmut]
paths_to_mutate = "src/"
backup = false
runner = "pytest"
tests_dir = "tests/"
```

**Run:**
```bash
mutmut run
mutmut results
# Output: parses survivors line-by-line — scripts/run-mutation.ts parses the
# tabular text output and converts to standardized JSON shape.
```

**Hypothesis (PBT) install + example:** see SKILL.md Section 3 (Python detail).

**Threshold default:** 70%.

---

## Java / Maven + JUnit 5

**Install:**
```xml
<!-- pom.xml -->
<dependency>
  <groupId>net.jqwik</groupId>
  <artifactId>jqwik</artifactId>
  <version>1.8.5</version>
  <scope>test</scope>
</dependency>
<plugin>
  <groupId>org.pitest</groupId>
  <artifactId>pitest-maven</artifactId>
  <version>1.18.0</version>
  <configuration>
    <targetClasses><param>com.example.*</param></targetClasses>
    <targetTests><param>com.example.*</param></targetTests>
    <mutationThreshold>70</mutationThreshold>
  </configuration>
</plugin>
```

**Run:**
```bash
mvn org.pitest:pitest-maven:mutationCoverage
# Output: target/pit-reports/<timestamp>/mutations.xml + index.html
```

**Threshold default:** 70%. PIT supports `<mutationThreshold>` in pom.xml — Maven build fails if not met.

**jqwik (PBT) — minimal example:**
```java
@Property
boolean serialize_deserialize_roundtrip(@ForAll User user) {
    return User.deserialize(user.serialize()).equals(user);
}
```

---

## C# / .NET + xUnit

**Install:**
```bash
dotnet tool install -g dotnet-stryker
dotnet add package FsCheck.Xunit
```

**Stryker.NET config (`stryker-config.json`):**
```json
{
  "stryker-config": {
    "reporters": ["html", "json", "progress"],
    "test-runner": "vstest",
    "thresholds": { "high": 80, "low": 60, "break": 70 },
    "mutate": ["src/**/*.cs"]
  }
}
```

**Run:**
```bash
dotnet stryker
# Output: StrykerOutput/<timestamp>/reports/mutation-report.html + .json
```

**Threshold default:** 70%.

**FsCheck.Xunit (PBT) example:**
```csharp
[Property]
public bool RoundTrip(User u) => u.Serialize().Deserialize().Equals(u);
```

---

## Rust / cargo

**Install:**
```bash
cargo install cargo-mutants
# Cargo.toml [dev-dependencies] add:
# proptest = "1.4"
```

**Run:**
```bash
cargo mutants
# Output: mutants.out/ directory with caught/missed/timeout lists
```

**Threshold default:** 70% (manually computed: `caught / (caught + missed)`).

**proptest example:**
```rust
proptest! {
  #[test]
  fn serialize_roundtrip(u: User) {
    let bytes = u.serialize();
    let deserialized = User::deserialize(&bytes).unwrap();
    prop_assert_eq!(u, deserialized);
  }
}
```

---

## Go / `testing`

**Install:**
```bash
go install github.com/avito-tech/go-mutesting/cmd/go-mutesting@latest
go get -t github.com/leanovate/gopter
```

**Run:**
```bash
go-mutesting ./...
# Output: stdout with mutations applied + tests pass/fail per mutation
```

**Threshold default:** 70% (compute manually from output).

**gopter (PBT) example:**
```go
func TestRoundTrip(t *testing.T) {
    properties := gopter.NewProperties(nil)
    properties.Property("roundtrip", prop.ForAll(
        func(u User) bool {
            return Deserialize(u.Serialize()).Equals(u)
        },
        userGen(),
    ))
    properties.TestingRun(t)
}
```

---

## Threshold rationale (cross-stack)

70% is the empirical anchor across three independent sources:
- **OutSight AI**: "critical paths ≥70%".
- **Meta ACH**: privacy engineers accepted 73% of generated tests.
- **Levnikolaevich claude-code-skills marketplace**: ≥75% threshold in mutation-testing skill.

Standard tier: ≥50%. Experimental tier: ≥30% (per OutSight tiering).

## Tool quality notes

| Tool | Maturity | Speed (medium codebase) | Notes |
|------|----------|------------------------|-------|
| Stryker (TS) | Production | 5-20min | Best HTML report; widely deployed |
| mutmut (Python) | Stable | 10-30min | Best for medium projects; slower than Stryker |
| PIT (Java) | Production | 5-15min | Industry standard since 2012 |
| Stryker.NET | Stable | 5-15min | Stryker family port to .NET |
| cargo-mutants (Rust) | Stable | 10-30min | Younger ecosystem, fewer mutators |
| go-mutesting | Stable | 10-30min | Less polished output; manual JSON conversion |

For SLOW tools on large codebases: invoke with `--paths-to-mutate <single-file>` (mutmut) / `--mutate <single-file>` (Stryker) per NFR-P1 in spec NFR.md.
