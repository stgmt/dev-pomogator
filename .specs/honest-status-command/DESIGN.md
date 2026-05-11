# Design

## Реализуемые требования

- [FR-1: Invocation surface](FR.md#fr-1-invocation-surface)
- [FR-2: Active spec auto-detection](FR.md#fr-2-active-spec-auto-detection)
- [FR-3: Sub-agent delegation](FR.md#fr-3-sub-agent-delegation)
- [FR-4: AC evidence classification](FR.md#fr-4-ac-evidence-classification)
- [FR-5: Test results recency](FR.md#fr-5-test-results-recency-audit)
- [FR-6: Test body quality](FR.md#fr-6-test-body-quality-classification)
- [FR-7: Git working state](FR.md#fr-7-git-working-state-cross-reference)
- [FR-8: Environmental blockers](FR.md#fr-8-environmental-blockers-section)
- [FR-9: Output format](FR.md#fr-9-output-format--structured-json--markdown-render)
- [FR-10: Reuse spec-status.ts](FR.md#fr-10-reuse-spec-statusts-wrapper)

## Компоненты

- **`.claude/skills/spec-status/SKILL.md`** — orchestrator skill: parses args, auto-detects active spec, invokes spec-status.ts wrapper для базовой info, prepares sub-agent context bundle, invokes Agent, renders JSON → markdown
- **`.claude/skills/spec-status/references/sub-agent-prompt.md`** — sub-agent prompt template (instructions для general-purpose Agent: AC audit, test quality, environmental checks)
- **`.dev-pomogator/tools/specs-generator/spec-status.ts`** — REUSED как-есть для базовой spec progress info (.progress.json read, phase summary)
- **`.claude/skills/strong-tests/`** + **`.claude/skills/tests-create-update/`** — REUSED как knowledge source для test quality patterns (sub-agent reads их инструкции)
- **`extensions/tui-test-runner/tools/tui-test-runner/yaml_writer.ts`** — REUSED для YAML schema reference (sub-agent понимает .test-status/status.*.yaml format)
- **Agent tool (Claude Code built-in)** — sub-agent invocation механизм

## Где лежит реализация

> **OUT OF SCOPE для текущей сессии**: implementation НЕ создаётся в этой спеке. Paths ниже = planned для будущей implementation сессии.

- App-код (planned): `.claude/skills/spec-status/SKILL.md` (NEW)
- Sub-agent template (planned): `.claude/skills/spec-status/references/sub-agent-prompt.md` (NEW)
- Integration tests (planned): `tests/e2e/spec-status.test.ts` (NEW, ≥4 it 1:1 с feature scenarios)
- Test fixtures (planned): `tests/fixtures/spec-status/` (NEW — mock spec, weak/strong test samples, .test-status YAML samples)
- Wiring: skill discoverable Claude Code из `.claude/skills/spec-status/` (no manifest changes — skill self-registers via SKILL.md frontmatter)

## Директории и файлы

- `.specs/honest-status-command/` — этот spec (15 files уже scaffolded)
- `.claude/skills/spec-status/` (planned dir для implementation):
  - `SKILL.md` — frontmatter + orchestrator workflow
  - `references/sub-agent-prompt.md` — sub-agent instructions
  - `references/test-quality-patterns.md` (optional) — extracted patterns для sub-agent
- `tests/e2e/spec-status.test.ts` (planned)
- `tests/fixtures/spec-status/` (planned)
- `tests/features/spec-status.feature` (planned BDD)

## Алгоритм

1. **Parse args**: explicit slug в `$ARGUMENTS` OR autodetect mode
2. **Autodetect (если no slug)**: scan `.specs/*/.progress.json` отсортированные по mtime, filter mtime ≤7 days; если ≥2 candidates — tie-break по `~/.claude/plans/<slug>.md` existence; если still ambiguous — tie-break по `git status` overlap с .specs/<slug>/; если no active — output "Pass slug explicitly" exit 0
3. **Validate slug**: regex `^[a-zA-Z0-9_-]+$`; reject если invalid (security NFR)
4. **Read base progress**: invoke `npx tsx .dev-pomogator/tools/specs-generator/spec-status.ts -Path .specs/<slug>` (capture JSON)
5. **Build context bundle** (≤4KB JSON): `{spec_slug, spec_path, plan_path, test_paths[], ac_ids[], git_sha, redacted_env: true}`
6. **Filter credentials** (security): scan content для `*_KEY=` `*_TOKEN=` `password:` patterns; replace matched lines с `[REDACTED]` ПЕРЕД embedding в bundle
7. **Invoke Agent**: `Agent(subagent_type="general-purpose", description="Spec status verification", prompt=<bundled prompt + context>)` timeout 60s
8. **Parse sub-agent output**: expect JSON conforming to SCHEMA; на parse fail → fail-open skeleton report
9. **Compute git section** (parent skill, не sub-agent): `git status --short` + `git log origin/main..HEAD --oneline`; classify по scope overlap
10. **Compute environmental blockers**: `docker ps` exit code check, WSL connection probe (Windows), stale YAML heartbeat check
11. **Render markdown**: combine spec-status.ts JSON + sub-agent JSON + git + env blockers → markdown sections (## Spec Progress / ## AC Status / ## Tests / ## Git / ## Environmental Blockers conditional)
12. **Output**: emit markdown + structured JSON (JSON в comment block для programmatic consumption)

## Sub-agent prompt structure (draft)

```
You are an INDEPENDENT verification agent. Your job: produce HONEST evidence-backed report for spec {slug}. You have NO context from parent AI session — start fresh.

Inputs (in this prompt):
- spec_slug, spec_path, plan_path, test_paths[], ac_ids[]

Read these files via your Read tool:
1. {spec_path}/ACCEPTANCE_CRITERIA.md — list all AC IDs
2. {spec_path}/TASKS.md — find which AC marked done (- [x])
3. For each `done` AC: search test files, commits, smoke evidence
4. Each test file in test_paths[]: classify it() blocks STRONG/WEAK/FAKE-POSITIVE-RISK
5. Latest .dev-pomogator/.test-status/status.*.yaml: parse passed/failed/mtime

Output ONLY valid JSON conforming to provided schema. No prose, no commentary. Each AC entry MUST include evidence path OR blocker reason — DO NOT mark verified без actual evidence file.
```

## Data flow (ASCII)

```
User OR Main AI
    ↓ /spec-status [slug]
.claude/skills/spec-status/SKILL.md
    ↓
1. Parse args + autodetect slug
2. Read spec-status.ts JSON (base progress)
3. Build context bundle ≤4KB
4. Filter credentials
    ↓
Agent(subagent_type=general-purpose)  ← isolated context, no parent bias
    ↓ Reads:
    - {spec}/ACCEPTANCE_CRITERIA.md
    - {spec}/TASKS.md
    - test files (Read tool)
    - .test-status YAML
    - Optionally git log, file evidence
    ↓ Returns JSON
SKILL.md (parent):
    + git status (parent computes — no need for sub-agent)
    + docker ps / WSL probe (parent computes)
    + render markdown
    ↓
Output: markdown + JSON to user/main AI
```

## Reuse map

| Behavior | Source | Skill action |
|----------|--------|--------------|
| Spec progress (.progress.json read, phases) | `spec-status.ts` | invoke as subprocess, parse JSON |
| AC list parsing | `ACCEPTANCE_CRITERIA.md` direct read | sub-agent reads via Read tool |
| Test quality patterns | `strong-tests` SKILL.md, `tests-create-update` SKILL.md | sub-agent reads their instructions, applies patterns |
| YAML schema awareness | `yaml_writer.ts` (TypeScript) | sub-agent prompt embeds expected schema fields |
| Git status | `git` CLI | parent skill invokes via Bash tool |
| Docker/WSL probe | `docker ps`, environment vars | parent skill invokes via Bash tool |
| Output rendering | new in skill (JSON → markdown) | parent skill (no sub-agent needed) |

## API

N/A — skill не exposes API endpoints. Interface = slash command + Skill tool invocation.

## Key Decisions

### Decision: Delegate verification logic to independent sub-agent (Agent tool), не выполнять в main AI

**Rationale:** Главная цель US-1 — eliminate goal-completion bias. Main AI which led implementation phase имеет sunk-cost mental model "tests pass = feature done". Independent sub-agent с fresh context (Agent subagent_type=general-purpose spawns isolated Claude) физически не имеет access к prior conversation — даёт honest read.

**Trade-off:** Sub-agent invocation adds 30-60s latency vs in-process check. Также context bundle нужно явно prepare (extra work на каждый вызов).

**Alternatives considered:**
- In-process check (main AI выполняет verification сам) — rejected: точная failure mode которую US-1 хочет избежать (incident 2026-05-10 произошёл именно потому что main AI overclaimed)
- Static checker script (no AI) — rejected: test body quality audit (FR-6) требует semantic understanding которое regex не даёт; strong-tests/tests-create-update являются AI-powered patterns

### Decision: Reuse existing spec-status.ts, не переписывать

**Rationale:** Existing `spec-status.ts` уже умеет parse .progress.json + AC checklist + phases. Дублирование = тех долг. Skill wraps spec-status.ts output JSON и добавляет sub-agent layer для AC evidence audit + tests + git + env blockers.

**Trade-off:** Coupling с spec-status.ts internal JSON format — если он изменится, skill broken. Mitigation: spec-status.ts стабильный API, документирован в JSON schema самого спека.

**Alternatives considered:**
- Inline all logic в SKILL.md — rejected: дублирование .progress.json parsing logic, тех долг
- Modify spec-status.ts to add sub-agent invocation — rejected: violates SRP; spec-status.ts read-only reporter, skill orchestrator

### Decision: Output ОБА formatа (markdown + JSON), не выбирать один

**Rationale:** Markdown для human review (AI/user читает в chat), JSON для downstream programmatic consumption (future hooks, telemetry). Cost минимальный — sub-agent уже возвращает JSON, render markdown — strait-forward.

**Trade-off:** Output длиннее (markdown + JSON block). Mitigation: JSON в `<details>` block либо в trailing code fence — collapsable.

**Alternatives considered:**
- JSON only — rejected: human read user/AI пытаются разобрать raw JSON unfriendly
- Markdown only — rejected: closes off future programmatic use cases (e.g. hook auto-blocks commit if verified_count < ac_count)

### Decision: Filter credentials в context bundle перед sub-agent invocation

**Rationale:** Sub-agent prompt embedded в Anthropic API request — содержит spec content который может иметь sensitive markers (API keys в .env examples, tokens в spec body). Filter перед embedding — defense in depth.

**Trade-off:** False-positive replacements могут испортить legitimate content (e.g. `*_KEY=` в test fixture sample). Mitigation: patterns conservative, applied только к spec/plan content, не к paths.

**Alternatives considered:**
- No filter — rejected: NFR Security violation
- Encrypt bundle — rejected: overkill, complex key management, не решает task (Anthropic API ВСЁ ЕЩЁ видит content после decrypt)

### Decision: Skill output read-only, никаких file writes

**Rationale:** Idempotency NFR. Skill = reporter, не writer. Если в будущем нужна persistent verification log (`.dev-pomogator/.verification-log.jsonl`) — отдельный feature, отдельный spec.

**Trade-off:** Каждый запуск делает full re-scan (no cache). Mitigation: <90s typical duration acceptable per NFR Performance.

**Alternatives considered:**
- Append verification events в `.verification-log.jsonl` — rejected for v1: scope creep, отдельный spec для logging
- Cache git/test results в `/tmp/` — rejected: race conditions при parallel runs, complexity

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

**TEST_DATA:** TEST_DATA_NONE
**TEST_FORMAT:** BDD
**Framework:** vitest (BDD-style через describe/it + @featureN теги)
**Install Command:** already installed (evidence: `package.json` devDependencies "vitest@^4.1.0" + existing `tests/e2e/*.test.ts`)
**Evidence:** RESEARCH.md "BDD Framework Detection" section + `vitest.config.ts:1-19` (project root)
**Verdict:** No persistent test data hooks required. Skill is read-only (NFR Reliability — no file system writes). Integration test uses tmpdir для mock spec fixtures + cleanup в afterEach. Sub-agent invocation в test mock'ается через test double либо реальный invocation в test (~60s OK для integration test).
