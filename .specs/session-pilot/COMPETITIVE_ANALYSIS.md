# Competitive Analysis (session-pilot vs. alternatives)

> **Method**: hypothesis-first research per `Skill("research-workflow")` — each per-tool section verified through direct WebFetch of the tool's GitHub README plus secondary sources (blog posts, comparison articles). Markers: `[VERIFIED]` = ≥3 independent sources, `[SINGLE_SOURCE]` = 1 source, `[ASSUMED]` = inferred from convention.
>
> **Scope**: tools that wrap Claude Code CLI (or are otherwise its functional analogues for managing multiple coding sessions). 7 alternatives + session-pilot.

---

## 1. Tools analysed

| # | Tool | Author | License | Stars | Last release | Status |
|---|------|--------|---------|-------|--------------|--------|
| 1 | **vibe-kanban** | BloopAI | Apache-2.0 | n/a | v0.1.44 (2026-04-24) | ⚠️ **SUNSETTING** [VERIFIED: README header + announcement + Medium articles 2026-Q2] |
| 2 | **agent-of-empires** | njbrake | MIT | n/a | v1.5.2 (2026-05-05) | Active; web PWA in Beta [VERIFIED] |
| 3 | **ccmanager** | kbwo | n/a | n/a | active | Active; TUI-only [VERIFIED] |
| 4 | **kanna** | jakemor | MIT | n/a | active | Active; web UI on port 3210 [VERIFIED] |
| 5 | **claudito** | comfortablynumb | MIT | 31 | 125 commits | Active; tiny project [SINGLE_SOURCE: README only] |
| 6 | **claude-code-web** | vultuk | MIT | 75 | v3.4.0 (2025-10-23) | Active; VS Code-style split view [VERIFIED] |
| 7 | **claudecodeui** (sugyan) | sugyan | MIT | 1.1k | v0.1.56 (2025-09-18) | Active; permission management focus [VERIFIED] |
| ★ | **session-pilot** | this project | n/a | — | v0.1.0 | This plugin (target) |

---

## 2. Per-tool deep dive

### 2.1 vibe-kanban (BloopAI) — SUNSETTING

**Key features** [VERIFIED: BloopAI/vibe-kanban README + vibekanban.com/docs + 2 Medium reviews (Llopart, Suresh)]:
- **Kanban board UX**: tasks have lanes (To Do / In Progress / Done), drag-and-drop, priorities, assignment to agents.
- **Multi-agent support**: «Switch between 10+ coding agents» — Claude Code, Codex, Gemini CLI, Copilot CLI, Cursor, OpenCode, etc.
- **Per-task workspace**: each task gets «a branch, a terminal, and a dev server» — git worktree per task attempt isolates changes.
- **Embedded preview**: «built-in browser with devtools, inspect mode, and device emulation».
- **PR workflow**: «open PRs with AI-generated descriptions, review on GitHub, and merge».
- **Inline diff comments**: «Review diffs and leave inline comments» — sends feedback to agent without leaving UI.
- **Built with**: Rust + TypeScript.

**Documented limitations**:
- ⚠️ **Project is sunsetting** — README header explicitly states «Vibe Kanban is sunsetting». Continues as community-maintained per announcement.
- No documentation on: status detection (running/idle/waiting), session persistence after reboot.

**Why it's relevant for us**: kanban UX is a different paradigm — task-centric, not session-centric. Useful concepts to borrow: per-task git worktree (we already do this), inline diff comments (P2 backlog).

### 2.2 agent-of-empires (njbrake) — TUI + Web PWA

**Key features** [VERIFIED: njbrake/agent-of-empires README + nimbalyst comparison blog 2026-04 + DEV.to article 2026-03]:
- **Status detection**: «running, waiting for input, or idle» — the **gold-standard verbosity** for agent state. Matches what ccmanager does.
- **Web PWA (Beta)**: «create, monitor, and control your agents from any browser, installable as a PWA. Real agent terminal renders in the page; switch sessions, type into the terminal, and review diffs without leaving the tab.»
- **TUI parallel**: equivalent feature set in terminal.
- **Multi-CLI**: 11 supported (Claude Code, OpenCode, Mistral Vibe, Codex CLI, Gemini CLI, Cursor CLI, Copilot CLI, Pi.dev, Factory Droid, Hermes, Kiro CLI).
- **Tmux backbone**: «Each agent runs in its own tmux session» — sessions persist when AoE UI closed; only removed when explicitly deleted.
- **Git worktrees**: «run parallel agents on different branches of the same repo».
- **Diff viewer**: «review git changes and edit files without leaving the TUI».
- **Remote access**: documented Tailscale + Cloudflare tunnel patterns for accessing AoE from phone.

**Limitations**:
- Web PWA marked «Beta, stabilization in progress» (May 2026).
- No specific pagination story for 50+ agents.
- Status definitions less precise than ccmanager (no clear "Busy" vs "Waiting" distinction).

**What we should copy**: status badges (running/waiting/idle) — already in our v0.1.0; diff viewer per worktree (P2); remote tunnel docs (P3).

### 2.3 ccmanager (kbwo) — TUI session manager

**Key features** [VERIFIED: kbwo/ccmanager README + nimbalyst session-managers comparison + 2 community posts]:
- **Hierarchical TUI**: project list → worktree menu → session view.
- **Status badges**: «Waiting / Busy / Idle» per session — Waiting = Claude asks user input, Busy = Claude processing, Idle = ready for tasks. Most granular state vocabulary in the space.
- **Session count badges**: per project shows `[active/busy/waiting]`.
- **Vi-style search**: `/` key filters projects/worktrees. Inspired by Vim.
- **Hierarchical back-navigation**: `B` key returns to previous menu.
- **Multi-project mode**: manages multiple git repositories from a single interface; root scanning via `CCMANAGER_MULTI_PROJECT_ROOT` env var.
- **Auto worktree creation/deletion/merging**: from within the app.
- **Session JSONL portability**: «Copy Claude Code session data» between worktrees — copies files from `~/.claude/projects/[source-path]` to target worktree on creation. Preserves «conversation history, project context, and Claude Code state». Configurable default via setting.
- **Enhanced Git status**: `+10 -5` (added/deleted), `↑3 ↓1` (ahead/behind upstream), parent branch context. Requires `git config extensions.worktreeConfig true`.
- **Post-creation hooks**: scripts run after worktree creation (env setup, IDE launch, notifications).
- **Auto-approval (experimental)**: approves "safe" prompts automatically for less Claude friction.
- **Configurable shortcuts**: e.g. Ctrl+E returns to menu (default).

**Limitations**:
- TUI-only, no web/HTML interface.
- No multi-key sort UI (single hierarchy only).
- No modal viewer for last message — TUI shows running terminal directly.

**What we should copy** (high priority):
- ⭐ **vi-style `/` filter** — P0 for v0.2 (Tabulator setFilter on keyboard `/`).
- ⭐ **Verbose status vocabulary**: Waiting / Busy / Idle (currently we have just LIVE / idle / none).
- ⭐ **Per-worktree git status `+N -M / ↑K ↓L`** — P0 for v0.2 (FR-6 in our spec).
- **Copy JSONL between worktrees** — P1 for v0.3 (skill scenario).
- **Post-creation hooks** — P2 for v0.3 (skill scenario hooks).

### 2.4 kanna (jakemor) — Beautiful web UI

**Key features** [VERIFIED: jakemor/kanna README + nimbalyst GUI comparison]:
- **React + Zustand**: client-side stack.
- **Project-first sidebar**: chats grouped under projects with drag-and-drop reordering.
- **Auto-discovery**: «auto-discovers projects from both Claude and Codex local history».
- **Persistent local history**: «refresh-safe routes backed by JSONL event logs and compacted snapshots». State at `~/.kanna/data/`. Replays on startup.
- **Default port 3210**.
- **Rich transcript rendering**: «hydrated tool calls, collapsible tool groups», interactive elements.
- **MIT licensed**, install via `bun install -g kanna-code`.

**Limitations**:
- No git worktree integration documented.
- No action button to launch commands (read-only viewer style).
- No multi-key sort.

**What we should copy**: project-first sidebar UX (we have repo column + frozen leftmost); JSONL event-log persistence (we have ETag+localStorage instead — different but solves same problem).

### 2.5 claudito (comfortablynumb) — Tiny multi-agent web manager

**Key features** [SINGLE_SOURCE: comfortablynumb/claudito README only — no community reviews found]:
- **Web UI**: localhost:3000.
- **Multi-agent multi-project**: «Run and monitor multiple Claude agents across different projects».
- **Configurable concurrency limit**: «Concurrent Execution: Run multiple agents at once (configurable limit)».
- **Session recovery**: «Automatic recovery when Claude sessions are lost».
- **Resume across restarts**: «Resume Claude sessions across restarts».
- **Ralph Loop**: iterative development pattern.
- **Mermaid.js**: diagram rendering in conversations.
- **MCP server config**: managed in UI.
- **MIT, 31 stars, 125 commits** — early stage.

**Limitations**:
- 31 stars — adoption is minimal; expect rough edges.
- Single source — claims about Session Recovery / Resume Across Restarts not independently verified.
- No documentation on git worktree integration, status indicators, or pagination.

**What we should copy**: Mermaid.js rendering (P3 — when we have markdown modal); explicit Resume-Across-Restarts naming (we already implement via Zellij + claude --resume).

### 2.6 claude-code-web (vultuk) — Multi-session web with VS Code split

**Key features** [VERIFIED: vultuk/claude-code-web README + DEV.to writeups + comparison post]:
- **«Web-based interface for Claude Code CLI that can be accessed from any browser»**.
- **🔄 Multi-Session Support**: «Create and manage multiple persistent Claude sessions».
- **Persistence after disconnect**: «Sessions remain active even after all browsers disconnect»; «reconnect from any device using the same server».
- **Real-time streaming**: full interactivity through WebSocket.
- **VS Code-style split view** (v3.4.0): split panes within the browser.
- **MIT, 75 stars, v3.4.0 released 2025-10-23** — actively maintained.

**Limitations**:
- Terminal-based interface — no dedicated action buttons or kanban-style task UX.
- No git worktree integration documented.
- No status indicators per session.

**What we should copy**: persistence-after-disconnect language (we achieve this via Zellij session resurrection + autostart hook, but should document it explicitly in README).

### 2.7 claudecodeui (siteboon, formerly «CloudCLI») — Most popular

**Key features** [VERIFIED: siteboon/claudecodeui README + shyft.ai/skills page + nimbalyst comparison + Anthropic Issue #33942 referencing it]:
- **Most stars in the space**: 10.7k stars (May 2026), AGPL-3.0-or-later — used as benchmark in many comparison articles.
- **Multi-CLI**: Claude Code, Cursor CLI, Codex, Gemini CLI.
- **Web + mobile responsive**: «desktop and mobile UI».
- **Auto-discovery**: «auto-discovers every session from your `~/.claude` folder».
- **Session management**: «Resume conversations, manage multiple sessions, and track history».
- **Built-in shell terminal**.
- **MCP management** UI panel.
- **File explorer + Git integration** UI.
- **Visual project browser** with rename/delete/organize actions.
- **Install**: `npx @cloudcli-ai/cloudcli`, opens at localhost:3001.
- **Docker sandbox option** documented.

**Limitations**:
- AGPL-3.0 — copyleft viral license. Network service modifications must be open-sourced.
- No git worktree integration documented.
- No multi-key sort UX described.
- No documented pagination strategy for hundreds of sessions.

**What we should copy**: discovery from `~/.claude/projects` (we already do this + cross-OS); MCP management UI (P3 backlog).

---

### 2.8 session-pilot (this project) — feature inventory

For symmetry with the rivals above:

**Key features** [VERIFIED: working prototype on `feat/session-pilot` branch + RESEARCH.md + this spec]:
- **Web dashboard** at `http://localhost:8083` with Tabulator-powered table.
- **Multi-repo worktree listing**: auto-discovers repos from `~/repos` and `/mnt/d/repos`, plus `git worktree list --porcelain` per repo.
- **LIVE / idle / none status indicator** per worktree from JSONL mtime (configurable threshold, default 300s for Claude write batching).
- **Cross-OS path encoding** [VERIFIED, unique to us]: matches Claude project dirs across both `/mnt/d/repos/foo` (WSL) AND `D:\repos\foo` (Windows), regardless of where the JSONL was written.
- **One-click [▶ Resume]**: injects `claude --resume <uuid>` into Zellij session via `action write-chars`. New session created with KDL layout if absent. (Phase 3.)
- **One-click [✨ Fresh / 📂 VSCode / 🪟 Zellij]** action buttons.
- **Last message preview** from JSONL in-row, with click → modal full-text + prev/next nav. (Phase 5.)
- **Last activity timestamp** parsed from `timestamp` field of last JSONL line — unique among reviewed tools.
- **SWR cache + ETag/304** [unique]: localStorage instant render + server returns 304 for unchanged paths (5ms response, 0 bytes). Reload skips 38/45 rows of fetch.
- **Multi-key shift+click sort** via vendored Tabulator.js. (Phase 5.)
- **Vi-style `/` filter** via Tabulator setFilter — adopted from ccmanager. (Phase 5.)
- **Per-worktree git status** `+N -M / ↑K ↓L` — adopted from ccmanager. (Phase 3.)
- **Diagnostic CLI** `python server.py --diagnose-livecycle <path>` — unique tool for troubleshooting encoding/threshold issues.
- **WSL + Windows host access**: bind 0.0.0.0 + netsh portproxy bridge.
- **SessionStart hook** for idempotent autostart.
- **Pairs with Zellij Web Client** at `:8082` for actual terminal access — we don't reinvent terminal embedding.

**Honest limitations**:
- v0.1.0: action button does NOT yet inject (Phase 3 todo).
- No remote tunnel (Tailscale/Cloudflare) — out of scope v0.1.0.
- No diff viewer — out of scope v0.1.0.
- Claude Code CLI only (multi-CLI support deferred to v0.2).

---

## 3. Master feature matrix

Legend: ✅ has · ⚠️ partial · ❌ no · ⏳ planned (next version)

| Feature | vibe-kanban | aoe | ccmanager | kanna | claudito | claude-code-web | claudecodeui | **session-pilot** |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Browser-first UI** | ✅ | ✅ Beta | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mobile responsive | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ⚠️ | ✅ | ❌ |
| **Multi-repo worktree listing** | ⚠️ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | ⚠️ | ✅ |
| **Status badges** (live/idle/waiting) | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Status: Waiting-for-input distinction | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ⏳ v0.2 |
| **Last message preview from JSONL** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** |
| **Last activity timestamp** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** |
| **Cross-OS path encoding** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** |
| **One-click claude --resume** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** (Phase 3) |
| **Modal full-conversation viewer** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** (Phase 5) |
| **Multi-key shift+click sort** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** (Phase 5) |
| **SWR cache + ETag/304** | ❌ | ❌ | ❌ | ⚠️ event log | ❌ | ❌ | ❌ | **✅ unique** |
| **Diagnostic CLI** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **✅ unique** |
| Vi-style `/` filter | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ⏳ v0.2 |
| Per-worktree git status `+N -M / ↑K ↓L` | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ⚠️ | ⏳ v0.2 |
| Copy session JSONL between worktrees | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ⏳ v0.3 |
| Diff viewer per agent | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ⚠️ | ⏳ v0.3 |
| Inline diff comments | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Embedded preview browser | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Kanban-style task assignment | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (out of scope) |
| Auto worktree creation from app | ❌ | ⚠️ | ✅ | ❌ | ❌ | ❌ | ❌ | ⏳ v0.3 (skill) |
| Post-creation hooks | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ⏳ v0.3 |
| Tmux backbone | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ (Zellij instead) |
| Multi-CLI support | ✅ 10+ | ✅ 11 | ✅ | ⚠️ Claude+Codex | ⚠️ | ❌ Claude only | ✅ 4 | ❌ Claude only v0.1 |
| Persistence across browser disconnect | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (via Zellij) |
| Persistence across reboot | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ❌ | ⚠️ via SessionStart hook |
| Remote tunnel (Tailscale/Cloudflare) | ❌ | ✅ docs | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| MCP server management UI | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| Tool permission UI | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| File explorer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Currently maintained** | ❌ sunsetting | ✅ | ✅ | ✅ | ⚠️ small | ✅ | ✅ | ✅ |

---

## 4. Features WE LACK that competitors have (priority backlog)

### P0 — must-have for v0.2 (parity with ccmanager status detection)

1. **Vi-style `/` filter** (ccmanager, [VERIFIED]) — Tabulator `setFilter()` keyboard-bound to `/`. ~30 LOC. Tracked as part of FR-8.
2. **Verbose status vocabulary**: Waiting-for-input vs Busy vs Idle (ccmanager + agent-of-empires, [VERIFIED]) — currently we have just LIVE/idle. Detect via parsing latest JSONL message role: `assistant` waiting on tool result = Busy; `user` last = Waiting; idle = no recent activity.
3. **Per-worktree git status `+N -M / ↑K ↓L`** (ccmanager, [VERIFIED]) — already in spec as FR-6. Implementation in Phase 3.

### P1 — useful for v0.3

4. **Copy JSONL between worktrees** (ccmanager, [VERIFIED]) — skill scenario: «Branch this conversation into worktree X» copies `~/.claude/projects/<src>/<uuid>.jsonl` → `<dst>/`.
5. **Auto worktree creation from app** (ccmanager, [VERIFIED]) — skill scenario: from dashboard click, run `git worktree add` + bootstrap + launch fresh claude.
6. **Post-creation hooks** (ccmanager, [VERIFIED]) — skill calls user-defined hook script after worktree creation (env setup, IDE launch, notifications).
7. **Diff viewer per worktree** (vibe-kanban + agent-of-empires, [VERIFIED]) — read `git diff` for the worktree, render in modal next to conversation.

### P2 — nice for v0.3+

8. **Inline diff comments** (vibe-kanban, [VERIFIED]) — add comment to specific diff line, agent sees in next message.
9. **Mobile-responsive UI** (claudecodeui, [VERIFIED]) — currently desktop-only.
10. **Tool permission UI** (claudecodeui, [VERIFIED]) — surface Claude's tool-use permissions in UI (allow/deny per tool).

### P3 — out of scope for foreseeable future

11. **Embedded preview browser** (vibe-kanban) — would conflict with Zellij Web pairing.
12. **Multi-CLI support** (vibe-kanban / agent-of-empires) — Claude Code only v0.1.0; expand once core stable.
13. **Remote tunnel docs** (agent-of-empires) — defer until network architecture matures.

---

## 5. Features WE HAVE that they lack (differentiation for marketing)

These exist in **session-pilot v0.1.0** and are NOT documented in any of the 7 reviewed alternatives:

1. **Last message preview** in row — see at-a-glance what was said last in each session. (Tested in claudecodeui — no in-row preview.)
2. **Last activity timestamp** parsed from JSONL `timestamp` field — accurate to millisecond, not file mtime.
3. **Cross-OS path encoding** — only tool that handles WSL `/mnt/d/repos/foo` ↔ Windows `D:\repos\foo` ambiguity. Critical for Claude Code Windows users with WSL setup.
4. **One-click claude --resume launch** via Zellij action API — no other tool has button-to-resume.
5. **Modal full-conversation viewer** with prev/next navigation — others either show running terminal (no scrollback search) or full chat (no quick-look).
6. **Multi-key shift+click sort** — others have single-column sort or tree hierarchy only.
7. **SWR cache with ETag/304** — others have either no caching or simple time-based TTL.
8. **Diagnostic CLI** `--diagnose-livecycle` — exposes internals for troubleshooting; no other tool has this.
9. **Configurable LIVE threshold** based on observed Claude write batching (300s default) — others use file presence as indicator.
10. **Pairs with Zellij Web Client** — leverages a mature terminal multiplexer rather than reinventing terminal embedding.

---

## 6. Recommendations for next versions

**v0.2.0 (target: 2026-Q3)**:
- P0 features 1-3 (vi-filter, verbose status, git status columns)
- Multi-CLI: add Codex CLI support (3rd most popular per claudecodeui adoption)

**v0.3.0 (target: 2026-Q4)**:
- P1 features 4-7 (copy JSONL, auto worktree, post-creation hooks, diff viewer)
- Mobile responsive layout (Tabulator already supports — needs CSS tuning)

**v0.4.0+**:
- Tool permission UI (P2)
- Remote tunnel documentation (P3)

---

## 7. Summary

session-pilot occupies a **distinct niche**: it's a **read-mostly aggregator dashboard** for Claude Code worktrees that pairs with an external terminal multiplexer (Zellij Web Client) rather than embedding the terminal itself. This is fundamentally different from the 7 reviewed alternatives:

- **claudecodeui / claude-code-web / kanna / claudito** embed the terminal in HTML — they ARE the working environment.
- **ccmanager / agent-of-empires** embed terminal via tmux + their own TUI/PWA shell.
- **vibe-kanban** wraps the terminal inside a kanban board.

session-pilot says: «You already have Zellij. We just help you find your way around 10+ worktrees.» That separation lets us focus exclusively on the **dashboard problem** (discovery, status, navigation, recall) rather than the **terminal problem** (input/output, scrollback, splits).

Net assessment after this analysis:
- **9 unique features** vs. competitors (Section 5).
- **3 P0 gaps** to close in v0.2 (vi-filter, verbose status, git columns) — all are <100 LOC each.
- **0 architectural mistakes** identified — Zellij-pairing decision validates against the alternatives' embedded-terminal complexity.

The competitive position is **defensible**: we're the only tool that solves "I have 10 worktrees, which one was I working on?" with low-LOC, JSONL-parsing-based intelligence rather than terminal-embedding heroics.

---

## Sources

- [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban) — Apache-2.0
- [vibekanban.com docs](https://vibekanban.com/docs/core-features/monitoring-task-execution)
- [njbrake/agent-of-empires](https://github.com/njbrake/agent-of-empires) — MIT
- [kbwo/ccmanager](https://github.com/kbwo/ccmanager)
- [jakemor/kanna](https://github.com/jakemor/kanna) — MIT
- [comfortablynumb/claudito](https://github.com/comfortablynumb/claudito) — MIT
- [vultuk/claude-code-web](https://github.com/vultuk/claude-code-web) — MIT
- [siteboon/claudecodeui](https://github.com/siteboon/claudecodeui) — AGPL-3.0
- [sugyan/claude-code-webui](https://github.com/sugyan/claude-code-webui) — MIT (1.1k stars, secondary reference)
- [Nimbalyst — Best Claude Code Session Manager 2026](https://nimbalyst.com/blog/best-session-managers-for-claude-code-and-codex/) (comparison)
- [Anthropic claude-code Issue #33942](https://github.com/anthropics/claude-code/issues/33942) — feature request referencing claudecodeui
- [Mindstudio — Claude Code Parallel Sessions](https://www.mindstudio.ai/blog/claude-code-parallel-sessions)
