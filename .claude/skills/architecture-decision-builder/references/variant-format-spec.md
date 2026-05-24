# Variant Format Spec

Each variant in an AxisModel (consumed by `artefact-generator.ts` → `VariantModel`) follows this skeleton. Attribution = where each field comes from.

```
{
  "id": "kebab-id",
  "name": "Human name",
  "y_statement": "In the context of X, facing Y, use Z and reject W, to achieve V, accepting U.",   // Zimmermann Y-statement
  "maturity_ring": "Adopt | Trial | Assess | Hold",                                                  // Thoughtworks Tech Radar
  "cost_chip": "$ | $$ | $$$",                                                                        // qualitative, not exact $ (stale)
  "good":    ["Good, because <concrete property> [VERIFIED via <doc>]"],                              // MADR Good + R3 marker
  "neutral": ["Neutral, because <wash fact>"],                                                        // MADR Neutral (avoids fake con)
  "bad":     ["Bad, because <concrete cost> [VERIFIED|UNVERIFIED]"],                                   // MADR Bad
  "failure_modes": ["crash mid-op → mitigation", "duplicate side-effect → idempotency key", ...],     // R10 (bhph)
  "when_to_choose": "one scenario sentence",                                                           // TC39 use-cases / KEP Goals
  "when_not_to_choose": "one scenario sentence",                                                       // KEP Non-Goals (R6)
  "real_world_precedent": [{ "repo": "...", "stars": N, "url": "..." }],                               // live octocode grep (R8 evidence)
  "confirmation": "fitness function — how we know it works post-adoption",                            // MADR v4 Confirmation
  "is_recommended": true|false
}
```

## Discipline reminders (BLOCKING — see SKILL.md)

- **R3:** every technical claim → `[VERIFIED via <source>]` or `[UNVERIFIED]`. No bare confident facts.
- **R10:** `failure_modes` non-empty — crash / duplicate / poison / race. "Exactly-once delivery" ≠ idempotent side-effect.
- **R11:** each choice is vendor-RECOMMENDED [cite], not just feasible.
- **R12:** for external integrations note webhook timeout / sync-vs-async / rate limits in good/bad/failure_modes.
- **R8:** ≥1 variant outside the obvious popular default.

Exactly one variant per axis has `is_recommended: true`. Recommendation pinned top by html-renderer regardless of grid shuffle order.
