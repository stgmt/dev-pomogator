# Non-Functional Requirements (NFR)

## Performance

- Gitignore writer (`writeManagedGitignoreBlock`) SHALL завершаться в <100ms для typical project (50-100 managed paths). Atomic write через temp + move.
- `git ls-files` collision check SHALL использовать batched single call (`git ls-files -- path1 path2 ... pathN`), не N отдельных subprocess вызовов. Реализация: `execFileSync` с array arguments.
- Marker block collapse algorithm (`collapseToDirectoryEntries`) SHALL работать за O(N log N) через sort + group-by-parent-dir, без quadratic scans.
- Secret pattern regex (`checkMcpJsonForSecrets`) SHALL использовать single pass с `matchAll` / `replace`, не N отдельных regex.test() вызовов.

## Security

- Path validation obligatory через `resolveWithinProject` pattern (from `.claude/rules/no-unvalidated-manifest-paths.md`) — никаких путей вне `repoRoot`. Uninstall SHALL использовать guard для каждого `ManagedFileEntry.path`.
- Atomic writes для `.gitignore`, `settings.local.json`, `~/.claude.json` (from `.claude/rules/atomic-config-save.md`) — temp file + `fs.move`, не direct `fs.writeJson`. Защищает от partial writes при crash.
- `setup-mcp.py` SHALL НЕ писать в project `.mcp.json` — force-global предотвращает смешивание наших MCP entries с user's potential secrets.
- Installer SHALL детектить secret patterns в existing project `.mcp.json` и warn — user awareness о risk leak через `git add .`.
- Uninstall command SHALL refuse в dev-pomogator source repo — защита от accidental dogfood deletion.
- Skill file (`SKILL.md`) SHALL NOT содержать destructive команд без explicit user confirmation на каждом critical шаге — prevent AI agent from auto-deleting files.

## Reliability

- Idempotent install: повторный install с identical extensions set SHALL давать identical `.gitignore` marker block bytes (stable sort, deterministic collapse).
- Graceful no-`.git/`: если target проект не git repo — collision detection SHALL skip, gitignore writer SHALL skip (no .gitignore to edit), hooks всё равно в settings.local.json.
- Graceful Windows/MSYS: forward-slash normalization в всех gitignore entries. `MSYS_NO_PATHCONV=1` env var в `git ls-files` вызовах на Windows.
- Legacy migration backward-compat: если в existing target `.claude/settings.json` есть наши hooks — мигрировать в `settings.local.json` без loss. Team hooks preserved.
- Installer loud-fail: better fail fast with clear message чем leave broken state (FR-5).
- Hook fail-soft: better silent no-op с diagnostic чем block entire Claude Code session (FR-6). Real errors still bubble up (FR-6 AC).
- Config atomic updates через `writeJsonAtomic` — partial failure не leaves corrupt config.

## Usability

- Install report SHALL содержать новые rows: `gitignore`, `settings.local.json`, `collisions`, `runner-verification`, `mcp-security` — каждая со status `ok|warn|fail` и короткой message.
- Self-guard SHALL логировать один info line: `"Detected dev-pomogator source repository — skipping personal-mode features"` — пользователь сразу видит почему personal mode не активировался.
- Collision warning SHALL печатать list of collided files с clear recommendation: `"COLLISION: {path} — skipped (user-tracked in git). To install dev-pomogator's version, first: git rm --cached {path}"`.
- Security warning (FR-10) SHALL быть actionable — с нумерованным списком рекомендаций, не generic "be careful".
- Uninstall `--dry-run` output SHALL показывать exactly какие файлы будут удалены, какие gitignore entries will be stripped, чтобы user мог verify перед real run.
- SKILL.md SHALL быть понятным для AI агента — numbered steps, clear conditions, explicit safety checks.
