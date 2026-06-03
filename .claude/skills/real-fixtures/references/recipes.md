# real-fixtures — recipes by format and by framework

Loaded on demand. The SKILL.md recipe is universal; here are the per-format trim
strategies (step 4) and per-framework test snippets (step 6). Pick the row that
matches your producer's **format** and your project's **test framework** — the
two are independent (a Python project can consume cucumber NDJSON; a TS project
can consume git porcelain).

## Part A — trim a real capture to a valid minimal subset, by FORMAT

### NDJSON / record stream (cucumber messages, `go test -json`, jsonl logs)
Records are interdependent and emitted in order. Keep: global header records
(meta/schema) + the full reference chain for the chosen cases. Filter forward,
building id-sets as you go (parent record seen before child). Re-parse after.
Example helper: `scripts/extract-ndjson-subset.ts` (cucumber). For `go test
-json`: keep all events whose `"Test"` is in your chosen set + package-level
`"Action":"start"`/`"pass"`/`"fail"` events.

### JSON array of results (`pytest --json-report`, `eslint -f json`, REST list)
Parse, keep N elements covering the outcome classes, re-serialize. Preserve any
top-level envelope keys the consumer reads (`{summary, tests:[...]}` → keep
`summary` recomputed for the kept subset, or document that summary is full-run).

### Single JSON object (one API response, one `EXPLAIN FORMAT JSON` row)
Don't trim structure — capture a small real call instead (hit an endpoint that
returns a small payload). If you must shrink, drop array elements only, never
invent keys. Keep one success + one error response as separate fixtures.

### Line-oriented text (`git status --porcelain`, `diff`, compiler output)
Each line is independent — keep the lines for your chosen cases verbatim,
including NUL separators (`-z`) and exact whitespace. Do NOT normalize; the
parser must handle the real bytes. Keep one fixture per format variant
(porcelain v1 vs v2).

### CSV / tabular
Keep the header row + N data rows covering value classes (empty cell, quoted
comma, unicode, max width). Preserve the real delimiter/quoting/line ending.

### Binary / protobuf / avro / msgpack
Never hand-edit. Capture a real small message off the wire/topic and commit it
as a binary fixture (+ a README noting the schema version). Decode-and-assert in
the test; reconcile a field against a known producer value.

### Golden / snapshot files
Capture by running the real producer once (`--update-snapshots` / `UPDATE=1`),
then **review the diff by hand** before committing — an unreviewed golden is a
fabricated fixture with extra steps.

## Part B — integration test that loads the REAL fixture, by FRAMEWORK

All snippets: load the committed real fixture, assert the documented ground
truth with EXACT assertions, and reconcile an aggregate with the producer's own
summary.

### vitest / jest (TypeScript)
```typescript
import { describe, it, expect } from 'vitest';
import { parseOutput } from '../src/parse';
const result = parseOutput(readFileSync('tests/fixtures/real-sample.ndjson', 'utf8'));
it('matches the captured ground truth', () => {
  expect(result.byId.get('case-3')?.status).toBe('UNDEFINED'); // exact, not toBeDefined
  expect(result.summary).toEqual({ passed: 40, pending: 10, undefined: 29 }); // == tool summary
});
```

### pytest (Python)
```python
from pathlib import Path
from app.parser import parse_output

def test_real_fixture_ground_truth():
    result = parse_output(Path("tests/fixtures/real-sample.json").read_text())
    assert result["case-3"]["status"] == "undefined"   # exact
    assert result["summary"] == {"passed": 40, "pending": 10, "undefined": 29}
```

### JUnit (JVM)
```java
@Test void realFixtureGroundTruth() throws Exception {
  var result = Parser.parse(Files.readString(Path.of("src/test/resources/real-sample.json")));
  assertEquals("UNDEFINED", result.get("case-3").status());
  assertEquals(Map.of("passed",40,"pending",10,"undefined",29), result.summary());
}
```

### xUnit (.NET)
```csharp
[Fact]
public void RealFixture_GroundTruth() {
  var result = Parser.Parse(File.ReadAllText("Fixtures/real-sample.json"));
  Assert.Equal("Undefined", result["case-3"].Status);
  Assert.Equal(new() {["passed"]=40,["pending"]=10,["undefined"]=29}, result.Summary);
}
```

### go test
```go
func TestRealFixtureGroundTruth(t *testing.T) {
  b, _ := os.ReadFile("testdata/real-sample.ndjson")
  got := Parse(b)
  if got["case-3"].Status != "undefined" { t.Fatalf("got %q", got["case-3"].Status) }
  if got.Summary != (Summary{Passed:40,Pending:10,Undefined:29}) { t.Fatal("summary mismatch") }
}
```

### cargo (Rust)
```rust
#[test]
fn real_fixture_ground_truth() {
    let s = std::fs::read_to_string("tests/fixtures/real-sample.json").unwrap();
    let got = parse(&s);
    assert_eq!(got["case-3"].status, "undefined");
    assert_eq!(got.summary, Summary { passed: 40, pending: 10, undefined: 29 });
}
```

## Reconciling with the producer's own summary

Most producers print a summary you can pin against (cucumber `N scenarios (X
passed, …)`, pytest `N passed, M failed`, `go test` final line, HTTP status +
`X-Total-Count`). Capture that number alongside the fixture and assert the
parsed aggregate equals it **exactly**. A mismatch means the fixture or the
parser is wrong — that's the whole point.
