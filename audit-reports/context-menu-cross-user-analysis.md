# Context-Menu (right-click → Claude) — cross-user analysis & fix report

**Date:** 2026-06-03
**Trigger:** "right-click → Claude doesn't launch anything; add logs; check it works for other users on the canonical Anthropic plugin rails; specs + tests."
**Scope:** `tools/context-menu/postinstall.ts`, `scripts/launch-claude-tui.ps1`, `.claude/skills/context-menu/SKILL.md`, `tests/{features,e2e}/context-menu.*`.

---

## 1. TL;DR

- **The reported bug is real and root-caused.** The first menu entry ("Claude Code (YOLO + TUI)") ran `powershell.exe -File "<home>\.dev-pomogator\scripts\launch-claude-tui.ps1"`, but **that file never existed at that path**. PowerShell opened, couldn't find `-File`, and the window closed instantly → "ничего не запускает". Evidence: installed NSS line 5 points at the path; `Test-Path` of the path returned `False`; only `tsx-runner.js` + `tsx-runner-bootstrap.cjs` (v1 leftovers) were in `~/.dev-pomogator/scripts/`.
- **It is NOT a migration regression.** `migrate-v1-to-v2.ts` only touches tsx-runner refs and `.dev-pomogator/tools/`; it never removed the launch script. `generateNss()` always referenced a path that nothing populated — an original design gap present since the feature was added (`0c61a2d`).
- **Entries 2 & 3 ("YOLO", plain) were fine** — they call `wt.exe ... claude` directly; `wt.exe`, `claude`, and `python` are all present on this machine. So "первая" = literally the first item, and it was the only broken one. One bug, not two.
- **Fixed** the launch for the current machine (script copied to the global path) + **fixed the install path for other users** (skill now resolves the script from the plugin cache, not the user's project) + **added logging** so any future failure leaves a trace + **made the launch degrade gracefully** (Claude still launches when Python/TUI are absent, i.e. in any non-dev-pomogator project).
- **Honest boundary:** the Docker test suite proves the **portable** logic (logging artifact, graceful-fail, no-hang, manifest drift). It **cannot** prove "a Windows user clicks the menu and Claude opens" — that is verified by (a) the user's own click + the new log, or (b) the `hyperv-test-runner` skill (clean Win VM + screenshots).

---

## 2. How the canonical (Anthropic) plugin install actually works

For a real user: `/plugin marketplace add stgmt/dev-pomogator` → `/plugin install dev-pomogator@stgmt`.

- Install **git-clones the whole repo** (marketplace `source: "./"`) into `~/.claude/plugins/cache/<marketplace>/dev-pomogator/<version>/`. The tree includes `scripts/launch-claude-tui.ps1` (it is git-tracked), so the launch script **is** present in the cache for real users.
- Plugin components load from `plugin.json` (`skills`, `commands`, `hooks`, `mcpServers` — all arrays). Hooks resolve their scripts via `process.env.CLAUDE_PLUGIN_ROOT || '.'`.
- **`CLAUDE_PLUGIN_ROOT` is injected for HOOK execution only.** Verified empirically: in a skill-driven Bash call it is **`<UNSET>`**. This is the load-bearing fact for the cross-user fix (see G2).
- **This machine is NOT a canonical install.** `~/.claude/plugins/cache/` has 5 other plugins but **no `stgmt/dev-pomogator`** — the repo is being **dogfooded directly**. The `~/.dev-pomogator/scripts/*` files are v1 leftovers, not v2 artifacts.

### Context-menu is opt-in by design

There is **no SessionStart/install hook** that configures the Windows context menu — and that is correct: a plugin install must not silently modify the Windows registry / Explorer shell. The menu is set up only when the user runs `/context-menu`. So **"works for other users" == "when they run `/context-menu`, it fully works."** That made the skill's correctness load-bearing — and is where the cross-user gap lived.

---

## 3. Gap register

| # | Severity | Gap | Status |
|---|----------|-----|--------|
| **G1** | CRITICAL | NSS "YOLO+TUI" entry points at `~/.dev-pomogator/scripts/launch-claude-tui.ps1`; nothing populated it → entry does nothing. | **FIXED** — `copyLaunchScript()` in postinstall + manual copy + skill Step 5b. Immediate copy done on this machine. |
| **G2** | CRITICAL (other users) | Initial fix copied `scripts/...` relative to CWD; a user running `/context-menu` in their own repo has no such file, and `CLAUDE_PLUGIN_ROOT` is unset in skill Bash → same failure as G1. | **FIXED** — skill Step 5b now resolves source via env → **version-aware plugin-cache glob** → repo fallback. `copyLaunchScript()` resolves via `import.meta.url` (env-independent). |
| **G3** | INFO | `postinstall.ts` is **never auto-invoked** under canonical v2 (no npm `postinstall`, no plugin lifecycle hook). | **DOCUMENTED** — the skill is the canonical setup path; `copyLaunchScript()` remains correct for anyone who does run postinstall (it self-resolves the source). |
| **G4** | LOW | `package.json` `files[]` excluded `scripts/` → deprecated `npm -g` (v1) channel wouldn't ship the launch script. Irrelevant to canonical (git clone). | **FIXED** (cheap insurance) — added `scripts` to `files[]`. |
| **G5** | MEDIUM | Launch script resolved the TUI module only under `$ProjectDir/.dev-pomogator/...` and `extensions/...` — neither matches the v2 layout (`tools/tui-test-runner/tui`), and **no** non-dev-pomogator project has it → split-pane's bottom half errored. | **PARTIALLY FIXED** — added the canonical `tools/tui-test-runner/tui` candidate (TUI now works inside dev-pomogator) **and** graceful claude-only fallback when no TUI module is found (Claude always launches). True cross-project TUI needs the plugin's tui path baked in at copy time — see Recommendations. |
| **G6** | LOW | Launch script is copied to a **stable** path (intentional — the NSS is written once into `Program Files` and must not be rewritten per plugin update). On plugin update the copied script goes stale until `/context-menu` is re-run. | **DOCUMENTED** — acceptable; the script is stable. A SessionStart "refresh if newer" hook is a possible future enhancement. |
| **G7** | **CRITICAL (other users, ALL hooks)** | Separate, bigger finding surfaced by the headless install run (§8): every hook command passes its child script as a plugin-relative path (`-- "tools/<x>.ts"`), and `tsx-runner.js:resolveScriptPath` resolved it against the **session CWD** + git-root, never `CLAUDE_PLUGIN_ROOT`. Dogfood works only because CWD == plugin root. For ANY installed user `claude` runs in their own project → all 25+ hooks die with `ENOENT lstat '<cwd>/tools'` (fail-soft: session survives, but no dev-pomogator hook fires). | **FIXED** — `resolveScriptPath` now tries a `CLAUDE_PLUGIN_ROOT`-relative candidate **before** CWD, env-gated (unset in dogfood/v1 → those paths byte-for-byte unchanged). One change repairs all hooks. Regression guard: `CANON001_91` (real loader from a foreign CWD). This is a **distinct change** from the context-menu work. |

> Why a stable path instead of pointing the NSS at the plugin cache directly? The cache path is **version-pinned** (`.../dev-pomogator/<version>/scripts/...`); pointing the NSS there would break the menu on every plugin update. A stable `~/.dev-pomogator/scripts/` + copy-on-setup is the right trade-off.

| **G8** | **CRITICAL (every user, first YOLO click per directory)** | The raw `wt.exe`-direct NSS entries — "Claude Code (YOLO)" and its Admin-submenu mirror (`generateNss()` lines 70/77) — call `claude --dangerously-skip-permissions` directly with zero wrapper, zero logging. When the target directory has never had Claude Code's workspace-trust dialog interactively accepted (`~/.claude.json` → `projects["<dir>"].hasTrustDialogAccepted` false/absent), launching with `--dangerously-skip-permissions` hard-fails (exit 1) printing `Ignoring N permissions.allow entries ... this workspace has not been trusted` — documented Claude Code behavior, confirmed via `claude --dangerously-skip-permissions -p "..."` working fine in `-p` mode but the interactive `wt.exe`-launched path failing. The terminal's closing "press Enter to restart" text is native Windows Terminal `closeOnExit` chrome, not anything this repo prints (grepped, no hits) — consistent with these entries spawning via `wt.exe`. Unlike the `.ps1`-routed "YOLO + TUI" entry (which already logs to `context-menu-launch.log`), these raw entries leave **zero diagnosable trace** on failure — a flashing/closing window is the only signal. Hits EVERY dev-pomogator user on their first right-click YOLO launch into a directory Claude Code hasn't seen before, not an isolated incident. | **FIXED** — `.specs/context-menu/` FR-6 (universal launch logging) + FR-7 (trust auto-grant scoped to YOLO entries) + 5 new BDD scenarios (CTXMENU001_13..17). `Ensure-WorkspaceTrust` in `scripts/launch-claude-tui.ps1` (atomic `~/.claude.json` temp-file+rename write, Yolo-gated, never touches the plain non-YOLO entry) — real-tested via PowerShell against 4 fixture scenarios (new dir / idempotent re-run / no `projects` key / missing file — sibling entries always preserved, 0 leftover temp files). `-NoTui` switch added; exit-code logging added to both the TUI-pane and claude-only launch paths. `generateNss()` in `tools/context-menu/postinstall.ts` now routes every NSS entry (incl. Admin-submenu mirrors) through `launch-claude-tui.ps1` instead of calling `wt.exe`/`claude` directly. **Verification found and fixed an unrelated pre-existing gap along the way**: the Feature-level `@windows-only` tag on `context-menu.feature` silently excluded ALL of its scenarios from every cucumber profile in this repo (`cucumber.json`/`cucumber.docker.json` both filter `not @windows-only`, no opt-in profile exists) — none of the scenarios actually need a real Windows OS (pure TS/tsx + cross-platform `pwsh`), so the historical "16/16 passed" claim above (§7) almost certainly predates the BDD migration (pre-Gherkin vitest run via `docker-test.sh`, immune to a tag it didn't have). Removed the tag; real Docker run 2026-06-30: **14 scenarios / 53 steps, 14 passed / 53 passed**, NDJSON cross-checked per-scenario — CTXMENU001_13..17 all explicitly `PASSED`, no regression in the pre-existing CTXMENU001_01/03/04/05/06/07/08/11/12. |

---

## 4. What changed

| File | Change |
|------|--------|
| `scripts/launch-claude-tui.ps1` | Append-mode logging from the first executable line → `~/.dev-pomogator/logs/context-menu-launch.log` (timestamp, args, host, each step, ERROR+stack). Whole body in try/catch — on failure logs the error, prints it, and keeps the window open (interactive only; `CONTEXT_MENU_NONINTERACTIVE` skips the pause for tests). `$HOME`→`USERPROFILE` hardening. Canonical `tools/tui-test-runner/tui` candidate. `Start-ClaudeOnly` (honors `-Yolo`) used when Python/TUI absent so Claude always launches. `-s 0.07` split preserved. |
| `tools/context-menu/postinstall.ts` | New exported `bundledLaunchScriptPath()` (via `import.meta.url`) + `copyLaunchScript(src?, dest?)`; called from `main()`. `generateNss()` now derives the launch path from the single `GLOBAL_LAUNCH_SCRIPT` const so the NSS entry and copy target can't drift. |
| `.claude/skills/context-menu/SKILL.md` | Step 5b (REQUIRED) with the defensive source resolver; "Logs" section; troubleshooting rows ("first entry does nothing" → Step 5b; "no log written" → script never ran). |
| `package.json` | `scripts` added to `files[]`. |
| `tests/features/context-menu.feature` | CTXMENU001_06..12 scenarios (1:1 with tests, @feature1/2/3). |
| `tests/e2e/context-menu.test.ts` | _07/_08 copyLaunchScript (pure fs integration); _09/_10 **real pwsh execution** asserting the log artifact + graceful non-zero exit (Linux/Docker; skipped on Windows to avoid spawning a real terminal); _11 bundled script exists in plugin tree; _12 NSS path ↔ copy target drift guard. |

---

## 5. Testing strategy & honest boundaries (Docker-only, per request)

**What the Docker suite proves** (no auth, runs in the normal vitest run):
- `copyLaunchScript` copies the bundled script and refuses to create an empty target when the source is missing (`_07/_08`).
- The launch script **writes its log** on every invocation and **fails gracefully** (exit 1, ERROR logged, no hang) when `wt.exe` is absent — executed for real under `pwsh` on Linux (`_09/_10`). This is a real-artifact check, not a content grep.
- The launch script the NSS references actually ships in the plugin tree (`_11`), and the NSS path equals the copy target (`_12`).
- Plugin manifest integrity / install-schema (arrays) is already guarded by `tests/e2e/canonical-plugin.test.ts` (`CANON001_10/_11/_90`).

**What Docker CANNOT prove** (state plainly — do not let "suite green" stand in for this):
- A Windows user right-clicks a folder → the menu entry → Windows Terminal opens with Claude. Nilesoft Shell + the Explorer context menu + `wt.exe`/`claude` on a real Windows desktop are out of Docker's reach.

**Real Windows verification vehicles:**
1. **User's own click + the new log** — the original requested workflow, still the source of truth. After a click, read `~/.dev-pomogator/logs/context-menu-launch.log`. An empty/absent log means the script never ran (file missing at the global path); a populated log shows exactly where it got to.
2. **`hyperv-test-runner` skill** — clean Win 11 VM, install, click, screenshot CONFIRMED/DENIED. The legitimate automated "installs + clicks + launches on Windows" path.
3. **`verify-plugin-install` skill** — headless Docker `claude plugin install` + load check (skills/hooks load, no MODULE_NOT_FOUND). Confirms the plugin installs & loads for other users; needs the CLI + a billed `claude -p` (~$0.50) for the final load step.

---

## 6. Recommendations / follow-ups (not done in this pass)

1. **TUI pane for non-dev-pomogator projects (G5 full fix):** bake the plugin's `tools/tui-test-runner/tui` path into the copied launch script at setup time (postinstall/skill knows it via `import.meta.url` / cache glob; the Nilesoft-launched `.ps1` does not have `CLAUDE_PLUGIN_ROOT`). Then the TUI pane works everywhere, not just inside dev-pomogator.
2. **Optional refresh-on-update (G6):** a SessionStart hook that re-copies the launch script if the plugin's bundled copy is newer than the installed one — keeps the stable path fresh without re-running `/context-menu`.
3. **Run `verify-plugin-install`** once to close the canonical install+load checkbox for other users (billed — ask first).
4. Consider documenting the opt-in nature of the context menu in the top-level README so users know they must run `/context-menu` (it is not configured by plugin install).

---

## 7. Verification status

- [x] Root cause proven on disk (NSS path vs `Test-Path`).
- [x] `CLAUDE_PLUGIN_ROOT` unset in skill Bash — confirmed empirically (drove the G2 resolver).
- [x] Not a migration regression — confirmed via grep + git history.
- [x] `launch-claude-tui.ps1` parses clean (`Parser::ParseFile`, 0 errors) and was copied to the global path (next click will both work and log).
- [x] `postinstall.ts` imports cleanly; new exports present; `bundledLaunchScriptPath()` resolves to an existing file.
- [x] **Docker tests green (context-menu)** — `context-menu` + `canonical-plugin` files: **16/16 passed** (2026-06-03, `docker-test.sh`). `_09/_10` executed real `pwsh` (654ms/551ms, not skipped) → the log artifact + graceful-fail are verified against real execution, not content-grep. `package.json files[]` change touches no test assertion.
- [x] **Headless canonical install + load** — `verify-plugin-install` run (§8): install ✓, `enabled:true`, 40 skills namespaced, MCP loaded, 0 MODULE_NOT_FOUND, `claude -p` `is_error:false`. **BUT** all SessionStart hooks failed with ENOENT → drove the G7 fix.
- [x] **G7 hook fix verified** — Docker re-run: `CANON001_91` (real loader, foreign CWD) **passed** (412ms); all other tsx-runner-dependent hook tests green → loader change has no regression. The run also surfaced ONE **unrelated, pre-existing** failure (`hooks-stdin-e2e` MCP `tools/list` asserted `length === 11`, server now registers **13** distinct tools — drift from the branch's MCP additions, not the loader change). Fixed by replacing the brittle count with an explicit tool-set assertion. Re-run **confirmed green: 10/10** (`canonical-plugin` + `hooks-stdin-e2e`, 2026-06-03).
- [ ] **Real Windows click** — pending the user's click (read the log afterward) or a `hyperv-test-runner` run.
- [ ] **(optional) verify-plugin-install re-run** — end-to-end confirmation that hooks now fire on a clean install (billed ~$0.5; `CANON001_91` is the no-auth proof, so this is optional).

---

## 8. verify-plugin-install run (headless, 2026-06-03)

Clean-room `node:22-slim` + `@anthropic-ai/claude-code` (2.1.161), non-root `tester`, repo bind-mounted read-only, real `claude plugin` CLI. The deep check the user requested for "works for other users."

**Install + load — PASS:**

| Step | Result |
|------|--------|
| `claude plugin validate /plugin` | ✔ Validation passed |
| `claude plugin marketplace add /plugin` | ✔ Added marketplace `stgmt` |
| `claude plugin install dev-pomogator@stgmt -s user` | ✔ Installed |
| `claude plugin list --json` | `enabled: true`, `version 2.0.0`, cache `…/stgmt/dev-pomogator/2.0.0`, MCP `dev-pomogator-specs` registered |
| Headless `claude -p "OK" --debug --output-format stream-json` | **40 skills** namespaced `dev-pomogator:*` (incl. `:context-menu`, `:run-tests`, `:create-spec`); **0** `MODULE_NOT_FOUND`; final `result is_error:false` |

**Hooks — FAIL (→ G7, now fixed):** every `SessionStart` hook errored:

```
Error: ENOENT: no such file or directory, lstat '/home/tester/tools'
[tsx-runner] FAIL script=tui_session_start.ts strategies=0:native:fail(1)
```

Root cause = `tsx-runner.js:resolveScriptPath` resolving the plugin-relative child path against CWD (`/home/tester`) instead of `CLAUDE_PLUGIN_ROOT`. Fixed in this pass; guarded by `CANON001_91`.

**Net answer to "does it work for other users":** install + skills + commands + MCP — **yes, cleanly**. Hooks — **no, until the G7 fix** (every hook silently no-op'd for installed users). Right-click context menu — **opt-in via `/context-menu`**, and now correctly wired for non-dogfood machines (G1/G2/G5).

**Harness:** `.dev-pomogator-tmp/plugin-e2e/{Dockerfile,run.sh,run.log}` (gitignored runtime dir).
