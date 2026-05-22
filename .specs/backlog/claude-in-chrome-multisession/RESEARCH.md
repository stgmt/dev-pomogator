# Research

## Контекст

Фича `claude-in-chrome-multisession` — workaround для open Anthropic issue: все Claude Code сессии шарят ОДИН и тот же MCP tab group когда используют официальный `claude-in-chrome` Chrome extension MCP. Issue tracker: [#15173](https://github.com/anthropics/claude-code/issues/15173) (BUG: all sessions share single tab group), [#15193](https://github.com/anthropics/claude-code/issues/15193) (Multi-Session Support feature request), [#20100](https://github.com/anthropics/claude-code/issues/20100) (FEATURE: isolated tab groups per session), [#26120](https://github.com/anthropics/claude-code/issues/26120), [#39637](https://github.com/anthropics/claude-code/issues/39637). Anthropic acknowledged feature request open, ETA unknown.

Эта фича — **прагматический workaround на стороне dev-pomogator**, не trying to fix upstream extension. Использует public hook API (PreToolUse + PostToolUse) для перехвата `mcp__claude-in-chrome__*` tool calls и enforce per-session ownership.

## Источники

- **Anthropic Claude Code hooks reference:** https://code.claude.com/docs/en/hooks (PreToolUse / PostToolUse JSON schema, `permissionDecision: "deny"` semantics, exit code 2 для DENY).
- **Claude in Chrome internals (gist by sshh12):** https://gist.github.com/sshh12/e352c053627ccbe1636781f73d6d715b — extension architecture (background service worker + content scripts + side panel + native messaging host); IPC: Windows `\\.\pipe\claude-mcp-browser-bridge-{USER}`, Mac/Linux `/tmp/claude-mcp-browser-bridge-{USER}/*.sock`.
- **Anthropic Claude Code Chrome docs:** https://code.claude.com/docs/en/chrome — official integration guide.
- **dev-pomogator existing PreToolUse hook example:** `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:30-40, :310` — verified pattern for reading `session_id` from stdin JSON, writing `permissionDecision: deny` + exit 2.

## Foundation verification (live POC, 2026-04-28)

**Перед написанием 10 FR** проведена end-to-end verification архитектуры через POC hook:

| Hypothesis | Test | Result |
|------------|------|--------|
| H1: PreToolUse fires on `mcp__claude-in-chrome__.*` regex matcher | Зарегистрирован POC hook, вызван `tabs_context_mcp` | ✅ Hook fired, log entry written |
| H2: `session_id` is reliably present in stdin JSON | Same POC; читал `parsed.session_id` | ✅ `4b29794f-92da-44d3-ab97-6ea4b0de9843` (UUID) |
| H3: `tool_input.tabId` available для tools that take it | Вызвал `navigate({tabId:..., url:...})` | ✅ `tool_input` содержал оба поля |
| H4: PostToolUse fires симметрично с `tool_response` | Same POC; вызвал `tabs_context_mcp` | ✅ `tool_response` array of `{type:"text", text:"..."}` blocks |
| H5: `permissionDecision: "deny"` + exit 2 actually blocks tool | POC v1 DENY-нул navigate с sentinel URL | ✅ Tool failed with `BLOCKED: ...` error visible to Claude |
| H6: Multi-session ownership isolation works (synthetic) | POC v2 запущен с 7 synthetic stdin scenarios (две `session_id`) | ✅ 7/7 passed: own ALLOW, other-session DENY, orphans auto-claim |
| H7: Real second `claude -p --chrome` session создаёт свой tab без collision | Запустил second Claude session через `claude -p --chrome`, открылся habr | ✅ State directories `<id-A>/` и `<id-B>/` полностью isolated |

**Урок mux**: foundation теперь верифицирована **на реальном Claude Code → MCP path**, не на synthetic stub. Это исключает H5 / mux-style failure где "тесты pass'или но runtime broken на target платформе".

## Технические находки

### Hook stdin protocol (verified 2026-04-28)

PreToolUse JSON shape:
```json
{
  "session_id": "<uuid>",
  "transcript_path": "<absolute>",
  "cwd": "<absolute>",
  "permission_mode": "auto" | "acceptEdits" | "...",
  "hook_event_name": "PreToolUse",
  "tool_name": "mcp__claude-in-chrome__navigate",
  "tool_input": {"tabId": 311065826, "url": "https://..."},
  "tool_use_id": "toolu_..."
}
```

PostToolUse adds `tool_response` (array of structured content blocks):
```json
{
  ...,
  "hook_event_name": "PostToolUse",
  "tool_response": [
    {"type": "text", "text": "Created new tab. Tab ID: 311066071\n..."},
    {"type": "text", "text": "<formatted second block>"}
  ],
  "duration_ms": 1371
}
```

DENY response (writes to stdout + exit 2):
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "<message visible to Claude>"
  }
}
```

Exit 0 = ALLOW (no payload required). Exit 2 = enforce DENY using stdout payload.

### Matcher regex semantics

`"matcher": "mcp__claude-in-chrome__.*"` — regex (not glob).

### Per-session state directory layout

```
~/.dev-pomogator/cdmm-sessions/
  <sanitized-session-id>/
    owned-tabs.json           # {sessionId, tabIds: number[], createdAt, lastUsedAt}
~/.dev-pomogator/logs/
  cims-guard.log              # JSONL append-only event log
```

`sanitize(sessionId)` = replace `[^a-zA-Z0-9_-]` with `_`. UUID survives sanitize unchanged.

## Risk Assessment

| ID | Риск | Severity | Likelihood | Mitigation |
|----|------|----------|------------|------------|
| R1 | Anthropic ships native per-session tab groups → этот extension становится legacy | Low (positive outcome) | Medium-High | README + CHANGELOG явно ссылаются на upstream issues; `stability` field позволяет demote в один шаг |
| R2 | Anthropic меняет hook stdin schema → hook ломается | Medium | Low | Defensive parse + fail-open в hook; integration test catches regression |
| R3 | `tabs_context_mcp` остаётся не-gated; skill discipline зависит от Claude следования инструкциям | Low | Low | Hook backs up skill — write op всё равно DENY-нет |
| R4 | Concurrent state writes из 2+ сессий race condition | Very Low | Very Low | Atomic write через temp+rename per session-specific directory |
| R5 | TTL cleanup может удалить активную сессию | Low | Low | TTL = 24h; recovery — тривиально (next tool call auto-claims orphans) |
| R6 | `claim-tab.mjs add` без CLAUDE_SESSION_ID env → ambiguous which session | Medium | Medium | Skill MUST set env через bash invocation; fail-fast если env missing |
| R7 | Skill hooks конфликтуют с другими extension hooks на том же matcher | Low | Low | Installer's writeHooksToSettingsLocal smart-merges, preserves other entries |
| R8 | Bootstrap mode (orphan auto-claim) перетягивает legitimate user tab при first touch | Low | Medium | Documented в SKILL.md + README; `claim-tab.mjs release <tabId>` reverses |

## Where implementation lives

- App-код (extension): `extensions/claude-in-chrome-multisession/extension.json`, `tools/claude-in-chrome-multisession/{cims-guard.ts, claim-tab.mjs, README.md}`
- Skill: `.claude/skills/claude-in-chrome-multisession/SKILL.md`
- Tests: `tests/e2e/claude-in-chrome-multisession-{guard,claim,skill,installer}.test.ts`
- State (runtime): `~/.dev-pomogator/cdmm-sessions/` + `~/.dev-pomogator/logs/cims-guard.log`
- Installer wiring: existing `src/installer/extensions.ts` + `src/installer/settings-local.ts` writeHooksToSettingsLocal — **no changes needed**.

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| no-unvalidated-manifest-paths | `.claude/rules/no-unvalidated-manifest-paths.md` | Resolve paths via `resolveWithinProject` | hook reads project-local files (если будет) | NFR-Security |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Atomic temp+rename writes | `owned-tabs.json` writes | NFR-Reliability |
| ts-import-extensions | `.claude/rules/ts-import-extensions.md` | `.ts` specifiers в extensions/**/*.ts | cims-guard.ts | FR-2 |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | All files listed in extension.json | manifest scope | FR-1 |
| extension-layout | `.claude/rules/extension-layout.md` | Skills source в repo `.claude/skills/`, не в `extensions/{ext}/skills/` | new skill location | FR-1 |
| installer-hook-formats | `.claude/rules/gotchas/installer-hook-formats.md` | 3 формата hooks; installer обрабатывает все | manifest hooks section | FR-9 |
| integration-tests-first | `.claude/rules/integration-tests-first.md` | Real spawnSync / runInstaller tests | tests | FR-tests |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| plan-gate.ts | `extensions/plan-pomogator/tools/plan-pomogator/plan-gate.ts:30-40, :310` | Pattern for PreToolUse hook reading `session_id` from stdin, writing DENY response | **Direct template** |
| writeHooksToSettingsLocal | `src/installer/settings-local.ts:145-209` | Atomic smart-merge writer for `.claude/settings.local.json` hooks | **Reuse as-is** |
| edge-debug-port skill | `extensions/edge-debug-port/.claude/skills/edge-debug-port/SKILL.md` | Pattern для browser-related skill | Template для skill structure |
| chrome-devtools-mcp-mux smoke-test.mjs | `extensions/chrome-devtools-mcp-mux/tools/chrome-devtools-mcp-mux/smoke-test.mjs` | Pattern для self-contained Node ESM helper | Template для claim-tab.mjs |

### BDD Framework Detection

`[VERIFIED: package.json + tests/e2e/ scan]`

| Field | Value |
|-------|-------|
| `language` | typescript |
| `framework` | vitest 4.1.0 |
| `Install Command` | already installed |
| `naming convention` | `tests/e2e/<extension>-<aspect>.test.ts` |

### Existing BDD Hooks

- `tests/e2e/helpers.ts` — `runInstaller()` + tmpdir creation. **Reuse** для integration tests.
- `tests/e2e/chrome-devtools-mcp-mux-helpers.ts` — fixture/cleanup helpers for tmpdir-based hook tests. **Pattern reused** в новом helpers file.

### Architectural Constraints Summary

- Hook stdin protocol locked at runtime via `extension-manifest-integrity` rule + manifest declaration; defensive parse + fail-open per `integration-tests-first` rule.
- State directory HOME-scoped, per-user, per-session-id; atomic writes only.
- Skill source path ОБЯЗАТЕЛЬНО `.claude/skills/claude-in-chrome-multisession/` per `extension-layout`.
- **No `.mcp.json` modification.** Unlike chrome-devtools-mcp-mux, эта extension does NOT register an MCP server.

## Выводы

1. Multi-session safety без extension fork — feasible через PreToolUse + PostToolUse hooks. Foundation verified end-to-end на real Claude Code → MCP path.
2. Soft (skill) + hard (hook) layers дают defense-in-depth.
3. First-touch ownership (orphan auto-claim) — bootstrap-friendly.
4. Skill alone недостаточно — Claude может ошибиться даже с лучшими инструкциями. Hook = enforcement floor.
5. No upstream modifications. Anthropic extension untouched. Когда они зашипят native fix — фича становится legacy.
6. `tabs_context_mcp` intentionally not gated (read-only, can't enforce filtering at hook level). Acceptable trade-off.
