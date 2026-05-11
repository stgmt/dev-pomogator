"""HTTP request handlers — extracted from server.py (Phase 5 refactor).

All module-globals + functions accessed via `import server` late binding so
test monkey-patches (`server.CLAUDE_PROJECTS_DIRS = ...`,
`server._whitelisted_paths = lambda: ...`) continue to reach the live call site.

Public surface:
  - `_send_json(handler, payload, status=200)` — JSON response helper
  - `Handler(BaseHTTPRequestHandler)` — POST `/api/launch`, `/api/open-vscode`;
    GET `/`, `/vendor/*`, `/api/health`, `/api/index`, `/api/claude`,
    `/api/data`, `/api/git-status`, `/api/message`
"""

import json
import re
import time
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs


def _send_json(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        import server
        url = urlparse(self.path)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body_raw = self.rfile.read(length) if length else b""
            body = json.loads(body_raw.decode("utf-8")) if body_raw else {}
        except Exception:
            _send_json(self, {"error": "invalid JSON body"}, 400); return

        if url.path == "/api/launch":
            self._handle_launch(body)
        elif url.path == "/api/open-vscode":
            self._handle_open_vscode(body)
        else:
            self.send_response(404); self.end_headers()

    def _handle_launch(self, body: dict) -> None:
        import server
        wt = body.get("worktree_path", "")
        sess = body.get("session_name", "")
        mode = body.get("mode", "resume")
        uuid_v = body.get("uuid")

        if wt not in server._whitelisted_paths():
            _send_json(self, {"ok": False, "error": "worktree_path not in current index whitelist"}, 403); return
        if not re.match(r"^[A-Za-z0-9_-]+$", sess) or len(sess) > 80:
            _send_json(self, {"ok": False, "error": "invalid session_name"}, 400); return
        if mode not in ("resume", "fresh"):
            _send_json(self, {"ok": False, "error": "mode must be 'resume' or 'fresh'"}, 400); return
        if mode == "resume":
            if not uuid_v or not server.UUID_RE.match(uuid_v):
                _send_json(self, {"ok": False, "error": "invalid uuid (must match ^[0-9a-f-]{36}$)"}, 400); return

        key = (sess, uuid_v or "fresh")
        now = time.time()
        last = server._launch_lock.get(key, 0.0)
        if now - last < server.LAUNCH_LOCK_TTL:
            _send_json(self, {"ok": True, "method": "cached", "session": sess,
                              "url": f"{server.ZELLIJ_WEB_URL}/?session={sess}",
                              "note": f"idempotency lock — last action {int(now - last)}s ago"}); return
        server._launch_lock[key] = now

        cmd = f"claude --resume {uuid_v}" if mode == "resume" else "claude"

        if server._zellij_session_exists(sess):
            result = server._zellij_inject(sess, cmd)
        else:
            result = server._zellij_spawn_with_layout(sess, wt, mode, uuid_v)

        if not result.get("ok"):
            _send_json(self, result, 500); return

        _send_json(self, {
            "ok": True,
            "method": result["method"],
            "session": sess,
            "url": f"{server.ZELLIJ_WEB_URL}/?session={sess}",
            "command": cmd,
        })

    def _handle_open_vscode(self, body: dict) -> None:
        import server
        wt = body.get("path", "")
        if wt not in server._whitelisted_paths():
            _send_json(self, {"ok": False, "error": "path not in current index whitelist"}, 403); return
        result = server._open_vscode(wt)
        _send_json(self, result, 200 if result["ok"] else 500)

    def _serve_vendor(self, url_path: str):
        from pathlib import Path as _P
        rel = url_path[len("/vendor/"):]
        if ".." in rel or rel.startswith("/") or "\\" in rel:
            self.send_response(403); self.end_headers(); return
        vendor_root = _P(__file__).parent / "ui" / "vendor"
        target = (vendor_root / rel).resolve()
        try:
            target.relative_to(vendor_root.resolve())
        except ValueError:
            self.send_response(403); self.end_headers(); return
        if not target.is_file():
            self.send_response(404); self.end_headers(); return
        ext = target.suffix.lower()
        ctype = {
            ".js":  "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".woff2": "font/woff2",
            ".woff":  "font/woff",
            ".ttf":   "font/ttf",
        }.get(ext, "application/octet-stream")
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Cache-Control", "public, max-age=86400")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        import server
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        if url.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            html_rendered = server.HTML.replace("__ZELLIJ_WEB_URL__", server.ZELLIJ_WEB_URL)
            self.wfile.write(html_rendered.encode("utf-8"))
        elif url.path.startswith("/vendor/"):
            self._serve_vendor(url.path)
        elif url.path == "/api/health":
            _send_json(self, {"status": "ok", "version": "0.1.0",
                              "uptime_sec": int(time.time() - server._START_TIME)})
        elif url.path == "/api/index":
            _send_json(self, server.build_index_cached())
        elif url.path == "/api/claude":
            path = (qs.get("path") or [""])[0]
            if not path:
                _send_json(self, {"error": "missing 'path' query param"}, 400); return
            data = server.build_claude_cached(path)
            etag = data.get("etag", "")
            inm = self.headers.get("If-None-Match", "")
            if etag and inm and inm == etag:
                self.send_response(304)
                self.send_header("ETag", etag)
                self.send_header("Cache-Control", "no-cache, must-revalidate")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                return
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            if etag: self.send_header("ETag", etag)
            self.send_header("Cache-Control", "no-cache, must-revalidate")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        elif url.path == "/api/data":
            idx = server.build_index_cached()
            for r in idx["rows"]:
                r.update(server.build_claude_cached(r["worktree_path"]))
            _send_json(self, idx)
        elif url.path == "/api/git-status":
            path = (qs.get("path") or [""])[0]
            if not path:
                _send_json(self, {"error": "missing 'path' query param"}, 400); return
            _send_json(self, server.git_status_for(path))
        elif url.path == "/api/message":
            path = (qs.get("path") or [""])[0]
            session = (qs.get("session") or [""])[0]
            try:
                index = int((qs.get("index") or ["0"])[0])
                context = int((qs.get("context") or ["2"])[0])
            except ValueError:
                _send_json(self, {"error": "index/context must be integers"}, 400); return
            if not path or not session:
                _send_json(self, {"error": "missing 'path' or 'session' query param"}, 400); return
            _send_json(self, server.messages_for_session(path, session, index, context))
        else:
            self.send_response(404); self.end_headers()

    def log_message(self, *args, **kwargs):
        pass
