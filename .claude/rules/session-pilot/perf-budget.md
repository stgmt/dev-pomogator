# Performance Budget — Per-Endpoint Latency Targets

Все performance changes MUST keep these targets. Regression в любой target → block PR.

## Latency targets

| Endpoint | Cold (no server cache) | Warm (server cache hit) | 304 path | Target measurement |
|---|---|---|---|---|
| `/` (HTML) | <50ms | <50ms | n/a | constant template substitution |
| `/api/health` | <5ms | <5ms | n/a | no I/O |
| `/api/index` | <3s | <150ms | n/a | parallel git stat across N repos |
| `/api/claude?path=` | <300ms | <30ms | <5ms | byte-window JSONL parse |
| `/api/launch` | <2s | n/a | n/a | bottleneck: Zellij spawn |
| `/api/open-vscode` | <50ms | n/a | n/a | `subprocess.Popen` returns immediately |
| `/api/message` | <50ms | <30ms | n/a | seek + parse single line |
| `/api/git-status?path=` | <100ms | <30ms | n/a | `git status --short` + `rev-list` |

## Frontend targets

| Operation | Target | Method |
|---|---|---|
| Cold first paint of top-20 | <1s | top-20 priority queue + 4 parallel workers |
| Warm reload (SWR cache hit) | <300ms | localStorage instant + per-row mtime check |
| Reload skip rate | ≥80% of rows | mtime versioning skips fetch for unchanged |
| Tabulator scroll latency | <16ms (60fps) | Tabulator virtual DOM |

## How to measure

### Backend (Python)

`Performance.now()` equivalent: `time.perf_counter()`. Wrap each handler:

```python
def _send_json(handler, payload, status=200):
    t0 = time.perf_counter()
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    # ...
    handler.wfile.write(body)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    if elapsed_ms > {"index": 150, "claude": 300}.get(...):
        log_warn(f"latency budget breach: {elapsed_ms:.0f}ms")
```

### Frontend (JS)

```javascript
const t0 = performance.now();
const r = await fetch('/api/index');
const data = await r.json();
console.log(`/api/index: ${(performance.now() - t0).toFixed(0)}ms`);
```

For UI rendering benchmarks:

```javascript
performance.mark('render-start');
render(rows);
performance.mark('render-end');
performance.measure('render', 'render-start', 'render-end');
console.log(performance.getEntriesByName('render')[0].duration);
```

## Common regressions to watch

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/index` >500ms warm | Sequential git stat per repo | `ThreadPoolExecutor(8)` parallel |
| `/api/claude` >500ms cold | Full-file JSONL parse | byte-window: head 64KB + tail 256KB |
| Frontend cold paint >2s | All-rows fetch before render | top-20 priority + lazy rest |
| Reload >1s with cache | Cache invalidation too aggressive | mtime versioning, not time-based TTL |
| Scroll jank | Real DOM rendering 500+ rows | Tabulator virtual DOM |

## Anti-patterns (do not use)

- ❌ `for f in jsonls: parse_full(f)` — full-file read for line count. Use byte-window estimate.
- ❌ `time.sleep(0.5)` between requests — burns wallclock. Use async or thread pool.
- ❌ Synchronous git in HTTP handler — blocks worker. ThreadPoolExecutor.
- ❌ `requests` library for sub-process calls — `subprocess.run` is faster + no dep.
- ❌ Global per-row mutex — serialises parallel workers. Per-path lock if needed.

## Testing perf

```bash
# Cold timing (kill server, restart, single request)
pkill python3 -f session-pilot/server.py
sleep 1
bash extensions/session-pilot/tools/session-pilot/start-server.sh
sleep 2
time curl -s http://localhost:8083/api/index >/dev/null

# Warm timing (after server cache populated)
time curl -s http://localhost:8083/api/index >/dev/null

# 304 timing
ETAG=$(curl -sI "http://localhost:8083/api/claude?path=X" | awk '/^[Ee][Tt][Aa][Gg]:/ {print $2}' | tr -d '\r')
time curl -s -H "If-None-Match: $ETAG" "http://localhost:8083/api/claude?path=X" >/dev/null
```

## Budget breach response

If a code change pushes any endpoint over budget:

1. **Don't merge yet**. Investigate root cause.
2. Profile with `cProfile`: `python3 -c "import cProfile; cProfile.run('build_index_cached()')"`.
3. Identify bottleneck. Common: I/O (fix with parallel), JSON serialization (fix with caching), regex (fix with compiled pattern).
4. If genuine architectural shift required → propose alternative in DESIGN.md «Pagination strategy» section style; document trade-off.
5. Update this file's targets ONLY if budget intentionally relaxed (with reason).
