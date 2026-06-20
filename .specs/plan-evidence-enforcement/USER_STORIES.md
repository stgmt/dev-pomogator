# User Stories

> Each story uses the User Story Form (v3): `(Priority)` + **Why:** + **Independent Test:** + **Acceptance Scenarios:**.

### User Story 1: plans stop being fantasy (Priority: P1)

As a maintainer, I want the plan validator to flag claims with no proof, so that a plan is not built on unverified facts unless I personally catch them.

**Why:** the AI repeatedly asserted external facts with no source until the user pushed back — the incident that motivated this spec.

**Independent Test:** run the validator on a plan with a claim and no source marker → it flags an unsourced claim.

**Acceptance Scenarios:**

Given a plan whose Implementation Plan claims «X supports Y» with no marker
When the plan validator runs
Then it flags that line as an unsourced claim

---

### User Story 2: the proof format is standard (Priority: P2)

As a plan author, I want a documented proof-marker format and a template section, so that I add evidence the same way every time.

**Why:** without a standard, evidence is ad-hoc and the validator cannot check it.

**Independent Test:** the rule defines `[src:]`/`[ref:]`/`[cmd:]`; the template has a sources section.

**Acceptance Scenarios:**

Given the claims-need-evidence rule and the plan template
When an author writes a plan
Then they place each external fact under a marker or in the sources section
