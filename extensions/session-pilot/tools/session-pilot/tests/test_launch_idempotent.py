"""
Integration tests for POST /api/launch.

Covers:
- Happy path: NEW session reachable in `zellij list-sessions` after POST
- Happy path: existing session — write-chars injection
- 5-second idempotency lock
- Path whitelist (403)
- UUID regex validation (400)
- Session name shell metachars (400)
- Mode=resume requires uuid

Per `.claude/rules/integration-tests-first.md`: real HTTP to running server,
real Zellij subprocess, real `zellij list-sessions` polling. No mocks.

Per `.specs/session-pilot/FIXTURES.md` B-2: each test that creates a Zellij
session MUST clean it up via `zellij delete-session --force` in finally block.

Prerequisite: server running at http://localhost:8083, Zellij at ~/.local/bin/zellij.
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


# ---------- HTTP helpers ----------

def _post(path: str, body: dict, timeout: int = 30) -> tuple[int, dict]:
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


def _get(path: str, headers: dict | None = None, timeout: int = 30) -> tuple[int, dict | bytes]:
    req = urllib.request.Request(f"{SERVER}{path}", headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            content_type = resp.headers.get("Content-Type", "")
            body = resp.read()
            if "json" in content_type:
                return resp.status, json.loads(body.decode("utf-8"))
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def _first_worktree() -> str:
    status, data = _get("/api/index")
    assert status == 200, f"/api/index returned {status}"
    assert data["rows"], "no worktrees in /api/index — test cannot proceed"
    return data["rows"][0]["worktree_path"]


# ---------- Zellij helpers ----------

def _zellij_session_exists(name: str) -> bool:
    """Real `zellij list-sessions` poll. Used to verify launch actually created session."""
    try:
        out = subprocess.run(
            [ZELLIJ_BIN, "list-sessions", "--no-formatting"],
            capture_output=True, text=True, timeout=5, check=False,
        )
    except FileNotFoundError:
        return False
    if out.returncode != 0:
        return False
    for line in out.stdout.splitlines():
        first_token = line.split()[0] if line.split() else ""
        if first_token == name:
            return True
    return False


def _zellij_delete_session(name: str) -> None:
    """Force-delete Zellij session. Idempotent: 'not found' is OK."""
    subprocess.run(
        [ZELLIJ_BIN, "delete-session", "--force", name],
        capture_output=True, timeout=5, check=False,
    )


def _unique_session_name(prefix: str) -> str:
    """Generate test session name with timestamp+random to avoid cross-run collisions."""
    return f"{prefix}-{int(time.time())}-{uuid_module.uuid4().hex[:6]}"


# ---------- Test runner with try/finally cleanup ----------

class _SessionTracker:
    """Tracks created Zellij sessions; cleanup_all called in test runner finally."""
    def __init__(self):
        self._created: list[str] = []

    def track(self, name: str) -> None:
        self._created.append(name)

    def cleanup_all(self) -> None:
        for name in self._created:
            _zellij_delete_session(name)
        self._created.clear()


# ---------- Tests ----------

def test_happy_path_launch_creates_real_zellij_session(tracker: _SessionTracker):
    """E2E: POST /api/launch → poll zellij list-sessions → assert session exists."""
    wt = _first_worktree()
    name = _unique_session_name("sp-happy")
    tracker.track(name)

    status, data = _post("/api/launch", {
        "worktree_path": wt,
        "session_name": name,
        "mode": "fresh",
    })
    assert status == 200, f"POST /api/launch failed: {status} {data}"
    assert data["ok"] is True, f"ok is not True: {data}"
    assert data["session"] == name, f"session mismatch: {data['session']} != {name}"
    assert data["url"] == f"http://localhost:8082/?session={name}", (
        f"URL mismatch: {data['url']}"
    )
    assert data["method"] in ("write-chars", "new-layout"), (
        f"unexpected method: {data['method']}"
    )

    # Poll Zellij — give setsid spawn up to 5s to register session
    deadline = time.time() + 5
    while time.time() < deadline:
        if _zellij_session_exists(name):
            break
        time.sleep(0.5)
    else:
        raise AssertionError(
            f"Zellij session {name!r} did NOT appear in `zellij list-sessions` within 5s. "
            f"POST returned ok=true but spawn failed silently."
        )


def test_existing_session_uses_write_chars(tracker: _SessionTracker):
    """When session already exists, second POST should use write-chars not spawn."""
    wt = _first_worktree()
    name = _unique_session_name("sp-existing")
    tracker.track(name)

    # First POST creates session
    status1, data1 = _post("/api/launch", {
        "worktree_path": wt, "session_name": name, "mode": "fresh",
    })
    assert status1 == 200
    # Wait for session to register
    deadline = time.time() + 5
    while time.time() < deadline and not _zellij_session_exists(name):
        time.sleep(0.5)
    assert _zellij_session_exists(name), "first POST didn't create session"

    # Wait 6s to ensure idempotency lock expired
    time.sleep(6)

    # Second POST — session exists, should write-chars
    status2, data2 = _post("/api/launch", {
        "worktree_path": wt, "session_name": name, "mode": "fresh",
    })
    assert status2 == 200
    assert data2["method"] == "write-chars", (
        f"expected method=write-chars (existing session), got {data2['method']}"
    )


def test_double_post_within_5s_returns_cached(tracker: _SessionTracker):
    """Idempotency lock: 2 identical POSTs in 5s window → second method=cached."""
    wt = _first_worktree()
    name = _unique_session_name("sp-idem")
    tracker.track(name)
    body = {"worktree_path": wt, "session_name": name, "mode": "fresh"}

    status1, data1 = _post("/api/launch", body)
    assert status1 == 200
    assert data1["ok"] is True

    status2, data2 = _post("/api/launch", body)
    assert status2 == 200
    assert data2["method"] == "cached", (
        f"expected method=cached (idempotency lock), got {data2['method']}"
    )
    note = data2.get("note", "")
    assert "idempotency lock" in note.lower(), f"note missing 'idempotency lock': {note!r}"


def test_post_after_5s_runs_again(tracker: _SessionTracker):
    """After 5s window expires, same POST runs fresh (not cached)."""
    wt = _first_worktree()
    name = _unique_session_name("sp-expire")
    tracker.track(name)
    body = {"worktree_path": wt, "session_name": name, "mode": "fresh"}

    status1, data1 = _post("/api/launch", body)
    assert status1 == 200
    method1 = data1["method"]

    time.sleep(6)  # exceed 5s lock TTL

    status2, data2 = _post("/api/launch", body)
    assert status2 == 200
    assert data2["method"] != "cached", (
        f"lock should have expired but got method=cached. Note: {data2.get('note')}"
    )
    # After first run created session, second should hit existing-session path
    assert data2["method"] == "write-chars", (
        f"expected write-chars (session exists), got {data2['method']}"
    )


def test_invalid_path_rejected_403():
    """Path not in /api/index whitelist → 403."""
    status, data = _post("/api/launch", {
        "worktree_path": "/tmp/notreal",
        "session_name": "sp-test-403",
        "mode": "resume",
        "uuid": "00000000-0000-0000-0000-000000000000",
    })
    assert status == 403, f"expected 403 got {status}: {data}"
    assert data.get("ok") is False
    assert "whitelist" in data.get("error", "").lower(), (
        f"error should mention whitelist: {data.get('error')!r}"
    )


def test_invalid_uuid_rejected_400():
    """UUID not matching ^[0-9a-f-]{36}$ → 400."""
    wt = _first_worktree()
    status, data = _post("/api/launch", {
        "worktree_path": wt,
        "session_name": "sp-test-uuid",
        "mode": "resume",
        "uuid": "not-a-valid-uuid",
    })
    assert status == 400, f"expected 400 got {status}: {data}"
    assert data.get("ok") is False
    assert "uuid" in data.get("error", "").lower()


def test_resume_without_uuid_rejected_400():
    """mode=resume requires uuid — should 400 if missing."""
    wt = _first_worktree()
    status, data = _post("/api/launch", {
        "worktree_path": wt,
        "session_name": "sp-test-no-uuid",
        "mode": "resume",
        # uuid intentionally missing
    })
    assert status == 400, f"expected 400 got {status}: {data}"
    assert data.get("ok") is False


def test_invalid_session_name_rejected_400():
    """Session name with shell metachars → 400."""
    wt = _first_worktree()
    status, data = _post("/api/launch", {
        "worktree_path": wt,
        "session_name": "evil; rm -rf /",
        "mode": "fresh",
    })
    assert status == 400, f"expected 400 got {status}: {data}"
    assert data.get("ok") is False


# ---------- Manual test runner with cleanup ----------

if __name__ == "__main__":
    import inspect

    tracker = _SessionTracker()
    failed = 0
    test_funcs = [
        (k, v) for k, v in list(globals().items())
        if k.startswith("test_") and callable(v)
    ]

    try:
        for name, fn in test_funcs:
            try:
                print(f"Running {name}…", flush=True)
                # Inject tracker if test accepts it
                sig = inspect.signature(fn)
                if "tracker" in sig.parameters:
                    fn(tracker)
                else:
                    fn()
                print(f"PASS {name}")
            except AssertionError as e:
                print(f"FAIL {name}: {e}")
                failed += 1
            except Exception as e:
                print(f"ERROR {name}: {type(e).__name__}: {e}")
                failed += 1
    finally:
        # Cleanup ALL tracked sessions even if tests crashed
        print(f"--- cleanup: deleting {len(tracker._created)} test sessions ---", flush=True)
        tracker.cleanup_all()

    sys.exit(1 if failed else 0)
