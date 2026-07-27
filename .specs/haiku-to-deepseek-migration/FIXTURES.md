# Fixtures

**Classification:** TEST_DATA_ACTIVE

All fixtures are checked-in redacted captures or deterministic derivatives of captures. They contain no live credential, account identifier, secret, or unredacted sensitive prompt. A fixture is not a claim that a candidate route is live; live catalog verification remains runtime behavior.

| ID | Kind | Lifecycle | Source / shape | Consumer | Cleanup |
|---|---|---|---|---|---|
| F-H2D-01 | static JSON | Per scenario | Redacted actual direct OpenRouter request/response shape captured from supported producer | Direct selection and source/bundle BDD | No mutable state. |
| F-H2D-02 | static JSON | Per scenario | Redacted actual AiPomogator `/go/v1/models` capture with provenance/date; route values are used only as captured catalog evidence | Catalog-first routing BDD | No mutable state. |
| F-H2D-03 | factory JSON | Per scenario | Negative variants derived from F-H2D-02 shape: missing field, malformed body, empty list, absent compatible route | Fail-soft routing BDD | Delete generated temp variants in AfterScenario. |
| F-H2D-04 | static records | Per feature | Redacted representative prompt-suggest, claim-evidence, and semantic workloads with reviewer-approved ground truth | Quality gate | Remove temporary evaluation output in AfterScenario. |
| F-H2D-05 | static JSON | Per feature | Captured price metadata and token-count record for 842 input / 11 output comparison; date/source retained | Cost and drift gate | No mutable state. |
| F-H2D-06 | factory observation | Per scenario | Supported entry-point observation for source/bundle, canonical/mirror, and installer/configuration parity | Exact-ID integrity BDD | Reset temporary build/install state in AfterScenario. |

## Validation rules

- F-H2D-01 and F-H2D-02 MUST mirror real producer field shapes; hand-invented provider/catalog schemas are prohibited.
- F-H2D-03 MAY alter only a documented captured shape to create the named negative condition.
- F-H2D-04 MUST be redacted before check-in and reviewed for Russian/format/hallucination scoring suitability.
- F-H2D-05 preserves historical cost evidence but live pricing metadata determines whether a numeric savings claim can be emitted.
- F-H2D-06 MUST exercise supported runtime/configuration seams, not merely inspect files.