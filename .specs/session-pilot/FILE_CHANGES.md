# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/session-pilot/extension.json` | create | Plugin manifest with toolFiles per [extension-manifest-integrity rule](../../.claude/rules/extension-manifest-integrity.md) |
| `extensions/session-pilot/README.md` | create | User-facing documentation |
| `extensions/session-pilot/CHANGELOG.md` | create | Version history starting v0.1.0 |
| `extensions/session-pilot/tools/session-pilot/server.py` | create | HTTP server (700 LOC; refactor candidate Phase 5) — implements [FR-1](FR.md#fr-1-get-apiindex--fast-worktree-list-with-claude_max_mtime), [FR-2](FR.md#fr-2-get-apiclaudepath--jsonl-preview-with-last-message), [FR-3](FR.md#fr-3-etag304-conditional-response-on-apiclaude), [FR-7](FR.md#fr-7-get-apihealth--idempotent-autostart-probe), [FR-19](FR.md#fr-19-diagnostic-cli---diagnose-livecycle), [FR-20](FR.md#fr-20-configurable-live-threshold) |
| `extensions/session-pilot/tools/session-pilot/start-server.sh` | create | Idempotent autostart with PID-lock — implements [FR-13](FR.md#fr-13-sessionstart-hook-idempotent-autostart) |
| `extensions/session-pilot/tools/session-pilot/zclaude` | create | Worktree-aware Zellij session launcher with auto-naming `<repo>__<branch>` |
| `extensions/session-pilot/tools/session-pilot/scripts/demo-zellij-install.sh` | create | Bootstrap helper for Zellij install in WSL |
| `extensions/session-pilot/tools/session-pilot/scripts/demo-zellij-setup.sh` | create | Bootstrap helper for Zellij config + token + start web |
| `extensions/session-pilot/tools/session-pilot/scripts/demo-spawn-sessions.sh` | create | Bootstrap helper for pre-creating multiple Zellij sessions |
| `extensions/session-pilot/tools/session-pilot/scripts/demo-dump-sessions.sh` | create | Helper for dumping Zellij session screen content |
| `extensions/session-pilot/tools/session-pilot/tests/check-api.py` | create | Smoke test for /api/index endpoint |
| `extensions/session-pilot/tools/session-pilot/tests/test-etag.sh` | create | Smoke test for ETag/304 path |
| `extensions/session-pilot/tools/session-pilot/layouts/claude-resume.kdl.tmpl` | create | Phase 3 — Zellij KDL template for `claude --resume <uuid>` mode |
| `extensions/session-pilot/tools/session-pilot/layouts/claude-fresh.kdl.tmpl` | create | Phase 3 — Zellij KDL template for fresh `claude` mode |
| `extensions/session-pilot/tools/session-pilot/ui/index.html` | create | Phase 5 — extracted UI shell with `<dialog>` modal markup |
| `extensions/session-pilot/tools/session-pilot/ui/app.js` | create | Phase 5 — Tabulator config + SWR cache + multi-key sort + modal logic |
| `extensions/session-pilot/tools/session-pilot/ui/styles.css` | create | Phase 5 — CSS-vars typography + frozen columns + density |
| `extensions/session-pilot/tools/session-pilot/ui/vendor/tabulator.min.js` | create | Phase 5 — vendored MIT, multi-sort + virtual scroll (~150KB) |
| `extensions/session-pilot/tools/session-pilot/ui/vendor/marked.min.js` | create | Phase 5 — vendored MIT, markdown rendering in modal (~30KB) |
| `extensions/session-pilot/tools/session-pilot/tests/test_encode_path.py` | create | Phase 6 — round-trip cross-OS path encoding regression tests |
| `extensions/session-pilot/tools/session-pilot/tests/test_launch_idempotent.py` | create | Phase 6 — verifies 5s idempotency lock prevents duplicate inject |
| `extensions/session-pilot/tools/session-pilot/tests/test_jsonl_indexer.py` | create | Phase 6 — synthetic fixtures parallel correctness |
| `extensions/session-pilot/tools/session-pilot/tests/fixtures/fake-claude-projects/` | create | Synthetic JSONL test data |
| `.claude/skills/session-pilot/SKILL.md` | create | Phase 6 — paired skill for ongoing development with `mcp__claude-in-chrome__*` scenarios |
| `.claude/rules/session-pilot/action-button-injection.md` | create | Phase 6 — decision tree write-chars vs new layout |
| `.claude/rules/session-pilot/claude-projects-encoding.md` | create | Phase 6 — WSL/Windows path encoding gotchas |
| `.claude/rules/session-pilot/perf-budget.md` | create | Phase 6 — per-endpoint latency targets |
| `.claude/rules/session-pilot/mcp-chrome-only.md` | create | Phase 6 — forbid PowerShell desktop captures (per [FR-16](FR.md#fr-16-skill-uses-mcp__claude-in-chrome__-for-browser)) |
| `.specs/session-pilot/COMPETITIVE_ANALYSIS.md` | create | Phase 2 — dedicated competitor analysis (≥1500 words, [FR-18](FR.md#fr-18-dedicated-competitor-analysis-artifact)) |
| `CLAUDE.md` | edit | Add 4 lines to Rules glossary table for new session-pilot rules |
