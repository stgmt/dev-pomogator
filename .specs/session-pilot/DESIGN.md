# Design

## Реализуемые требования

См. полный список в [FR.md](FR.md). Этот файл документирует **архитектурные решения** и обоснование выбора альтернатив.

## Architecture

session-pilot — **read-mostly aggregator dashboard**, отдельный от терминала. Cross-platform native — один Python server (stdlib only), platform-dispatched terminal spawn:

```
┌──────────────────────────────────────────────────┐
│  Browser (Chrome / Edge / Firefox / Safari)      │
│  Tabulator UI + localStorage SWR cache           │
└────────┬─────────────────────────────────────────┘
         │ HTTP :8083
         ▼
┌─────────────────────────────────────────┐
│  session-pilot Python server (any OS)   │   POST /api/launch
│  stdlib only — no pip deps              ├──────────────┐
│  terminal_launcher.py: sys.platform     │              │
│   dispatch                              │              │
└────────┬────────────────────────────────┘              │
         │ scan ~/.claude/projects                       │
         ▼                                               │
┌──────────────────────────────────────┐                 │
│  Windows: %USERPROFILE%\.claude\…\   │                 │
│           D--repos-foo\<uuid>.jsonl  │                 │
│  Linux:   ~/.claude/projects/        │                 │
│           -home-user-repos-foo/…     │                 │
│  macOS:   ~/.claude/projects/        │                 │
│           -Users-stigm-repos-foo/…   │                 │
│  + git worktree list per repo        │                 │
└──────────────────────────────────────┘                 │
                                                         ▼
                              ┌──────────────────────────────────────┐
                              │  Platform-dispatched spawn (FR-4):   │
                              │  Windows: wt.exe → pwsh/cmd          │
                              │  Linux:   gnome/konsole/alacritty/   │
                              │           kitty/wezterm/xterm/...    │
                              │  Linux*:  setsid nohup (headless)    │
                              │  macOS:   osascript Terminal/iTerm2  │
                              │  Override: $SP_TERMINAL_CMD          │
                              │   → spawns `claude --resume <uuid>`  │
                              │     in worktree cwd, detached        │
                              └──────────────────────────────────────┘
```

Single-port dashboard (8083, default `127.0.0.1` bind). Каждый ▶ Resume / ✨ Fresh — независимое native окно (или background detached на headless Linux), detached от Python сервера. v0.4 — no Zellij, no tmux, no WSL bridge — каждая ОС использует её native terminal stack.

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

### KD-3: Cross-platform native terminal spawn chain (v0.4)

**Decision (v0.4 de-pivot from v0.3 Windows-only KD-3)**: spawn detached native terminal per-OS — никаких universal layers (нет Zellij, нет tmux dependency, нет WSL bridge). `terminal_launcher.py` ветвится через `sys.platform`:

- **Windows** (`win32`): `wt.exe -d <cwd> -- pwsh.exe -NoExit -Command "<claude-cmd>"` → fallback `wt.exe ... -- powershell.exe -NoExit ...` (PS 5.1) → fallback `cmd.exe /c start "" pwsh.exe -NoExit -Command "..."` (no-WT). Env override `$SP_TERMINAL_CMD` (single var; renamed from v0.3 `$env:SP_TERMINAL_CMD` to platform-neutral `SP_TERMINAL_CMD` accessed via `os.environ`).
- **Linux GUI** (`linux` + `$DISPLAY` or `$WAYLAND_DISPLAY`): probe chain `$TERMINAL` → `gnome-terminal` → `konsole` → `alacritty` → `kitty` → `wezterm` → `xfce4-terminal` → `tilix` → `terminator` → `xterm`. Каждый terminal имеет свой синтаксис передачи cwd+command (см. FR-4 table). Detection через `shutil.which`. First hit wins.
- **Linux headless** (`linux` + DISPLAY+WAYLAND both empty OR all GUI terminals absent): `subprocess.Popen(["setsid", "nohup", "bash", "-c", f"cd {cwd} && claude --resume {uuid}"], stdin=DEVNULL, stdout=DEVNULL, stderr=DEVNULL, start_new_session=True)` — true daemon detach. PID captured via `.pid`.
- **macOS** (`darwin`): iTerm2 detection через `osascript -e 'tell app "System Events" to (name of processes) contains "iTerm2"'` (1-call check, <50ms) → если running, `osascript -e 'tell app "iTerm2" to create window with default profile command "claude ..."'`. Else `osascript -e 'tell app "Terminal" to do script "cd <cwd> && claude ..."'`.
- **All platforms**: `$SP_TERMINAL_CMD` env var template (placeholders `{cwd}` + `{cmd}`) — decomposed to argv via `shlex.split` (POSIX) или native list-form (Windows). Never invoked through `shell=True`. [VERIFIED 2026-05-12 research-workflow session: env var naming convention `SP_` prefix matches v0.3 convention `WT_DASHBOARD_BIND → SP_DASHBOARD_BIND` rename for platform-neutrality; template-substitution + argv-decomposition pattern matches research-workflow Linux/macOS spawn analysis. `WAYLAND_DISPLAY` is standard Wayland session env var per [Wayland docs](https://wayland.freedesktop.org/) — `$DISPLAY` is X11 standard. `XDG_STATE_HOME` is XDG Base Directory Specification per [freedesktop.org spec](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html) §3 — default `$HOME/.local/state`.]

**Why per-OS native instead of universal layer (Zellij/tmux)**:
- Zellij (v0.2) — fragile injection, `action write-chars` races, PTY parking workarounds. v0.3 dropped это правильно.
- tmux — Linux/macOS only, no Windows native. Forcing user install adds friction.
- Native terminals (`wt`/`gnome-terminal`/`Terminal.app`) preinstalled, no extra deps.

**Why headless fallback (Linux)**: CI/SSH/server use case — agent работает в репо без X11/Wayland (e.g. cloud dev box, GitHub Codespaces без code-server). `setsid nohup` гарантирует процесс переживёт parent server restart.

**Why no command injection in running terminal**: ни одна из 3 ОС не имеет robust IPC `action write-chars` equivalent. SendKeys/AppleScript-keystroke hacks требуют window focus + хрупкие. Modeled instead как «idempotent spawn»: каждый клик [▶ Resume] → новое окно с `claude --resume <uuid>`. Claude подхватывает JSONL state. User закрывает старые вручную.

**Trade-off**: multiple clicks → multiple windows. 5-second idempotency lock per `(worktree_path, uuid)` смягчает — повторный клик в течение 5s возвращает `{method: "cached"}` без spawn.

[VERIFIED 2026-05-12 cross-platform research session]: Windows spawn pattern `Start-Process pwsh -PassThru -WorkingDirectory` (Azure SDK convention) — но Python `subprocess.Popen([wt, ...])` эквивалентен с прямой PID capture. Linux chain validated через ≥3 independent angles (gnome-terminal docs / konsole man / Alacritty release notes). macOS osascript validated через Apple Developer docs Terminal AppleScript dictionary.

**Removed in v0.3 (still removed in v0.4)**: KDL layout files (Zellij-specific), `_PTY_MASTERS` parking, `zellij_util.py`. v0.4 adds `terminal_launcher.py` per-OS handlers but does NOT resurrect Zellij.

### KD-4: SWR cache — server ETag + client localStorage with mtime versioning

**Inspired by**: Vercel's [SWR](https://swr.vercel.app/) + HTTP ETag/If-None-Match.

**Implementation**:
- Server: ETag = `W/"<int(max_jsonl_mtime)>"` per /api/claude path. If-None-Match match → 304 + 0 bytes.
- Client: `localStorage["session_pilot_v1_<id>"] = {mtime, etag, data}`. Reload: instant render → fetch /api/index → compare per-row mtime → skip unchanged rows.

**Result**: 38/45 rows skip fetch on warm reload. 7 stale rows hit 304 path (5ms). Total reload <300ms.

### KD-5: Cross-platform Claude path encoding (v0.4)

**Decision (v0.4 de-pivot)**: per-OS canonical encoding rule + defensive cross-platform fallbacks. Encoder reads `sys.platform`, computes canonical primary (= production lookup path), then appends fallbacks для shared-worktree сценариев (WSL + Windows host share `/mnt/d/...` ↔ `D:\...`).

| Source path | Canonical (primary) | Defensive fallbacks emitted |
|-------------|---------------------|------------------------------|
| `D:\repos\foo` (Windows-native) | `D--repos-foo` | (empty; Windows path не имеет POSIX-side ambiguity) |
| `/home/user/repos/foo` (Linux-native) | `-home-user-repos-foo` | (empty) |
| `/Users/stigm/repos/foo` (macOS-native) | `-Users-stigm-repos-foo` | (empty) |
| `/mnt/d/repos/foo` (WSL view of D-drive) | `-mnt-d-repos-foo` | `D--repos-foo` (Windows-side view) |
| `\\wsl.localhost\Ubuntu\home\user\foo` (Windows view of WSL filesystem) | `--wsl.localhost-Ubuntu-home-user-foo` | `-home-user-foo` (WSL-side view) |
| `C:\Users\stigm\.cursor\worktrees\bar` (Cursor IDE Windows) | `C--Users-stigm--cursor-worktrees-bar` | (empty — dot-prefixed дирs preserve dots; double-hyphen перед `.cursor` due to leading dot) |

Encoder API: `encode_path_for_claude(path: str) -> list[str]` — returns list where `result[0]` = canonical, `result[1:]` = defensive fallbacks. Scanner iterates list, first hit determines display row. Если ни один variant не найден, `--diagnose-livecycle <path>` показывает все попытки.

**Why cross-platform encoder есть, не платформенно-конкретный**: shared-worktree scenarios real — user работает с Windows-native cwd на хосте но иногда заходит в WSL Bash в тот же git worktree через `/mnt/d/`. Claude Code пишет JSONLs в одну из двух dirs (зависит от с какой стороны был запущен claude). Encoder generates BOTH variants → scanner находит независимо от стороны запуска.

[VERIFIED]: `D--repos-foo` encoding empirically observed in this session — Claude Code's tool-result file path is `C:\Users\stigm\.claude\projects\D--repos-dev-pomogator\...` from cwd `D:\repos\dev-pomogator`. Linux/macOS POSIX rule [ASSUMED] from Claude Code общая convention "replace separators with `-`"; should be validated by running `claude` in Linux dir и checking `~/.claude/projects/` structure during implementation.

**Removed in v0.3 (now re-added in v0.4)**: WSL variants `/mnt/X/...` → `-mnt-X-...`. Они снова в production-paths потому что v0.4 поддерживает Linux/WSL.

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

### KD-11: On-demand bootstrap skill (not auto-fire post-checkout, not symlink) (v0.4 addition)

**Decision**: orphan-worktree recovery — **standalone Claude Code skill** `session-pilot-bootstrap` (slash `/sp-bootstrap`) которым пользователь explicit вызывает когда видит `ERR_MODULE_NOT_FOUND` в hook output. **НЕ auto-fire** на `git worktree add`, **НЕ git post-checkout hook**, **НЕ symlink из main worktree**.

**Why not auto-fire on `git worktree add` / post-checkout**:
- Adds ~50s latency на каждый `worktree add` (npm install + build + installer) даже если worktree throwaway или юзер не хочет hooks.
- `git worktree add` часто запускается из scripts / automation — silent slow side-effect не нужен.
- Юзер часто **уже знает** что хочет throwaway worktree (быстрый test branch) — bootstrap его раздражает.

**Why not git post-checkout hook**:
- Per-worktree `.git` is dir, не файл — `core.hookspath` shared across worktrees. Невозможно «only for new worktrees, not main».
- Hook fires также при `git checkout <branch>` в существующем worktree — false positives.

**Why not symlink/junction `.dev-pomogator/`**:
- Branches may have different extension versions; tools из main могут не работать на feature branch.
- Windows junction quirks across drives (`D:\` vs `C:\`).
- Невозможно для read-write tools (e.g. `.dev-pomogator/.docker-status/`) — race conditions при parallel sessions.

**Why on-demand skill is correct**:
- User-controlled timing — bootstrap только когда нужно.
- Idempotent re-run safe (если случайно вызван дважды).
- Skill — cross-platform по design (markdown + Bash + AskUserQuestion), zero OS-specific code.
- Discoverable: trigger phrases `«забутстрапь worktree»` / `«fix hooks here»` — естественный language для проблемы.
- Synergy с session-pilot family: dashboard (FR-1..14) закрывает «no session for existing worktree», bootstrap-skill (FR-22) закрывает «no tools for orphan worktree». Два failure modes — два skill'а в одной family.

**Skill architecture** (live at `.claude/skills/session-pilot-bootstrap/SKILL.md`):
```yaml
---
name: session-pilot-bootstrap
description: |
  Bootstrap orphan git worktree by running dev-pomogator installer
  in cwd. Use when stop hooks fail with ERR_MODULE_NOT_FOUND because
  `.dev-pomogator/tools/*.ts` are gitignored and missing in this worktree.

  Triggers (RU): "забутстрапь worktree", "поставь dev-pomogator
  в этот worktree", "почини hooks в worktree", "инициализируй worktree".

  Triggers (EN): "bootstrap worktree", "install dev-pomogator here",
  "fix hooks in this worktree", "initialize orphan worktree".

  Skip when: cwd is main repo worktree (already installed via dev workflow),
  cwd not in git repo, user declined.
allowed-tools:
  - Bash               # git, npm, node commands
  - AskUserQuestion    # {Bootstrap, Skip npm install, Cancel}
  - Read               # verify sentinel file presence
---
```

Body: 6-step workflow per FR-22 — preflight → detect orphan → AskUserQuestion → run installer chain → verify sentinel → exit.

**Trade-off**: skill needs to be **installed** to be invokable. Bootstrap-skill itself doesn't help if dev-pomogator package not yet known to Claude Code session. Mitigation: skill is part of `dev-pomogator` package — once user runs `dev-pomogator install` once anywhere (main worktree), skill is registered globally for that session's user. Subsequent worktree-creation events can invoke `/sp-bootstrap` even before that worktree's tools are installed.

[ASSUMED]: skill discovery mechanism (Claude Code reads `~/.claude/skills/` + installed extension skills) propagates to all spawned sessions including those in orphan worktrees. Not directly verified — needs implementation test confirming `/sp-bootstrap` available even в session spawned внутри orphan worktree без prior `.dev-pomogator/tools/`.

### KD-10: Per-platform module dispatch architecture (v0.4 addition)

**Decision**: keep cross-platform branching surgically localized — only **2 modules** know OS, rest of codebase is OS-agnostic:

```
extensions/session-pilot/tools/session-pilot/
├── server.py             ← OS-agnostic; HTTP routing only
├── indexer.py            ← OS-agnostic; reads ~/.claude/projects/* (path is platform-resolved by Python)
├── handlers.py           ← OS-agnostic; calls terminal_launcher.launch(...)
├── frontend.py           ← OS-agnostic; serves static HTML
├── claude_paths.py       ← **KNOWS OS** for canonical encoder rule (KD-5)
├── terminal_launcher.py  ← **KNOWS OS** for spawn dispatch (KD-3)
├── diagnose.py           ← OS-agnostic CLI wrapper around claude_paths + indexer
└── ui/                   ← OS-agnostic web assets
```

Two **isolation points** for OS-specific code = surface area for bugs is small + easy to test (parametrize `sys.platform` via monkeypatch in `tests/test_terminal_launcher.py` and `tests/test_encode_path.py`).

**Why not duck-type per-OS via separate command subclasses** (`WindowsLauncher`, `LinuxLauncher`, `DarwinLauncher`): adds complexity without benefit at our scale (~200 LOC total in launcher). Flat `if/elif` через `sys.platform` плюс private `_launch_<os>` функции — simpler, faster grep, no inheritance ceremony.

**Why not use existing cross-platform terminal libraries** (e.g. `python-terminado`, `pyterm`): all assume PTY allocation in-process (heavy, kills detach semantics). We want fire-and-forget native window, so `subprocess.Popen` + per-OS argv list is sufficient.

[ASSUMED]: module split не verified through implementation yet — should be confirmed when v0.4 PR lands. Risk: если cross-cutting OS-conditional logic утечёт за пределы `claude_paths.py` + `terminal_launcher.py`, isolation broken.

### KD-9: SessionStart hook for autostart (cross-platform, not Task Scheduler / systemd / launchd)

**Why not platform-specific service manager** (Windows Task Scheduler / systemd user units / macOS launchd):
- All three требуют per-user setup ceremony (admin для systemd system unit, plist syntax для launchd, GUI или schtasks.exe для Task Scheduler).
- Three different installer flows multiply maintenance burden.
- Not obvious where to look когда сервис не запускается — каждая ОС имеет свой logs path.
- Doesn't survive Claude Code update (paths могут смениться).

**Why SessionStart hook**: every Claude Code launch triggers it on every OS. Single mechanism (Claude Code settings.json `hooks.SessionStart`) — config-as-code, version-controlled, OS-agnostic at registration level. Per-OS only **command** differs:

- **Windows**: `pwsh.exe -NoProfile -ExecutionPolicy Bypass -File start-server.ps1` → fallback `powershell.exe -NoProfile -File start-server.ps1`. PID lock в `$env:LOCALAPPDATA\session-pilot\server.pid` + `Get-Process -Id $pid -ErrorAction SilentlyContinue`.
- **Linux/macOS**: `bash start-server.sh`. PID lock в `${XDG_STATE_HOME:-$HOME/.local/state}/session-pilot/server.pid` (XDG Base Directory spec compliant) + `kill -0 $pid 2>/dev/null` liveness check.

Both scripts share the **4-step idempotency contract** (см. FR-13):
1. Read PID from state file.
2. Если alive → "already running" → exit 0.
3. Если stale/missing → spawn `python server.py` detached, write new PID.
4. Poll `http://127.0.0.1:8083/api/health` until 200 (timeout 2s) → exit 0.

Installer (FR-15) registers the right command per detected platform. `extension.json` hook entry uses Claude Code's hook command format which resolves through shell — installer chooses script extension based on host OS.

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
