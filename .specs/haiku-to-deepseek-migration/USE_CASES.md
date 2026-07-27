# Use Cases

## UC-1: Execute a direct OpenRouter selector

**Actor:** Maintainer or supported runtime entry point.

**Preconditions:** The direct provider path is configured and any supported environment override is available.

**Main flow:**
1. The selector resolves a supported override first.
2. Without an override it selects `deepseek/deepseek-v4-flash`.
3. It exposes effective model, provider path, and decision source at the supported seam.
4. Source and generated bundle are exercised through supported entry points.

**Postconditions:** The observed direct selection is exact and no live Haiku default remains in the scoped path.

## UC-2: Resolve an AiPomogator route

**Actor:** Operator or routed runtime entry point.

**Preconditions:** The provider catalog endpoint and credential path are configured.

**Main flow:**
1. The selector requests and validates `/go/v1/models`.
2. It chooses only a compatible DeepSeek identifier returned by that catalog.
3. It records verified-catalog provenance and the exact selected ID.

**Alternative flow:** Missing credentials, provider failure, malformed/empty catalog, or no compatible entry produces an explicit diagnostic and configured non-Haiku abstention, stop, or fallback behavior.

**Postconditions:** No routed ID was invented from the direct OpenRouter slug and no silent Haiku fallback occurred.

## UC-3: Run a semantic selector safely

**Actor:** Claim-evidence or learning workflow.

**Preconditions:** A supported selector entry point and optional environment override are available.

**Main flow:**
1. The workflow resolves its effective provider/model and decision source.
2. It runs the semantic operation.
3. It emits secret-free diagnostics for provider/output failure conditions.

**Postconditions:** Override precedence is preserved and failure does not report a false DeepSeek success or retain Haiku silently.

## UC-4: Regenerate and synchronize derived policy artifacts

**Actor:** Maintainer.

**Preconditions:** Canonical source or canonical `.claude` policy was changed.

**Main flow:**
1. The maintainer runs the supported bundle regeneration or mirror synchronization process.
2. Integration verification invokes source/bundle and canonical/mirror entry points.
3. The verifier compares active model and fallback behavior, including exact-ID installer/configuration output.

**Postconditions:** Derived artifacts are parity-verified, not independently hand-authored.

## UC-5: Decide rollout readiness from product evidence

**Actor:** Human reviewer.

**Preconditions:** Redacted representative workload captures and price metadata are available.

**Main flow:**
1. The reviewer compares Haiku baseline and DeepSeek candidate under fixed settings.
2. The gate records rubric scores, latency, tokens, cost, provenance, and pass/fail/no-go.
3. The gate checks pricing metadata before publishing any numeric savings claim.

**Postconditions:** External benchmarks remain candidacy evidence and a missing, failed, or drifted record prevents a readiness claim.