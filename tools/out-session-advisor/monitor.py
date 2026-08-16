#!/usr/bin/env python3
"""
monitor.py — FR-4: цикл мониторинга воркера «не встаёт».

Различает «долгий думающий ход (xhigh)» от «процесс умер»:
  - живость: проверка привязанного процесса (cp `worker.pid`); по умолчанию Windows
    Get-Process -Id <pid>, fallback `ps`.
  - interval: снимать tail_snapshot + liveness каждые N сек (default 120–180).
  - timeout: если процесс жив, но транскрипт не рос дольше `alive_but_stale_s` — вердикт
    «думает (xhigh)», НЕ «повис».
  - мёртв: вердикт «умер» + рекомендация перезапуска (`worker_driver --resume <sid>`).

CLI (для агента-адвизора и тестов):
  python monitor.py --pid 1234 --session-dir <dir> [--interval 150] [--stale-after 600]
    → JSON: {alive, last_write_age_s, stale, verdict: "idle"|"thinking-xhigh"|"dead", since_sec}
  python monitor.py watch --pid ... --interval 150   # непрерывный цикл, печатает ходы
"""
import argparse
import json
import os
import subprocess
import sys
import time

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def is_alive(pid):
    try:
        pid = int(pid)
    except (TypeError, ValueError):
        return False
    if os.name == "nt":
        try:
            r = subprocess.run(
                ["powershell", "-NoProfile", "-Command",
                 f"Get-Process -Id {pid} -ErrorAction SilentlyContinue"],
                capture_output=True, text=True, timeout=15)
            return "Handles" in (r.stdout or "") or str(pid) in (r.stdout or "")
        except Exception:
            try:
                os.kill(pid, 0)
                return True
            except Exception:
                return False
    try:
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def last_write_age(transcript_path):
    if not transcript_path or not os.path.exists(transcript_path):
        return None
    return time.time() - os.path.getmtime(transcript_path)


def check(pid, transcript_path, stale_after=600):
    alive = is_alive(pid)
    age = last_write_age(transcript_path)
    if not alive:
        return {
            "alive": False,
            "last_write_age_s": age,
            "stale": age is not None and age > stale_after,
            "verdict": "dead",
            "since_sec": age,
            "hint": f"перезапуск: worker_driver.py --resume <sid> --cwd <dir>",
        }
    if age is not None and age > stale_after:
        return {
            "alive": True,
            "last_write_age_s": age,
            "stale": True,
            "verdict": "thinking-xhigh",
            "since_sec": age,
            "hint": "процесс жив, транскрипт не рос — думающий ход (xhigh), НЕ повис",
        }
    return {
        "alive": True,
        "last_write_age_s": age,
        "stale": False,
        "verdict": "idle",
        "since_sec": age,
    }


def main(argv=None):
    p = argparse.ArgumentParser(description="FR-4 worker liveness monitor.")
    p.add_argument("--pid", required=True, help="worker pid")
    p.add_argument("--transcript", help="path to main session jsonl (for last-write age)")
    p.add_argument("--stale-after", type=int, default=600, help="sec of no writes before 'thinking-xhigh'")
    p.add_argument("--interval", type=float, default=None)
    sub = p.parse_args(argv)
    payload = check(sub.pid, sub.transcript, sub.stale_after)
    if sub.interval is not None and sub.interval > 0:
        # watch loop: печатать каждый ход
        print(json.dumps(payload, ensure_ascii=False))
        while True:
            time.sleep(sub.interval)
            print(json.dumps(check(sub.pid, sub.transcript, sub.stale_after), ensure_ascii=False), flush=True)
        return 0
    print(json.dumps(payload, ensure_ascii=False))
    return 0 if payload["alive"] else 2


if __name__ == "__main__":
    raise SystemExit(main())