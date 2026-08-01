# Pinator extraction blast-radius — 2026-07-30

> **Superseded naming (2026-07-31):** canonical Pinator = `.specs/pinator/` (Stop-judge; runtime still `tools/claim-evidence-gate/`). npm `build:pinator` renamed to `build:prompt-suggest`. This blast-radius note's "Pinator proper = prompt-suggest" framing is obsolete.

## Executive verdict

The repository uses **Pinator** ambiguously:

1. **Pinator proper = prompt-suggest**: `package.json` names its build target `build:pinator`, and `.env.example` calls prompt-suggest next-step hints “the pinator”.
2. **The claim-evidence judge is a separate subsystem**, although commit messages, incident reports, code regexes, and some spec prose also call it Pinator.

Therefore the safe default is:

- keep `tools/claim-evidence-gate/` and its generic spec-graph infrastructure on `main`;
- preserve current `main` on a dedicated Pinator branch;
- remove `tools/prompt-suggest/` from `main` by path and regenerate hook artifacts;
- do **not** revert commits selected by the word `pinator`.

If the intended extraction includes the claim-evidence judge too, use the extended scope below; it is a materially larger spec-generator refactor, not a second directory deletion.

No files were changed during the investigation except this untracked report.

## Scope A — prompt-suggest only (recommended)

### Whole-owned artifacts to remove from main

- `tools/prompt-suggest/` (source, prompt, submit hook, Stop hook, tracked bundle).
- `.specs/prompt-suggest/` (16 spec documents/artifacts).
- `tests/features/plugins/prompt-suggest/PLUGIN010_prompt-suggest.feature`.
- Pinator-specific entries in `tests/fixtures/haiku-to-deepseek-migration/workload-and-pricing.json`.

The PLUGIN010 feature is currently not listed in either canonical Cucumber path list and has no dedicated step-definition module, so deleting that feature alone does not reduce an executing suite. The haiku migration step-definition is the real breaker.

### Canonical hook removal and generated cascade

The actual source of truth is `.claude-plugin/hooks.legacy.json`, not `.claude-plugin/hooks.json`.

Remove both prompt-suggest groups from the legacy manifest:

- Stop launcher around `.claude-plugin/hooks.legacy.json:39`;
- UserPromptSubmit launcher around `.claude-plugin/hooks.legacy.json:420`.

Then regenerate:

- `tools/hook-service/registry.json` through `tools/hook-service/generate-registry.mjs`;
- `.claude-plugin/hooks.json` and `.claude/settings.json` together through `tools/hook-service/generate-manifest.mjs`;
- `tools/spec-graph/__tests__/__fixtures__/registry-parity/settings-hooks.snapshot.json` from the new per-event registry identities.

Current generated routes are:

- `Stop/3/0` → prompt-suggest Stop bundle (`tools/hook-service/registry.json:26`);
- `UserPromptSubmit/2/0` → prompt-suggest submit hook (`tools/hook-service/registry.json:321`).

Deleting positional groups renumbers later routes. Hand-deleting only the visible route is unsafe: regeneration restores it, while editing only one generated artifact creates manifest/registry drift. Existing user-global managed settings may retain old route IDs until the managed-hook migration repairs them.

### Independent Codex distribution

Claude hook regeneration does not update the Codex channel. Remove prompt-suggest from:

- `.codex/hooks.json` (UserPromptSubmit and Stop launchers);
- `.codex/config.toml:9-10` (`PROMPT_SUGGEST_ENABLED`, `PROMPT_SUGGEST_TTL`);
- Codex support spec prose and its nested prompt-suggest feature.

### Build/config/docs edits

- Delete `build:pinator` from `package.json:50` and its token from `build:bundles` at `package.json:54`.
- Remove only prompt-suggest settings/comments from `.env.example:8-35`; retain shared `AUTO_COMMIT_API_KEY`, OpenRouter/AiPomogator, and claim-gate settings.
- Remove prompt-suggest from `docs/COMPONENTS.md:105,125,128`.
- Scrub stale prompt-suggest launchers from `.claude/settings.json.bak` if that tracked backup remains in the repository.
- Update the registry-parity fixture after regeneration.

### Executing test breaker

`tests/step_definitions/feature_haiku_to_deepseek.ts` imports `tools/prompt-suggest/prompt_suggest_core.ts` at line 9, enumerates prompt-suggest source/bundle paths at lines 36-37 and 159, and defines prompt-suggest provider/model steps at lines 67-79. Deleting `tools/prompt-suggest/` first makes loading the shared step-definition set fail, which can collapse the whole Docker BDD run.

Carve prompt-suggest out of that step-definition and its real-workload fixture before deleting the directory. Amend the `haiku-to-deepseek-migration` spec through the MCP spec door so its FR-1/FR-4 exact-ID scope no longer requires a removed consumer; preserve it as historical/out-of-scope evidence rather than silently rewriting history.

### Spec/doc cleanup

The dedicated prompt-suggest spec can be moved with the branch. Surviving specs need surgical cleanup:

- `claim-evidence-gate/README.md`: remove the sibling link to the prompt-suggest spec, but keep the claim-gate spec.
- `codex-cli-support`: remove prompt-suggest support-matrix/design/task/feature claims.
- `haiku-to-deepseek-migration`: remove active prompt-suggest obligations and mark historical evidence appropriately.
- `test-statusline`, `pomogator-doctor`, `session-pilot`, and `spec-generator-v4`: remove incidental prompt-suggest prose only where it describes a current component.
- Remove prompt-suggest entries from both spec-reality-check bulk eval snapshots, or regenerate those datasets.

All spec edits must go through the spec MCP door and need a graph/conformance pass afterward.

### Keep on main

- `tools/claim-evidence-gate/` and `tests/features/plugins/claim-evidence-gate/`.
- `.specs/claim-evidence-gate/`.
- `tools/spec-graph/task-census.ts`, `spec-status-store.ts`, and generic task-routing/status APIs.
- `tools/_shared/marker-utils.ts`; it has several non-claim-gate consumers.
- `tools/_shared/deepseek-model.ts` and shared credentials/endpoints.
- `audit-reports/pinator-no-kick-analysis.md`, `pinator-token-burn-analysis.md`, and `referent-grounding-failure-analysis.md`: despite their names, they document claim-evidence-gate incidents.
- `AUTO_COMMIT_API_KEY`: it has multiple surviving consumers.

The surviving gate contains four comment-only references to prompt-suggest (`meridian-judge.ts:11,26,134`; `claim_evidence_gate_stop.ts:113`). Scrub or reword them, but they are not runtime dependencies.

## Scope B — if “Pinator” means prompt-suggest plus claim-evidence-gate

This extended extraction is high blast radius.

### Additional whole-owned removals

- `tools/claim-evidence-gate/` including its tracked bundle and live judge bench.
- `.specs/claim-evidence-gate/`.
- `tests/features/plugins/claim-evidence-gate/CEGATE001_claim-evidence-gate.feature`.
- `tests/step_definitions/feature_claim_evidence_gate.ts`.
- Claim-gate feature entries in both `cucumber.json:49` and `cucumber.docker.json:49`.
- `build:claim-gate` and its `build:bundles` token in `package.json:51,54`.
- Stop route around `.claude-plugin/hooks.legacy.json:99`, followed by the same registry/manifest/settings/snapshot regeneration.

### Cross-spec hostage: spec-generator-v4 FR-49

The claim gate is not isolated from the spec-generator contract. `spec-generator-v4` FR-49 explicitly requires:

- census-aware claim-evidence gating;
- the LLM judge and provider resolution;
- no-next-section behavior;
- task replay, intent inheritance, and Pinator fire logging.

`tests/step_definitions/feature49_autosurface.ts` imports the gate classifier, transcript parser, and judge at lines 27-29 and drives the real Stop hook from line 299 onward. It contains many executing SPECGEN004 scenarios, including the mandate/replay/fire-log and terse-follow-up behavior around lines 745-975. The spec feature also carries the FR-49 scenarios, including SPECGEN004_530 near line 3401. `TASKS.md` P32-7 records Pinator fire logging as completed work.

Deleting the gate without redesigning FR-49 makes another spec dishonest and makes the shared BDD step-definition loader fail. Extended extraction therefore requires one of two explicit product decisions:

1. **Retire FR-49b/e/g/h gate behavior from spec-generator-v4**, update AC/scenarios/tasks and replace next-step surfacing with census/MCP-only behavior; or
2. **Move the FR-49 gate contract and its test slice to the Pinator branch**, leaving only generic census/status behavior in spec-generator-v4.

Do not simply delete the imports/scenarios while leaving FR-49 marked implemented.

### Runtime consumers of the judge module

`tools/bdd-quality-judge/judge.ts:17` imports `resolveEndpoint` directly from `claim-evidence-gate/meridian-judge.ts`. If the gate moves out, extract provider resolution into a neutral shared module first and repoint this consumer.

The pomogator-doctor Meridian check is also coupled to `CLAIM_GATE_JUDGE` semantics (`.claude/skills/pomogator-doctor/scripts/engine/checks/meridian.ts:18-32`, plus the `.agents` mirror and bundled doctor). Extended extraction requires redesigning or deleting those claim-gate-specific checks and rebuilding the doctor bundle.

`tools/claude-subscription-proxy/ensure-up.cjs` describes claim-gate as its primary SessionStart reason. Verify all remaining proxy consumers before deciding whether that SessionStart autostart hook remains justified; do not remove generic Meridian/proxy infrastructure merely because the gate consumed it.

### Generic code to keep but rename/re-document

- `task-census.ts` has many non-gate consumers: spec MCP lifecycle, conformance push, conformance summary, status and autosurface tooling.
- `spec-status-store.ts` is used by the MCP server/lifecycle/conformance push.
- `marker-utils.ts` is shared by test-quality, auto-simplify, answer-simple, and other hooks.
- `feature-strength.ts`, spec MCP descriptions, orchestrator feature maps, bg-task guard, anchor/test-quality gates, and BDD migrator mainly carry comments or coordination language. Reword them and rebuild generated bundles; do not delete their generic behavior.

### Additional specs/docs/tests to update

- `haiku-to-deepseek-migration` currently treats both prompt-suggest and claim-evidence as active model consumers.
- `pomogator-doctor` has claim-gate judge scenarios/steps.
- `spec-generator-v4` FR-49, ACs, scenarios, tasks, design, and file-change map need a coherent retirement or transfer.
- `bdd-only-migration` and mutation-quality prose cite claim-gate migration/bench exceptions.
- CARL and project rules that promise mechanical anti-handoff enforcement (`finish-the-deploy-dont-hand-off`, `no-unverified-blocker`) must be rewritten if the enforcement hook leaves main.
- `CLAUDE.md`, `AGENTS.md`, the discipline map, and `docs/COMPONENTS.md` hook inventories need new behavior counts/descriptions.

## Git/history strategy

There is no existing Pinator branch.

History is too entangled for commit reverts:

- the prompt-suggest introduction was concentrated in `aa58492a`, but later migrations touched it inside broad canonical-plugin and v4 mega-commits;
- most commits whose subject says `pinator` actually modify the claim-evidence judge and spec-graph infrastructure;
- at least two relevant commits are very broad (one touched roughly 1,300 files, another roughly 316).

Recommended sequence:

1. Create and push a preservation branch at the exact current `main` tip, e.g. `feature/pinator` or `archive/pinator-full`.
2. Create a separate removal branch from the same commit, e.g. `chore/main-without-pinator`.
3. Remove by owned paths plus explicit surgical edits; do not revert by commit-message grep.
4. Merge the removal branch into `main`; continue Pinator development only on the preservation branch.
5. If Pinator should remain mergeable long-term, give that branch its own CI/release/versioning policy; otherwise main’s future refactors will continuously conflict with a frozen feature branch.

The current tree has about 183 dirty paths, overwhelmingly pre-existing audit/temp artifacts plus `.claude/settings.local.json`. Before branch operations, snapshot exact status and avoid `git add -A`; stage only named paths. Creating a branch pointer itself does not require stashing, but switching/excising should happen in an isolated worktree or after safely preserving the dirty state.

## Validation matrix

### Prompt-suggest-only extraction

- `tools/prompt-suggest/` absent on main and present on the preservation branch.
- No prompt-suggest routes in legacy hooks, generated registry, generated Claude manifest/settings, Codex hooks/config, or parity snapshot.
- Claim-evidence Stop route still exists and resolves to an existing bundle.
- Hook manifest, registry, and dogfood settings pass the managed-hook review and parity scenarios.
- `npm run build:bundles` succeeds without `build:pinator`.
- `npm run lint` and `npm run check:skill-health` pass.
- Docker BDD passes after the haiku step-definition carve-out; do not run Cucumber on the host.
- `npm pack --dry-run --json` contains no prompt-suggest code/spec/stale shipped report.
- Spec graph has no `prompt-suggest` nodes and no dangling links/requirements to them.
- A clean installed-plugin smoke proves neither Stop nor UserPromptSubmit dispatches a missing route.
- Managed-hook migration repairs existing local/user settings so old positional route IDs are not left behind.

### Extended extraction

All checks above, plus:

- no claim-gate route, bundle, config, doctor check, Cucumber path, or spec node remains on main;
- `bdd-quality-judge` uses neutral provider plumbing;
- spec-generator-v4 FR-49 is retired/transferred coherently, with no importing step definitions or orphan scenarios;
- generic task census/status/MCP behavior remains green;
- user-facing promises about automatic anti-handoff enforcement are removed or replaced;
- SessionStart proxy autostart is retained only if a surviving runtime consumer needs it.

## Pipeline blind spot

The release workflow does not run hook-review, lint, a bundle build, or the Docker BDD suite before publishing. A partial removal can therefore publish a tarball whose registry points at a deleted hook target. The extraction should either harden the release workflow in the same change or perform the complete local validation matrix before tagging.

## Final recommendation

Use **prompt-suggest-only scope** unless there is an explicit decision that the claim-evidence Stop judge must leave main too. That extraction is bounded: one owned tool directory/spec/feature, two canonical hook groups, Codex wiring, one executing cross-migration step-definition, generated artifacts, and prose/eval cleanup.

Moving the claim-evidence judge as well crosses a subsystem boundary: it changes spec-generator-v4 FR-49, the BDD quality judge, doctor behavior, proxy rationale, rules that promise mechanical enforcement, and a large executing BDD slice. Treat that as a separate architecture/spec migration, not as “remove the other Pinator folder.”
