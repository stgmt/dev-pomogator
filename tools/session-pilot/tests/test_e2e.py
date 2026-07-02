"""
End-to-end test of session-pilot critical path (v0.3+ native-terminal launch —
Zellij was removed in v0.3; the old Zellij steps in this header were stale):

1. GET /api/health → 200
2. GET /api/index → 200, ≥1 worktree
3. GET /api/claude?path=<wt> → 200 with ETag
4. GET /api/claude?path=<wt> with If-None-Match → 304 + 0 bytes
5. POST /api/launch fresh → 200 ok=true method∈{wt-spawn…,cmd-fallback…,cached}
   (500 tolerated on Linux CI — no wt.exe/cmd.exe)
6. POST /api/launch invalid mode → 400
7. POST /api/launch non-whitelisted path → 403

Per `.claude/rules/integration-tests-first.md`: real HTTP, real subprocess. No mocks.

NOTE: this test PRESUMES a server already running at SP_SERVER (default
localhost:8083) — it does NOT cold-start via the launcher. The durable
cold-start delivery path is proven by test_launcher.py::SP054 (Windows) and the
CI 'cold-start via start-server.sh' step (Linux). See
audit-reports/session-pilot-durability-2026-07-02.md.
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
    """Exercise every endpoint + side-effect verification. v0.3 — Windows-only spawn.

    POST /api/launch will fail on Linux CI runners (no wt.exe / cmd.exe). We
    assert the HTTP CHAIN (validation, idempotency, response shape) but tolerate
    spawn failure as the expected outcome on non-Windows platforms.
    """
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
    if isinstance(body, bytes):
        assert len(body) == 0, f"304 body should be empty, got {len(body)} bytes"
    print("  ✓ Step 4: /api/claude with matching If-None-Match → 304 + 0 bytes")

    # --- Step 5: POST /api/launch fresh ---
    # v0.3 payload: {worktree_path, mode, uuid?}. session_name removed.
    status, launch_data = _post("/api/launch", {
        "worktree_path": wt,
        "mode": "fresh",
    })
    if status == 200:
        # Windows host — spawn succeeded
        assert launch_data["ok"] is True
        method = launch_data["method"]
        assert method.startswith("wt-spawn") or method.startswith("cmd-fallback") or method == "cached", (
            f"unexpected method: {method}"
        )
        print(f"  ✓ Step 5: /api/launch 200 method={method} (Windows native)")
    elif status == 500:
        # Linux CI — terminal_launcher fallback failed because no wt.exe / cmd.exe
        err = launch_data.get("error", "")
        assert "cmd.exe not found" in err or "wt.exe not found" in err, (
            f"unexpected 500 error: {err}"
        )
        print(f"  ✓ Step 5: /api/launch 500 (expected on Linux — no Windows binaries)")
    else:
        raise AssertionError(f"/api/launch unexpected status {status}: {launch_data}")

    # --- Step 6: POST /api/launch with invalid mode — 400 validation ---
    status, err_data = _post("/api/launch", {
        "worktree_path": wt,
        "mode": "invalid",
    })
    assert status == 400, f"expected 400 for invalid mode, got {status}: {err_data}"
    assert "mode must be" in err_data.get("error", "").lower()
    print("  ✓ Step 6: /api/launch validates mode")

    # --- Step 7: POST /api/launch with non-whitelisted path — 403 ---
    status, err_data = _post("/api/launch", {
        "worktree_path": "/tmp/notreal",
        "mode": "fresh",
    })
    assert status == 403, f"expected 403 for non-whitelisted, got {status}: {err_data}"
    print("  ✓ Step 7: /api/launch validates whitelist")

    print(f"\n--- E2E PASS: all 7 steps verified ---")


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
