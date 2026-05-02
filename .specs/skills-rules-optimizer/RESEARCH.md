# Research

## Контекст

Расширить существующий `rules-optimizer` skill (`.claude/skills/rules-optimizer/`) чтобы покрывал также `.claude/skills/*/SKILL.md`, не только rules. Цель — детектировать overlapping skills, oversize SKILL.md (>500 lines per Anthropic), missing `allowed-tools`. LLM-driven merge synthesis через Claude Code sub-agent (Agent tool) с ratchet (regression prevention).

Driver — cross-session repeat: в этой же сессии создан skill `variant-matrix-build` без `AskUserQuestion` в `allowed-tools` (нарушение existing rule `skill-allowed-tools-audit.md`). Manual checklist не сработал — нужна automation.

## Источники

5 OSS implementations + 1 academic paper (deep research через `mcp__octocode` + WebSearch):

- **`jkitchin/skillz`** — https://github.com/jkitchin/skillz/blob/main/cli/commands/merge.py — Python CLI, two-stage workflow (`OVERLAP_PROMPT` detect → `MERGE_PROMPT` execute через Claude CLI). Inspired by CASCADE paper.
- **`L-Qun/EvoClaude`** — https://github.com/L-Qun/EvoClaude/blob/main/src/skill-merger.ts — TypeScript, чистая алгоритмика без LLM. Jaccard similarity description tokens >0.5; auto-union triggers; longer-content wins.
- **`connorblack/skill-tools`** — https://github.com/connorblack/skill-tools/blob/main/commands/deduplicate.md — slash command, **detection-only** (no auto-merge). Triple-axis Jaccard: trigger phrases (>30%) + section headings + functional output. Scope-aware (project/global/plugin).
- **`alchaincyf/darwin-skill`** — https://github.com/alchaincyf/darwin-skill (2047★) — evolutionary skill optimizer. **Ratchet pattern**: independent scorer sub-agent + git revert если regression. Karpathy autoresearch-inspired.
- **`shinytoyrobots/claude-skills-linter`** — https://github.com/shinytoyrobots/claude-skills-linter/blob/main/skills/te-review.md — token-efficiency linter. Ranks findings by `tokens_per_line × invocation_frequency`; rank-then-recommend без auto-merge.

Academic foundation:
- **CASCADE paper (arxiv:2512.23880)** — https://arxiv.org/abs/2512.23880 — Multi-agent skill creation с continuous-learning. SciSkillBench: **93.3% success с evolution mechanism vs 35.4% без** (GPT-5). Skill evolution phase = "combined, deduplicated, and reorganized".

Anthropic official docs:
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices — SKILL.md ≤500 lines hard cap, references max one-level-deep, TOC mandatory >100 lines, `name` ≤64 lowercase-hyphens (no "anthropic"/"claude"), `description` ≤1024 chars third-person.
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills — three-level progressive disclosure (frontmatter/body/linked files).

## Технические находки

### Detection: Jaccard pre-filter + LLM judge (hybrid)

Two camps в OSS landscape:
- **Mechanical Jaccard** (EvoClaude, skill-tools): cheap, deterministic, no LLM cost. Threshold 0.3-0.5 на token sets / trigger phrases.
- **LLM-as-judge** (skillz `OVERLAP_PROMPT`): semantic similarity, но quadratic API cost для N×N pairs.

**Best practice**: Jaccard pre-filter → only candidates feed в LLM stage. Combines cheap filtering + semantic accuracy.

### Triple-axis overlap (skill-tools pattern)

Не только description tokens — overlap может проявляться по 3 осям:
1. **Trigger phrases** — quoted strings в `description:` (regex `/"([^"]+)"/g`)
2. **Section headings** — `## .+` в SKILL.md body
3. **Functional output** — keywords из Mission line + Steps

Pair flagged если any axis ≥ threshold. В нашем repo trigger phrases особенно важны — у нас skills имеют RU+EN trigger lists.

### Sub-agent invocation pattern (pioneer для repo)

В dev-pomogator existing skills используют:
- `Skill("research-workflow")` — skill-to-skill delegation (через Skill tool)
- `Agent(subagent_type="Explore")` — code analysis (tests-create-update skill pattern)

**Не найдено** examples где Agent возвращает structured JSON в skill context для programmatic processing. Наш case — pioneer для repo. Approach:
- Scripts emit JSON envelope `{action: "invoke-agent", subagent_type, prompt, continuation}` в stdout
- SKILL.md workflow yields control: main turn parses envelope → calls `Agent(...)` tool → writes output → invokes continuation script

### Ratchet (regression prevention)

darwin-skill pattern: после merge — **independent scorer Agent** (отдельный sub-agent) re-evaluates merged skill против originals. Критерии:
- Frontmatter validity (per Anthropic spec)
- `allowed-tools` coverage (всё что body invocates — declared)
- Mission preservation (does merged cover both originals' missions?)
- Trigger phrase preservation

Если score(merged) < score(orig_a) + score(orig_b) → flag regression → require `--force` или revert.

### Token cap calibration

Anthropic 500-line hard cap + mindstudio 150-line warning (https://www.mindstudio.ai/blog/claude-code-skills-architecture-skill-md-reference-files). Existing skills в dev-pomogator: median ~200 lines, max ~500 (run-tests SKILL.md после нашей merge — на грани).

## Где лежит реализация

- Skill source: `.claude/skills/skills-rules-optimizer/` (renamed from `rules-optimizer/`)
- Scripts: `.claude/skills/skills-rules-optimizer/scripts/` (shared.ts + 7 scripts)
- References: `.claude/skills/skills-rules-optimizer/references/` (5 files: 2 existing + 3 new)
- Manifest: `extensions/suggest-rules/extension.json` (skills + skillFiles paths updated)
- Wire-up: `.claude/commands/suggest-rules.md` Phase 6 (paths updated, skill-side audit added)
- CLAUDE.md: глоссарий update

## Выводы

1. **Hybrid Jaccard + LLM** — best practice, доказано 5 OSS implementations
2. **Triple-axis overlap** — single-axis недостаточно (skill-tools demonstrates)
3. **Ratchet обязателен** — Sub-agent выдаёт plausible-looking но invalid SKILL.md в edge cases (H1 risk); ratchet — единственная защита без human review per merge
4. **Sub-agent через Agent tool** — pioneer pattern для repo; не нужен Anthropic SDK / API key
5. **500-line cap** — Anthropic explicit; объективный threshold для warning tier
6. **Confirmed gap в OSS** — никто не делает horizontal skill merge в general way (есть либо vertical version-merge, либо single-skill cleanup); наша работа — closing gap

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| skill-allowed-tools-audit | `.claude/rules/checklists/skill-allowed-tools-audit.md` | Manual checklist на coverage allowed-tools при создании/edit skill | Skill creation/edit | FR-3 (codify into automation) |
| extension-layout | `.claude/rules/extension-layout.md` | Skills MUST live in `.claude/skills/` (centralized) | Skill placement | FR-9 (manifest paths sync) |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json — single source of truth, skillFiles complete | Skill manifest update | FR-9 (rename sync) |
| no-unvalidated-manifest-paths | `.claude/rules/no-unvalidated-manifest-paths.md` | Validate paths внутри project (path traversal protection) | Script writes | NFR-Security |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Configs через temp + atomic move | merge-skills.ts output write | NFR-Reliability |
| verify-divergent-contracts | `.claude/rules/gotchas/verify-divergent-contracts.md` | Дочитать оба контракта при divergence | Spec ↔ implementation sync | All FRs (sanity) |
| claude-md-glossary | `.claude/rules/claude-md-glossary.md` | CLAUDE.md = glossary, sync on rules add/remove | После rename | Manifest integrity |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| rules-optimizer (current) | `.claude/skills/rules-optimizer/` | audit.ts + check-antipatterns.ts + report.ts + shared.ts; CLI `--dir <path> --save <file>` | Base — extend, не replace |
| `/suggest-rules` Phase 6 | `.claude/commands/suggest-rules.md` | Auto-invokes audit/antipatterns/report после Phase 5 file creation | Wire-up target — add skill audit step |
| spec-variant-matrix benchmark | `.specs/spec-variant-matrix/` | Quality benchmark для spec sections (5 stories, 9 FR, 7 AC, DESIGN с 9 sections) | Template — mirror format |
| tests-create-update skill | `.claude/skills/tests-create-update/SKILL.md` | Pattern: `Agent(subagent_type="Explore")` для code analysis | Reference для merge-skills.ts pattern |
| variant-matrix-build skill | `.claude/skills/variant-matrix-build/SKILL.md` | Recent pioneer of envelope output (variant-matrix-cli.ts JSON) | Sub-agent invocation precedent |

### Architectural Constraints Summary

- **Backward compat обязателен** для `/suggest-rules` Phase 6 — existing rules-side audit MUST continue работать bit-identical (FR-9, AC-8)
- **Skills централизованы в `.claude/skills/`** — NEW (post этой сессии) convention; никаких extensions/{ext}/.claude/skills/ (per amended `extension-layout.md`)
- **Sub-agent envelope pattern** — script outputs JSON, SKILL.md orchestrates, main turn executes Agent tool — established convention; не direct API calls

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| H1: Sub-agent (general-purpose) возвращает invalid SKILL.md (output как prose, malformed frontmatter) | High | Medium | Ratchet scorer detects invalid frontmatter → revert; output schema validation в verify-merge.ts перед apply |
| H2: Ratchet scorer subjective (LLM as judge) — может ложно одобрить bad merge | Medium | High | SCORER_PROMPT explicit на critical fields (frontmatter, allowed-tools); если "uncertain" → flag for human review (не auto-apply); `--force` flag required для override |
| H3: Renaming `rules-optimizer → skills-rules-optimizer` ломает import paths (extension.json, suggest-rules.md, CLAUDE.md, потенциально hooks) | Medium | High | Explicit Impact Analysis grep repo-wide перед rename; atomic git mv + sync references в одном commit; integration test после rename |
| H4: Jaccard threshold 0.3 — false positives (skills с похожими keywords но разными missions) | Medium | Low | Calibrate на реальных pairs первого audit run; manual review CTA — "проверь recommendations прежде чем `--execute`" |
| H5: Skill rename breaks open user sessions (hot reload) | Low | Medium | Document в CHANGELOG; рекомендация — restart Claude Code session после rename merge |
