# External Dynamic Workflow sources

## Provenance and status

These references were supplied by the user and independently fetched on 2026-08-01. Source-code observations below are pinned to the fetched raw files and use conservative evidence markers. Repository popularity, tests, and production reliability are not inferred from code shape.

## Verified source matrix

| Candidate | Evidence status | Observed mechanism | Allowed use | Limits |
|-----------|-----------------|--------------------|-------------|--------|
| Salesforce DX VS Code `review-diff.js` (`https://raw.githubusercontent.com/forcedotcom/salesforcedx-vscode/develop/.claude/workflows/review-diff.js`) | `[SINGLE_SOURCE: fetched source code]` | The workflow explicitly sends every finding to an adversarial verifier whose job is to disprove it and returns confirmed, downgraded, or dropped. Its verdict rules inspect cited code, gating CI, external consumers, and ADR premises. | Borrow premise, file/line, CI, consumer, ADR, and severity checks plus fix-only-after-verification discipline. | Do not copy Salesforce-specific organizations, CI assumptions, private skills/services, or monolithic file shape. This source alone does not prove runtime success or tests. |
| Himmel `adversarial-verify.js` (`https://raw.githubusercontent.com/yotamleo/Himmel/main/.claude/workflows/adversarial-verify.js`) | `[SINGLE_SOURCE: fetched source code]` | A `pipeline()` reviews dimensions and launches one verifier per finding with: `Try to refute ... Default to refuted=true if uncertain.` Only findings with a non-refuted verdict survive. | Borrow the short refuter direction and per-item pipeline form. | One model verdict is not deterministic proof; fetched code did not establish reproduction or workflow-test coverage. |
| `claude-workflows-pack` `plan-module-review.js` (`https://raw.githubusercontent.com/liush2yuxjtu/claude-workflows-pack/main/workflows/plan-module-review.js`) | `[SINGLE_SOURCE: fetched source code]` | The inspected workflow uses targeted correctness and edge prompts and asks reviewers to construct an input or refute candidate defects. | Borrow diverse factual, false-positive, and reproducibility lenses and explicit coverage bounds. | Structural reference only. Its raw README URL `https://raw.githubusercontent.com/liush2yuxjtu/claude-workflows-pack/main/README.md` warns that several workflows rely on private services and may fail or no-op outside that environment. |
| shinpr `claude-code-workflows` README (`https://raw.githubusercontent.com/shinpr/claude-code-workflows/main/README.md`) | `[SINGLE_SOURCE: fetched README]` | The repository presents a Claude Code plugin ecosystem and links responsibility-specific discovery, procedure, task, and PR-review skills. | Borrow responsibility separation and objective artifact handoff only where verified in an actual source file. | The fetched README does not prove the current JavaScript Workflow DSL, runtime enforcement, or a specific orchestrator/implementer/verifier protocol. |
| Dynamic Workflow Registry (`https://dynamicworkflow.run/`) | `[SINGLE_SOURCE: fetched registry]` | The registry classifies Salesforce and Himmel as Claude Code orchestration and adversarial-verification examples. | Discovery and cross-reference only. | Registry description is not independent runtime or quality evidence. |
| Claude Code Ultimate Guide and awesome lists | `[UNVERIFIED in this session]` | Secondary explanation and discovery leads. | Use only to find primary sources. | Never override current official Claude Code docs or count inclusion as quality evidence. |

## Independent verification completed

- Raw Salesforce, Himmel, workflow-pack workflow, workflow-pack README, shinpr README, and Dynamic Workflow Registry pages were fetched rather than cited by name only.
- Salesforce and Himmel contain real JavaScript workflow primitives in the inspected source.
- Salesforce's verifier burden and Himmel's default-to-refuted wording were observed directly.
- The workflow-pack private-service warning was observed directly in its README.
- No claim here upgrades these repositories to tested, portable, or production-reliable without separate commit, test, and activity evidence.

## Remaining evidence work

1. Pin immutable commit SHAs instead of mutable default-branch raw URLs.
2. Record commit dates and activity.
3. Search each repository for executable tests of the workflow itself.
4. Identify all private skills, services, environment variables, and inaccessible dependencies.
5. Compare every runtime claim with current official Claude Code workflow documentation.
6. Keep claims `[SINGLE_SOURCE]` or `[UNVERIFIED]` until independent runtime or test evidence exists.

## Target synthesis

The design does not canonize one repository. It combines the official runtime contract with narrowly observed patterns:

- Salesforce-style premise, CI, consumer, ADR, and severity challenges;
- Himmel-style default-to-refuted verifier direction;
- diverse factual, false-positive, and reproduction lenses;
- role-separated artifact handoffs only when independently verified;
- repository-owned journal inspection, deterministic reproduction, and BDD regressions.
