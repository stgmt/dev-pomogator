"""
End-to-end test of session-pilot critical path:

1. GET /api/health → 200
2. GET /api/index → 200, ≥1 worktree
3. GET /api/claude?path=<wt> → 200 with ETag
4. GET /api/claude?path=<wt> with If-None-Match → 304 + 0 bytes
5. POST /api/launch fresh mode → 200 ok=true method∈{write-chars,new-layout}
6. Poll `zellij list-sessions` → assert spawned session present
7. POST /api/launch SAME → method=cached (idempotency)
8. Cleanup: `zellij delete-session --force <name>`

This is the full critical-path E2E that test_launch_idempotent's
unit-level happy-path doesn't cover. Single test method per requirement
that exercises real HTTP + real Zellij + real assertions on side effects.

Per `.claude/rules/integration-tests-first.md`: real HTTP, real subprocess,
real filesystem polling. No mocks.

Per `.specs/session-pilot/FIXTURES.md` cleanup ordering: Zellij sessions
must be deleted BEFORE process exits.
"""

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid as uuid_module

SERVER = os.environ.get("SP_SERVER", "http://localhost:8083")
ZELLIJ_BIN = os.environ.get("ZELLIJ_BIN", os.path.expanduser("~/.local/bin/zellij"))


def _get(path: str, headers: dict | None = None, timeout: int = 30):
    req = urllib.request.Request(f"{SERVER}{path}", headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get("Content-Type", "")
            etag = resp.headers.get("ETag", "")
            body = resp.read()
            if "json" in content_type:
                return resp.status, json.loads(body.decode("utf-8")), etag
            return resp.status, body, etag
    except urllib.error.HTTPError as e:
        return e.code, e.read(), ""


def _post(path: str, body: dict, timeout: int = 30):
    req = urllib.request.Request(
        f"{SERVER}{path}",
        method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


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


def test_full_critical_path():
    """One test exercising every endpoint + side-effect verification + cleanup."""
    session_name = f"sp-e2e-{int(time.time())}-{uuid_module.uuid4().hex[:6]}"

    try:
        # --- Step 1: GET /api/health ---
        status, data, _ = _get("/api/health")
        assert status == 200, f"/api/health failed: {status}"
        assert data["status"] == "ok", f"health.status: {data}"
        assert "version" in data, f"health missing version: {data}"
        assert "uptime_sec" in data, f"health missing uptime_sec: {data}"
        print("  ✓ Step 1: /api/health 200 ok")

        # --- Step 2: GET /api/index ---
        status, data, _ = _get("/api/index")
        assert status == 200, f"/api/index failed: {status}"
        assert "rows" in data and len(data["rows"]) > 0, f"/api/index empty: {data}"
        wt = data["rows"][0]["worktree_path"]
        assert wt, f"first row has no worktree_path: {data['rows'][0]}"
        print(f"  ✓ Step 2: /api/index 200 with {len(data['rows'])} rows; using {wt}")

        # --- Step 3: GET /api/claude with ETag ---
        status, claude_data, etag = _get(f"/api/claude?path={wt}")
        assert status == 200, f"/api/claude failed: {status}"
        assert etag, f"/api/claude missing ETag header"
        assert etag.startswith('W/"'), f"ETag not weak format: {etag!r}"
        print(f"  ✓ Step 3: /api/claude 200, ETag={etag}")

        # --- Step 4: GET /api/claude with If-None-Match → 304 ---
        status, body, _ = _get(f"/api/claude?path={wt}", headers={"If-None-Match": etag})
        assert status == 304, f"expected 304 got {status}: {body[:200] if isinstance(body, bytes) else body}"
        # 304 must have empty body
        if isinstance(body, bytes):
            assert len(body) == 0, f"304 body should be empty, got {len(body)} bytes"
        print("  ✓ Step 4: /api/claude with matching If-None-Match → 304 + 0 bytes")

        # --- Step 5: POST /api/launch fresh ---
        status, launch_data = _post("/api/launch", {
            "worktree_path": wt,
            "session_name": session_name,
            "mode": "fresh",
        })
        assert status == 200, f"/api/launch failed: {status} {launch_data}"
        assert launch_data["ok"] is True, f"ok not true: {launch_data}"
        assert launch_data["session"] == session_name
        assert launch_data["method"] in ("write-chars", "new-layout"), (
            f"unexpected method: {launch_data['method']}"
        )
        expected_url = f"http://localhost:8082/?session={session_name}"
        assert launch_data["url"] == expected_url, (
            f"URL mismatch: {launch_data['url']!r} != {expected_url!r}"
        )
        print(f"  ✓ Step 5: /api/launch 200 method={launch_data['method']}")

        # --- Step 6: poll Zellij — assert real session created ---
        deadline = time.time() + 5
        found = False
        while time.time() < deadline:
            if _zellij_session_exists(session_name):
                found = True
                break
            time.sleep(0.3)
        assert found, (
            f"Zellij session {session_name!r} NOT in `zellij list-sessions` after 5s. "
            f"POST returned ok=true but spawn silently failed."
        )
        print(f"  ✓ Step 6: zellij list-sessions confirms {session_name} alive")

        # --- Step 7: POST /api/launch SAME — idempotency cached ---
        status, cached_data = _post("/api/launch", {
            "worktree_path": wt,
            "session_name": session_name,
            "mode": "fresh",
        })
        assert status == 200
        assert cached_data["method"] == "cached", (
            f"expected method=cached on rapid duplicate, got {cached_data['method']}"
        )
        assert "idempotency lock" in cached_data.get("note", "").lower()
        print("  ✓ Step 7: idempotency lock returns method=cached")

        print(f"\n--- E2E PASS: all 7 steps verified for {session_name} ---")

    finally:
        # --- Step 8 (cleanup, always runs): delete Zellij session ---
        _zellij_delete(session_name)
        print(f"--- cleanup: zellij delete-session --force {session_name} ---")


def test_open_vscode_invalid_path_rejected():
    """POST /api/open-vscode with non-whitelisted path → 403."""
    status, data = _post("/api/open-vscode", {"path": "/tmp/notreal"})
    assert status == 403, f"expected 403 got {status}: {data}"
    assert data.get("ok") is False
    assert "whitelist" in data.get("error", "").lower()


if __name__ == "__main__":
    test_funcs = [
        (k, v) for k, v in list(globals().items())
        if k.startswith("test_") and callable(v)
    ]
    failed = 0
    for name, fn in test_funcs:
        try:
            print(f"Running {name}…", flush=True)
            fn()
            print(f"PASS {name}\n")
        except AssertionError as e:
            print(f"FAIL {name}: {e}\n")
            failed += 1
        except Exception as e:
            print(f"ERROR {name}: {type(e).__name__}: {e}\n")
            failed += 1
    sys.exit(1 if failed else 0)
