# Use Cases

## UC-1: Audit skills repo (happy path)

Maintainer запускает аудит для проверки health всех skills.

- `npx tsx .claude/skills/skills-rules-optimizer/scripts/audit.ts --dir .claude/skills --save audit_skills.json`
- Скрипт сканирует `.claude/skills/*/SKILL.md`, извлекает frontmatter, считает токены/строки, детектит overlap candidates через Jaccard pre-filter (cheap, ≤1s для 30 skills)
- Output JSON: `{ totalSkills, withErrors[], withWarnings[], overlaps[], details[] }`
- Maintainer читает `audit_skills.json`, решает какие issues fix-ить

**Связанные FR:** [FR-1], [FR-2], [FR-3], [FR-4]

## UC-2: Detect-then-merge workflow

Audit показал что skills A и B имеют trigger Jaccard 0.45 — overlap candidate.

- User запускает `merge-skills.ts --execute skill-a skill-b merged-ab`
- Скрипт читает оба SKILL.md, формирует MERGE_PROMPT envelope
- SKILL.md workflow yields control: main turn вызывает `Agent(subagent_type="general-purpose", prompt=...)`
- Agent возвращает merged SKILL.md content
- `verify-merge.ts` запускает ratchet scorer (independent Agent) на merged + originals
- Если score не regressed → write `.claude/skills/merged-ab/SKILL.md`, output cleanup suggestion
- Originals остаются на диске для manual review

**Связанные FR:** [FR-4], [FR-5], [FR-6], [FR-7]

## UC-3 (edge): Merge Agent returns malformed SKILL.md

Sub-agent (general-purpose) выдаёт content без обязательного `name:` в frontmatter.

- `merge-skills.ts` parses Agent output, сохраняет в `merged-ab/SKILL.md.draft`
- `verify-merge.ts` читает draft, scorer Agent оценивает: `frontmatter_valid: false, regression: true`
- Output: `{regression: true, reasoning: "merged SKILL.md missing required 'name:' field", shouldRevert: true}`
- Main turn удаляет draft, не применяет merge
- User видит report — может попробовать с другим prompt, или skip pair

**Связанные FR:** [FR-5], [FR-6]

## UC-4: Bulk pre-commit audit gate

Maintainer хочет чтобы commits с broken SKILL.md (oversize, missing allowed-tools) блокировались.

- Pre-commit hook вызывает `audit-skills.ts --dir .claude/skills --strict`
- `--strict` exit 1 if `withErrors[].length > 0` (не warnings)
- Maintainer fix-ит errors → re-commit → audit passes → commit proceeds

**Связанные FR:** [FR-1], [FR-2], [FR-3], [FR-9] (бэкcompat хука)

## UC-5 (edge): Transitive references nesting

SKILL.md ссылается на `references/A.md`, который ссылается на `references/B.md`.

- `audit-skills.ts` читает SKILL.md → extracts `references/*.md` links
- Для каждого referenced file → читает → extracts его references
- Если depth > 1 → flag `transitive_references` per Anthropic anti-pattern (one-level-deep limit)
- Output: warning `{path, warning: "transitive_references", chain: ["SKILL.md", "A.md", "B.md"]}`

**Связанные FR:** [FR-1] (расширенный audit scope)

## UC-6 (edge): /suggest-rules backwards compat

Existing flow: `/suggest-rules` Phase 6 вызывает audit для rules-only.

- Phase 6.2 теперь вызывает `audit.ts --dir .claude/rules` (rules path) И `audit.ts --dir .claude/skills` (skills path)
- `audit.ts` — dispatcher: `--dir .claude/rules` → `audit-rules.ts` (existing logic verbatim); `--dir .claude/skills` → `audit-skills.ts` (NEW)
- Old behaviour for rules — bit-identical (FR-9)
- New behaviour for skills — additive

**Связанные FR:** [FR-9]
