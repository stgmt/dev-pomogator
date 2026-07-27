# Implementation Tasks

BDD-only, integration-first implementation: all behavior tests belong in Docker Cucumber feature files and supported step definitions. Provider and catalog fixtures must be real producer-shaped redacted captures.

## Phase 0: Evidence and BDD foundation

- [ ] census active selector and exact-ID surfaces — id: h2d-inventory-evidence — Status: TODO | Est: 75m

_Requirements: [FR-1](FR.md#fr-1), [FR-2](FR.md#fr-2), [FR-3](FR.md#fr-3), [FR-4](FR.md#fr-4)_

**Done When:**
  - [ ] A checked-in census distinguishes active source, generated bundle, canonical/mirror, installer, configuration, BDD, and historical-only Haiku mentions.
  - [ ] Every scoped path names its supported runtime/configuration seam and owner.

- [ ] capture redacted producer-shaped fixtures — id: h2d-real-fixtures-red — Status: TODO | Est: 90m

_Requirements: [FR-1](FR.md#fr-1), [FR-2](FR.md#fr-2), [FR-5](FR.md#fr-5)_

**Done When:**
  - [ ] Direct request/response, catalog, workload, and price captures have provenance and redaction review.
  - [ ] Negative catalog fixtures derive from a real captured shape rather than invented JSON.

- [ ] define rubric and no-go thresholds — id: h2d-quality-gate-red — Status: TODO | Est: 90m

_Requirements: [FR-3](FR.md#fr-3), [FR-5](FR.md#fr-5)_

**Done When:**
  - [ ] The fixed rubric covers relevance, hallucination, Russian, format/length, malformed/empty rate, latency, and cost.
  - [ ] Per-surface pass/fail/no-go and pricing-drift rules are reviewable before rollout.

## Phase 1: Direct and semantic selectors

- [ ] migrate prompt-suggest canonical source and bundle — id: h2d-prompt-suggest-green — Status: TODO | Est: 90m

_Requirements: [FR-1](FR.md#fr-1), [FR-4](FR.md#fr-4)_

**Done When:**
  - [ ] Canonical prompt-suggest default is exactly `deepseek/deepseek-v4-flash` and supported override precedence remains intact.
  - [ ] The supported bundle regeneration and Docker BDD prove source/bundle effective-ID parity.

- [ ] migrate Meridian direct and routed behavior — id: h2d-claim-evidence-green — Status: TODO | Est: 120m

_Requirements: [FR-1](FR.md#fr-1), [FR-2](FR.md#fr-2), [FR-3](FR.md#fr-3), [FR-4](FR.md#fr-4)_

**Done When:**
  - [ ] Meridian direct defaults, catalog routing, overrides, and diagnostics satisfy the documented policy.
  - [ ] The regenerated executable bundle is exercised by Docker BDD.

- [ ] migrate learning semantic selection — id: h2d-learnings-capture-green — Status: TODO | Est: 90m

_Requirements: [FR-3](FR.md#fr-3), [FR-5](FR.md#fr-5)_

**Done When:**
  - [ ] The live semantic default and supported override/fail-soft behavior are observable through a supported entry point.
  - [ ] Real-workload evidence includes the learning surface decision.

## Phase 2: AiPomogator routing and override behavior

- [ ] implement catalog-first route selection — id: h2d-aipomogator-green — Status: TODO | Est: 120m

_Requirements: [FR-2](FR.md#fr-2), [FR-3](FR.md#fr-3)_

**Done When:**
  - [ ] The selector chooses only a compatible returned catalog ID and records verified-catalog provenance.
  - [ ] Missing credentials, provider errors, malformed/empty catalogs, and absent routes emit non-Haiku fail-soft diagnostics.

- [ ] test direct and routed precedence — id: h2d-override-precedence — Status: TODO | Est: 60m

_Requirements: [FR-1](FR.md#fr-1), [FR-2](FR.md#fr-2), [FR-3](FR.md#fr-3)_

**Done When:**
  - [ ] Docker BDD proves documented override precedence at actual configuration/request seams.
  - [ ] Diagnostics distinguish override, direct default, and verified-catalog selection sources.

## Phase 3: Canonical mirror and installer integrity

- [ ] synchronize cross-spec-reconcile canonical and mirror — id: h2d-cross-spec-mirror — Status: TODO | Est: 75m

_Requirements: [FR-4](FR.md#fr-4)_

**Done When:**
  - [ ] Canonical `.claude` policy is updated before the designated `.agents` synchronization.
  - [ ] Integration verification shows identical active model and fallback semantics.

- [ ] propagate exact selected ID — id: h2d-claude-mem-installer — Status: TODO | Est: 75m

_Requirements: [FR-2](FR.md#fr-2), [FR-4](FR.md#fr-4)_

**Done When:**
  - [ ] Bootstrap writes the exact direct or verified routed selected ID through its supported path.
  - [ ] Docker BDD and current-behavior documentation assert that exact value.

- [ ] synchronize meridian-model-call guidance — id: h2d-meridian-mirror — Status: TODO | Est: 60m

_Requirements: [FR-4](FR.md#fr-4)_

**Done When:**
  - [ ] Canonical Meridian guidance/configuration is updated and the mirror is synchronized.
  - [ ] Exact-current-ID documentation checks reject generic nonempty assertions.

- [ ] prove active policy at executable seams — id: h2d-exact-id-census — Status: TODO | Est: 90m

_Requirements: [FR-1](FR.md#fr-1), [FR-2](FR.md#fr-2), [FR-3](FR.md#fr-3), [FR-4](FR.md#fr-4)_

**Done When:**
  - [ ] Every scoped runtime/configuration path is exercised through a supported entry point.
  - [ ] The census proves no active Haiku selector remains and identifies any historical-only reference separately.

## Phase 4: Quality gate and final Docker proof

- [ ] evaluate real redacted workloads — id: h2d-ab-quality-gate — Status: TODO | Est: 120m

_Requirements: [FR-5](FR.md#fr-5)_

**Done When:**
  - [ ] Each scoped surface has a fixed-rubric baseline/candidate record and human-reviewed pass/fail/no-go decision.
  - [ ] Price metadata is checked and pricing drift withholds numeric savings claims.

- [ ] remove obsolete active selection paths — id: h2d-refactor — Status: TODO | Est: 45m

_Requirements: [FR-1](FR.md#fr-1), [FR-2](FR.md#fr-2), [FR-3](FR.md#fr-3), [FR-4](FR.md#fr-4)_

**Done When:**
  - [ ] Duplicate active selection branches are removed without changing historical evidence prose.
  - [ ] BDD continues to exercise all supported paths after refactoring.

- [ ] run final integration proof — id: h2d-final-docker-bdd — Status: TODO | Est: 45m

_Requirements: [FR-1](FR.md#fr-1), [FR-2](FR.md#fr-2), [FR-3](FR.md#fr-3), [FR-4](FR.md#fr-4), [FR-5](FR.md#fr-5)_

**Done When:**
  - [ ] Docker-only BDD covers direct/bundle, catalog/fail-soft, mirror/installer exact-ID, and quality/pricing scenarios.
  - [ ] Evidence records scenario outcomes without marking unrun scenarios as passed.