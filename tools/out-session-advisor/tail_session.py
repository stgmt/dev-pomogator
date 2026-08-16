#!/usr/bin/env python3
"""
tail_session.py — FR-1 snapshot собиратель транскрипта воркера.

Хвостит главный `~/.claude/projects/<proj>/<sid>.jsonl` И все открытые/живые
`subagents/agent-*.jsonl` (включая вложенный `subagents/workflows/<runId>/agent-*.jsonl`,
рекурсивный обход с лимитом глубины, param `--max-depth`, default 8 — по образцу
`Guiziweb/claude-code-data` `readSubagentTurns`).

Правила чтения (FR-1 / SCHEMA validation):
- файлы читаются по offset, НЕ ждём EOF: незакрытый файл читаем сколько ЕСТЬ;
- закрытые файлы помечаются «closed» после того, как размер не растёт между семплами
  (состояние в `<state-dir>/offsets.json`);
- дедупликация уже показанных строк (global + per-file offset);
- строка JSONL, что не парсится -> пропущена (fail-open), не роняет снапшот;
- субагентные события маркируются префиксом `[subagent <agentId>]`.

Возвращает text: последние события главного + живых subagents с временнЫми штампами.
"""
import argparse
import json
import sys
import os
import re

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

DEFAULT_TAIL_BYTES = 8 * 1024 * 1024
DEFAULT_MAX_LINES = 400  # финальных строк снапшота
DEFAULT_MAX_DEPTH = 8


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Tail Claude Code session transcript (main + subagents).")
    p.add_argument("--session", dest="sid", required=True, help="Claude Code session id (uuid or ses_...)")
    p.add_argument("--project-dir", dest="project_dir", required=True,
                   help="encoded project dir under ~/.claude/projects (e.g. E--repos-sales) OR full path")
    p.add_argument("--projects-root", dest="projects_root", default=os.path.expanduser("~/.claude/projects"),
                   help="claude projects root (default ~/.claude/projects)")
    p.add_argument("--tail-bytes", type=int, default=DEFAULT_TAIL_BYTES)
    p.add_argument("--max-lines", type=int, default=DEFAULT_MAX_LINES)
    p.add_argument("--max-depth", type=int, default=DEFAULT_MAX_DEPTH)
    p.add_argument("--state-dir", dest="state_dir", default=None,
                   help="dir for offsets state; default <projects_root>/.advisor-state")
    p.add_argument("--compact", action="store_true", help="compact output (no box drawing, terse markers)")
    return p.parse_args(argv)


def encoded_project_dir(project_dir):
    """'E:/repos/sales' or 'E--repos-sales' -> dir under projects-root."""
    if os.path.isdir(project_dir):
        return project_dir
    # already encoded (no drive colon / slashes) - treat as-is
    if not re.search(r"[:/\\]", project_dir):
        return project_dir
    return re.sub(r"[:/\\]", "-", project_dir)


def load_offsets(state_path):
    try:
        with open(state_path, "r", encoding="utf8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_offsets(state_path, offsets):
    os.makedirs(os.path.dirname(state_path), exist_ok=True)
    tmp = state_path + ".tmp"
    with open(tmp, "w", encoding="utf8") as f:
        json.dump(offsets, f, ensure_ascii=False, indent=1)
    os.replace(tmp, state_path)


def read_tail_bytes(path, tail_bytes):
    """Read last tail_bytes of a file (whole file if smaller)."""
    try:
        size = os.path.getsize(path)
    except OSError:
        return b""
    with open(path, "rb") as f:
        f.seek(max(0, size - tail_bytes))
        return f.read()


def iter_json_lines(text):
    for line in text.splitlines():
        if not line.strip():
            continue
        try:
            yield json.loads(line)
        except Exception:
            continue  # fail-open


def str_content(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "\n".join(str_content(x) for x in c)
    if isinstance(c, dict):
        if "text" in c and isinstance(c["text"], str):
            return c["text"]
        return json.dumps(c, ensure_ascii=False)[:2000]
    return ""


def render_event(j, agent_id=None):
    """Render one JSONL event line into a compact textual snapshot row.

    Субагентные файлы CC>=2.1.2 помечены `isSidechain: true` — НОРМАЛЬНО для них
    (прод-пример `subagents/agent-*.jsonl`). Потому isSidechain-фильтр применяем
    только к main (agent_id is None); субагенты (agent_id не None) не выкидываем.
    """
    t = j.get("type")
    if agent_id is None and (j.get("isSidechain") or j.get("is_sensitive_request")):
        return None
    ts = (j.get("timestamp") or "")[11:19]
    m = j.get("message") or {}
    prefix = f"[subagent {agent_id}] " if agent_id else ""
    parts = []
    if t in ("user", "assistant"):
        content = m.get("content")
        if isinstance(content, list):
            for c in content:
                if not isinstance(c, dict):
                    continue
                ct = c.get("type")
                if ct == "tool_use":
                    name = c.get("name", "")
                    inp = c.get("input") or {}
                    fpath = inp.get("file_path", "") if isinstance(inp, dict) else ""
                    cmd = ""
                    if isinstance(inp, dict) and inp.get("command"):
                        cmd = " | " + str(inp["command"])[:110]
                    parts.append(f"[TOOL {name} {fpath}{cmd}]")
                elif ct == "text":
                    txt = (c.get("text") or "").strip()
                    if txt:
                        parts.append(f"[TEXT {txt[:220]}]")
        elif isinstance(content, str) and content.strip():
            parts.append(f"[TEXT {content[:220]}]")
        if parts:
            return f"{prefix}{ts} {t}: {' '.join(parts)}"
    elif t == "summary":
        summ = j.get("summary") or ""
        if isinstance(summ, str):
            return f"{prefix}{ts} SUMMARY: {summ[:300]}"
    return None


def scan_subagents_dir(root, depth, max_depth, out):
    """Recursively collect subagent files (agent-*.jsonl) — mirrors claude-code-data."""
    if depth > max_depth:
        return
    try:
        entries = sorted(os.listdir(root))
    except OSError:
        return
    for name in entries:
        path = os.path.join(root, name)
        if os.path.isfile(path) and name.startswith("agent-") and name.endswith(".jsonl"):
            out.append((path, name[len("agent-"):-len(".jsonl")]))
        elif os.path.isdir(path):
            scan_subagents_dir(path, depth + 1, max_depth, out)


def is_closed(path, last_size, offsets):
    """Closed = file existed before, and its size did not grow since last sample."""
    key = path.replace("\\", "/")
    prev = offsets.get(key, {}).get("size")
    return prev is not None and last_size == prev


def collect(args):
    projects_root = args.projects_root
    proj_dir = encoded_project_dir(args.project_dir)
    base = os.path.join(projects_root, proj_dir)
    main_path = os.path.join(base, f"{args.sid}.jsonl")
    if not os.path.exists(main_path):
        # session subfolder (session_id.jsonl nested under <sid>/)
        nested = os.path.join(base, args.sid, f"{args.sid}.jsonl")
        if os.path.exists(nested):
            main_path = nested
        else:
            return None, f"session transcript not found: {main_path}"

    state_dir = args.state_dir or os.path.join(projects_root, ".advisor-state")
    state_path = os.path.join(state_dir, "offsets.json")
    offsets = load_offsets(state_path)
    prev_main = offsets.get("__main__", {})

    snapshot = []
    # main file
    raw = read_tail_bytes(main_path, args.tail_bytes)
    for j in iter_json_lines(raw.decode("utf-8", errors="replace")):
        row = render_event(j)
        if row:
            snapshot.append(row)

    # subagents (nested scan under <sid>/subagents)
    sub_list = []
    sid_base = os.path.join(base, args.sid)
    scan_subagents_dir(os.path.join(sid_base, "subagents"), 0, args.max_depth, sub_list)
    # legacy flat: <sid>.jsonl next to main (agent-*.jsonl) handled by readSessionIds exclusion;
    # we still scan the session subfolder only (CC >= 2.1.2 layout).
    for path, agent_id in sub_list:
        raw2 = read_tail_bytes(path, args.tail_bytes)
        closed = is_closed(path, os.path.getsize(path) if os.path.exists(path) else 0, offsets)
        if closed:
            snapshot.append(f"[subagent {agent_id}] [closed]")
        for j in iter_json_lines(raw2.decode("utf-8", errors="replace")):
            row = render_event(j, agent_id=agent_id)
            if row:
                snapshot.append(row)

    # offsets update
    new_offsets = {}
    new_offsets["__main__"] = {"size": os.path.getsize(main_path)}
    for path, _ in sub_list:
        new_offsets[path.replace("\\", "/")] = {"size": os.path.getsize(path)}
    save_offsets(state_path, new_offsets)

    # dedup (global)
    seen = set()
    unique = []
    for row in snapshot:
        if row in seen:
            continue
        seen.add(row)
        unique.append(row)

    return unique[-args.max_lines:], None


def main(argv=None):
    args = parse_args(argv)
    lines, err = collect(args)
    if err:
        print(f"[tail-session] {err}", file=sys.stderr)
        return 2
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())