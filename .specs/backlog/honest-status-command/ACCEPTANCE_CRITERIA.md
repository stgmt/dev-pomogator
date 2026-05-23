# Acceptance Criteria (EARS)

## AC-1 (FR-1): Invocation surface

**Требование:** [FR-1](FR.md#fr-1-invocation-surface)

- **AC-1.1 (user explicit)**: WHEN пользователь набирает `/spec-status fix-bg-output-loss` THEN skill SHALL load с slug=`fix-bg-output-loss` AND вернуть status report
- **AC-1.2 (AI proactive)**: WHEN главный AI вызывает `Skill("spec-status")` без args после implementation phase THEN skill SHALL auto-detect active spec AND вернуть status report
- **AC-1.3 (description triggers)**: WHEN читается `.claude/skills/spec-status/SKILL.md` frontmatter description THEN содержит минимум 3 trigger keywords из set: "honest status", "before claiming done", "verify spec progress", "delegate to sub-agent"

## AC-2 (FR-2): Active spec auto-detection

**Требование:** [FR-2](FR.md#fr-2-active-spec-auto-detection)

- **AC-2.1 (mtime-based)**: WHEN `/spec-status` invoked без аргументов AND `.specs/X/.progress.json` mtime ≤7 days ago AND no other recent .progress.json THEN skill SHALL select slug=X
- **AC-2.2 (tie-break by plan)**: WHEN ≥2 recent .progress.json AND `~/.claude/plans/X.md` exists THEN skill SHALL prefer X
- **AC-2.3 (no active)**: IF no .progress.json ≤7 days ago THEN skill SHALL output `No active spec found. Pass slug explicitly: /spec-status <slug>` AND exit 0

## AC-3 (FR-3): Sub-agent delegation

**Требование:** [FR-3](FR.md#fr-3-sub-agent-delegation)

- **AC-3.1 (Agent invocation)**: WHEN skill вычисляет verification THEN SHALL invoke `Agent(subagent_type="general-purpose", prompt=<sub-agent-prompt>, description="Spec status verification")` AND NOT compute verification в main AI context
- **AC-3.2 (context bundle ≤4KB)**: WHEN sub-agent invoked THEN passed prompt contains JSON context bundle ≤4096 bytes AND содержит keys `{spec_slug, spec_path, plan_path?, test_paths[], ac_ids[]}`
- **AC-3.3 (sub-agent reads files)**: WHEN sub-agent prompted THEN sub-agent SHALL use Read tool на actual spec files (verified via grep `Read tool` в sub-agent output trace) — main AI не должен pre-read большие файлы

## AC-4 (FR-4): AC evidence classification

**Требование:** [FR-4](FR.md#fr-4-ac-evidence-classification)

- **AC-4.1 (3 categories)**: WHEN sub-agent classifies AC THEN output JSON `ac[]` array содержит каждый AC с `status` ∈ `{verified, blocked, claimed_only}`
- **AC-4.2 (verified requires evidence)**: IF AC marked `verified` THEN entry SHALL contain `evidence` field с path string (file path, optionally `:line`)
- **AC-4.3 (blocked requires reason)**: IF AC marked `blocked` THEN entry SHALL contain `reason` field с описанием blocker (Docker down, missing dep, etc.)
- **AC-4.4 (no overclaim)**: WHEN AC marked done в TASKS.md (- [x]) но no test file / commit / smoke evidence найден THEN sub-agent SHALL mark it `claimed_only` (NOT `verified`)

## AC-5 (FR-5): Test results recency

**Требование:** [FR-5](FR.md#fr-5-test-results-recency-audit)

- **AC-5.1 (fresh classification)**: WHEN latest `.dev-pomogator/.test-status/status.*.yaml` mtime <5 min ago AND `state` ∈ `{passed, failed}` THEN output marks tests `fresh` с passed/failed/skipped counts
- **AC-5.2 (stale heartbeat)**: WHEN latest YAML `state: running` AND mtime ≥5 min ago THEN output marks tests `stale` с reason `Heartbeat dead — process likely hung`
- **AC-5.3 (not run)**: IF no `.test-status/*.yaml` exists THEN output marks tests `not_run` с hint `Run /run-tests to populate test status`

## AC-6 (FR-6): Test body quality classification

**Требование:** [FR-6](FR.md#fr-6-test-body-quality-classification)

- **AC-6.1 (per-it classification)**: WHEN sub-agent audits test files в scope THEN each `it()` block classified `STRONG` / `WEAK` / `FAKE-POSITIVE-RISK` с line number + reason
- **AC-6.2 (weak detection patterns)**: WHEN test использует ТОЛЬКО `toBeDefined()` / `toBeTruthy()` без value-level assertion (toBe/toEqual/toMatchObject) THEN classified `WEAK` с reason `Assertion is presence-only, not value-level`
- **AC-6.3 (mock-heavy fake-positive)**: WHEN test содержит `vi.mock()` для path упомянутого в `FILE_CHANGES.md create/edit` (production path) THEN classified `FAKE-POSITIVE-RISK` с reason `Mocks production path — high false-positive risk`
- **AC-6.4 (tautology detection)**: WHEN test содержит `expect(true).toBe(true)` или similar tautology assertion THEN classified `FAKE-POSITIVE-RISK` с reason `Tautological assertion`

## AC-7 (FR-7): Git working state

**Требование:** [FR-7](FR.md#fr-7-git-working-state-cross-reference)

- **AC-7.1 (counts reported)**: WHEN skill вызывается THEN output git section содержит counts (`X modified, Y staged, Z committed but not pushed, W pushed`)
- **AC-7.2 (scope overlap)**: WHEN counts вычисляются THEN classification limited to files в spec scope (`.specs/{slug}/` AND paths из `FILE_CHANGES.md`)
- **AC-7.3 (clean state)**: IF no modified/staged/unpushed THEN output marks git section `🟢 clean — all changes pushed`

## AC-8 (FR-8): Environmental blockers section

**Требование:** [FR-8](FR.md#fr-8-environmental-blockers-section)

- **AC-8.1 (Docker detected)**: WHEN `docker ps` exits non-zero OR output contains "connection refused" / "Cannot connect" THEN section "Environmental Blockers" lists `Docker daemon unreachable: <error message>`
- **AC-8.2 (WSL detected — Windows)**: IF host is Windows AND WSL connection error detected THEN section lists `WSL connection failed: <error>`
- **AC-8.3 (stale heartbeat env block)**: WHEN test YAML stale per AC-5.2 THEN environmental blocker section lists `Test heartbeat dead — last update X min ago` (NOT marked as test failure)
- **AC-8.4 (empty omitted)**: WHEN no environmental issues detected THEN section "Environmental Blockers" SHALL NOT appear в output

## AC-9 (FR-9): Output format

**Требование:** [FR-9](FR.md#fr-9-output-format--structured-json--markdown-render)

- **AC-9.1 (JSON schema)**: WHEN sub-agent returns result THEN parsed JSON conforms to schema in `honest-status-command_SCHEMA.md` (root keys: `spec, phase, ac, tests, git, environmental_blockers`)
- **AC-9.2 (markdown sections)**: WHEN skill renders output THEN markdown содержит 5 sections в порядке: `## Spec Progress`, `## AC Status`, `## Tests`, `## Git`, `## Environmental Blockers` (last conditional per AC-8.4)
- **AC-9.3 (emoji-coded)**: WHEN markdown rendered THEN AC statuses use emoji prefixes (✓/⏸/❌) AND test quality use emoji (🟢/🟡/🔴) для quick visual scan

## AC-10 (FR-10): Reuse spec-status.ts

**Требование:** [FR-10](FR.md#fr-10-reuse-spec-statusts-wrapper)

- **AC-10.1 (wrapper call)**: WHEN skill computes Spec Progress section THEN SHALL invoke `.dev-pomogator/tools/specs-generator/spec-status.ts -Path .specs/<slug>` AND parse его JSON output для phases/files completion data
- **AC-10.2 (no modification)**: WHEN spec implementation done THEN file `.dev-pomogator/tools/specs-generator/spec-status.ts` unchanged (verified via git diff before/after)
- **AC-10.3 (value-add documented)**: WHEN читается DESIGN.md THEN section "Reuse map" explicitly notes which behaviors come from spec-status.ts vs which are new (sub-agent AC audit, test quality, env blockers)
