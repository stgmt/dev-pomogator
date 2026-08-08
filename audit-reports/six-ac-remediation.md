# Six remaining acceptance criteria — remediation journal

## Initial disposition

- AC-1.3: superseded. The old npm/v1 installation contract is no longer the canonical distribution path; the active product path is the marketplace plugin. History remains in the spec CHANGELOG and the AC-mapping journal.
- AC-7.4: active implementation gap. Requires an executable installed-versus-integrated guard and real-artifact evidence.
- AC-7.5: active evidence gap. Requires a repeatable Marksman link-resolution proof, not only the historical 2026-06-04 measurement.
- AC-20.2: active evidence gap. The producer and technical tests exist; an AC-owned BDD proof is being added.
- AC-26.2: active producer/wiring gap. Opt-out previously returned SKIPPED_OPT_OUT but did not emit the required event or flow from spec verdict to every pair.
- AC-36.6: active process-gate gap. Requires a machine-readable migration-phase completion gate.

## Wave 1 — semantic opt-out producer and BDD ownership

- Status: implementation in progress on branch fix/six-ac-remediation.
- Changed producer: tools/spec-llm-judge/index.ts now emits SEMANTIC_CHECK_SKIPPED_OPT_OUT before returning from the opt-out branch. The event contains only FR/scenario identities and severity info; no prose is persisted.
- Changed verdict: tools/specs-generator/spec-verdict.ts reads the owning spec explicit spec_llm_judge_deny: true frontmatter, passes the policy into every FR-to-scenario pair, and reports the skip as a fail-loud semantic note.
- Added BDD owner: SPECGEN004_694 with AC-26.2; it asserts no subprocess, no semantic cache entry, and one event per pair.
- Door change: AC-1.3 now carries an explicit superseded disposition in ACCEPTANCE_CRITERIA.md.

## Verification pending

- Filtered Docker BDD: SPECGEN004_694.
- Full Docker BDD and authoritative verdict: only after all six remediation waves and the final commit.
