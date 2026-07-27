# Design

## Scope and ownership

Direct OpenRouter defaults use the exact `deepseek/deepseek-v4-flash` ID. AiPomogator is a separate routed namespace whose selected ID is data from a validated `/go/v1/models` response, not a transformed direct slug. Canonical source owns generated bundles; canonical `.claude` owns `.agents` mirrors.

### Decision: Use the exact direct OpenRouter model identity

**Требование:** [FR-1](FR.md#fr-1)

**Rationale:** Direct OpenRouter has a verified exact model identity and does not require routed-catalog translation.

**Trade-off:** The direct selector is intentionally provider-specific rather than portable across routed namespaces.

**Alternatives considered:**
- Reuse one string for every provider; rejected because routed providers own independent catalogs.
- Preserve the Haiku direct default until all routed providers migrate; rejected because direct OpenRouter already has a verified DeepSeek target.

### Decision: Separate direct and routed provider identities

**Требование:** [FR-2](FR.md#fr-2)

**Rationale:** The direct OpenRouter ID is known and exact, while AiPomogator availability and route IDs must be verified from its live catalog before selection.

**Trade-off:** Routing adds a discovery call and explicit unavailable-route behavior rather than a static convenience string.

**Alternatives considered:**
- Derive an AiPomogator ID by prefixing or copying the OpenRouter slug; rejected because it invents provider availability.
- Retain Haiku when the catalog fails; rejected because it hides migration failure and violates fail-soft policy.

### Decision: Fail soft without silent Haiku fallback

**Требование:** [FR-2](FR.md#fr-2)

**Rationale:** Provider/catalog/credential/output failures must be diagnosable while configured work can abstain, stop, or use a documented non-Haiku fallback.

**Trade-off:** Some calls intentionally decline work instead of using an implicit legacy model.

**Alternatives considered:**
- Catch errors and continue with a prior Haiku default; rejected because behavior would be silent and unverifiable.
- Treat any provider failure as a generic success with empty output; rejected because callers cannot distinguish availability from quality failure.

### Decision: Preserve observable semantic-selector overrides

**Требование:** [FR-3](FR.md#fr-3)

**Rationale:** Claim-evidence and learning selectors need explicit DeepSeek defaults while retaining operator override precedence and secret-free diagnostics.

**Trade-off:** Every selector must expose its decision source instead of hiding model resolution inside a request helper.

**Alternatives considered:**
- Remove environment overrides; rejected because existing operator control is part of the runtime contract.
- Accept any nonempty model string; rejected because it cannot prove that Haiku was removed.

### Decision: Verify derived artifacts through supported entry points

**Требование:** [FR-4](FR.md#fr-4)

**Rationale:** Source text does not prove a distributed bundle, mirror, installer, or configuration has the active policy used by users.

**Trade-off:** Regeneration and synchronization become explicit implementation tasks and integration checks take longer than text scans.

**Alternatives considered:**
- Manually edit generated bundles and mirrors; rejected because canonical ownership is lost.
- Use nonempty-model or source-text assertions; rejected because stale derived behavior can still pass.

### Decision: Gate rollout on real redacted workload evidence

**Требование:** [FR-5](FR.md#fr-5)

**Rationale:** Product prompts, Russian output, format, failures, latency, and cost require representative workload evidence beyond external benchmark rankings.

**Trade-off:** Capture/redaction and human review add preparation time and may produce a no-go result.

**Alternatives considered:**
- Accept external benchmark results as product proof; rejected because they establish candidacy only.
- Publish the historical 65.3 percent saving unconditionally; rejected because live pricing, retry, caching, and tokenization can drift.

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE

**TEST_DATA:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js
**Install Command:** already installed via project dependencies and configured in `cucumber.json`
**Evidence:** `cucumber.json`, `tests/step_definitions/`, and `tests/hooks/` are the existing executable BDD infrastructure.
**Verdict:** Reuse the existing Cucumber.js world and cleanup hooks; add producer-shaped fixtures and scenario-local temporary outputs.

| Fixture class | Lifecycle | Source and cleanup | Use |
|---|---|---|---|
| Redacted provider/catalog captures | Per scenario | Checked-in redacted producer capture; no live credential; remove temporary material in AfterScenario | Direct request shape and AiPomogator catalog routing/failures |
| Redacted workload records | Per feature | Checked-in redacted representative samples; evaluation output is temporary and removed after review/import | Baseline/candidate rubric and pricing drift |
| Generated/mirror parity observations | Per scenario | Produce through supported build/sync path; reset temp output in AfterScenario | Source/bundle and canonical/mirror behavior |

Docker-only Cucumber BDD is the test source of truth. Provider-specific scenarios use checked-in producer-shaped captures; live credentials and unredacted payloads are prohibited.

### Existing hooks

| Hook file | Type | Scope | Reuse |
|---|---|---|---|
| `tests/hooks/before-after.ts` | Before/After | Per scenario | Reuse for temporary environment and artifact cleanup. |

### New hooks

No new hook file is required; scenario-local cleanup is added through the existing `tests/hooks/before-after.ts` hook surface.

### Cleanup Strategy

Each scenario restores model-related environment variables, removes temporary catalog and workload output files, and discards generated comparison artifacts. Checked-in redacted captures remain immutable. Cleanup executes even after assertion failure.

### Test Data & Fixtures

| Fixture/Data | Path | Purpose | Lifecycle |
|---|---|---|---|
| Redacted OpenRouter model catalog | `tests/fixtures/haiku-to-deepseek/openrouter-models.json` | Prove exact direct model availability and live pricing shape. | Shared immutable capture |
| Redacted AiPomogator model catalog variants | `tests/fixtures/haiku-to-deepseek/aipomogator-models-*.json` | Cover present, absent, empty, and malformed routed catalog outcomes. | Per scenario |
| Redacted workload packet | `tests/fixtures/haiku-to-deepseek/workload.ndjson` | Compare baseline and candidate on product-shaped prompts. | Per feature |

### Shared Context / State Management

| Key | Type | Written by | Read by | Purpose |
|---|---|---|---|---|
| `selectedModel` | string or null | provider-selection Given/When steps | routing assertions | Record the resolved direct or routed ID. |
| `diagnostic` | redacted object | runtime call step | failure assertions | Prove fail-soft reason without secrets. |
| `evaluationRows` | array | A/B execution step | rubric and cost assertions | Hold per-sample baseline/candidate evidence. |
