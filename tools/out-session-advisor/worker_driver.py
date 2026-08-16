#!/usr/bin/env python3
"""
worker_driver.py — FR-2 PRIMARY управление воркером Claude Code через stream-json.

Мост к живому `claude` CLI: `claude --input-format stream-json --output-format
stream-json [--resume <sid> --model <m> --dangerously-skip-permissions]`.
Синхронизация по `type=result` (wait for result before next send).
Structured события: `system/init` (session_id, tools), `assistant`,
`user/tool_result`, `result` (num_turns, total_cost_usd, permission_denials).

Паттерн: `claw-army/claude-node` (stream-json bridge), [VERIFIED: docs/04-protocol.md].

Архитектура:
  - `--run-json <path>`: INVOKE = прочитать инвойс-JSON, выполнить один инвойс,
    записать результат в <path>.result.json. Инвойс:
        {"op":"send"|"send_nowait"|"wait_result"|"stop",
         "prompt": str, "timeout": float, "model": str, "resume": str,
         "cwd": str, "skip_permissions": bool}
  - `--converse "prompt" --cwd <dir> [--resume <sid>]`: shorthand, вывести
    final assistant text в stdout.
  - интерактивный режим при отсутствии флагов: цикл «жди вопрос в result -> отвечай».

Вопросы воркера приходят обычным текстом в `result` (вариант A, live-тест 2026-08-15);
адвизор отвечает через `send` — перехвата AskUserQuestion не требуется.
"""
import argparse
import json
import os
import subprocess
import sys
import threading
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

CLAUDE_EXE = os.environ.get("OUT_SESSION_CLAUDE", "claude")


class WorkerError(Exception):
    pass


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())


def to_event(msg: "ClaudeMessage"):
    """Нормализовать stream-json сообщение в событие event-log (формат в стиле csd events.ts)."""
    raw = msg.raw
    t = msg.type
    if t == "system" and msg.subtype == "init":
        return {"event": "session_start", "ts": now_iso(), "sid": msg.session_id()}
    if t == "system" and msg.subtype == "thinking_tokens":
        return {"event": "thinking_tokens", "ts": now_iso(),
                "estimated_tokens": raw.get("estimated_tokens")}
    if t == "assistant":
        content = (raw.get("message") or {}).get("content") or []
        evts = []
        for c in content:
            if not isinstance(c, dict):
                continue
            if c.get("type") == "tool_use":
                evts.append({"event": "tool_use", "ts": now_iso(),
                             "tool": c.get("name", ""), "tool_input": c.get("input") or {}})
            elif c.get("type") == "text" and c.get("text"):
                evts.append({"event": "assistant_text", "ts": now_iso(),
                             "text": str(c.get("text"))[:500]})
        return evts
    if t == "user":
        content = (raw.get("message") or {}).get("content") or []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "tool_result":
                return {"event": "tool_result", "ts": now_iso(),
                        "is_error": bool(c.get("is_error"))}
    if t == "result":
        return {"event": "result", "ts": now_iso(), "sid": msg.session_id(),
                "is_error": msg.is_error(), "text": msg.result_text()[:2000],
                "cost_usd": msg.cost_usd()}
    return None


class ClaudeMessage:
    def __init__(self, raw):
        self.raw = raw

    @property
    def type(self):
        return self.raw.get("type", "")

    @property
    def subtype(self):
        return self.raw.get("subtype", "")

    def is_init(self):
        return self.type == "system" and self.subtype == "init"

    def is_result(self):
        return self.type == "result"

    def is_result_ok(self):
        return self.is_result() and self.raw.get("is_error", False) is False

    def is_error(self):
        return self.raw.get("is_error", False) or self.raw.get("api_error_status") is not None

    def result_text(self):
        r = self.raw.get("result")
        return r if isinstance(r, str) else ""

    def session_id(self):
        return self.raw.get("session_id", "")

    def cost_usd(self):
        return self.raw.get("total_cost_usd")

    def assistant_texts(self):
        out = []
        content = ((self.raw.get("message") or {}).get("content")) or []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text" and c.get("text"):
                out.append(c["text"])
        return out


class WorkerDriver:
    def __init__(self, cwd=None, resume=None, model=None, skip_permissions=True,
                 extra=(), transcript_path=None, timeout_ms=None, event_log=None):
        self.cwd = cwd or os.getcwd()
        self.proc = None
        self.messages = []
        self._lock = threading.Lock()
        self._reader_alive = threading.Event()
        self.timeout_ms = timeout_ms
        self.transcript_path = transcript_path
        self.event_log = event_log
        self._event_fh = None
        self._transcript_fh = None
        cmd = [CLAUDE_EXE, "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"]
        if resume:
            cmd += ["--resume", resume]
        if model:
            cmd += ["--model", model]
        if skip_permissions:
            cmd += ["--dangerously-skip-permissions"]
        cmd += list(extra)
        self.cmd = cmd

    def start(self, wait_init_timeout=60.0):
        self.proc = subprocess.Popen(
            self.cmd,
            cwd=self.cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        self._reader_alive.set()
        if self.event_log:
            self._event_fh = open(self.event_log, "a", encoding="utf-8")
        if self.transcript_path:
            self._transcript_fh = open(self.transcript_path, "a", encoding="utf-8")
        t = threading.Thread(target=self._reader, daemon=True)
        t.start()
        if wait_init_timeout and wait_init_timeout > 0:
            # init может задерживаться за SessionStart hooks (context-mode injection);
            # готовность к работе = первый result пришедший по send — не блокируемся.
            init = self.wait_init(wait_init_timeout)
            if init is None:
                # не фейлим старт: многие коректные сессии инициализируются за 2+ мин
                return True
            return True
        return True

    def _reader(self):
        line = self.proc.stdout.readline()
        while line and self._reader_alive.is_set():
            if self._transcript_fh:
                self._transcript_fh.write(line)
            stripped = line.strip()
            if stripped:
                try:
                    msg = ClaudeMessage(json.loads(stripped))
                except Exception:
                    msg = None
                if msg is not None:
                    with self._lock:
                        self.messages.append(msg)
                    if self._event_fh:
                        evts = to_event(msg)
                        if evts:
                            if not isinstance(evts, list):
                                evts = [evts]
                            for e in evts:
                                self._event_fh.write(json.dumps(e, ensure_ascii=False) + "\n")
                            self._event_fh.flush()
            line = self.proc.stdout.readline()

    def stop(self, timeout=5.0):
        self._reader_alive.clear()
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.stdin.write("\n")
                self.proc.stdin.flush()
            except Exception:
                pass
            try:
                self.proc.terminate()
                self.proc.wait(timeout=timeout)
            except Exception:
                if self.proc.poll() is None:
                    self.proc.kill()
        for fh in (self._event_fh, self._transcript_fh):
            if fh:
                try:
                    fh.close()
                except Exception:
                    pass

    def _send_json(self, obj):
        if not self.proc or self.proc.poll() is not None:
            raise WorkerError("worker process not running")
        self.proc.stdin.write(json.dumps(obj, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()

    def send_nowait(self, text):
        self._send_json({
            "type": "user",
            "message": {"role": "user", "content": [{"type": "text", "text": text}]},
        })
        if self._event_fh:
            try:
                self._event_fh.write(json.dumps(
                    {"event": "send", "ts": now_iso(), "prompt": text[:2000]},
                    ensure_ascii=False) + "\n")
                self._event_fh.flush()
            except Exception:
                pass

    def send(self, text, timeout=60.0):
        self.send_nowait(text)
        return self.wait_for_result(timeout)

    def wait_init(self, timeout=60.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            for m in self.snapshot():
                if m.is_init():
                    return m
            time.sleep(0.1)
        return None

    def snapshot(self):
        with self._lock:
            return list(self.messages)

    def wait_for_result(self, timeout=60.0, start_index=0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                for i in range(start_index, len(self.messages)):
                    m = self.messages[i]
                    if m.is_result():
                        return m
            time.sleep(0.2)
        return None

    def wait_for_tool_use(self, tool_name, timeout=30.0, start_index=0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            with self._lock:
                for i in range(start_index, len(self.messages)):
                    m = self.messages[i]
                    content = ((m.raw.get("message") or {}).get("content")) or []
                    for c in content:
                        if isinstance(c, dict) and c.get("type") == "tool_use" \
                                and c.get("name") == tool_name:
                            return c
            time.sleep(0.2)
        return None


def run_invoice(driver, invoice):
    op = invoice.get("op", "send")
    prompt = invoice.get("prompt", "")
    timeout = float(invoice.get("timeout", 60))
    if op == "stop":
        driver.stop()
        return {"ok": True, "op": "stop"}
    if op == "send":
        res = driver.send(prompt, timeout=timeout)
        return result_payload(res, op="send")
    if op == "send_nowait":
        driver.send_nowait(prompt)
        return {"ok": True, "op": "send_nowait", "queued": True}
    if op == "wait_result":
        res = driver.wait_for_result(timeout=timeout)
        return result_payload(res, op="wait_result")
    raise WorkerError(f"unknown op {op!r}")


def result_payload(res, op):
    if res is None:
        return {"ok": False, "op": op, "timeout": True, "text": ""}
    return {
        "ok": True,
        "op": op,
        "session_id": res.session_id(),
        "text": res.result_text(),
        "cost_usd": res.cost_usd(),
        "is_error": res.is_error(),
        "permission_denials": res.raw.get("permission_denials", []),
        "assistant_texts": res.assistant_texts(),
    }


def main(argv=None):
    p = argparse.ArgumentParser(description="Worker driver via stream-json (FR-2).")
    group = p.add_mutually_exclusive_group()
    group.add_argument("--run-json", dest="run_json", help="run one invoice JSON; writes <path>.result.json")
    group.add_argument("--converse", dest="converse", help="send a prompt, print final text")
    group.add_argument("--interactive", action="store_true", help="loop: read result-text question -> stdin answer")
    p.add_argument("--cwd", default=os.getcwd())
    p.add_argument("--resume")
    p.add_argument("--model", default=None)
    p.add_argument("--no-skip-permissions", action="store_true", help="do NOT bypass permissions")
    p.add_argument("--timeout", type=float, default=180.0)
    p.add_argument("--transcript", default=None, help="optional transcript_path (append raw stdout)")
    p.add_argument("--event-log", dest="event_log", default=None,
                   help="путь к JSONL-логу нормализованных событий (session_start/send/thinking_tokens/tool_use/tool_result/result) — для tail_session --event-log")
    args = p.parse_args(argv)

    driver = WorkerDriver(
        cwd=args.cwd,
        resume=args.resume,
        model=args.model,
        skip_permissions=not args.no_skip_permissions,
        transcript_path=args.transcript,
        event_log=args.event_log,
    )
    try:
        ok = driver.start(wait_init_timeout=60.0)
    except Exception as e:
        # claude binary отсутствует / недоступен (напр. в Docker без creds) — fail-open
        print(json.dumps({"ok": False, "error": "worker start failed", "detail": str(e), "skipped": True}, ensure_ascii=False))
        return 3
    if not ok:
        print(json.dumps({"ok": False, "error": "init timeout"}, ensure_ascii=False))
        return 2

    try:
        if args.run_json:
            with open(args.run_json, "r", encoding="utf8") as f:
                invoice = json.load(f)
            result = run_invoice(driver, invoice)
            out_path = args.run_json + ".result.json"
            with open(out_path, "w", encoding="utf8") as f:
                json.dump(result, f, ensure_ascii=False, indent=1)
            print(json.dumps(result, ensure_ascii=False))
        elif args.converse:
            res = driver.send(args.converse, timeout=args.timeout)
            payload = result_payload(res, op="converse")
            print(json.dumps(payload, ensure_ascii=False))
            if res is None:
                return 3
        elif args.interactive:
            start = 0
            while True:
                res = driver.wait_for_result(timeout=args.timeout, start_index=start)
                if res is None:
                    print(json.dumps({"ok": False, "timeout": True}))
                    return 3
                start = len(driver.messages)
                text = res.result_text()
                if text:
                    print(f"[WORKER] {text}")
                answer = input().strip()
                driver.send_nowait(answer)
        else:
            p.print_help()
            return 1
    finally:
        driver.stop()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())