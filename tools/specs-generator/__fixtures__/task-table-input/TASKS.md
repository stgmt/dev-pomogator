# Tasks — task-table contract fixture (FR-21)

This spec is a FROZEN INPUT for `tools/specs-generator/__tests__/task-table-contract.test.ts`.
It exercises every branch of `parseTasksForTable`: bullet + heading formats, explicit
Status overrides, checkbox-derived status, Est/depends extraction, Phase -1 ids,
em-dash title truncation. DO NOT edit without regenerating `../task-table.baseline.md`.

## Task Summary Table

(placeholder — the CLI ignores this section; it parses task blocks below)

## Phase -1: Infrastructure Prerequisites

- [x] Provision the database container — id: provision-db — Status: DONE | Est: 30m
  _Requirements: FR-21_
  **Done When:**
  - container starts

- [ ] Seed env vars — id: seed-env — Status: TODO | Est: 15m
  _depends: provision-db_
  **Done When:**
  - .env.test exists

## Phase 0: BDD Foundation (Red)

- [ ] Write failing scenarios — long title that goes on and on to make sure the eighty character truncation branch is exercised properly — id: red-scenarios — Status: IN_PROGRESS | Est: 45m
  _depends: seed-env_

- [x] Checkbox-only status (no explicit Status field, derived DONE from [x])
  _depends: red-scenarios_

## Phase 1: Implementation (Green)

- [ ] Blocked task — id: blocked-task — Status: BLOCKED | Est: 120m
  _depends: red-scenarios, seed-env_

### 📋 `heading-format-task`
> Heading-format block with a blockquote description line.
- **files:** `src/example.ts` *(edit)*
- **refs:** FR-21
- **deps:** *none*
Status: IN_PROGRESS | Est: 60m
