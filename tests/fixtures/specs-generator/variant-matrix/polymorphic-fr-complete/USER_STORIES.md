# User Stories

### User Story 1: Stock validation across doctypes (Priority: P1)

As a warehouse operator, I want stock validation работать корректно для всех типов документов, чтобы не submitнуть document с invalid quantities.

**Why:** Prevent inventory drift across variant doctype submissions.

**Independent Test:** Run audit-spec.ts → assert zero VARIANT_COVERAGE findings.

**Acceptance Scenarios:**

Given doctype is one of supported variants
When validation runs
Then correct warehouseId param is passed to pipeline
