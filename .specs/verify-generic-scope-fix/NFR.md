# Non-Functional Requirements (NFR)

## Performance

- **P-1: Hook cold-start < 500ms p95** на среднем diff (< 500 изменённых строк). Жёстче чем `plan-gate.ts` budget (2s) потому что fires на каждый `Bash` в PreToolUse, включая innocuous commands. Measured через e2e test с synthetic diffs.
- **P-2: `scoreDiff()` pure function < 50ms** на diff до 2000 строк. Простой line-by-line regex scan, no async I/O.
- **P-3: Marker GC < 100ms** overhead per invocation. Single `fs.readdir` + `fs.stat` batch + filter + unlink. Skipped если последний GC был < 1h назад (tracked via marker-dir mtime).
- **P-4: Skill execution unbounded** — skill user-invocable, не блокирует другие operations; может занимать 5-30s для thorough grep reach-analysis. Acceptable.

## Security

- **S-1: Escape hatch reason ≥ 8 chars** (`[skip-scope-verify: X]` где `X.length >= 8`) — prevents token-gaming `"x"` / `"fix"` reasons без real explanation. Enforced в hook; короче — WARN в stderr (non-blocking), но audit log still records.
- **S-2: Marker path traversal protection** — marker filename вычисляется из `session_id` + `shortdiffsha`; hook validates итоговый path начинается с `{cwd}/.claude/.scope-verified/` через `resolve + startsWith` pattern per `no-unvalidated-manifest-paths.md`.
- **S-3: Session scoping** — marker SHALL содержать `session_id`; hook SHALL reject marker с другим `session_id`. Prevents cross-session contamination (агент A создал marker, агент B не должен использовать).
- **S-4: Audit log append-only** — `.claude/logs/scope-gate-escapes.jsonl` write via `fs.appendFile` с `flag: 'a'` + newline-delimited JSON. Hook не имеет capability удалять существующие entries. Manual cleanup по `log-rotate` convention.
- **S-5: No secret logging** — hook не пишет tool_input.command / diff content в marker или escape log (только sha256 hash). Prevents credential leak если diff случайно содержит secrets.

## Reliability

- **R-1: Fail-open на любую ошибку** — JSON parse error, `git` exec failure, filesystem error, unexpected exception → `process.exit(0)` (allow tool use). Pattern из `plan-gate.ts:220-231, 303-307`. Hook ломаться silent-но = лучше чем false positive deny.
- **R-2: No crash на missing git repo** — `git diff --cached` fails если `.git/` отсутствует; hook catches exec error → exit 0.
- **R-3: Concurrent invocation safety** — несколько параллельных skill invocations не должны corrupt-ить marker store. Atomic write per `atomic-config-save.md`: temp file + `fs.move` overwrite.
- **R-4: Hook resilience к corrupt marker** — если marker файл существует но JSON invalid → treat as absent (not crash). Log WARN в stderr.
- **R-5: TTL enforcement** — hook всегда проверяет `Date.now() - marker.timestamp <= 30min` независимо от содержимого marker; prevents indefinite-valid marker attacks.

## Usability

- **U-1: Deny reason ≤ 1000 chars** (actionable message). Содержит:
  - Что triggered (детектированные patterns)
  - Что делать (команда `/verify-generic-scope-fix`)
  - Escape hint (`[skip-scope-verify: <reason>]` при legitimate bypass)
- **U-2: Skill output structured** — per-variant report: `{variant, kind, reach, evidence_file_line}`. Easy to scan.
- **U-3: Zero-friction для true negatives** — docs/test-only diff не показывает никаких сообщений (silent exit 0). Only debug mode (`SCOPE_GATE_DEBUG=1`) включает trace logs.
- **U-4: Clear escape hatch documentation** — `.claude/rules/scope-gate/escape-hatch-audit.md` document-ирует when/how/what-reasons, cross-linked from deny message.
- **U-5: Install-time safety** — extension opt-in (user sets via `npx dev-pomogator install --extension scope-gate`). Default-off для existing projects, no surprise blocking.

## Assumptions

- A-1: Claude Code hook API stable на `PreToolUse` event с `matcher: "Bash"` + stdin JSON input per https://code.claude.com/docs/en/hooks
- A-2: `disable-model-invocation: true` frontmatter field распознаётся Claude Code skill system (documented pattern; первый precedent в dev-pomogator)
- A-3: dev-pomogator installer поддерживает `skills` + `hooks.claude.PreToolUse` + `ruleFiles.claude` одновременно в одном extension.json (verified через `extensions/personal-pomogator` + `extensions/reqnroll-ce-guard` precedents)
- A-4: `git diff --cached` available во всех target environments (contract: extension activates только в git repos; если нет `.git/` — hook exits 0 fail-open)

## Risks

- R-risk-1 (HIGH): false positives в heuristic — mitigation: threshold=2, dampening FR-4, escape hatch, post-release tuning via blocks.jsonl
- R-risk-2 (MED): Claude learning to game escape hatch — mitigation: reason ≥8 chars, audit trail, `when-to-verify.md` rule forbids gaming
- R-risk-3 (MED-HIGH): over-application (H1 regression) — mitigation: FR-4 dampening + hard-OUT list в `when-to-verify.md` + `SCOPE_GATE_DRYRUN=1` env для early adopters
- R-risk-4 (LOW): marker file pollution — mitigation: FR-5 GC > 24h
- R-risk-5 (LOW): hook delay на every Bash раздражает user — mitigation: P-1 <500ms budget + early exit на не-git commands

## Out of Scope

- Domain-specific glossaries (warehouse.md и т.п.) — отвергнуто per H6 structural LLM limit (см. `RESEARCH.md` Rejected Alternatives)
- Automatic memory refinement (`feedback_jira_literal_scope.md` update в webapp) — отдельная task после dev-pomogator release
- Cross-project marker sharing — by design markers per-cwd (FR-5 session scoping)
- Behavioral exhaustiveness static analysis (typescript-eslint-style AST check) — may be future enhancement, not v0.1.0
