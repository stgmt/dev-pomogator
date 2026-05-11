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
let _rows = [];          // current row state
let _wtById = {};        // id -> row reference

async function hardReload() {
  // Force re-fetch ignoring cache. Server itself caches 5/8s; we just retry.
  loadIndex();
}

// SWR-style cache in localStorage. Keyed by row.id, stores:
//   { mtime: <claude_max_mtime>, etag: 'W/"…"', data: {claude_sessions, claude_running_now, claude_last_modified} }
const CACHE_KEY_PREFIX = 'wtdash_v3_';

function cacheGet(id) {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY_PREFIX + id) || 'null'); }
  catch { return null; }
}
function cacheSet(id, entry) {
  try { localStorage.setItem(CACHE_KEY_PREFIX + id, JSON.stringify(entry)); } catch {}
}

function applyCachedClaude(row) {
  const cached = cacheGet(row.id);
  if (!cached) return false;
  const c = cached.data;
  Object.assign(row, c, {_claude_loaded: true, _from_cache: true, _cached_etag: cached.etag});
  const top = (c.claude_sessions || [])[0] || {};
  row._last_msg_text = top.last_message || top.first_message || '';
  row._last_msg_role = top.last_message_role || '';
  row._last_msg_ts = top.last_message_ts || c.claude_last_modified || '';
  row._msg_count = top.msg_count || 0;
  row._age_sec = top.age_sec ?? 9e9;
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
    // Init rows. Pull data from cache instantly per row.
    _rows = data.rows.map(r => {
      const merged = Object.assign({}, r, {
        claude_sessions: [],
        claude_running_now: false,
        claude_last_modified: null,
        _claude_loaded: false,
      });
      // Rows without Claude history are "loaded" immediately — nothing to fetch
      if (!r.has_claude_history) merged._claude_loaded = true;
      applyCachedClaude(merged); // fills from localStorage if available
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
  // SWR: skip rows whose server-reported mtime matches our cached mtime AND we have data
  const stale = _rows.filter(row => {
    if (!row.has_claude_history) return false;            // never had Claude — skip
    const cached = cacheGet(row.id);
    if (!cached) return true;                              // no cache — must fetch
    if (cached.mtime !== row.claude_max_mtime) return true;// changed — must fetch
    return false;                                          // cache fresh, skip
  });
  const total = stale.length;
  if (total === 0) {
    const cached = _rows.filter(r => r._from_cache && r.has_claude_history).length;
    const noHist = _rows.filter(r => !r.has_claude_history).length;
    setProgress(100, `Instant: ${cached} from cache · ${noHist} no history · 0 fetched`);
    setTimeout(clearProgress, 2000);
    return;
  }
  let done = 0;
  // Compute real categories
  const totalRows = _rows.length;
  const noHistory = _rows.filter(r => !r.has_claude_history).length;
  const fromCache = _rows.filter(r => r._from_cache && r.has_claude_history).length;
  setProgress(0, `Fetching ${total} stale · ${fromCache} from cache · ${noHistory} no history`);
  const queue = [...stale];
  const workers = Array(4).fill(0).map(async () => {
    while (queue.length) {
      const row = queue.shift();
      try {
        const cached = cacheGet(row.id);
        const headers = {};
        if (cached?.etag) headers['If-None-Match'] = cached.etag;
        const r = await fetch('/api/claude?path=' + encodeURIComponent(row.worktree_path), {cache: 'no-store', headers});
        if (r.status === 304 && cached) {
          // Server confirmed: nothing changed. Just use cache.
          applyCachedClaude(row);
        } else {
          const c = await r.json();
          Object.assign(row, c, {_claude_loaded: true, _from_cache: false});
          const top = (c.claude_sessions || [])[0] || {};
          row._last_msg_text = top.last_message || top.first_message || '';
          row._last_msg_role = top.last_message_role || '';
          row._last_msg_ts = top.last_message_ts || c.claude_last_modified || '';
          row._msg_count = top.msg_count || 0;
          row._age_sec = top.age_sec ?? 9e9;
          // Persist
          cacheSet(row.id, {mtime: c.claude_max_mtime, etag: c.etag, data: {
            claude_sessions: c.claude_sessions,
            claude_running_now: c.claude_running_now,
            claude_last_modified: c.claude_last_modified,
          }});
        }
      } catch (e) {
        row._claude_loaded = true;
        row._error = e.message;
      }
      done++;
      setProgress((done / total) * 100, `Fetching (${done}/${total}) · ${fromCache} from cache · ${noHistory} no history`);
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
      {title: "Status", field: "claude_running_now", width: 100, headerSort: true, formatter(cell) {
        const row = cell.getRow().getData();
        if (!row._claude_loaded) return '<span class="spinner"></span>';
        if (row.claude_running_now) return '<span class="status live">● LIVE</span>';
        if (row.claude_last_modified) {
          const ageMin = Math.floor((Date.now()/1000 - new Date(row.claude_last_modified).getTime()/1000) / 60);
          return `<span class="status idle">idle ${formatIdle(ageMin)}</span>`;
        }
        return '<span class="status none">—</span>';
      }},
      {title: "Repo", field: "repo", frozen: true, headerSort: true,
        headerFilter: "list",
        // Tabulator 6.x: multiselect взаимно исключает autocomplete/listOnEmpty/placeholderEmpty.
        // Берём чистый multiselect — список репо короткий, поиск-по-буквам не нужен.
        headerFilterParams: {valuesLookup: "active", multiselect: true, clearable: true, sort: "asc"},
        headerFilterFunc: "in",
        formatter(cell) {
          const r = cell.getRow().getData();
          return `<span class="repo">${escapeHtml(r.repo)}</span>${r.is_main_worktree ? ' <span style="color:#888">(main)</span>' : ''}`;
      }},
      {title: "Branch", field: "branch", frozen: true, headerSort: true,
        headerFilter: "input",
        headerFilterPlaceholder: "filter branch…",
        formatter(cell) {
          const v = cell.getValue();
          const klass = v === 'main' || v === 'master' ? 'branch main' : 'branch';
          return `<span class="${klass}">${escapeHtml(v)}</span>`;
      }},
      {title: "HEAD", field: "head", width: 90, headerSort: true, responsive: 5, formatter(cell) {
        // responsive: 5 — hide first when viewport narrows (short hash, low info-density)
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
        const top = (row.claude_sessions || [])[0] || {};
        const role = top.last_message_role || '';
        const text = cell.getValue() || '';
        return (role ? `<span class="role-${role}">${role}:</span> ` : '') + escapeHtml(text);
      }, cellClick(e, cell) {
        const row = cell.getRow().getData();
        const top = (row.claude_sessions || [])[0];
        if (top?.uuid) openMsgModal(row.worktree_path, top.uuid, (top.msg_count || 1) - 1);
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
        const top = (row.claude_sessions || [])[0];
        const uuid = top?.uuid;
        const canResume = !!uuid;
        return `
          <button class="act-btn ${canResume ? '' : 'disabled'}" title="Resume claude --resume ${uuid?.slice(0,8) || '?'}…"
                  ${canResume ? `onclick="actLaunch(this, ${JSON.stringify(row.worktree_path)}, 'resume', ${JSON.stringify(uuid)})"` : 'disabled'}>▶</button>
          <button class="act-btn" title="Fresh claude (no resume) in ${row.worktree_path}"
                  onclick="actLaunch(this, ${JSON.stringify(row.worktree_path)}, 'fresh', null)">✨</button>
          <button class="act-btn" title="Open in VSCode/Cursor (code ${row.worktree_path})"
                  onclick="actVSCode(this, ${JSON.stringify(row.worktree_path)})">📂</button>
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
    Object.keys(localStorage).filter(k => k.startsWith('wtdash_v3_')).forEach(k => localStorage.removeItem(k));
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
