"""
Frontend smoke test for session-pilot dashboard HTML/JS.

Why this layer (vs pure backend tests):
- Verify HTML actually contains expected elements (4 buttons per row,
  Tabulator placeholder, modal markup if v0.2)
- Verify ZELLIJ_WEB_URL_JS template substitution applied at server-render
- Verify localStorage cache key prefix correct (wtdash_v3_*)
- Verify visibilitychange and Ctrl+Shift+Backspace JS hooked up

What's NOT covered (deferred):
- Real button click → POST /api/launch round-trip — requires Playwright /
  Selenium / claude-in-chrome MCP. Skill scenario 2 covers this manually.

Approach: curl HTML, parse with regex, assert structural invariants.
Lighter than Playwright; sufficient for v0.1.0 ship.
"""

import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

SERVER = os.environ.get("SP_SERVER", "http://localhost:8083")


def _get_html() -> str:
    with urllib.request.urlopen(SERVER + "/", timeout=10) as resp:
        assert resp.status == 200
        return resp.read().decode("utf-8")


# ---------- structural assertions ----------

def test_html_renders_with_doctype_and_title():
    html = _get_html()
    assert "<!doctype html>" in html.lower(), "missing doctype"
    assert "<title>Worktree Dashboard</title>" in html, "title missing"


def test_no_legacy_zellij_template_placeholders():
    """v0.3: __ZELLIJ_WEB_URL__ placeholder and ZELLIJ_WEB_URL_JS const removed."""
    html = _get_html()
    assert "__ZELLIJ_WEB_URL__" not in html, "legacy template placeholder leaked"
    assert "ZELLIJ_WEB_URL_JS" not in html, "legacy JS const leaked"


def test_action_column_renders_3_buttons_template():
    """v0.3: Action column has 3 buttons [▶ Resume] [✨ Fresh] [📂 VSCode]. No 🪟 Zellij."""
    html = _get_html()
    for glyph, name in [("▶", "Resume"), ("✨", "Fresh"), ("📂", "VSCode")]:
        assert glyph in html, f"button glyph {glyph} for {name} missing in rendered HTML"
    assert "🪟" not in html, "v0.3 dropped Zellij Web button — 🪟 glyph must not appear"


def test_action_handlers_actLaunch_and_actVSCode_defined():
    """JS must define actLaunch + actVSCode handlers for buttons."""
    html = _get_html()
    assert "function actLaunch" in html or "async function actLaunch" in html, (
        "actLaunch handler missing"
    )
    assert "function actVSCode" in html or "async function actVSCode" in html, (
        "actVSCode handler missing"
    )


def test_localstorage_cache_key_prefix():
    """SWR cache key prefix must be 'wtdash_v3_' (FR-14)."""
    html = _get_html()
    assert "wtdash_v3_" in html, "localStorage cache key prefix missing"


def test_visibility_listener_present():
    """visibilitychange listener — refreshes on tab focus (FR-14, Phase 3b)."""
    html = _get_html()
    assert "visibilitychange" in html, "visibilitychange listener missing"


def test_cache_clear_keyboard_shortcut():
    """Ctrl+Shift+Backspace clears cache (debug aid)."""
    html = _get_html()
    assert "Backspace" in html and "ctrlKey" in html and "shiftKey" in html, (
        "Ctrl+Shift+Backspace cache-clear shortcut not wired up"
    )


def test_progress_bar_elements_present():
    """Progress bar DOM nodes for long enrichment ops (user-requested feature)."""
    html = _get_html()
    assert "progressBar" in html, "progressBar element missing"
    assert "progressText" in html, "progressText element missing"


def test_table_target_element():
    """Table has #tbl id for JS render target."""
    html = _get_html()
    assert 'id="tbl"' in html, "#tbl table element missing"


def test_refresh_button_calls_loadIndex():
    """Refresh button click triggers hardReload() / loadIndex()."""
    html = _get_html()
    assert "Refresh" in html, "Refresh button text missing"
    # Either hardReload or loadIndex must be in the click handler chain
    assert ("hardReload" in html) or ("loadIndex" in html), (
        "no reload function bound"
    )


def test_no_unescaped_template_placeholders():
    """No `__FOO__` placeholder syntax should leak into rendered HTML."""
    html = _get_html()
    placeholders = re.findall(r"__[A-Z][A-Z_]+__", html)
    assert not placeholders, (
        f"unsubstituted template placeholders leaked: {set(placeholders)!r}"
    )


def test_html_includes_meta_charset_utf8():
    html = _get_html()
    assert 'charset="utf-8"' in html.lower() or "charset='utf-8'" in html.lower(), (
        "missing meta charset utf-8"
    )


def test_action_button_onclick_uses_single_quoted_attribute():
    """Regression — dashboard Action buttons were dead (▶ ✨ 📂 did nothing).

    The onclick handlers embed ${JSON.stringify(row.worktree_path)}, which emits a
    DOUBLE-quoted JS string. If the onclick ATTRIBUTE is also double-quoted, the
    first arg's quote closes the attribute early -> the browser parses onclick as
    just `actLaunch(this, ` -> SyntaxError on click -> every button silently no-ops.
    The attribute MUST be single-quoted. Read from source (no server needed).
    """
    src = (Path(__file__).resolve().parents[1] / "frontend.py").read_text(encoding="utf-8")
    assert 'onclick="actLaunch' not in src, (
        "actLaunch onclick must be single-quoted ('...'): double quotes collide with "
        "the JSON.stringify() argument and truncate the handler"
    )
    assert 'onclick="actVSCode' not in src, (
        "actVSCode onclick must be single-quoted ('...'): double quotes collide with "
        "the JSON.stringify() argument and truncate the handler"
    )
    assert "onclick='actLaunch" in src, "actLaunch button not wired with single-quoted onclick"
    assert "onclick='actVSCode" in src, "actVSCode button not wired with single-quoted onclick"


if __name__ == "__main__":
    failed = 0
    for k, v in list(globals().items()):
        if k.startswith("test_") and callable(v):
            try:
                v()
                print(f"PASS {k}")
            except AssertionError as e:
                print(f"FAIL {k}: {e}")
                failed += 1
            except Exception as e:
                print(f"ERROR {k}: {type(e).__name__}: {e}")
                failed += 1
    sys.exit(1 if failed else 0)
