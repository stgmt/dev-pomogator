# Design

## Реализуемые требования

- [FR-1: Audit skills directory](FR.md#fr-1-audit-skills-directory)
- [FR-2: Frontmatter validation per Anthropic spec](FR.md#fr-2-frontmatter-validation-per-anthropic-spec)
- [FR-3: Allowed-tools coverage check](FR.md#fr-3-allowed-tools-coverage-check)
- [FR-4: Triple-axis overlap detection](FR.md#fr-4-triple-axis-overlap-detection)
- [FR-5: LLM merge synthesis через sub-agent](FR.md#fr-5-llm-merge-synthesis-через-sub-agent)
- [FR-6: Ratchet scorer](FR.md#fr-6-ratchet-scorer-regression-prevention)
- [FR-7: Preserve originals](FR.md#fr-7-preserve-originals-no-auto-delete)
- [FR-8: Unified scoring engine](FR.md#fr-8-unified-scoring-engine-для-rules-skills)
- [FR-9: Backward compatibility](FR.md#fr-9-backward-compatibility-для-rules-side)

## Компоненты

- `audit.ts` — top-level dispatcher: routes по `--dir` к rules или skills audit pipeline
- `audit-rules.ts` — extracted из current audit.ts (verbatim logic, FR-9 backward compat)
- `audit-skills.ts` — NEW: SKILL.md scanning + frontmatter validation + tools coverage + Jaccard pre-filter
- `detect-overlap.ts` — NEW: triple-axis Jaccard implementation, separated для testability
- `merge-skills.ts` — NEW: orchestrates sub-agent для LLM synthesis (envelope pattern)
- `verify-merge.ts` — NEW: ratchet scorer (envelope pattern)
- `check-antipatterns.ts` — extended: existing rule antipatterns + skill-specific (transitive references, oversize, no TOC)
- `report.ts` — extended: skill findings в comparison output
- `shared.ts` — extended с `Asset` interface + `parseFrontmatterFlexible()`

## Где лежит реализация

- App-код: `.claude/skills/skills-rules-optimizer/scripts/`
- Templates: `.claude/skills/skills-rules-optimizer/references/` (merge-prompt-template.md, ratchet-scoring.md, skill-overlap-detection.md)
- Wiring: `.claude/commands/suggest-rules.md` Phase 6 (paths updated, skill-side audit added)
- Manifest: `extensions/suggest-rules/extension.json` (skills + skillFiles paths)

## Директории и файлы

```
.claude/skills/skills-rules-optimizer/
├── SKILL.md
├── scripts/
│   ├── shared.ts                       — Asset, types, helpers
│   ├── audit.ts                        — dispatcher
│   ├── audit-rules.ts                  — extracted from current audit.ts
│   ├── audit-skills.ts                 — NEW
│   ├── check-antipatterns.ts           — extended
│   ├── detect-overlap.ts               — NEW
│   ├── merge-skills.ts                 — NEW
│   ├── verify-merge.ts                 — NEW
│   └── report.ts                       — extended
└── references/
    ├── path-inference-table.md         — existing (rules-side)
    ├── known-antipatterns.md           — extended
    ├── skill-overlap-detection.md      — NEW
    ├── merge-prompt-template.md        — NEW
    └── ratchet-scoring.md              — NEW
```

Test fixtures:
```
tests/fixtures/skills-rules-optimizer/
├── valid-skill/SKILL.md
├── missing-allowed-tools/SKILL.md
├── oversize-skill/SKILL.md             — 600 lines lorem padding
├── transitive-references/SKILL.md      — references/A.md → references/B.md
├── claude-in-name/SKILL.md             — name: "Claude Helper"
└── overlap-pair/{a,b}/SKILL.md         — Jaccard 0.45 на trigger phrases
```

Tests:
```
tests/e2e/
├── skills-rules-optimizer-audit.test.ts        — frontmatter + tools coverage + oversize
├── skills-rules-optimizer-overlap.test.ts      — Jaccard triple-axis
├── skills-rules-optimizer-merge.test.ts        — envelope output structure
└── skills-rules-optimizer-rules-compat.test.ts — FR-9 backward compat
```

## Алгоритм

### Audit pipeline

1. `audit.ts --dir <path>` parses args; if `--dir == .claude/rules` → invokes `audit-rules.ts` (extracted, verbatim); if `--dir == .claude/skills` → invokes `audit-skills.ts`; if `--dir` containing both → invokes both и merges output.
2. `audit-skills.ts`: collects `*/SKILL.md`; parses frontmatter via `parseFrontmatterFlexible()`; validates per FR-2 rules (name, description, allowed-tools); body scanning for FR-3 tool invocations; calls `detect-overlap.ts` для overlap candidates.
3. `detect-overlap.ts`: extracts triggers (regex), section headings (`## .+`), functional keywords (Mission line); pairwise Jaccard на 3 axes; flag pair if any axis ≥ 0.3.
4. Output JSON aggregated `{ totalSkills, withErrors[], withWarnings[], overlaps[], details[] }`; written to stdout или `--save <file>`.

### Merge pipeline (opt-in)

1. User runs `merge-skills.ts --execute <a> <b> --merged-name <m>`.
2. Script reads `<a>/SKILL.md` + `<b>/SKILL.md`; loads MERGE_PROMPT template; substitutes `{content1}`, `{content2}`; emits envelope JSON to stdout.
3. SKILL.md workflow yields control. Main turn parses envelope; calls `Agent(subagent_type="general-purpose", prompt=...)`.
4. Agent returns merged SKILL.md content. Main turn writes к `.claude/skills/<m>/SKILL.md.draft` (через atomic temp + move).
5. Main turn invokes `verify-merge.ts --merged <m> --originals <a> <b>` (continuation).
6. `verify-merge.ts` reads draft + originals; loads SCORER_PROMPT; emits scorer envelope.
7. Main turn calls Agent again (independent sub-agent, fresh context). Returns scoring JSON.
8. Main turn parses scoring: `regression=true` → delete draft, output regression report; `regression=false` → rename draft → final SKILL.md, output cleanup suggestion.

### Ratchet decision logic

- Score baseline: `score(orig_a) + score(orig_b)` где score = sum of {has_valid_frontmatter, has_complete_tools_coverage, has_clear_mission, trigger_phrase_count}
- Score merged: same metrics applied to merged SKILL.md
- Regression IF `score_merged < 0.9 × baseline` (10% tolerance для unavoidable consolidation losses)

## API

### `audit.ts`

- **CLI:** `audit.ts --dir <path> [--save <file>]`
- **Input:** `--dir` (required), `--save` (optional, defaults stdout)
- **Output:** JSON `{ totalRules?, totalSkills?, withPaths?, withFrontmatter?, withErrors[], withWarnings[], overlaps[], mergeCandidates?, antipatternFiles[], details[] }`
- **Behavior:** Dispatcher; route на rules или skills pipeline по path inspection.

### `audit-skills.ts`

- **CLI:** `audit-skills.ts --dir <path> [--save <file>] [--strict]`
- **Input:** `--dir`, `--save` (optional), `--strict` (optional, exit 1 if `withErrors[].length > 0`)
- **Output:** JSON-shape SkillAuditResult
- **Behavior:** Scan directory; FR-2/FR-3 validation; trigger overlap pre-filter via Jaccard.

### `detect-overlap.ts`

- **CLI:** `detect-overlap.ts --dir <path> [--threshold <num>]`
- **Input:** `--dir`, `--threshold` (default 0.3)
- **Output:** JSON `{ overlaps: [{a, b, axis, similarity, recommendation}] }`
- **Behavior:** Triple-axis Jaccard pairwise.

### `merge-skills.ts`

- **CLI:** `merge-skills.ts --execute <skill-a> <skill-b> --merged-name <name>`
- **Input:** Skill names (directory basename relative to `.claude/skills/`); merged name (kebab-case, validated per FR-2)
- **Output:** JSON envelope `{ action: "invoke-agent", subagent_type: "general-purpose", prompt, continuation }` to stdout
- **Behavior:** Read both SKILL.md; format MERGE_PROMPT; emit envelope.

### `verify-merge.ts`

- **CLI:** `verify-merge.ts --merged <path> --originals <a> <b>`
- **Input:** Merged file path (draft); two original skill names
- **Output:** JSON envelope для scorer Agent invocation
- **Behavior:** Format SCORER_PROMPT с merged + originals; emit envelope.

## Key Decisions

### Decision: Sub-agent envelope pattern для LLM invocation (vs. direct API call)

**Rationale:** User explicitly chose Claude Code sub-agent (Agent tool) over direct Anthropic API в Phase 1 review. Это устраняет API key dependency (NFR-Security) и позволяет любому maintainer использовать skill без personal key. Existing repo precedent: `tests-create-update` skill использует `Agent(subagent_type="Explore")` для code analysis, `create-spec` invokes `Skill("research-workflow")`. Envelope pattern (script emits JSON, SKILL.md workflow orchestrates main turn Agent call) — pioneer для repo но согласуется с established skill convention.

**Trade-off:** Дополнительный round-trip (script → main turn → Agent → main turn → continuation script) удлиняет latency на ~5-10s per merge vs. direct API. Также требует careful design SKILL.md workflow для parsing envelope и handling continuation. Direct API было бы проще, но потеряли бы zero-config benefit.

**Alternatives considered:**
- **Direct Anthropic API в скрипте** — rejected: требует API key, нарушает NFR-Security; user explicitly opted for sub-agent path
- **Headless `claude --print` invocation** — rejected: 0 evidence в repo (research agent проверил); неясно поддерживается ли official; debugging harder than envelope
- **Skill-to-skill via `Skill()` tool** — rejected: нет existing skill для merge synthesis; создавать sub-skill только для one-shot LLM call — overhead

### Decision: Triple-axis Jaccard pre-filter перед LLM stage

**Rationale:** Quadratic LLM cost (N×N pairs) делает naive "send all pairs to Agent" неприемлемым для 30+ skills repo. Jaccard на 3 axes (triggers / sections / functional) — cheap (≤1s для 30 skills, NFR-Performance), deterministic, и доказал себя в connorblack/skill-tools (ref RESEARCH.md). Threshold 0.3 — empirical lower bound из skill-tools; калибруем на первом real audit run.

**Trade-off:** Mechanical Jaccard miss-ит semantic similarity (skills с похожими missions но разными вокабуляром). E.g. `code-review` и `simplify` skills могут оба про code quality но с минимальным token overlap. Mitigation: low threshold (0.3) над-индексит recall за счёт precision; user manually reviews recommendations прежде чем merge.

**Alternatives considered:**
- **LLM на all pairs** — rejected: cost / latency unacceptable для 30+ skills (435 comparisons × 30s ≈ 3.6 hours)
- **Embedding-based similarity (text-embedding-3)** — rejected for MVP: добавляет dependency на external API; deferred to v0.2.0 как FR-10 OUT OF SCOPE
- **Single-axis Jaccard на description tokens** — rejected: skill-tools doc shows triple-axis catches different overlap patterns (semantic conflict vs trigger collision vs function dup)

### Decision: Ratchet scorer mandatory (vs. optional flag)

**Rationale:** H1 risk (sub-agent returns plausible-but-invalid SKILL.md) высоковероятен (LLM tendency hallucinate frontmatter fields). H2 risk (LLM-as-judge subjective) — secondary, но без ratchet нет защиты от H1. User explicitly chose mandatory ratchet в Phase 1 review (option 2a "safety > speed"). Pattern из darwin-skill (2047★, established) подтверждает viability — independent scorer Agent с separate context избегает self-evaluation bias.

**Trade-off:** Ratchet удваивает Agent invocations per merge (1 для synthesis + 1 для scoring). Latency ~60s + ~30s = ~90s total. Также complexity: SKILL.md workflow становится 8-step (vs. 5-step без ratchet). User may считать слишком "тяжёлым" для small overlaps.

**Alternatives considered:**
- **Manual review only (no ratchet)** — rejected: user explicitly said "safety > speed"; H1 risk слишком высок без automated check
- **Ratchet через assertion script (no Agent)** — rejected partially: некоторые critical checks (mission preservation, trigger sufficient subset) require semantic understanding, не выражаются как rules. Mix: assertions для frontmatter + Agent для semantic — reasonable compromise но complicates design. MVP: full Agent ratchet.
- **Ratchet через `--with-ratchet` opt-in flag** — rejected: defeats safety purpose; user choice was "обязателен"

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_NONE
**TEST_FORMAT:** BDD
**Framework:** Cucumber.js (через vitest .feature integration — existing repo pattern)
**Install Command:** already installed (vitest 4.x в package.json)
**Evidence:** `tests/e2e/specs-generator-variant-matrix.test.ts` использует тот же pattern (vitest + .feature через manual scenario mapping); `package.json` уже содержит vitest dependency. См. RESEARCH.md "Existing Patterns" row "[spec-variant-matrix](../spec-variant-matrix/FR.md) benchmark".
**Verdict:** No hooks required. Tests reading test fixtures from `tests/fixtures/skills-rules-optimizer/` (read-only) и проверяющие audit/detect/merge output JSON structure. No state mutation, no API calls, no DB. `vitest run` straight без setup/teardown.


## Shipped Skill-Health Checker Extension

### Component boundary
- `tools/skill-health/check.mjs` is the one shipped, Node-builtins-only executable for [FR-12](FR.md#fr-12-shipped-dependency-free-checker-and-shared-gates). Source CI, release verification, and installed-plugin dependency-absent verification call this file rather than source-only optimizer scripts.
- `tools/skill-health/baseline.json` holds finite exact exemptions for [FR-17](FR.md#fr-17-exact-fingerprint-baseline); `tools/skill-health/mirror-contract.json` declares every mirror relationship for [FR-18](FR.md#fr-18-explicit-mirror-policy).
- The checker is a CLI/gate component, not a lifecycle hook. Hook registries remain outside this change by [FR-19](FR.md#fr-19-no-prompt-lifecycle-hook-rollout).

### Validation flow
1. Enumerate plugin SKILL.md files and fingerprint their full content.
2. Parse frontmatter losslessly. A malformed block produces a structural finding before required-field validation, satisfying [FR-13](FR.md#fr-13-strict-frontmatter-parser-and-metadata-contract).
3. Inspect syntax-qualified active calls, local references, baseline entries, and mirror entries under the separate rules in [FR-14](FR.md#fr-14-active-tool-permission-coverage-with-false-positive-pins), [FR-15](FR.md#fr-15-local-reference-integrity-and-root-containment), [FR-17](FR.md#fr-17-exact-fingerprint-baseline), and [FR-18](FR.md#fr-18-explicit-mirror-policy).
4. Sort findings deterministically, render text or JSON, then select report or strict exit semantics defined by [FR-16](FR.md#fr-16-deterministic-report-and-strict-modes).

### CLI and gate contract
- `--report` is the non-blocking diagnostic mode; `--strict` is the blocking gate mode; `--json` changes only the rendered format, not finding identity or ordering.
- The source CI workflow, release workflow, and dependency-absent installed runtime test assert the same canonical executable path and exercise a real plugin tree with dependencies unavailable.

### BDD proof boundary
BDD scenarios cover parser regressions derived from `bdd-migrator`, `edge-debug-port`, `task-status`, `proxy-up`, and `use-claude-subscription`; active permissions and false-positive pins; local references; baseline identity; all mirror modes; deterministic CLI modes; installed dependency-absent execution; and the absence of prompt lifecycle wiring.

## Key Decisions

### Decision: Use the shipped builtins-only checker at every distribution gate

**Требование:** [FR-12](FR.md#fr-12-shipped-dependency-free-checker-and-shared-gates)

**Rationale:** One executable exercises the artifact users receive and makes source CI, release, and installed dependency-absent evidence comparable.

**Trade-off:** The parser supports only the frontmatter subset the checker explicitly owns instead of accepting every YAML feature through a runtime dependency.

**Alternatives considered:**
- Reuse `audit-skills.ts` through `tsx` — rejected because a source dependency proves neither packaging nor installed-user viability.
- Install `yaml` during verification — rejected because dependency installation masks the condition the gate must prove.

### Decision: Fail closed on malformed frontmatter before downstream checks

**Требование:** [FR-13](FR.md#fr-13-strict-frontmatter-parser-and-metadata-contract)

**Rationale:** Structural parse findings prevent malformed YAML from silently becoming empty metadata and producing misleading secondary diagnostics.

**Trade-off:** Some uncommon YAML constructs are rejected until they are deliberately specified and tested.

**Alternatives considered:**
- Continue with an empty metadata object — rejected because it hides parser failures and produces false validation results.
- Depend on a full YAML package — rejected because installed dependency-absent execution is a required property.

### Decision: Detect syntax-qualified active calls and pin prose negatives

**Требование:** [FR-14](FR.md#fr-14-active-tool-permission-coverage-with-false-positive-pins)

**Rationale:** Exact call syntax preserves useful missing-permission findings while keeping prohibitions, prose, and examples from making strict CI noisy.

**Trade-off:** Ambiguous natural-language instructions may require a clearer executable call form to be checked automatically.

**Alternatives considered:**
- Flag every tool-name token — rejected because confirmed prohibitions are false positives.
- Disable permission coverage — rejected because undeclared active tool calls remain a runtime failure source.

### Decision: Resolve only static local links inside the plugin root

**Требование:** [FR-15](FR.md#fr-15-local-reference-integrity-and-root-containment)

**Rationale:** Root-contained resolution catches broken shipped references and traversal without pretending to validate templates or remote documentation.

**Trade-off:** Dynamic link generation is intentionally outside this static checker.

**Alternatives considered:**
- Resolve every Markdown-looking string — rejected because examples and templates create false findings.
- Allow parent traversal if the target exists — rejected because plugin artifacts must not depend on paths outside their install root.

### Decision: Make baseline identity and mirror modes explicit contracts

**Требование:** [FR-16](FR.md#fr-16-deterministic-report-and-strict-modes)

**Rationale:** Deterministic output, exact fingerprints, and finite policy modes make every gate decision reproducible and reviewable.

**Trade-off:** Baseline refreshes and cross-agent adaptations require an intentional contract update when content changes.

**Alternatives considered:**
- Permit glob or regex baselines — rejected because broad exemptions can suppress unrelated future defects.
- Infer mirror status from directory names — rejected because inferred policy silently accepts drift.

### Decision: Keep skill health out of prompt lifecycle hooks

**Требование:** [FR-19](FR.md#fr-19-no-prompt-lifecycle-hook-rollout)

**Rationale:** CI, release, and explicit installed checks provide strong evidence without slowing or surprising interactive prompt flows.

**Trade-off:** Authors receive feedback at deliberate gate boundaries rather than on every prompt.

**Alternatives considered:**
- Add a SessionStart scan — rejected because startup cost and repeated noise do not improve release evidence.
- Add a UserPromptSubmit guard — rejected because prompt-time enforcement is disproportionate to a repository health audit.

### Decision: Bind baseline exemptions to content fingerprints

**Требование:** [FR-17](FR.md#fr-17-exact-fingerprint-baseline)

**Rationale:** Path, finding code, and fingerprint together make an exemption narrow, reviewable, and automatically invalid when content changes.

**Trade-off:** Intentional content edits require a deliberate baseline refresh rather than retaining an old exemption.

**Alternatives considered:**
- Path-only baselines — rejected because they would conceal changed defects at the same location.
- Wildcard or regex exemptions — rejected because they can suppress unrelated future findings.

### Decision: Express mirror behavior through finite named modes

**Требование:** [FR-18](FR.md#fr-18-explicit-mirror-policy)

**Rationale:** Exact, adapted, canonical-only, and legacy modes document whether and how a mirror is expected to diverge.

**Trade-off:** New mirror relationships need an explicit contract entry before verification can pass.

**Alternatives considered:**
- Infer policy from directory names — rejected because the intended adaptation is not reviewable.
- Treat every pair as an exact mirror — rejected because legitimate platform adaptations would become indistinguishable from accidental drift.
