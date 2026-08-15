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
                 extra=(), transcript_path=None, timeout_ms=None):
        self.cwd = cwd or os.getcwd()
        self.proc = None
        self.messages = []
        self._lock = threading.Lock()
        self._reader_alive = threading.Event()
        self.timeout_ms = timeout_ms
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
            line = line.strip()
            if line:
                try:
                    msg = ClaudeMessage(json.loads(line))
                except Exception:
                    msg = None
                if msg is not None:
                    with self._lock:
                        self.messages.append(msg)
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
    args = p.parse_args(argv)

    driver = WorkerDriver(
        cwd=args.cwd,
        resume=args.resume,
        model=args.model,
        skip_permissions=not args.no_skip_permissions,
        transcript_path=args.transcript,
    )
    ok = driver.start(wait_init_timeout=60.0)
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