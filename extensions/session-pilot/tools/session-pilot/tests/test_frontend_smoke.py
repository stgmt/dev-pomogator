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


def test_zellij_web_url_template_substituted_not_placeholder():
    """ZELLIJ_WEB_URL_JS must be substituted server-side, NOT raw __ZELLIJ_WEB_URL__."""
    html = _get_html()
    assert "__ZELLIJ_WEB_URL__" not in html, (
        "Template placeholder __ZELLIJ_WEB_URL__ leaked unsubstituted"
    )
    # Must have substituted value as JS const
    m = re.search(r"const ZELLIJ_WEB_URL_JS = ['\"]([^'\"]+)['\"]", html)
    assert m, "ZELLIJ_WEB_URL_JS const not found in HTML"
    url = m.group(1)
    assert url.startswith("http"), f"substituted URL not http(s): {url!r}"


def test_action_column_renders_4_buttons_template():
    """Frontend code must reference 4 button glyphs [▶][✨][📂][🪟]."""
    html = _get_html()
    for glyph, name in [("▶", "Resume"), ("✨", "Fresh"), ("📂", "VSCode"), ("🪟", "Zellij")]:
        assert glyph in html, f"button glyph {glyph} for {name} missing in rendered HTML"


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
