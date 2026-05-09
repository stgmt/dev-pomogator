"""
Integration test: 5-second idempotency lock prevents duplicate /api/launch
injection. Tests via real HTTP to running server (per integration-tests-first rule).

Prerequisite: server must be running at http://localhost:8083 with at least
one worktree in /api/index.
"""

import json
import sys
import time
import urllib.error
import urllib.request


SERVER = "http://localhost:8083"


def _post(path: str, body: dict) -> tuple[int, dict]:
    req = urllib.request.Request(
        f"{SERVER}{path}",
        method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


def _first_worktree() -> str:
    with urllib.request.urlopen(f"{SERVER}/api/index", timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["rows"][0]["worktree_path"]


def test_double_post_within_5s_returns_cached():
    """Two identical POSTs within 5s → second returns method=cached."""
    wt = _first_worktree()
    body = {
        "worktree_path": wt,
        "session_name": "sp-idempotency-test",
        "mode": "fresh",
    }

    status1, data1 = _post("/api/launch", body)
    assert status1 == 200, f"First POST failed: {status1} {data1}"
    assert data1["ok"] is True
    method1 = data1["method"]

    # Second POST within 5s
    status2, data2 = _post("/api/launch", body)
    assert status2 == 200, f"Second POST failed: {status2} {data2}"
    assert data2["method"] == "cached", (
        f"Expected method=cached, got {data2['method']}. "
        f"First method was {method1}."
    )
    assert "idempotency lock" in data2.get("note", "").lower()


def test_post_after_5s_runs_again():
    """Same POST after 5s window → runs again (not cached)."""
    wt = _first_worktree()
    body = {
        "worktree_path": wt,
        "session_name": "sp-idempotency-test-2",
        "mode": "fresh",
    }

    status1, data1 = _post("/api/launch", body)
    assert status1 == 200

    print("Sleeping 6s to let lock expire…", flush=True)
    time.sleep(6)

    status2, data2 = _post("/api/launch", body)
    assert status2 == 200
    assert data2["method"] != "cached", (
        f"Lock should have expired. Got method={data2['method']}"
    )


def test_invalid_path_rejected():
    """Path not in /api/index whitelist → 403."""
    status, data = _post("/api/launch", {
        "worktree_path": "/tmp/notreal",
        "session_name": "sp-test",
        "mode": "resume",
        "uuid": "00000000-0000-0000-0000-000000000000",
    })
    assert status == 403, f"Expected 403, got {status}"
    assert "whitelist" in data.get("error", "").lower()


def test_invalid_uuid_rejected():
    """UUID not matching regex → 400."""
    wt = _first_worktree()
    status, data = _post("/api/launch", {
        "worktree_path": wt,
        "session_name": "sp-test",
        "mode": "resume",
        "uuid": "not-a-valid-uuid",
    })
    assert status == 400, f"Expected 400, got {status} {data}"


def test_invalid_session_name_rejected():
    """Session name with shell metachars → 400."""
    wt = _first_worktree()
    status, data = _post("/api/launch", {
        "worktree_path": wt,
        "session_name": "evil; rm -rf /",
        "mode": "fresh",
    })
    assert status == 400, f"Expected 400, got {status} {data}"


if __name__ == "__main__":
    test_funcs = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in test_funcs:
        try:
            print(f"Running {fn.__name__}…", flush=True)
            fn()
            print(f"PASS {fn.__name__}")
        except AssertionError as e:
            print(f"FAIL {fn.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"ERROR {fn.__name__}: {type(e).__name__}: {e}")
            failed += 1
    sys.exit(1 if failed else 0)
