# Non-Functional Requirements (NFR)

## Performance

- **Pre-filter (Jaccard) latency:** ≤ 1s для 30 skills (pairwise N×N ≈ 435 comparisons; cheap token-set operations).
- **Audit phase total time:** ≤ 3s для 30 skills (file IO + frontmatter parse + token estimate + Jaccard).
- **LLM merge stage latency:** ≤ 60s per pair (Agent sub-agent overhead, dominated by Claude inference; нет hard cap, но user-facing notice если >120s).
- **Ratchet scorer latency:** ≤ 30s per evaluation (smaller prompt чем merge, но same Agent overhead).

## Security

- **No API keys в коде:** zero references to `ANTHROPIC_API_KEY` env var, `import Anthropic`, `@anthropic-ai/sdk` package. Verifiable через `grep -r "ANTHROPIC_API\|@anthropic-ai" .claude/skills/skills-rules-optimizer/` → 0 matches.
- **Path validation:** все пути из CLI args (e.g. `--dir`, `--merged-name`) validated через `resolveWithinProject(projectPath, relativePath)` per `no-unvalidated-manifest-paths.md` rule. Reject `..` traversal.
- **Sub-agent sandbox:** Agent sub-agent (general-purpose) inherits Claude Code sandbox; не имеет access к `~/.ssh`, `~/.config`, etc. кроме explicit grants.
- **Atomic writes:** merged SKILL.md write через temp file + `fs.move({overwrite: false})` per `atomic-config-save.md` rule. Reject overwrite если `<merged-name>/SKILL.md` уже существует.

## Reliability

- **Ratchet защита:** preserve-originals + scorer evaluation + revert логика — три уровня safety; data loss невозможен без explicit `--force` от user.
- **Idempotent audit:** `audit.ts` повторный run на unchanged repo emit identical JSON output (deterministic ordering: alphabetic by path, stable Jaccard computation).
- **Rename safety:** atomic git mv preserves history; Impact Analysis grep validates ВСЕ references обновлены перед commit.
- **Fail-safe defaults:** missing frontmatter → warning (не error); missing optional fields → warning. Hard errors только для violations spec'd в FR-2 (forbidden tokens, oversize, missing required).

## Usability

- **Single command для full audit:** `npx tsx audit.ts --dir .claude/skills` — без extra args для default behaviour. Same CLI shape как existing rules-side audit (FR-9).
- **Detect/execute split:** mirrors rules-optimizer convention. `--detect` (default) выводит таблицу, `--execute` opt-in для merge. Пользователь видит recommendations прежде чем apply.
- **Cleanup suggestions как dim text:** не выполняются автоматически, чтобы пользователь явно подтвердил `rm -rf` командой. Защита от accidental data loss.
- **Error messages actionable:** каждое error finding содержит `code` (machine-readable), `path` (file location), `suggestion` (как fix). Пример: `{ code: "ALLOWED_TOOLS_MISSING", path: ".claude/skills/foo/SKILL.md", missing: ["Skill"], suggestion: "Add 'Skill' to allowed-tools in frontmatter" }`.
- **Ratchet decision visible:** на regression — explanation от scorer (не binary fail), чтобы user понимал почему rejected merge.
