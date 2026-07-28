# User Stories

> Each story uses the User Story Form (v3): Priority in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:**.

### User Story 1: One traceable test engine (Priority: P1)

As a maintainer, I want a single test engine (BDD), so that every test is traceable in the spec graph and there are no orphan unit tests living outside a spec.

**Why:** Mixed engines (vitest + cucumber) leave ~120 graph-invisible tests, so coverage and honesty rollups under-report reality.

**Independent Test:** After the tail is migrated, `migrate.ts --batch` reports netCount = 0 and a repo scan finds zero `*.test.ts` files.

**Acceptance Scenarios:**

Given the repository has been fully migrated
When the migration corpus is counted
Then netCount is 0 and no `*.test.ts` remain

### User Story 2: Mutation strength survives the move (Priority: P1)

As a maintainer, I want the code's mutation protection preserved after the move to BDD, so that the migration does not silently weaken the real strength of the tests.

**Why:** If the 56 detector assertions move to coarser BDD scenarios, mutants formerly killed by vitest could survive and the test suite would be weaker than it looks.

**Independent Test:** `npm run mutation:bdd` then `npm run mutation:verify` show every previously-killed mutant is KILLED by the BDD scenarios before the vitest twin is deleted.

**Acceptance Scenarios:**

Given the 56 detector checks are expressed as @feature7 Scenario Outline + Examples
When mutation:bdd and mutation:verify run on the detector
Then every mutant previously killed by vitest is KILLED

### User Story 3: .NET mutation path is checked automatically (Priority: P2)

As a maintainer, I want the .NET mutation path verified automatically in Docker, so that it is not skipped for a missing local toolchain.

**Why:** The .NET scenario currently `skipIf`s when `dotnet-stryker` is absent, so it never actually runs and provides no protection.

**Independent Test:** In the canonical Docker-cucumber run the .NET mutation scenario reports `passed`, not `skipped`.

**Acceptance Scenarios:**

Given the Docker base image ships the .NET 8 SDK and dotnet-stryker
When the canonical Docker BDD run executes
Then the .NET mutation scenario is passed (not skipped)

### User Story 4: No backsliding to the old engine (Priority: P1)

As an operator, I want a hook that prevents creating new tests on the old engine, so that reverting to vitest is impossible while existing tests are still being migrated.

**Why:** Without a gate, new vitest files keep appearing and the migration never converges to zero.

**Independent Test:** A Write of a new `*.test.ts` is denied by the hook; an Edit of an existing one and a Write of a `.feature`/step-def are allowed.

**Acceptance Scenarios:**

Given the bdd-only-test-guard hook is registered
When an agent writes a brand-new non-BDD test file
Then the hook denies the write with a BDD-only reason

### User Story 5: See honest remaining migration debt (Priority: P1)

As a repository maintainer, I want every Git-tracked legacy test classified as migration debt or a justified exemption, so that the migration spec cannot report READY while old product tests remain.

**Требование:** [FR-11](FR.md#fr-11-repository-wide-remaining-old-test-census-blocks-false-ready)

**Why:** A structural/execution-green spec is misleading when repository-owned non-BDD tests still exist outside its scenario graph.

**Independent Test:** Run BDDONLY001_07 and BDDONLY001_08 against the real Git census, authoritative verdict, and MCP status surfaces.

**Acceptance Scenarios:**

Given tracked product tests, fixtures, generated mirrors, and justified exemptions
When the repository census runs
Then every matched path is classified exactly once and conservation holds

Given an otherwise ready migration spec with residual in-scope old tests
When CLI and MCP readiness are evaluated
Then both report NOT_READY with the same census debt

