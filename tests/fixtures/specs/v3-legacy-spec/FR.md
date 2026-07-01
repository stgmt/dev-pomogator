# Functional Requirements — v3-legacy-spec

This fixture mixes the OLD v3 heading shape (`### Requirement: FR-N Title`)
with the NEW v4 shape (`### FR-N: Title {#fr-N}`) in the same file to prove
the dual-anchor + triple-anchor parser branches coexist (FR-3, FR-29).

### Requirement: FR-1 Login

Legacy v3 form. Parser MUST register three anchors:
`FR-1`, `fr-1-login`, and `requirement-fr-1-login`.

### FR-2: Logout {#fr-2}

Modern v4 form with an explicit `{#fr-2}` slug. Parser MUST register the
compact id `FR-2` plus the modern slug `fr-2-logout`. The triple-anchor
heading above MUST NOT be flagged as `MALFORMED_HEADING`.
