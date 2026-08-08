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

## Wave 2 — FR-20 speed and atomic acknowledgement BDD ownership

- Added BDD owner: SPECGEN004_695 with AC-20.2.
- The scenario drives the real summary producer over 1000 log entries, measures 100 samples, invokes the real acknowledgement CLI, validates complete JSON, and checks temporary-file cleanup.
- The existing technical regression in tools/specs-validator/__tests__/conformance-summary.test.ts remains complementary; the acceptance path is now BDD-owned.

## Wave 3 — real Marksman link-definition proof

- Extended tools/marksman-installer/lsp-probe.ts with one reusable LSP session, request/response correlation, initialized/didOpen notifications, and textDocument/definition handling.
- The real-artifact e2e now creates source/target Markdown files, sends a link-position definition request to the real Marksman binary, and asserts the target URI plus heading range.
- Added AC-7.5 ownership to SPECGEN004_15 through the MCP door; no capability-only evidence is treated as sufficient.
- Local probe returned one target definition with the expected target URI; Docker BDD verification is running under the canonical test wrapper.

