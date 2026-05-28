"""Session-pilot HTML/CSS/JS dashboard — extracted from server.py for maintainability.

This module exports `HTML`: a single string containing the full dashboard SPA
(inline `<style>` and `<script>` blocks). Tabulator 6.x is loaded from
`/vendor/tabulator.min.{js,css}` served by the parent process.

v0.3 (Windows-native): served as-is — no template substitution. The legacy
`__ZELLIJ_WEB_URL__` placeholder removed when Zellij was dropped from spec.
"""

HTML = """<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Worktree Dashboard</title>
<link rel="stylesheet" href="/vendor/tabulator_midnight.min.css">
<script src="/vendor/tabulator.min.js"></script>
<style>
  body { background: #0e0e10; color: #e6e6e6; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", monospace; margin: 0; padding: 24px; }
  h1 { margin: 0 0 8px; font-size: 22px; }
  .meta { color: #888; font-size: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #2a2a2e; vertical-align: top; }
  th { background: #1c1c20; color: #aab; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  tr:hover td { background: #16161a; }
  .repo { color: #7dd3fc; font-weight: 600; }
  .branch { color: #fbbf24; font-family: monospace; }
  .branch.main { color: #22c55e; }
  .head { color: #888; font-family: monospace; font-size: 12px; }
  .path { color: #888; font-family: monospace; font-size: 12px; }
  .session.active { color: #22c55e; font-weight: 600; }
  .session.inactive { color: #555; }
  .open-link { display: inline-block; padding: 4px 10px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px; font-size: 12px; }
  .open-link:hover { background: #1d4ed8; }
  .open-link.disabled { background: #333; color: #777; pointer-events: none; }
  .claude-sessions { font-size: 11px; color: #aaa; }
  .claude-sessions div { padding: 2px 0; border-top: 1px dashed #333; }
  .claude-sessions div:first-child { border: 0; }
  .claude-uuid { color: #f472b6; font-family: monospace; }
  .empty { text-align: center; color: #555; padding: 40px; }
  .refresh { float: right; padding: 6px 14px; background: #2a2a2e; color: #ddd; border: 1px solid #444; border-radius: 4px; cursor: pointer; }
  .status.live { color: #22c55e; font-weight: 700; animation: pulse 1.5s infinite; }
  .status.idle { color: #888; font-size: 11px; }
  .status.idle small { color: #666; font-size: 10px; }
  .status.none { color: #444; }
  .row-live td { background: rgba(34, 197, 94, 0.06) !important; }
  .row-live .repo { color: #4ade80; }
  .live-dot { color: #22c55e; animation: pulse 1.2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: #fbbf24; }
  td.last-msg { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #ccc; }
  /* v0.3 layout-fix: ellipsis on long Tabulator cells (last-message, worktree path) */
  .tabulator-cell { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tabulator-cell .last-msg, .tabulator-cell .path { overflow: hidden; text-overflow: ellipsis; }
  td.ts { font-family: monospace; color: #888; font-size: 11px; white-space: nowrap; }
  td.num { text-align: right; color: #aaa; font-family: monospace; }
  .role-user { color: #60a5fa; font-weight: 600; }
  .role-assistant { color: #f472b6; font-weight: 600; }
  td.actions { white-space: nowrap; min-width: 130px; }
  .act-btn {
    display: inline-block; min-width: 28px; height: 28px; padding: 2px 6px;
    margin-right: 3px; border: 1px solid #444; border-radius: 4px;
    background: #2a2a2e; color: #ddd; cursor: pointer;
    text-align: center; line-height: 22px; text-decoration: none;
    font-size: 14px; transition: background 0.15s;
  }
  .act-btn:hover:not(.disabled):not(:disabled) { background: #3a3a3e; border-color: #666; }
  .act-btn.disabled, .act-btn:disabled { background: #1a1a1e; color: #555; cursor: not-allowed; border-color: #333; }
  .act-btn[href] { line-height: 22px; }
  .progress-wrap { background: #1a1a1e; border: 1px solid #333; border-radius: 4px; height: 6px; margin: 8px 0 16px; overflow: hidden; }
  .progress-bar { background: linear-gradient(90deg, #2563eb, #22c55e); height: 100%; width: 0%; transition: width 0.3s ease; }
  .progress-text { color: #888; font-size: 11px; margin-bottom: 6px; }
  td.loading { color: #555; font-style: italic; font-size: 11px; }
  .spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid #333; border-top-color: #fbbf24; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  td.git { font-size: 11px; white-space: nowrap; }
  .git-loading { color: #555; font-style: italic; }
  .git-na { color: #555; }
  .git-clean { color: #4ade80; }
  .git-add { color: #4ade80; }
  .git-mod { color: #fbbf24; }
  .git-del { color: #f87171; }
  .git-un  { color: #6b7280; }
  .git-ahead { color: #60a5fa; }
  .git-behind { color: #c084fc; }
  td.last-msg { cursor: pointer; }
  td.last-msg:hover { background: rgba(96, 165, 250, 0.06); }
  dialog#msgModal { background: #15161b; color: #d4d4d4; border: 1px solid #2a2a2e; border-radius: 6px; max-width: 720px; width: 70vw; max-height: 80vh; padding: 0; }
  dialog#msgModal::backdrop { background: rgba(0,0,0,0.6); }
  .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid #2a2a2e; background: #1a1a1f; }
  .modal-body { padding: 14px; overflow-y: auto; max-height: calc(80vh - 50px); }
  .modal-close, .modal-nav { background: #2a2a2e; color: #d4d4d4; border: 1px solid #444; border-radius: 4px; padding: 2px 8px; cursor: pointer; margin-left: 4px; font-size: 12px; }
  .modal-close:hover, .modal-nav:hover { background: #3a3a3e; }
  .modal-nav:disabled { opacity: 0.4; cursor: not-allowed; }
  .msg-block { padding: 6px 0; border-bottom: 1px solid #2a2a2e; }
  .msg-block:last-child { border-bottom: none; }
  .msg-block.target { background: rgba(96, 165, 250, 0.08); padding: 8px; border-radius: 4px; }
  .msg-role { display: inline-block; font-weight: bold; font-size: 11px; margin-right: 6px; }
  .msg-role.user { color: #60a5fa; }
  .msg-role.assistant { color: #fbbf24; }
  .msg-ts { font-size: 10px; color: #666; margin-left: 6px; }
  .msg-text { margin-top: 4px; white-space: pre-wrap; word-break: break-word; font-family: inherit; }
</style>
</head><body>
<h1>Worktree Dashboard <button class="refresh" onclick="hardReload()">↻ Refresh</button>
  <input id="filterInput" type="text" placeholder="/ to filter…"
    oninput="window._filterQuery = this.value; render();"
    style="margin-left:12px; background:#1a1a1f; color:#d4d4d4; border:1px solid #2a2a2e; border-radius:4px; padding:4px 8px; font-size:12px; width:240px;"
  /></h1>
<div class="meta" id="meta">Loading worktrees…</div>
<div class="progress-text" id="progressText"></div>
<div class="progress-wrap"><div class="progress-bar" id="progressBar"></div></div>
<div id="tbl"></div>
<dialog id="msgModal">
  <div class="modal-header">
    <strong id="msgModalTitle">Message viewer</strong>
    <span>
      <button class="modal-nav" id="msgModalPrev" title="Previous message (←)">◀</button>
      <button class="modal-nav" id="msgModalNext" title="Next message (→)">▶</button>
      <button class="modal-close" onclick="document.getElementById('msgModal').close()" title="Close (Esc)">✕</button>
    </span>
  </div>
  <div class="modal-body" id="msgModalBody">Loading…</div>
</dialog>
<script>
// Frontend code version. Bumped on every breaking schema change. On load,
// poll /api/health periodically — if server.version > FRONTEND_VERSION, the
// browser is running stale JS (Edge --app keeps in-memory state across reloads
// since Cache-Control: no-store only stops disk caching, not in-memory).
// Force a full reload to pull fresh HTML/JS.
const FRONTEND_VERSION = '0.5.0';

let _rows = [];          // current row state
let _wtById = {};        // id -> row reference

async function checkServerVersion() {
  try {
    const r = await fetch('/api/health', {cache: 'no-store'});
    const h = await r.json();
    if (h.version && h.version !== FRONTEND_VERSION) {
      console.warn(`[session-pilot] frontend v${FRONTEND_VERSION} vs server v${h.version} — reloading`);
      // Bypass any in-memory cache: location.reload(true) is non-standard but
      // hint to browsers; appending cache-buster query param forces fresh GET.
      location.href = '/?v=' + h.version + '&t=' + Date.now();
    }
  } catch {}
}

async function hardReload() {
  // Force re-fetch ignoring cache. Server itself caches 5/8s; we just retry.
  loadIndex();
}

// Run version check immediately + every 30s. Catches the case when user keeps
// Edge --app window open across server upgrades (most common stale-cache cause).
checkServerVersion();
setInterval(checkServerVersion, 30000);

// SWR-style cache in localStorage. v5: bumped to invalidate v4 entries that
// cached pre-cleanup message previews (raw ```json fences in last_message).
// Keyed by row.id (includes session_uuid suffix, FR-26). Stored shape unchanged.
//   { mtime: <claude_max_mtime>, etag: 'W/"…"', data: {claude_sessions, claude_running_now, claude_last_modified} }
// Keep this version in sync with indexer.py _PREVIEW_FORMAT_VERSION (ETag bump).
const CACHE_KEY_PREFIX = 'wtdash_v5_';

// One-shot purge of legacy cache versions (v3 per-worktree id; v4 pre-preview-cleanup).
// Stale entries would copy wrong-UUID / fence-polluted previews onto v5 rows.
(function purgeLegacyCache() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('wtdash_v3_') || k.startsWith('wtdash_v4_'));
    keys.forEach(k => localStorage.removeItem(k));
    if (keys.length) console.log('[session-pilot] purged ' + keys.length + ' legacy wtdash cache entries');
  } catch {}
})();

function cacheGet(id) {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY_PREFIX + id) || 'null'); }
  catch { return null; }
}
function cacheSet(id, entry) {
  try { localStorage.setItem(CACHE_KEY_PREFIX + id, JSON.stringify(entry)); } catch {}
}

function computeStatusSort(row) {
  // Synthetic numeric for Status column sort. Lower = higher priority.
  // priority * 1e10 + (-mtime) so within same priority, newer mtime sorts FIRST.
  // 1e10 > max plausible unix timestamp (~1.8e9) — no priority crossover.
  let priority;
  const LIVE_THRESHOLD_SEC = 300;
  const now = Math.floor(Date.now() / 1000);
  const age = row.claude_max_mtime ? (now - row.claude_max_mtime) : null;
  if (row.claude_running_now || (age !== null && age >= 0 && age < LIVE_THRESHOLD_SEC)) {
    priority = 0;  // LIVE
  } else if (row.claude_window_open) {
    priority = 1;  // 💡 Open
  } else if (row.claude_max_mtime) {
    priority = 2;  // idle with history
  } else {
    priority = 3;  // never ran / no history
  }
  // Sub-sort: newer mtime first within same priority.
  // Score = priority * 1e10 - mtime → lower priority wins, then lower-score-with-higher-mtime wins.
  return priority * 1e10 - (row.claude_max_mtime || 0);
}

function applyCachedClaude(row) {
  const cached = cacheGet(row.id);
  if (!cached) return false;
  const c = cached.data;
  // FR-26: claude_running_now is now AUTHORITATIVE on row level (from /api/index
  // per-session). Don't let /api/claude (per-worktree aggregate) overwrite it.
  // We keep claude_sessions / claude_last_modified for the message lookup,
  // but skip claude_running_now.
  const liveBefore = row.claude_running_now;
  Object.assign(row, c, {_claude_loaded: true, _from_cache: true, _cached_etag: cached.etag});
  row.claude_running_now = liveBefore;
  // FR-26: pick the session matching THIS row's session_uuid (not newest).
  // Fallback to first session if UUID not found (could happen if cache stale).
  const sessions = c.claude_sessions || [];
  const s = (row.session_uuid && sessions.find(x => x.uuid === row.session_uuid)) || sessions[0] || {};
  row._last_msg_text = s.last_message || s.first_message || '';
  row._last_msg_role = s.last_message_role || '';
  row._last_msg_ts = s.last_message_ts || c.claude_last_modified || '';
  row._msg_count = s.msg_count || 0;
  row._age_sec = s.age_sec ?? 9e9;
  row._status_sort = computeStatusSort(row);
  return true;
}

async function loadIndex() {
  setProgress(0, 'Loading worktree index…');
  try {
    const r = await fetch('/api/index', {cache: 'no-store'});
    const data = await r.json();
    document.getElementById('meta').textContent =
      `${data.rows.length} worktrees · generated ${data.generated_at}`;
    if (data.rows.length === 0) {
      document.getElementById('tbl').innerHTML = '<tr><td class="empty">No git worktrees found.</td></tr>';
      setProgress(100, 'Done');
      return;
    }
    // Init rows. Pull data from cache instantly per row + compute synthetic
    // _status_sort field for Status column sorting (FR-25/FR-26).
    _rows = data.rows.map(r => {
      const merged = Object.assign({}, r, {
        claude_sessions: [],
        // Note: claude_running_now from /api/index is per-session (FR-26).
        // Don't reset to false here — preserve backend value.
        _status_sort: 0,
        claude_last_modified: null,
        _claude_loaded: false,
      });
      // Rows without Claude history are "loaded" immediately — nothing to fetch
      if (!r.has_claude_history) merged._claude_loaded = true;
      applyCachedClaude(merged); // fills from localStorage if available
      // Compute Status sort key for every row (cache hit or miss).
      merged._status_sort = computeStatusSort(merged);
      return merged;
    });
    _wtById = {};
    _rows.forEach(r => _wtById[r.id] = r);
    render(); // INSTANT render with whatever's in cache (Tabulator handles sort)
    enrichClaude();  // revalidate only what's stale
  } catch (e) {
    setProgress(0, 'Failed: ' + e.message);
  }
}

async function enrichClaude() {
  // FR-26: per-session rows share worktree_path → dedupe fetches by cwd.
  // Build map cwd → list of rows; 1 fetch per unique cwd applies to N rows.
  const staleRows = _rows.filter(row => {
    if (!row.has_claude_history) return false;
    const cached = cacheGet(row.id);
    if (!cached) return true;
    if (cached.mtime !== row.claude_max_mtime) return true;
    return false;
  });
  if (staleRows.length === 0) {
    const cached = _rows.filter(r => r._from_cache && r.has_claude_history).length;
    const noHist = _rows.filter(r => !r.has_claude_history).length;
    setProgress(100, `Instant: ${cached} from cache · ${noHist} no history · 0 fetched`);
    setTimeout(clearProgress, 2000);
    return;
  }
  // Group by cwd (worktree_path)
  const byPath = {};
  staleRows.forEach(r => {
    (byPath[r.worktree_path] = byPath[r.worktree_path] || []).push(r);
  });
  const paths = Object.keys(byPath);
  const total = paths.length;
  let done = 0;
  const noHistory = _rows.filter(r => !r.has_claude_history).length;
  const fromCache = _rows.filter(r => r._from_cache && r.has_claude_history).length;
  setProgress(0, `Fetching ${total} cwds (${staleRows.length} rows) · ${fromCache} from cache · ${noHistory} no history`);
  const queue = [...paths];
  const workers = Array(4).fill(0).map(async () => {
    while (queue.length) {
      const path = queue.shift();
      const rowsForPath = byPath[path];
      try {
        // Use first row's cache etag as If-None-Match probe (all rows for
        // same cwd share same /api/claude response, hence same etag).
        const probe = cacheGet(rowsForPath[0].id);
        const headers = {};
        if (probe?.etag) headers['If-None-Match'] = probe.etag;
        const r = await fetch('/api/claude?path=' + encodeURIComponent(path), {cache: 'no-store', headers});
        let c = null;
        if (r.status === 304 && probe) {
          c = probe.data;
        } else {
          c = await r.json();
        }
        // Apply to every row sharing this cwd; lookup per-row session by uuid.
        rowsForPath.forEach(row => {
          const liveBefore = row.claude_running_now;
          Object.assign(row, c, {_claude_loaded: true, _from_cache: (r.status === 304)});
          row.claude_running_now = liveBefore;  // keep /api/index per-session value
          const sessions = c.claude_sessions || [];
          const s = (row.session_uuid && sessions.find(x => x.uuid === row.session_uuid)) || sessions[0] || {};
          row._last_msg_text = s.last_message || s.first_message || '';
          row._last_msg_role = s.last_message_role || '';
          row._last_msg_ts = s.last_message_ts || c.claude_last_modified || '';
          row._msg_count = s.msg_count || 0;
          row._age_sec = s.age_sec ?? 9e9;
          row._status_sort = computeStatusSort(row);
          // Persist per-row cache entry (each row.id unique by UUID suffix)
          if (c.claude_max_mtime !== undefined) {
            cacheSet(row.id, {mtime: c.claude_max_mtime, etag: c.etag || (probe?.etag), data: {
              claude_sessions: c.claude_sessions,
              claude_running_now: c.claude_running_now,
              claude_last_modified: c.claude_last_modified,
            }});
          }
        });
      } catch (e) {
        rowsForPath.forEach(row => {
          row._claude_loaded = true;
          row._error = e.message;
        });
      }
      done++;
      setProgress((done / total) * 100, `Fetching cwd (${done}/${total}) · ${rowsForPath.length} rows`);
      if (done % 3 === 0 || done === total) render();
    }
  });
  await Promise.all(workers);
  setProgress(100, `Done · ${total} fetched, ${fromCache} from cache`);
  setTimeout(clearProgress, 2000);
  // Fire-and-forget git_status enrichment — independent of claude data, no
  // SWR cache (fresh on every poll). Errors are tolerated (row._git_status = null).
  enrichGitStatus();
}

async function enrichGitStatus() {
  const rows = [..._rows];
  const queue = [...rows];
  const workers = Array(4).fill(0).map(async () => {
    while (queue.length) {
      const row = queue.shift();
      try {
        const r = await fetch('/api/git-status?path=' + encodeURIComponent(row.worktree_path), {cache: 'no-store'});
        row._git_status = await r.json();
        row._git_dirty_total = (row._git_status.added||0) + (row._git_status.modified||0) + (row._git_status.deleted||0) + (row._git_status.untracked||0);
      } catch (e) {
        row._git_status = {error: e.message};
        row._git_dirty_total = 0;
      }
    }
  });
  await Promise.all(workers);
  render();
}

function clearProgress() {
  document.getElementById('progressBar').style.width = '0%';
  document.getElementById('progressText').textContent = '';
}

function setProgress(pct, label) {
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressText').textContent = label || '';
}

let _msgModalState = null;  // {worktree, session, total, index}
async function openMsgModal(worktree, session, index) {
  const modal = document.getElementById('msgModal');
  document.getElementById('msgModalTitle').textContent = `${session.slice(0,8)} · message ${index}`;
  document.getElementById('msgModalBody').textContent = 'Loading…';
  if (typeof modal.showModal === 'function') modal.showModal(); else modal.setAttribute('open', '');
  try {
    const url = `/api/message?path=${encodeURIComponent(worktree)}&session=${encodeURIComponent(session)}&index=${index}&context=2`;
    const r = await fetch(url, {cache: 'no-store'});
    const d = await r.json();
    if (d.error) {
      document.getElementById('msgModalBody').textContent = `Error: ${d.error}`;
      return;
    }
    _msgModalState = {worktree, session, total: d.total, index};
    renderMsgModal(d);
  } catch (e) {
    document.getElementById('msgModalBody').textContent = `Error: ${e.message}`;
  }
}
function renderMsgModal(d) {
  const body = document.getElementById('msgModalBody');
  body.innerHTML = d.messages.map(m => {
    const isTarget = m.idx === d.target_index;
    return `<div class="msg-block ${isTarget ? 'target' : ''}">
      <span class="msg-role ${m.role}">${m.role}#${m.idx}</span>
      <span class="msg-ts">${escapeHtml(m.ts || '')}</span>
      <div class="msg-text">${escapeHtml(m.text)}</div>
    </div>`;
  }).join('');
  document.getElementById('msgModalPrev').disabled = _msgModalState.index <= 0;
  document.getElementById('msgModalNext').disabled = _msgModalState.index >= _msgModalState.total - 1;
  document.getElementById('msgModalTitle').textContent =
    `${_msgModalState.session.slice(0,8)} · message ${_msgModalState.index} / ${_msgModalState.total - 1}`;
}
async function navMsg(delta) {
  if (!_msgModalState) return;
  const next = _msgModalState.index + delta;
  if (next < 0 || next >= _msgModalState.total) return;
  _msgModalState.index = next;
  const url = `/api/message?path=${encodeURIComponent(_msgModalState.worktree)}&session=${encodeURIComponent(_msgModalState.session)}&index=${next}&context=2`;
  const r = await fetch(url, {cache: 'no-store'});
  const d = await r.json();
  if (!d.error) renderMsgModal(d);
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('msgModalPrev')?.addEventListener('click', () => navMsg(-1));
  document.getElementById('msgModalNext')?.addEventListener('click', () => navMsg(+1));
  document.addEventListener('keydown', (e) => {
    const open = document.getElementById('msgModal')?.open;
    if (!open) return;
    if (e.key === 'ArrowLeft') navMsg(-1);
    if (e.key === 'ArrowRight') navMsg(+1);
  });
});

// Tabulator-backed render. First call builds the table; subsequent calls
// replace data and re-apply filter. Tabulator handles multi-column sort
// natively (Shift+click), virtual DOM, and frozen columns.
//
// Layout variants — switchable via ?layout=A|B|C|D query param for A/B testing:
//   A — fitColumns (squeeze all into viewport, no horizontal scroll)
//   B — fitColumns + responsiveLayout: "collapse" (auto-hide on narrow + expand)
//   C — fitDataStretch + maxWidth/ellipsis on long cells (legacy + truncation)
//   D — fitColumns + responsiveLayout + ellipsis (gibrid, default)
let _tabulator = null;
function _layoutVariant() {
  const v = new URLSearchParams(location.search).get('layout');
  return ['A', 'B', 'C', 'D'].includes(v) ? v : 'A';
}
function buildTabulator() {
  const variant = _layoutVariant();
  const cfg = {
    placeholder: "Scanning worktrees…",
    height: "calc(100vh - 160px)",
    movableColumns: true,
    initialSort: [{column: "_last_msg_ts", dir: "desc"}],
    columns: [
      {title: "Status", field: "_status_sort", width: 100, headerSort: true, sorter: "number",
        // FR-25/FR-26: Status sort by SYNTHETIC numeric field `_status_sort` —
        // computed per row in loadIndex/enrichClaude as composite of priority
        // (LIVE=0, Open=1, idle=2, none=3) × big-number + inverse mtime so
        // within same priority newer-mtime sorts first. Plain numeric sort
        // handles asc/desc clicks natively (Tabulator built-in sorter).
        // Why not custom sorter: Tabulator 6.x custom sorter directional
        // semantics are unreliable when many ties (boolean field tied at false
        // for all non-LIVE rows). Synthetic numeric field avoids the issue.
        formatter(cell) {
        const row = cell.getRow().getData();
        if (!row._claude_loaded) return '<span class="spinner"></span>';
        // FR-25 3-state priority: LIVE > Open > idle/none.
        // Client-side LIVE override: if mtime fresh (<300s) but server response
        // stale-cached with running_now=false → still show LIVE. Closes the
        // 5s cache-lag window where freshly-written JSONL displays as "idle 0m".
        const LIVE_THRESHOLD_SEC = 300;
        const ageS = row.claude_max_mtime ? (Math.floor(Date.now()/1000) - row.claude_max_mtime) : null;
        if (row.claude_running_now || (ageS !== null && ageS >= 0 && ageS < LIVE_THRESHOLD_SEC)) {
          return '<span class="status live">● LIVE</span>';
        }
        if (row.claude_window_open) {
          const pids = (row.claude_window_pids || []).join(',');
          return `<span class="status open" title="Window open · PIDs: ${pids}">💡 Open</span>`;
        }
        if (row.claude_last_modified) {
          const ageMin = Math.floor((Date.now()/1000 - new Date(row.claude_last_modified).getTime()/1000) / 60);
          return `<span class="status idle">idle ${formatIdle(ageMin)}</span>`;
        }
        if (row.claude_max_mtime) {
          const ageMin = Math.floor((Date.now()/1000 - row.claude_max_mtime) / 60);
          return `<span class="status idle">idle ${formatIdle(ageMin)}</span>`;
        }
        return '<span class="status none">—</span>';
      }},
      {title: "Repo", field: "repo", frozen: true, headerSort: true,
        headerFilter: "list",
        headerFilterParams: {valuesLookup: "active", multiselect: true, clearable: true, sort: "asc"},
        headerFilterFunc: "in",
        formatter(cell) {
          const r = cell.getRow().getData();
          // FR-24: orphan rows (cwd not in any git repo) render — placeholder
          if (r.is_orphan) return '<span class="orphan-cell">—</span>';
          return `<span class="repo">${escapeHtml(r.repo)}</span>${r.is_main_worktree ? ' <span style="color:#888">(main)</span>' : ''}`;
      }},
      {title: "Branch", field: "branch", frozen: true, headerSort: true,
        headerFilter: "input",
        headerFilterPlaceholder: "filter branch…",
        formatter(cell) {
          const r = cell.getRow().getData();
          if (r.is_orphan) return '<span class="orphan-cell">—</span>';
          const v = cell.getValue();
          const klass = v === 'main' || v === 'master' ? 'branch main' : 'branch';
          return `<span class="${klass}">${escapeHtml(v)}</span>`;
      }},
      {title: "HEAD", field: "head", width: 90, headerSort: true, responsive: 5, formatter(cell) {
        const r = cell.getRow().getData();
        if (r.is_orphan) return '<span class="orphan-cell">—</span>';
        return `<span class="head">${escapeHtml(cell.getValue() || '')}</span>`;
      }},
      {title: "Worktree path", field: "worktree_path", headerSort: true, responsive: 4, formatter(cell) {
        // responsive: 4 — hide second (long, can be inferred from Repo+Branch)
        const v = cell.getValue() || '';
        return `<span class="path" title="${escapeHtml(v)}">${escapeHtml(v)}</span>`;
      }},
      {title: "Last activity", field: "_last_msg_ts", width: 160, headerSort: true, formatter(cell) {
        const row = cell.getRow().getData();
        if (!row._claude_loaded) return '<span class="loading">…</span>';
        const v = cell.getValue();
        if (!v) return '—';
        // TZ fix: Claude Code writes JSONL timestamps in UTC with Z suffix.
        // Parse and render in user's LOCAL timezone via toLocaleString.
        try {
          const d = new Date(v);
          if (isNaN(d.getTime())) return escapeHtml(v.replace('T', ' ').slice(0, 19));
          const opts = {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false};
          return escapeHtml(d.toLocaleString(navigator.language || 'ru-RU', opts).replace(',', ''));
        } catch (e) {
          return escapeHtml(v.replace('T', ' ').slice(0, 19));
        }
      }},
      {title: "Last message", field: "_last_msg_text", widthGrow: 2, headerSort: true, formatter(cell) {
        const row = cell.getRow().getData();
        if (!row._claude_loaded) return '<span class="loading">scanning JSONL…</span>';
        // FR-26: use row-level _last_msg_role (populated by applyCachedClaude
        // from row's matching session, not always newest). Falls back to
        // legacy claude_sessions[0] if row hasn't been enriched yet.
        const role = row._last_msg_role || (row.claude_sessions || [])[0]?.last_message_role || '';
        const text = cell.getValue() || '';
        return (role ? `<span class="role-${role}">${role}:</span> ` : '') + escapeHtml(text);
      }, cellClick(e, cell) {
        const row = cell.getRow().getData();
        // FR-26: openMsgModal uses row.session_uuid (this row's UUID), not newest.
        const uuid = row.session_uuid || (row.claude_sessions || [])[0]?.uuid;
        if (uuid) openMsgModal(row.worktree_path, uuid, (row._msg_count || 1) - 1);
      }, cssClass: "tabulator-last-msg"},
      {title: "Msgs", field: "_msg_count", width: 70, hozAlign: "right", headerSort: true, responsive: 3, formatter(cell) {
        const row = cell.getRow().getData();
        return row._claude_loaded ? (cell.getValue() ?? '—') : '…';
      }},
      {title: "Git", field: "_git_dirty_total", width: 180, headerSort: true, responsive: 3, formatter(cell) {
        return formatGitStatus(cell.getRow().getData()._git_status);
      }},
      {title: "Action", field: "_action", width: 130, headerSort: false, formatter(cell) {
        const row = cell.getRow().getData();
        // FR-24: stale rows (decoded cwd no longer on disk) — all 3 buttons disabled
        if (row.is_stale) {
          const t = 'Path no longer exists on disk';
          return `
            <button class="act-btn disabled" title="${t}" disabled>▶</button>
            <button class="act-btn disabled" title="${t}" disabled>✨</button>
            <button class="act-btn disabled" title="${t}" disabled>📂</button>
          `;
        }
        // FR-26: Resume uses row.session_uuid (per-row UUID). null for Source C
        // (git worktree, no Claude history) — Resume disabled, Fresh still enabled.
        const uuid = row.session_uuid;
        const canResume = !!uuid;
        const resumeTitle = canResume
          ? `Resume claude --resume ${uuid.slice(0,8)}…`
          : 'No session history — use Fresh to start';
        // onclick attribute MUST be single-quoted: JSON.stringify emits
        // double-quoted strings, so a double-quoted attribute would be closed
        // by the first arg's quote → truncated handler → dead button (every row).
        return `
          <button class="act-btn ${canResume ? '' : 'disabled'}" title="${resumeTitle}"
                  ${canResume ? `onclick='actLaunch(this, ${JSON.stringify(row.worktree_path)}, "resume", ${JSON.stringify(uuid)})'` : 'disabled'}>▶</button>
          <button class="act-btn" title="Fresh claude (no resume) in ${row.worktree_path}"
                  onclick='actLaunch(this, ${JSON.stringify(row.worktree_path)}, "fresh", null)'>✨</button>
          <button class="act-btn" title="Open in VSCode/Cursor (code ${row.worktree_path})"
                  onclick='actVSCode(this, ${JSON.stringify(row.worktree_path)})'>📂</button>
        `;
      }},
    ],
    rowFormatter(row) {
      if (row.getData().claude_running_now) {
        row.getElement().classList.add("row-live");
      }
    },
  };
  // Apply layout variant
  if (variant === 'A') {
    cfg.layout = 'fitColumns';
  } else if (variant === 'B') {
    cfg.layout = 'fitColumns';
    cfg.responsiveLayout = 'collapse';
  } else if (variant === 'C') {
    cfg.layout = 'fitDataStretch';
    // Truncation handled per-column via formatter ellipsis (see CSS .tabulator-cell)
  } else {
    // D — default: fitColumns + responsive collapse
    cfg.layout = 'fitColumns';
    cfg.responsiveLayout = 'collapse';
  }
  document.getElementById('meta').setAttribute('data-layout-variant', variant);
  // Save selected repo filter to localStorage on every change.
  // dataFiltering fires when any header filter changes — extract Repo value
  // and persist. setHeaderFilters/setHeaderFilterValue triggers same event,
  // so restore-on-init also writes itself back (no-op net effect).
  cfg.dataFiltering = function(filters) {
    try {
      const repoFilter = (filters || []).find(f => f.field === 'repo');
      if (repoFilter && Array.isArray(repoFilter.value) && repoFilter.value.length > 0) {
        localStorage.setItem('wtdash_filter_v1_repo', JSON.stringify(repoFilter.value));
      } else {
        localStorage.removeItem('wtdash_filter_v1_repo');
      }
    } catch (e) { /* localStorage may be unavailable (private mode, quota) */ }
  };
  return new Tabulator("#tbl", cfg);
}

function _restoreRepoFilter() {
  try {
    const raw = localStorage.getItem('wtdash_filter_v1_repo');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved) || saved.length === 0) return;
    _tabulator.setHeaderFilterValue('repo', saved);
  } catch (e) {
    try { localStorage.removeItem('wtdash_filter_v1_repo'); } catch {}
  }
}

function render() {
  if (!_tabulator) {
    _tabulator = buildTabulator();
    // Wait for table-built event before first replaceData, otherwise rows are lost
    _tabulator.on("tableBuilt", () => {
      _tabulator.replaceData(_rows);
      applyTabulatorFilter();
      // Restore saved repo filter from previous session (after data is in,
      // because valuesLookup="active" needs rows to enumerate dropdown items).
      _restoreRepoFilter();
    });
    return;
  }
  _tabulator.replaceData(_rows);
  applyTabulatorFilter();
  const meta = document.getElementById('meta');
  if (meta && window._filterQuery) {
    const filtered = _tabulator.getDataCount("active");
    meta.textContent = `${filtered} of ${_rows.length} worktrees (filter: "${window._filterQuery}")`;
  }
}

function applyTabulatorFilter() {
  if (!_tabulator) return;
  const q = (window._filterQuery || '').trim().toLowerCase();
  if (!q) {
    _tabulator.clearFilter();
    return;
  }
  _tabulator.setFilter([
    [
      {field: "repo",            type: "like", value: q},
      {field: "branch",          type: "like", value: q},
      {field: "head",            type: "like", value: q},
      {field: "worktree_path",   type: "like", value: q},
      {field: "_last_msg_text",  type: "like", value: q},
    ],
  ]);
}
function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatIdle(totalMin) {
  // Human-readable idle duration. <60m: "Nm". <24h: "Nh Mm". >=24h: "Nd Hh Mm".
  const m = Math.max(0, Math.floor(totalMin));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h < 24) return mins ? `${h}h ${mins}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hours = h % 24;
  return mins ? `${d}d ${hours}h ${mins}m` : (hours ? `${d}d ${hours}h` : `${d}d`);
}
function formatGitStatus(s) {
  // Compact one-cell git status: "+A ~M -D ?U / ↑K ↓L". Falls back to '…' or '—'.
  if (s === undefined) return '<span class="git-loading">…</span>';
  if (!s || s.error) return '<span class="git-na" title="' + (s?.error || 'unknown') + '">—</span>';
  const dirty = (s.added||0) + (s.modified||0) + (s.deleted||0) + (s.untracked||0);
  const parts = [];
  if (s.added)     parts.push(`<span class="git-add">+${s.added}</span>`);
  if (s.modified)  parts.push(`<span class="git-mod">~${s.modified}</span>`);
  if (s.deleted)   parts.push(`<span class="git-del">-${s.deleted}</span>`);
  if (s.untracked) parts.push(`<span class="git-un">?${s.untracked}</span>`);
  if (dirty === 0) parts.push('<span class="git-clean">clean</span>');
  if (s.ahead)  parts.push(`<span class="git-ahead">↑${s.ahead}</span>`);
  if (s.behind) parts.push(`<span class="git-behind">↓${s.behind}</span>`);
  return parts.join(' ');
}
// Vi-style `/` filter — focuses Tabulator filter input on `/`. Multi-key sort
// is handled by Tabulator natively (Shift+click on column headers).
window._filterQuery = '';
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    if (e.key === 'Escape' && e.target.id === 'filterInput') {
      e.target.value = '';
      window._filterQuery = '';
      e.target.blur();
      if (_tabulator) _tabulator.clearFilter();
    }
    return;
  }
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    const inp = document.getElementById('filterInput');
    if (inp) inp.focus();
  }
});
loadIndex();
setInterval(loadIndex, 30000);

// Refresh on tab focus (Chrome throttles setInterval on hidden tabs)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    setProgress(0, 'Tab focused — refreshing…');
    loadIndex();
  }
});

// Force-clear cache button (for SWR debugging / stale states)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'Backspace') {
    Object.keys(localStorage).filter(k => k.startsWith('wtdash_v')).forEach(k => localStorage.removeItem(k));
    setProgress(0, 'Cache cleared. Reloading…');
    loadIndex();
  }
});

// Action button handlers — v0.3 (Windows Terminal spawn)
async function actLaunch(btn, worktree_path, mode, uuid) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const r = await fetch('/api/launch', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({worktree_path, mode, uuid}),
    });
    const data = await r.json();
    if (!data.ok) {
      alert('Launch failed: ' + (data.error || JSON.stringify(data)));
      btn.textContent = '❌';
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
      return;
    }
    btn.textContent = '✓';
    // v0.3: server spawn-нул detached Windows Terminal окно. Никакой URL не открываем
    // (нет Zellij Web Client). data.method = "wt-spawn-pwsh"|"cmd-fallback-..."|"cached".
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
    // Trigger refresh to update LIVE indicator
    setTimeout(loadIndex, 2000);
  } catch (e) {
    alert('Network error: ' + e.message);
    btn.textContent = '❌';
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  }
}

async function actVSCode(btn, path) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳';
  try {
    const r = await fetch('/api/open-vscode', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({path}),
    });
    const data = await r.json();
    btn.textContent = data.ok ? '✓' : '❌';
    if (!data.ok) alert('VSCode launch failed: ' + (data.error || ''));
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
  } catch (e) {
    btn.textContent = '❌'; alert('Network error: ' + e.message);
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
  }
}
</script>
</body></html>
"""
