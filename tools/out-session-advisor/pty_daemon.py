#!/usr/bin/env python3
"""
pty_daemon.py — FR-2 FALLBACK: ConPTY-контроль воркера для живого TUI/handoff.

Dолгоживущий процессы: `PtyProcess.spawn([claude, --resume <sid>, --model <m>,
--dangerously-skip-permissions], cwd, dimensions, env)`; протокол ctl/rsp-файлись:
  - control: `claude-ctl.json` = {"action":"send|read|exit","prompt":"<utf8>","wait":N}
  - response: `claude-rsp.json` = {"out":"<ansi snapshot>","pid":N,"sent":true}

Не хардкодит пути: всё (claude exe, cwd, session, model, winpty-lib) — через аргументы/ env.
Не PRIMARY для основного цикла — May نیاز stream-json недоступен либо нужен живой TUI
(handoff владельцу). Смотри FR-2.

Вопросы/вывод — ANSI; читай из rsp «out» и чисти `strip_ansi.py` перед анализом.
"""
import json
import os
import sys
import threading
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CONTROL = "claude-ctl.json"
DEFAULT_RESPONSE = "claude-rsp.json"

# winpty user-site: выводится через env WPTY_LIB; если не задано — пробуем стандартные места
_LIB_CANDIDATES = [
    os.environ.get("WINPTY_LIB", ""),
]

sys.path[:0] = [x for x in _LIB_CANDIDATES if x]


def _import_pty():
    try:
        from winpty import PtyProcess  # type: ignore
        return PtyProcess
    except Exception as e:
        raise RuntimeError(
            f"pywinpty not importable (FR-2 fallback; primary = stream-json): {e}. "
            f"Set WINPTY_LIB to the dir containing pywinpty.")


def main():
    import argparse
    p = argparse.ArgumentParser(description="ConPTY daemon fallback (FR-2)")
    p.add_argument("--ctl", default=DEFAULT_CONTROL, help="control json path")
    p.add_argument("--rsp", default=DEFAULT_RESPONSE, help="response json path")
    p.add_argument("--cwd", default=os.getcwd())
    p.add_argument("--resume", default=None, help="claude --resume <sid>")
    p.add_argument("--model", default=None, help="claude --model <m>")
    p.add_argument("--no-skip-permissions", action="store_true", help="do NOT bypass permissions")
    p.add_argument("--dim-cols", type=int, default=220)
    p.add_argument("--dim-rows", type=int, default=50)
    args = p.parse_args()

    PtyProcess = _import_pty()
    cmd = [os.environ.get("OUT_SESSION_CLAUDE", "claude")]
    if args.resume:
        cmd += ["--resume", args.resume]
    if args.model:
        cmd += ["--model", args.model]
    if not args.no_skip_permissions:
        cmd += ["--dangerously-skip-permissions"]

    for path in (args.ctl, args.rsp):
        if os.path.exists(path):
            os.remove(path)

    proc = PtyProcess.spawn(
        cmd,
        cwd=args.cwd or os.getcwd(),
        dimensions=(args.dim_rows, args.dim_cols),
        env=os.environ.copy(),
    )
    time.sleep(5)  # prime terminal

    buf = []

    def reader():
        while True:
            try:
                chunk = proc.read()
            except Exception:
                chunk = ""
            if chunk:
                buf.append(chunk)
            else:
                time.sleep(0.3)

    threading.Thread(target=reader, daemon=True).start()

    def dump(extra=None):
        snap = "".join(buf)
        buf.clear()
        obj = {"out": snap[-20000:], "pid": proc.pid}
        if extra:
            obj.update(extra)
        with open(args.rsp, "w", encoding="utf8") as f:
            json.dump(obj, f, ensure_ascii=False)

    while True:
        if not os.path.exists(args.ctl):
            time.sleep(0.5)
            continue
        try:
            with open(args.ctl, "r", encoding="utf8") as f:
                req = json.load(f)
        except Exception:
            req = {}
        os.remove(args.ctl)
        act = req.get("action", "read")
        if act == "exit":
            try:
                proc.write("\x03")
                proc.write("exit\r")
            except Exception:
                pass
            time.sleep(1)
            try:
                proc.close()
            except Exception:
                pass
            break
        if act == "send":
            prompt = str(req.get("prompt", ""))
            try:
                proc.write(prompt + "\r")
            except Exception as exc:
                dump({"sent": False, "error": str(exc)})
            else:
                dump({"sent": True})
        time.sleep(float(req.get("wait", 2)))
        dump()


if __name__ == "__main__":
    main()