# Cucumber-JVM sample NDJSON fixture

Test fixture for `tests/e2e/multilang-ingest-roundtrip.test.ts` (FR-31, AC-31.1/2).

## Status: **handcrafted to schema**

This fixture is **handcrafted** to the canonical `@cucumber/messages` NDJSON
envelope schema (protocol version 32.2.0). It is **not** the live output of a
real `cucumber-jvm` process on the CI runner, because:

- A real regeneration requires a full Maven (or Gradle) sub-module with
  `pom.xml`, `io.cucumber:cucumber-java` + `io.cucumber:cucumber-junit-platform-engine`
  dependencies, step definitions, and a JUnit runner. Vendoring that for one
  fixture would balloon the repo.
- CI hosts do not always have an OpenJDK + Maven toolchain; FR-31 mandates the
  fixture must ship as committed bytes, not as a generation script that
  depends on `mvn`/`javac`.

The fixture is, however, **schema-correct** — every envelope conforms to the
canonical `@cucumber/messages` shape and `meta.implementation.name = "cucumber-jvm"`
so `detectRunner()` returns `'cucumber-jvm'` per
`tools/spec-graph/parsers/multilang.ts:47`.

## Expected scenarios

| pickle id       | name                | status  |
| --------------- | ------------------- | ------- |
| `pk-charge-ok`  | Charge succeeds     | PASSED  |
| `pk-no-funds`   | Insufficient funds  | FAILED  |

Failing step error message includes
`org.opentest4j.AssertionFailedError: Charge to be declined but ledger shows captured`.

## Regeneration with a real Cucumber-JVM runner (optional)

If you want to refresh this fixture from a real cucumber-jvm project, the
recipe is:

```bash
# 1. Scaffold a Maven project (one-off)
mvn archetype:generate -DgroupId=com.example -DartifactId=payment-sample \
    -DarchetypeArtifactId=maven-archetype-quickstart -DinteractiveMode=false

# 2. Add to pom.xml:
#    - io.cucumber:cucumber-java                       (7.18.1)
#    - io.cucumber:cucumber-junit-platform-engine      (7.18.1)
#    - org.junit.platform:junit-platform-suite-engine
#    - junit-jupiter-engine
#    - cucumber.publish.quiet=true                     (in src/test/resources/cucumber.properties)

# 3. Drop the same feature + step bindings as the fixture above:
#    src/test/resources/features/payment.feature
#    src/test/java/com/example/PaymentSteps.java
#    src/test/java/com/example/RunCucumberTest.java   (JUnit 5 launcher class)

# 4. Run with the message plugin:
mvn test \
  -Dcucumber.plugin=message:target/cucumber-report.ndjson

# 5. Copy target/cucumber-report.ndjson to this directory as output.ndjson.
```

Runner command + version used to assemble the schema reference:

- **cucumber-jvm** (io.cucumber:cucumber-java) 7.18.1
- **OpenJDK** 21.0.4
- **Cucumber Messages protocol** 32.2.0

The handcrafted fixture mirrors the envelope sequence cucumber-jvm 7.18.1
emits via the `message` plugin; if upstream bumps the schema and a field
shape drifts, the fixture will need re-syncing alongside
`tools/spec-graph/parsers/ndjson.ts`.
