# Design

## Реализуемые требования

См. полный список в [FR.md](FR.md). Этот файл документирует **архитектурные решения** и обоснование выбора альтернатив.

## Architecture

session-pilot — **read-mostly aggregator dashboard**, отдельный от терминала:

```
┌──────────────────────────────────────────────────┐
│  Browser (Edge / Chrome) — Tabulator UI          │
│   localStorage SWR cache                         │
└────────┬─────────────────────────────────────────┘
         │ HTTP
         ▼
┌──────────────────────┐
│  :8083               │   POST /api/launch
│  session-pilot       ├──────────────────────────┐
│  Python server (Win) │   Popen detached         │
└────────┬─────────────┘                          ▼
         │ scan                          ┌────────────────────┐
         ▼                               │  Windows Terminal  │
┌──────────────────────────────────────┐ │  wt.exe -d <cwd>   │
│  %USERPROFILE%\.claude\projects\     │ │  -- pwsh -NoExit   │
│  D--repos-foo\<uuid>.jsonl           │ │  claude --resume   │
│  + git worktree list per repo        │ │  <uuid>            │
└──────────────────────────────────────┘ └────────────────────┘
```

Single-port dashboard (8083). Каждый ▶ Resume / ✨ Fresh — отдельное Windows Terminal окно, detached. v0.3+ — no Zellij, no WSL.

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

### KD-3: Windows Terminal spawn chain — wt.exe → cmd.exe → env override

**Decision (v0.3 pivot from KD-3 v0.2)**: spawn detached `wt.exe -d <cwd> -- pwsh.exe -NoExit -Command "<claude-cmd>"`. Fallback chain если `wt` нет на PATH: `cmd.exe /c start "" pwsh.exe -NoExit -Command "..."`. Env override `$env:SP_TERMINAL_CMD` для пользовательских терминалов (Alacritty/WezTerm/kitty).

[UNVERIFIED: `$env:SP_TERMINAL_CMD` template format (placeholders `{cwd}` и `{cmd}`) — design choice, не из external sources. To verify когда implementation lands: integration test что `$env:SP_TERMINAL_CMD = "alacritty --working-directory {cwd} -e pwsh -NoExit -c '{cmd}'"` действительно открывает Alacritty с правильным cwd + command.]

**Why `wt.exe` приоритет**: preinstalled на Windows 11; tab support; современный rendering. На Win 10 1809+ — устанавливается из Store или присутствует в Win 10 21H2+ updates. Fallback `cmd.exe /c start` гарантирует запуск даже без Windows Terminal.

**Why no command injection in running terminal**: Windows native не имеет zellij-style `action write-chars`. Альтернативы (SendKeys через WinAPI / OS automation) — hacky, требуют focus on target window. Modeled instead на «idempotent spawn»: каждый клик [▶ Resume] → новое окно с `claude --resume <uuid>`. Claude сам подхватывает JSONL state и продолжает разговор. User закрывает старое окно вручную если нужно.

**Trade-off**: каждый Resume плодит новое окно (если пользователь много раз кликает — много окон). 5-second idempotency lock per `(worktree_path, uuid)` смягчает: повторный клик в течение 5s возвращает `{method: "cached"}` без spawn.

**Removed in v0.3**: KDL layout files (Zellij-specific), `_PTY_MASTERS` parking (race-fix больше не нужен — нет PTY allocation в новой архитектуре), `zellij_util.py` целиком.

### KD-4: SWR cache — server ETag + client localStorage with mtime versioning

**Inspired by**: Vercel's [SWR](https://swr.vercel.app/) + HTTP ETag/If-None-Match.

**Implementation**:
- Server: ETag = `W/"<int(max_jsonl_mtime)>"` per /api/claude path. If-None-Match match → 304 + 0 bytes.
- Client: `localStorage["session_pilot_v1_<id>"] = {mtime, etag, data}`. Reload: instant render → fetch /api/index → compare per-row mtime → skip unchanged rows.

**Result**: 38/45 rows skip fetch on warm reload. 7 stale rows hit 304 path (5ms). Total reload <300ms.

### KD-5: Windows-native path encoding

**v0.3 pivot from KD-5 v0.2**: Windows-native paths only. `encode_path_for_claude("D:\\repos\\foo")` returns `D--repos-foo` (canonical Claude Code на Windows). Defensive fallbacks (`D-repos-foo`, char-stripped variants) для edge cases с символами вне `[A-Za-z0-9_-]`.

**Removed**: WSL variants (`-mnt-d-repos-foo`, `mnt-d-repos-foo`) — out-of-scope для v0.3 (Windows-only target). Encoder function код их всё ещё поддерживает defensively (если пользователь runs v0.3 на WSL, оно работает), но production-paths их не используют.

**Mitigation for unforeseen variants**: `--diagnose-livecycle <path>` CLI dumps actual scan results.

### KD-6: 300s LIVE threshold (not 90s)

**Empirical observation**: Claude Code batches JSONL writes every 2-3 минуты during active typing. 90s threshold misses real activity (B-1 incident: lm-saas idle while user typing, youngest JSONL 146s old).

**Default 300s** balances freshness signal against false negatives. Override via `LIVE_THRESHOLD_SEC` env var.

[VERIFIED: empirically measured 2026-04-30 against `lm-saas` worktree — JSONL `mtime` deltas during active session ranged 75-205s; chosen `300s = max_observed_delta * ~1.5` headroom. Reproducible via `extensions/session-pilot/tools/session-pilot/server.py:LIVE_THRESHOLD_SEC` env override + `--diagnose-livecycle` CLI. See RESEARCH.md «Claude write-batching empirical observation» (B-1 incident).]

### KD-7: Vendored libs (Tabulator + marked.js), no external CDN

**Why not CDN**: privacy (User-Agent leakage), offline support, no ToS lock-in.

**Why Tabulator**: built-in shift+click multi-key sort (zero custom code), virtual DOM, frozen columns, setFilter for vi-style `/`.

### KD-8: Native `<dialog>` element для modal

**Why**: ESC-close, focus management, accessibility, backdrop-click-close — all built in. Browser support since March 2022.

### KD-9: SessionStart hook for autostart (not Windows Task Scheduler)

**Why not Task Scheduler**: requires manual setup; per-user registration; admin rights в некоторых конфигурациях; не очевидно где смотреть если не запускается.

**Why SessionStart hook**: every Claude Code launch triggers it; idempotent PID-lock check через `$env:LOCALAPPDATA\session-pilot\server.pid` + `Get-Process -Id`. Script: `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File start-server.ps1`. Fallback на `powershell.exe` если PS7 не установлен.

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
| `/api/launch` | POST | 5s idempotency lock per (wt_path, uuid) | <500ms (wt.exe spawn) |
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
