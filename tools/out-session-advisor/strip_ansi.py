#!/usr/bin/env python3
"""strip_ansi.py — FR-2/FR-1: очистка ANSI/OSC-последовательностей из снапшотов PTY.

CLI: `python strip_ansi.py <in.txt> <out.txt>`; если файлы не переданы — читает
`claude-rsp.json` и пишет `claude-clean.txt` рядом (для pty_daemon fallback).
Чистка: CSI  `\x1b[...m`, OSC `\x1b]...\x07`, CR -> LF.
"""
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
OSC_RE = re.compile(r"\x1b\][^\x07]*\x07")


def strip_ansi(text):
    out = CSI_RE.sub("", text)
    out = OSC_RE.sub("", out)
    out = out.replace("\r", "\n")
    # collapse empty-line runs
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out


def main(argv=None):
    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) >= 2:
        src, dst = argv[0], argv[1]
        with open(src, "r", encoding="utf8", errors="replace") as f:
            text = f.read()
        clean = strip_ansi(text)
        with open(dst, "w", encoding="utf8") as f:
            f.write(clean)
        print(f"stripped: {len(text)} -> {len(clean)} chars")
        return 0
    # default: read claude-rsp.json, write claude-clean.txt
    base = os.path.dirname(os.path.abspath(__file__))
    rsp = os.path.join(base, "claude-rsp.json")
    clean_path = os.path.join(base, "claude-clean.txt")
    with open(rsp, "r", encoding="utf8") as f:
        obj = json.load(f)
    out = obj.get("out", "")
    clean = strip_ansi(out)
    with open(clean_path, "w", encoding="utf8") as f:
        f.write(clean)
    print(f"len {len(clean)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())