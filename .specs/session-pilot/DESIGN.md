# Design

## Реализуемые требования

См. полный список в [FR.md](FR.md). Этот файл документирует **архитектурные решения** и обоснование выбора альтернатив.

## Architecture

session-pilot — **read-mostly aggregator dashboard**, отдельный от терминала:

```
┌──────────────────────────────────────────────────┐
│  Browser (Edge / Chrome) — Tabulator UI          │
│   localStorage SWR cache                         │
└────────┬───────────────────────┬─────────────────┘
         │ HTTP                   │
         ▼                        ▼
┌─────────────────┐       ┌─────────────────────┐
│  :8083          │       │  :8082 Zellij Web   │
│  session-pilot  │ exec  │  Client             │
│  Python server  ├──────▶│  (terminal access)  │
└────────┬────────┘       └─────────────────────┘
         │ scan
         ▼
┌──────────────────────────────────────────────────┐
│  ~/.claude/projects/<encoded>/<uuid>.jsonl       │
│  /mnt/c/Users/.../  (Windows mount)              │
│  + git worktree list per repo                    │
└──────────────────────────────────────────────────┘
```

Two-port pairing: dashboard (8083) — навигатор, Zellij Web Client (8082) — рабочая среда. Мы не reinvent terminal embedding.

---

## Key decisions

### KD-1: Move (not rewrite) prototype to plugin

**Rationale**: Прототип `worktree-dashboard.py` (700 LOC) был iteratively validated пользователем. Rewrite в 11 модулей с новым API surface — high regression risk.

**Trade-off**: Принимаем temporary tech debt (single file harder to test) в обмен на velocity (Phase 1 за 1ч вместо 6ч refactor) и lower regression risk.

**Alternatives considered**:
- ❌ Rewrite в 11 модулей: high regression risk
- ❌ Stay в `.dev-pomogator/bin/`: not version-tracked
- ✅ MOVE → version-track → refactor opportunistically

### KD-2: Pagination — Alt A (top-20 priority) for v0.1.0; Alt B planned for v0.2

| Alt | Description | Pros | Cons | First-paint |
|---|---|---|---|---|
| **A** ✅ chosen | Top-20 priority queue + rest in background | Predictable; simplest code | Wasted I/O on offscreen rows | ~1s for 20 / ~4s full |
| **B** v0.2 | LIVE-only first paint + IntersectionObserver lazy | Bounded I/O | Scroll triggers fetches → potential jank | ~500ms initial / on-demand |
| **C** v0.3+ | Pre-built SQLite index daemon | Server response near-zero | Extra moving part; index lag | ~100ms server / 500ms total |

**Why Alt A для v0.1.0**: Lowest LOC, no new architectural component, sufficient for `<50` worktrees. User setup = 45 worktrees (in tolerance).

**Trigger to switch to Alt B**: >100 worktrees OR observable jank on first paint.
**Trigger to consider Alt C**: `/api/index` exceeds 500ms warm (current ~150ms).

### KD-3: Zellij command injection — `action write-chars` for existing, `-n` flag for new

**Critical Zellij CLI gotcha** (discovered Phase 3): `zellij -s NAME -l FILE` interprets as «add as new tab to existing session NAME» — fails with «Session NAME not found» if session doesn't exist. Must use `-n FILE -s NAME` (`--new-session-with-layout`) which always creates new.

For existing sessions: `zellij --session NAME action focus-pane-id terminal_1 && action write-chars "<cmd>\n"`. Focus-first prevents race с previously-shifted focus.

**Trade-off**: 5-second idempotency lock prevents double-inject on rapid clicks. User loses ability to inject same command twice within 5s — acceptable.

### KD-4: SWR cache — server ETag + client localStorage with mtime versioning

**Inspired by**: Vercel's [SWR](https://swr.vercel.app/) + HTTP ETag/If-None-Match.

**Implementation**:
- Server: ETag = `W/"<int(max_jsonl_mtime)>"` per /api/claude path. If-None-Match match → 304 + 0 bytes.
- Client: `localStorage["session_pilot_v1_<id>"] = {mtime, etag, data}`. Reload: instant render → fetch /api/index → compare per-row mtime → skip unchanged rows.

**Result**: 38/45 rows skip fetch on warm reload. 7 stale rows hit 304 path (5ms). Total reload <300ms.

### KD-5: Cross-OS path encoding — multiple variants per worktree

**Problem**: Claude Code on Windows writes JSONL to `D--repos-foo` even когда CWD = `/mnt/d/repos/foo`. WSL Claude writes to `-mnt-d-repos-foo`. Same worktree, different encoded directories.

**Solution**: `encode_path_for_claude(p)` returns ALL plausible variants. Dashboard scans both `~/.claude/projects` (WSL) и `/mnt/c/Users/.../  .claude/projects` (Windows mount).

**Mitigation for unforeseen variants**: `--diagnose-livecycle <path>` CLI dumps actual scan results.

### KD-6: 300s LIVE threshold (not 90s)

**Empirical observation**: Claude Code batches JSONL writes every 2-3 минуты during active typing. 90s threshold misses real activity (B-1 incident: lm-saas idle while user typing, youngest JSONL 146s old).

**Default 300s** balances freshness signal against false negatives. Override via `LIVE_THRESHOLD_SEC` env var.

### KD-7: Vendored libs (Tabulator + marked.js), no external CDN

**Why not CDN**: privacy (User-Agent leakage), offline support, no ToS lock-in.

**Why Tabulator**: built-in shift+click multi-key sort (zero custom code), virtual DOM, frozen columns, setFilter for vi-style `/`.

### KD-8: Native `<dialog>` element для modal

**Why**: ESC-close, focus management, accessibility, backdrop-click-close — all built in. Browser support since March 2022.

### KD-9: SessionStart hook for autostart (not systemd)

**Why not systemd**: WSL2 default disables it; needs separate setup per OS.

**Why SessionStart hook**: every Claude Code launch triggers it; idempotent PID-lock check; works on Windows native + WSL + Linux native identically.

---

## Pagination strategy decision (Phase 4 deliverable)

After evaluation on user's 45-worktree setup:

| Metric | Alt A (current v0.1.0) | Alt B (v0.2 candidate) | Alt C (v0.3 candidate) |
|---|---|---|---|
| Cold first paint top-20 | ~1.0s | ~0.5s | ~0.5s |
| Cold full enrichment | ~4s (4 workers) | on-demand | <1s SQL |
| Warm reload (SWR hit) | <300ms | <300ms | <300ms |
| LOC delta vs v0.1.0 | 0 | +30 (IntersectionObserver) | +400 (daemon+SQLite) |
| Reliability risk | low | medium (scroll race) | high (daemon health, index lag) |
| Recommended for | <50 worktrees | 50–200 | >200 |

**Decision**: ship v0.1.0 с Alt A. Track Alt B as next iteration. Alt C deferred unless adoption justifies.

---

## API contract summary

| Endpoint | Method | Cache | Latency target |
|---|---|---|---|
| `/` | GET | none | <50ms |
| `/api/health` | GET | none | <5ms |
| `/api/index` | GET | server 5s | <150ms warm |
| `/api/claude?path=` | GET | server 8s, ETag | <300ms cold / 5ms 304 |
| `/api/launch` | POST | 5s idempotency lock | <2s (zellij spawn) |
| `/api/open-vscode` | POST | none | instant |
| `/api/message?path=&session=&index=` | GET | none yet | <50ms |
| `/api/git-status?path=` | GET | server 10s | <100ms |

---

## Out-of-scope (rationale)

- **Multi-CLI** (Codex/Gemini): scope creep v0.1.0; defer v0.2 when core stable.
- **Diff viewer per agent**: orthogonal to dashboard mission; defer v0.3.
- **Inline diff comments**: needs bidirectional integration with running session.
- **Mobile-responsive PWA**: usage pattern unclear; v0.4 if demand.
- **Remote tunnel docs**: until network architecture matures.
- **Tool permission UI**: ToS questions about programmatic permission grants.
