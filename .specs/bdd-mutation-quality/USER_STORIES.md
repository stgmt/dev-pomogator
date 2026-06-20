# User Stories

> Each story uses the User Story Form (v3): `(Priority)` + **Why:** + **Independent Test:** + **Acceptance Scenarios:**.

### User Story 1: BDD code stays mutation-protected (Priority: P1)

As a maintainer, I want mutations to test BDD-covered code too, so that migrating a test to BDD does not silently drop its real protection.

**Why:** vitest-only mutation let BDD-covered code rot undetected — the gap that motivated this spec.

**Independent Test:** `npm run mutation:bdd` produces a mutation score for a BDD-covered file in minutes.

**Acceptance Scenarios:**

Given a file covered only by `@featureN` scenarios
When `npm run mutation:bdd` runs
Then Stryker reports its mutation score via the cucumber-runner (perTest)

---

### User Story 2: weak BDD tests are caught at author-time (Priority: P2)

As a test author, I want an advisory when I write a weak BDD test, so that coarse scenarios are flagged before a slow mutation run.

**Why:** coverage gaps + loose assertions are invisible until a mutation run; an edit-time nudge is cheaper.

**Independent Test:** edit a step-def with a loose `assert.ok` → the hook emits a §6.5 advisory.

**Acceptance Scenarios:**

Given a step-def whose only assertion is `assert.ok(result)`
When the PostToolUse bdd-quality hook runs
Then it emits an advisory naming the loose-assertion criterion
