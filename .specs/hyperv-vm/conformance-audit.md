# Conformance Audit — hyperv-vm

**Auditor**: strict spec-conformance auditor (session 2026-07-21)
**Verdict**: **NON-CONFORMANT** — hollow scaffold wired into the live test suite, wrapped around an already-shipped implementation.
**Method**: every claim below cites the file/line/command that produced it. No structural "valid" is taken as health (rule `no-structural-valid`).

## Findings (most severe first)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| F1 | ROOT | Every form-doc is an unfilled scaffold template — the spec defines **zero real requirements** | `FR.md`: `## FR-1..5: {Название}`, 12 placeholder lines, 0 content; `ACCEPTANCE_CRITERIA.md`: AC bodies = `WHEN {событие} THEN {система} SHALL {действие}`; `USE_CASES.md`: 25/43 lines placeholders; `DESIGN.md`: 33 placeholders (`### {Endpoint 1}`); `USER_STORIES.md`: 14 (`User Story 1: {Short title}`); `TASKS.md`: 32 placeholders, `TBD-1 {first task} TODO`, 0 Done; `FILE_CHANGES.md`: **0 declared paths** (all `{путь/к/файлу}`); `NFR.md`: no NFR ids; `SCHEMA.md`: heading `# {Feature Name} Schema`; `README.md:3,11-14` placeholders; `CHANGELOG.md`: `[0.1.0] - TBD` |
| F4 | CRITICAL | 8 scenarios `HYPERV001_01..08` (31 steps) have **no step-definitions anywhere** — and the feature is wired into **both** profiles (`cucumber.json` last path; `cucumber.docker.json`, 46 paths, hyperv present), with no `@windows-only` tag, so the existing exclusion doesn't apply → every full run in either profile carries 8 UNDEFINED. By design the scenarios **are** Docker-executable — record-seam for Hyper-V commands (`hyperv-vm.feature:8` "captured by a disposable command seam"), script parsing (`:48`, `:54` "scripts are parsed"), fixture comparison (`:29-31`, `:35-37`); not live Hyper-V calls. `bdd-only-tests` forbids non-BDD tests, so the shipped skill has **zero executable verification** with no environmental excuse | repo-wide `Grep HYPERV001` → exactly 1 file: `.specs/hyperv-vm/hyperv-vm.feature`; `cucumber.json` + `cucumber.docker.json` path lists |
| F3 | HIGH | Traceability is phantom: scenarios tagged `@FR-1..@FR-6`, but `FR.md` defines only FR-1..5 (**FR-6 does not exist**) and none has content; `REQUIREMENTS.md` CHK rows (`CHK-FR1-01`…) link to template anchors `#fr-1-название` and template tags `@feature1/@feature2` | `.feature` tags vs `FR.md` headings; `REQUIREMENTS.md` table rows |
| F2 | HIGH | Workflow bookkeeping contradicts reality: `.progress.json` = `currentPhase: Discovery`, **all 4 phases** `stopConfirmed: false`, `completedAt: null` — while Finalization docs exist, `validation-report.md` was generated **2026-07-21T15:02** (today, over the templates), and the implementation is committed | `.progress.json` (read verbatim); `validation-report.md:3`; `git log --oneline -3` → `ce4a378b`, `b8a2e413 #131`, `53978612 feat: add reusable Hyper-V VM skill` |
| F5 | HIGH | Implementation shipped against no requirements: 3 commits on `feat/hyperv-docker-vm-skill-131`, 17 files under `.claude/skills/hyperv-vm/` (12 `.ps1` + SKILL.md + references) — spec-test-sync / plan-pomogator flow bypassed | `git log`, `Glob .claude/skills/hyperv-vm/**` |
| F0 | CORPUS | `.specs/undefined/` exists — a spec whose slug is literally `undefined` (scaffold bug, likely `scaffold-spec.ts -Name` received undefined) | `Glob .specs/*/README.md` listing |
| F6 | SYSTEMIC | F1 is a corpus disease, not a one-off: **6 of 61** specs have fully hollow FR scaffolds — `voice-s5`, `spec-mcp-usability-dogfood`, `undefined`, `hyperv-vm`, `context-menu`, `claim-sanity-check` (6 `{Название}` template hits each); `spec-generator-v4` carries 1 residual hit | `Grep {Название}` over `.specs/**/FR.md`, count mode |

## What is real (not everything is hollow)

- `hyperv-vm.feature` — 8 genuine scenarios, 31 steps, 0 placeholders.
- `.claude/skills/hyperv-vm/` — 17 real implementation files, committed.
- `RESEARCH.md` — partially real: `## Project Context & Constraints / ### Relevant Rules / ## Proof of Concept` sections filled; technical-findings sections still template (16 placeholders).
- `validation-report.md` — real machine artifact (but a structural pre-filter, not a health verdict — `no-structural-valid`).

## [UNVERIFIED] — honest scope limits

- **MCP spec-door** (`get_spec_status` / `conformance_check` / graph counts / collisions): permission not granted this session → graph-side counts and UNCOVERED_FR/SCENARIO_TAG_ORPHAN machine findings not obtained. Audit ran via direct reads (the sanctioned fallback used by `spec-reality-check`/`verify.ts`).
- **Live Docker BDD run not executed** (7–12 min; auditor role): the "8 UNDEFINED every run" claim is derived from the repo-wide grep showing zero step-defs + `cucumber.json` wiring, not observed in a run.
- `.feature` step bodies not audited line-by-line (titles/tags/step-count only); `.specs/undefined/` contents not inspected beyond existence.

## Recommended remediation (not performed — auditor role)

1. Retro-author real FR/AC **from the 8 scenarios + SKILL.md behavior** (the scenarios encode the actual contract — reverse-trace it), then fix `@FR-6` (define it or re-tag) and rebuild CHK/FILE_CHANGES from the actual `git diff` (17 files).
2. Author REGEX step-defs for `HYPERV001_*` driving the real `.ps1` scripts the way the scenarios specify — record-seam for Hyper-V commands (`:8`), script parsing (`:48`/`:54`), fixture comparison; **all Docker-executable, no Windows-only escape exists** (`test-author` agent) — until then the feature pollutes every full run in **both** profiles.
3. Reconcile `.progress.json`: either run the phases honestly or reset the state to match reality.
4. Triage `.specs/undefined/` (archive via the gated `archive_spec` door or fix the scaffold bug and re-slug).
5. Re-run the smart verdict (`spec-verdict.ts`) after 1–3; do not accept `validate-spec: 0 errors` as done.
