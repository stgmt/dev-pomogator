# Russian CARL evaluation fixture notes

This directory documents how `tools/carl/evaluate-russian.ts` uses the real CARL fixture captured from the sibling `presentation-reels` repository.

## Evidence source

The evaluator reads these real captured artifacts from `tests/fixtures/carl/`:

- `bench.stdout.tsv` — producer benchmark rows with loaded-domain summaries for `neutral-continue`, `ru-debug-root-cause`, `render-legibility`, `feature-index`, and `codex-ru-debug`.
- `manifest.json` — capture date, source repo, producer status, and SHA-256 source hashes.
- `real-output/README.md` — provenance ledger and trust boundary.

The evaluator deliberately does **not** call `git diff`, `git log`, or `git status`, because Docker BDD runs without `.git`.

## Prompt matrix

| Case | Russian intent | Evidence | Expected result |
|------|----------------|----------|-----------------|
| `neutral-continue` | `продолжай` should stay small | real sibling fixture row | `[GLOBAL]` only |
| `ru-debug-root-cause` | debugging/root-cause in Russian | real sibling fixture row | `[GLOBAL]`, anti-infra-blame, reproduce-not-theorize |
| `specs-workflow` | specs/feature-index Russian prompt | real sibling fixture row | `[GLOBAL]`, `PROJECT__FEATURE_INDEX` |
| `changed-rule-skill` | changed rule/skill Russian prompt | no dev-pomogator-owned real output yet | gap: capture real output + add aliases |
| `render-legibility` | presentation render readability | real sibling fixture row | `[GLOBAL]`, render legibility, Remotion reference |
| `deferred-codex-ru-debug` | Codex Russian debug prompt | real sibling fixture row | `[GLOBAL]`, reproduce-not-theorize |

## Trust boundary

The report mode is `fixture-backed-sibling-real-output`, and `runtimeReadiness.devPomogator` is always `false`. This fixture proves output shape and highlights Russian coverage gaps; it is not proof that dev-pomogator's own runtime is ready.

## Current optimization finding

The intentionally missing `changed-rule-skill` case produces false negatives for `GLOBAL` and `PROJECT__FEATURE_INDEX` because there is no dev-pomogator-owned real CARL output for that Russian prompt yet. The generated recommendations require:

1. capture real dev-pomogator CARL output for the prompt;
2. add project-owned Russian aliases for `обнови правило`, `скилл`, `русские алиасы`, and `проверь хук`;
3. rerun the evaluator and promote the captured output to a real regression fixture only after the source hashes are recorded.
