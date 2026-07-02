# session-pilot durability audit — "works here, dead on another machine"

**Date:** 2026-07-02 · **Branch:** main · **Spec:** `.specs/session-pilot/` (21 docs — FR/AC/DESIGN/POSTMORTEM-test-discipline/…)

> **Verdict:** session-pilot has **four different ways to come alive, and all four are broken, un-distributed, or untested.** There is no single, self-healing, OS-agnostic "make sure the server is up" entry point. The autostart wiring lives only in a per-machine, non-distributed file, so it never travels to another machine — and the tests that "cover" it are a dead CI workflow + GUI-gated skips + an "E2E" test that *assumes the server is already running*. It is not running even on this machine right now.

---

## 1. Live state on THIS machine (the evidence that frames everything)

| Probe | Result |
|---|---|
| `curl http://127.0.0.1:8083/api/health` | **NO SERVER** (connection refused) |
| `%LOCALAPPDATA%\session-pilot\` state dir | **does not exist** → server was *never spawned here* |
| `server.log` / `server.log.err` | **absent** (nothing to read — because nothing ever started) |
| Autostart hook in `.claude-plugin/hooks.json` (the channel that travels) | **not present** |
| Autostart hook in `.claude/settings.local.json` (this machine) | **not present** |

So durability is broken **universally**, not machine-B-specific. This kills any "it's a per-machine config quirk" theory and points straight at: **the wiring rots silently and nothing re-creates it.**

### Live confirmation (ran the Windows starter by hand, 2026-07-02 19:33)

To separate "code broken" from "wiring broken", I invoked `start-server.ps1` **directly** on this machine:

| Action | Result |
|---|---|
| `& start-server.ps1` | exit 0 — spawned python, wrote `server.pid` + `server.log` |
| `GET /api/health` | **200** `{"status":"ok","version":"0.6.1","platform":"win32"}` |
| `GET /api/index` | **200 — 57 rows** (full worktree scan works) |
| `server.log` contents | only the server's own stdout (`Worktree dashboard listening…`, 55 bytes) — **no launcher-level record** of which python was picked / spawn PID / health outcome |

**Conclusion: the server + the Windows starter are 100% healthy.** The instant *anything* calls the starter, the dashboard works. The entire "not durable / dead on another machine" is a **wiring + distribution problem, not a code problem** — nothing calls the starter automatically, durably, cross-OS, and the launcher leaves no breadcrumb when it isn't called. (The dashboard is now running on this machine as a side effect of the check.)

---

## 2. The four delivery paths — each broken in a different way

"Doesn't work on another machine" is relative to *how you start it*. There are four supposed entry points. None survives a fresh machine.

| # | Delivery path | How it should start the server | Actual status |
|---|---|---|---|
| **1** | **SessionStart autostart** | `install.ps1` writes a hook into `.claude/settings.local.json` → `start-server.ps1` spawns `python server.py` | Hook is registered **nowhere that travels** — not in the plugin's `.claude-plugin/hooks.json`, not in local settings. Requires a **manual, per-machine `install.ps1` run**. Windows-only. Not wired even here. |
| **2** | **Desktop shortcut** | `create-launcher.ps1` → `launch.ps1` → `Ensure-SpServer` → `start-server.ps1` | Requires a **manual per-machine** `create-launcher.ps1`/`install.ps1`. Path is baked into the `.lnk` at create time (the exact **SP051 fragility class** — see §4). Windows-only. |
| **3** | **The skill** ("проверь dashboard работает" / "restart session-pilot") | `SKILL.md` Scenario 1 §2: `bash tools/session-pilot/start-server.sh` | **`start-server.sh` does not exist.** The skill's start path **fails on every OS.** Skill also `cat /tmp/sp-server.log` — wrong path (real log is `%LOCALAPPDATA%\...\server.log`). |
| **4** | **Cross-platform (v0.4 spec)** | `install.sh` (Linux/mac) + `create-launcher.sh` | **`install.sh` is absent.** `create-launcher.sh` exists and is solid (XDG `.desktop` / macOS `.app`) — but it opens a browser at `http://127.0.0.1:8083` that **nothing serves**, because there is **no `start-server.sh`** to spawn the Python server on Linux/mac. |

**The single root cause underneath all four:** there is **no one OS-agnostic, self-healing "ensure the server is running" primitive.** Each path re-implements "is it up? if not, start it" and each re-implementation is broken or unwired differently. The Windows `start-server.ps1` works *only if* you manually ran `install.ps1` *and* the `settings.local.json` entry survived — and nothing distributes it or heals it if it's gone.

---

## 3. Why it is "not durable"

Durable = *works on any machine after the standard setup, and stays working without babysitting.* Every pillar of that is missing:

- **Nothing travels.** The only autostart wiring lives in `.claude/settings.local.json` — a per-machine, non-distributed file. Clone/plug-in on machine B → no hook → no server. The plugin (`hooks.json`), which *does* travel, carries no session-pilot entry.
- **Nothing self-heals.** If the hook is missing (fresh machine, settings reset, overwrite), only a **manual** `install.ps1` re-adds it. There's no "on session start, if the wiring is gone, restore it."
- **The cross-platform half was never finished.** `start-server.sh` and `install.sh` don't exist, so Linux/mac have no server-start at all — the v0.4 "session-pilot снова cross-platform" de-pivot is spec-only.
- **Silent by design.** `start-server.ps1`'s `Write-Error` and `launch.ps1`'s warnings go to a hidden console; the skill's missing `start-server.sh` fails into the void. When it doesn't come up, there is no breadcrumb saying *why*.

---

## 4. Why the tests don't catch it

This is the part that "фakes зелёное" — the suite is green while the product is dead on arrival.

| Layer | What it does | Why it misses the durability break |
|---|---|---|
| **CI `.github/workflows/session-pilot.yml`** | Linux job: starts server, runs python tests + mutmut | **Dead workflow.** `paths:` trigger = `extensions/session-pilot/**` — the **deleted v1 layout** → never triggers on real `tools/session-pilot/` changes. Every internal path points at `extensions/session-pilot/tools/session-pilot/server.py` (**doesn't exist**). Still installs **Zellij** (removed in v0.3). Runs on **Linux** (product is Windows-native). Hasn't run against real code since the v2 migration. |
| **`tests/test_e2e.py`** | "full critical path" E2E | **Presumes a running server** (`SP_SERVER=http://localhost:8083`, connects, never cold-starts via the real launcher). It can't catch "server never starts" — it *requires* the broken thing to already work. Docstring still describes the deleted **Zellij** flow. |
| **`tests/test_launcher.py` SP047/SP048** | The *actual* launcher delivery path (opens/focuses window) | **Windows-only + `SP_GUI_TEST=1`-gated** → skips by default and in CI. This is the **exact gating pattern that let SP051's silent-fail ship** — its own comment says so. |
| **Any test of the autostart wiring** | — | **None exists.** Nothing asserts the hook is registered, that `start-server.sh` exists, or that a cold machine can bring the dashboard up. |
| **`npm test` (Docker vitest/cucumber)** | the canonical repo suite | **Doesn't run the python tests at all** (no reference in `package.json`). Only the dead CI workflow would. |

This is textbook against the repo's own rules: **`dead-integration-guard`** ("installed ≠ integrated"; a hook with code+tests but registered in no live manifest never fires), **`integration-tests-first`** (test the real delivery path — `runInstaller`/real spawn — not the end-state), and **`verify-status-against-code-before-acting`** (the CI `paths:` drifted from the real layout). And it is a **recurrence** of the user's own `POSTMORTEM-test-discipline.md` ("тестов нет нихуя не работает" — reactive testing, "готово" without verifying through the real delivery path).

---

## 5. Spec location + drift

Spec: **`.specs/session-pilot/`** (via the MCP door — `read_spec_doc`). Relevant requirements and where reality diverges:

- **FR-13 / AC-13** — SessionStart autostart hook → reality: hook registered nowhere durable.
- **FR-15 / AC-15** — install script → reality: `install.ps1` only; `install.sh` (promised by v0.4) absent.
- **FR-23 / FR-27** — pinnable launcher → reality: `create-launcher.ps1`/`.sh` exist but depend on a server that never starts on a fresh machine.
- **v0.4 scope de-pivot (FR.md header, 2026-05-12)** — "cross-platform, per-OS native" → reality: cross-platform *launcher* shipped, cross-platform *server start* (`start-server.sh`) did not.
- **SKILL.md** — stale: `start-server.sh` (missing), `/tmp/sp-server.log` (wrong), Zellij Scenarios 2–3 + `session_name` (removed API), "version in 3 places / extension.json" (extension.json deleted in v2 → only 2 places now, handlers.py + frontend.py, both `0.6.1`).

---

## 6. The fix — "so it doesn't fuck with my head anymore"

The goal per the user is **a test that FAILS when the delivery path rots**, plus a startup that heals itself on any machine — not a rebuild. Five parts:

### Fix A — one self-healing, OS-agnostic "ensure server" primitive
Create the missing **`start-server.sh`** (Linux/mac twin of `start-server.ps1`: idempotent PID-file check → spawn `python3 server.py` detached → log to `$XDG_STATE_HOME/session-pilot/server.log`). Now paths 1–4 **and** the skill have a real server-start on every OS. This is the smallest change that un-breaks the most paths.

### Fix B — make autostart durable + distributed + self-healing  *(the one decision — see below)*
Register a SessionStart hook in the plugin's **`.claude-plugin/hooks.json`** (the channel that travels) that runs a tiny OS-dispatch launcher → `start-server.ps1` on Windows, `start-server.sh` on Linux/mac. **Fail-open** (never blocks a session), **idempotent**, honors an **opt-out** (`SP_NO_AUTOSTART=1`). Result: any machine that has dev-pomogator gets the dashboard, **no manual `install.ps1`, self-heals every session start.**

### Fix C — wire launcher-chain logging (the "прикрути логи и смотри")
`server.log` already exists but is empty *because the server never spawned* — the silent failures are one level up, in the launcher chain. Add a single append-only **`<state>/launcher.log`** that every entry point writes to (start attempt, resolved python path, spawn PID/exit, health-probe result). Then "look at the logs" actually shows *why* it didn't start.

### Fix D — the recurrence-stopper: ONE ungated, cross-platform delivery-path test
Per `dead-integration-guard`, cold-start via the **real** launcher — do **not** presume `localhost:8083` the way `test_e2e` does:
1. **Static "no dangling entry point" guard** (ungated, runs everywhere): assert every referenced entry point exists — `start-server.sh`, `install.sh`, the plugin hook entry, the files the skill invokes. (SP051, but complete.)
2. **Cold-start integration**: run `start-server.{sh,ps1}` on a clean state dir → poll `/api/health` → assert 200 → tear down. Fails loudly if the chain is broken.
3. **Fix-or-delete the dead CI workflow**: repoint `paths:`→`tools/session-pilot/**`, drop Zellij, add a **Windows** job that runs the launcher delivery-path test, and wire the python tests into a runner that actually executes.

### Fix E — de-rot the skill + docs
`SKILL.md` (Zellij Scenarios 2–3, `start-server.sh`/`/tmp/sp-server.log`, `session_name`, "3 places/extension.json"), `test_e2e.py` Zellij docstring. This drift is what hides the real state.

---

## 7. The one decision that gates implementation scope

Everything above is derivable except **how invasive Fix B should be**:

- **Option 1 — Distribute autostart to every plugin user (opt-out).** Wire it into `.claude-plugin/hooks.json`. Truly durable ("just works" on any machine with the plugin, incl. Linux/mac), self-healing every session. Cost: a background HTTP server + browser-profile spins up for *every* dev-pomogator user unless they set `SP_NO_AUTOSTART=1`.
- **Option 2 — Keep it opt-in, but make the installer self-registering + self-healing.** `install.{ps1,sh}` writes the hook *and* the hook re-verifies/re-adds itself each session. Only affects machines where you ran the installer. Less invasive; still requires that first `install` run per machine.

Both include Fix A/C/D/E. **Recommendation: Option 1**, scoped with `SP_NO_AUTOSTART=1` opt-out — it's the only one that makes "another machine just works" true without a manual step, which is the stated complaint.
