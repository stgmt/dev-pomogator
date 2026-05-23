# Skills Rules Optimizer

**Status: shipped 0.1.0 — 2026-05-23.** Skill `.claude/skills/skills-rules-optimizer/` + 9 scripts. Phase 6 интеграция: `/suggest-rules` автозапускает `audit.ts` после rule creation. См. [CHANGELOG.md](CHANGELOG.md).

Расширение существующего `rules-optimizer` skill чтобы покрывать также `.claude/skills/*/SKILL.md`, не только `.claude/rules/*.md`. Детектирование overlapping skills, oversize SKILL.md (per Anthropic 500-line cap), missing `allowed-tools`, transitive references — с LLM-driven merge synthesis через Claude Code sub-agent + ratchet (regression prevention).

## Driver

В рамках текущей session создан skill `variant-matrix-build` без `AskUserQuestion` в `allowed-tools`, хотя SKILL.md описывает interactive flow ("собрать с пользователя список вариантов"). Existing rule `skill-allowed-tools-audit.md` — manual checklist, не сработал. Symmetric overlap detection между skills (как существующий rules-optimizer делает для rules) — отсутствует.

## Ключевые идеи

- **Расширение, не replacement** — существующий `rules-optimizer` сохраняется byte-identical для rules-side; добавляются capabilities для skills (FR-9 backward compat)
- **Hybrid Jaccard + LLM** — cheap pairwise pre-filter (≤1s/30 skills) → only candidates feed в expensive LLM stage (per `EvoClaude` + `jkitchin/skillz` pattern)
- **Triple-axis overlap detection** — trigger phrases / section headings / functional keywords (per `connorblack/skill-tools` pattern); single-axis недостаточно
- **Sub-agent invocation pattern** — pioneer для repo: scripts emit JSON envelope, SKILL.md workflow yields control, main turn calls `Agent(subagent_type="general-purpose")`. NO direct API key dependency.
- **Ratchet mandatory** — independent scorer sub-agent оценивает merged skill против originals (per `darwin-skill` 2047★ pattern); regression → revert
- **Preserve originals** — никогда auto-delete; cleanup suggestion как dim text — manual `rm` от user

## Где лежит реализация

- **App-код**: `.claude/skills/skills-rules-optimizer/scripts/` (renamed from `rules-optimizer/scripts/`)
- **Templates**: `.claude/skills/skills-rules-optimizer/references/` (5 files: 2 existing + 3 new)
- **Wiring**: `.claude/commands/suggest-rules.md` Phase 6 (paths updated, skill audit step added)
- **Manifest**: `extensions/suggest-rules/extension.json` (skills + skillFiles paths)

## Research foundation

5 OSS implementations + CASCADE academic paper grounding:
- `jkitchin/skillz` — LLM two-stage merge (OVERLAP_PROMPT → MERGE_PROMPT)
- `L-Qun/EvoClaude` — Jaccard pre-filter без LLM
- `connorblack/skill-tools` — triple-axis detection-only
- `alchaincyf/darwin-skill` (2047★) — ratchet pattern
- `shinytoyrobots/claude-skills-linter` — token-cost ranking
- [CASCADE paper (arxiv:2512.23880)](https://arxiv.org/abs/2512.23880) — 93.3% success с evolution mechanism vs 35.4% без

См. [RESEARCH.md](RESEARCH.md) для full sources с code excerpts.

## Где читать дальше

- [USER_STORIES.md](USER_STORIES.md) — 5 historiess (3×P1 + 2×P2)
- [USE_CASES.md](USE_CASES.md) — UC-1 happy + UC-2..6 edge cases
- [RESEARCH.md](RESEARCH.md) — 5 OSS sources + Risk Assessment H1-H5
- [REQUIREMENTS.md](REQUIREMENTS.md) — 24 CHKs traceability matrix
- [FR.md](FR.md) — 9 FRs + 2 OUT_OF_SCOPE
- [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) — 8 EARS criteria
- [NFR.md](NFR.md) — Performance/Security/Reliability/Usability
- [DESIGN.md](DESIGN.md) — components + algorithm + 3 Key Decisions + BDD Infra
- [FILE_CHANGES.md](FILE_CHANGES.md) — 40+ files (rename + extend + create + manifest)
- [FIXTURES.md](FIXTURES.md) — 6 static read-only fixtures
- [TASKS.md](TASKS.md) — 16 tasks across Phase 0/1/2/3 (TDD)
- [skills-rules-optimizer.feature](skills-rules-optimizer.feature) — 8 BDD scenarios
- [CHANGELOG.md](CHANGELOG.md) — Unreleased + [0.1.0]
