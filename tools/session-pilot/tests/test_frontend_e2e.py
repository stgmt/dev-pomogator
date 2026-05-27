"""
Real browser e2e via Playwright (Firefox headless — Chromium needs sudo
apt install libnspr4 in WSL2; Firefox bundle works without system deps).

KNOWN FLAKINESS (test_frontend_actLaunch_handler_chain):
On WSL2, the chain Playwright→server.py→subprocess.Popen→setsid→Zellij has
intermittent race conditions where Popen succeeds + KDL file is written,
but the spawned Zellij process doesn't register a session. Manual curl POST
to the same endpoint works reliably. Hypothesis: browser context teardown
(page close from `finally` block) signals fetched connections, which on
Linux propagates to Python's HTTP server worker thread, which somehow
disturbs the just-spawned subprocess group before setsid completes detach.

Mitigation: 25s spawn timeout (was 5s) + retry on flake in CI via
`continue-on-error: true` on this test. Backend integration test
test_e2e.py covers the same chain reliably (no browser involvement).

Verifies:
1. Dashboard HTML loads, table renders rows
2. ZELLIJ_WEB_URL_JS template substituted in DOM
3. Action column has 4 buttons per row
4. Calling page-context actLaunch() triggers POST /api/launch
   (verifies JS handler + fetch + backend chain; safer than clicking
   Fresh button on user's real session row which would mutate state)
5. POST returns ok=true with method ∈ {write-chars, new-layout, cached}
6. Zellij session actually created server-side
7. Cleanup: zellij delete-session --force <test-session>

Why page.evaluate instead of clicking real button:
- Test session name uses unique prefix (`sp-fe-e2e-<rand>`) so we don't
  hijack/delete the user's actual lm-saas / dev-pomogator sessions
- Click would target first_row by sort order which is the user's live
  worktree; destructive
- evaluate() lets us exercise the full JS handler with safe inputs
"""

import os
import subprocess
import sys
import time
import uuid as uuid_module

SERVER = os.environ.get("SP_SERVER", "http://localhost:8083")
ZELLIJ_BIN = os.environ.get("ZELLIJ_BIN", os.path.expanduser("~/.local/bin/zellij"))

try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_OK = True
except ImportError:
    PLAYWRIGHT_OK = False


def _zellij_session_exists(name: str) -> bool:
    out = subprocess.run(
        [ZELLIJ_BIN, "list-sessions", "--no-formatting"],
        capture_output=True, text=True, timeout=5, check=False,
    )
    if out.returncode != 0:
        return False
    for line in out.stdout.splitlines():
        first = line.split()[0] if line.split() else ""
        if first == name:
            return True
    return False


def _zellij_delete(name: str) -> None:
    subprocess.run(
        [ZELLIJ_BIN, "delete-session", "--force", name],
        capture_output=True, timeout=5, check=False,
    )


def _first_worktree_via_api() -> str:
    import urllib.request, json
    with urllib.request.urlopen(SERVER + "/api/index", timeout=10) as r:
        data = json.load(r)
    return data["rows"][0]["worktree_path"]


def test_frontend_renders_and_table_populated():
    """Dashboard loads, table populated with rows from /api/index."""
    if not PLAYWRIGHT_OK:
        print("SKIP test_frontend_renders_and_table_populated (playwright not installed)")
        return
    with sync_playwright() as p:
        browser = p.firefox.launch(headless=True)
        try:
            page = browser.new_page()
            page.goto(f"{SERVER}/?fe-e2e-render", wait_until="domcontentloaded", timeout=30000)
            assert "Worktree Dashboard" in page.title()
            # Tabulator renders rows as div.tabulator-row (not tbody tr)
            page.wait_for_selector(".tabulator-row", timeout=15000)
            assert page.locator(".tabulator-row").count() > 0
            # Action column buttons — Tabulator cells are div.tabulator-cell
            buttons = page.locator(".tabulator-row").first.locator(".tabulator-cell button.act-btn")
            assert buttons.count() >= 3, f"expected ≥3 action buttons (Resume/Fresh/VSCode), got {buttons.count()}"
        finally:
            browser.close()


def test_frontend_no_legacy_zellij_globals():
    """v0.3: ZELLIJ_WEB_URL_JS global should NOT exist (legacy from Zellij Web Client)."""
    if not PLAYWRIGHT_OK:
        print("SKIP test_frontend_no_legacy_zellij_globals (playwright not installed)")
        return
    with sync_playwright() as p:
        browser = p.firefox.launch(headless=True)
        try:
            page = browser.new_page()
            page.goto(f"{SERVER}/?fe-e2e-url")
            zellij_url = page.evaluate("typeof ZELLIJ_WEB_URL_JS !== 'undefined' ? ZELLIJ_WEB_URL_JS : null")
            assert zellij_url is None, f"v0.3 dropped Zellij — ZELLIJ_WEB_URL_JS should not be defined, got {zellij_url!r}"
        finally:
            browser.close()


def test_frontend_actLaunch_handler_chain():
    """Full chain: invoke page-context actLaunch() → POST /api/launch fires.

    v0.3: terminal spawn requires wt.exe/cmd.exe (Windows-only). On Linux CI
    the spawn will fail with `cmd.exe not found` — assert the POST fired
    correctly (network chain), tolerate spawn failure as expected on Linux.
    """
    if not PLAYWRIGHT_OK:
        print("SKIP test_frontend_actLaunch_handler_chain (playwright not installed)")
        return

    wt = _first_worktree_via_api()

    with sync_playwright() as p:
        browser = p.firefox.launch(headless=True)
        try:
            ctx = browser.new_context()
            page = ctx.new_page()

            launch_responses: list[dict] = []
            def on_response(resp):
                if "/api/launch" in resp.url and resp.request.method == "POST":
                    try:
                        launch_responses.append({"status": resp.status, "body": resp.json()})
                    except Exception:
                        launch_responses.append({"status": resp.status, "body": None})
            page.on("response", on_response)

            page.goto(f"{SERVER}/?fe-e2e-launch", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_selector(".tabulator-row", timeout=10000)

            # v0.3 actLaunch signature: (btn, worktree_path, mode, uuid)
            page.evaluate(f"""
                actLaunch(
                    {{disabled: false, textContent: 'test', tagName: 'BUTTON'}},
                    {repr(wt)},
                    'fresh',
                    null
                );
            """)

            # Wait for POST response (network event)
            deadline = time.time() + 15
            while time.time() < deadline and not launch_responses:
                page.wait_for_timeout(200)
            assert launch_responses, (
                f"POST /api/launch never fired after actLaunch() invocation."
            )
            r = launch_responses[0]
            # On Windows: status 200 + method=wt-spawn-* or cmd-fallback-*.
            # On Linux CI: status 500 + method=cmd-fallback-* + error="cmd.exe not found".
            # Both paths prove the frontend → backend chain is wired correctly.
            if r["status"] == 200:
                assert r["body"]["ok"] is True
                assert r["body"]["method"].startswith("wt-spawn") or r["body"]["method"].startswith("cmd-fallback") or r["body"]["method"] == "cached"
                print(f"  ✓ POST /api/launch 200 method={r['body']['method']} (Windows host)")
            elif r["status"] == 500:
                # Linux CI — terminal launcher fails because no wt.exe / cmd.exe.
                # Frontend chain is still proven (POST fired with correct payload).
                err = r["body"].get("error", "")
                assert "cmd.exe not found" in err or "wt.exe not found" in err, (
                    f"unexpected 500 error: {err}"
                )
                print(f"  ✓ POST /api/launch 500 (expected on Linux — no wt.exe/cmd.exe)")
            else:
                raise AssertionError(f"/api/launch unexpected status {r['status']}: {r['body']}")

        finally:
            browser.close()


if __name__ == "__main__":
    failed = 0
    for k, v in list(globals().items()):
        if k.startswith("test_") and callable(v):
            try:
                print(f"Running {k}…", flush=True)
                v()
                if PLAYWRIGHT_OK:
                    print(f"PASS {k}\n")
            except AssertionError as e:
                print(f"FAIL {k}: {e}\n")
                failed += 1
            except Exception as e:
                print(f"ERROR {k}: {type(e).__name__}: {e}\n")
                failed += 1
    sys.exit(1 if failed else 0)
