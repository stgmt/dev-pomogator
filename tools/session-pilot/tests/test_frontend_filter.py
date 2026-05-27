"""
Frontend tests for header-filter feature (Repo multiselect + Branch input).

Three classes of tests:

  FILT_01  positive:  Repo column declares list+multiselect headerFilter
  FILT_02  positive:  Branch column declares input headerFilter
  FILT_03  invariant: no invalid Tabulator option combinations leak into HTML
                      (multiselect+autocomplete, listOnEmpty/placeholderEmpty
                      without autocomplete — Tabulator emits config-error
                      warnings and silently drops the offending option,
                      meaning filter degrades to single-select even though
                      author wrote `multiselect: true`).

The last class is the output-invariant test promised in
.claude/rules/testing/output-invariants-first.md: instead of testing each
option in isolation, it tests the *combination space* — pattern that
catches the exact regression I just dug myself out of (multiselect+autocomplete
combo silently degraded to single-select without throwing).

Approach: read frontend.py source directly (no live server needed) and
parse the embedded JS Tabulator config. Lighter than spinning up the
server + headless browser; sufficient because we're testing the static
content the server hands out.
"""

import re
import sys
from pathlib import Path

SP_TOOLS = Path(__file__).resolve().parent.parent
FRONTEND_PY = SP_TOOLS / "frontend.py"


def _load_html_template() -> str:
    """Return the JS template embedded in frontend.py.

    frontend.py builds the HTML response by interpolating into a heredoc.
    We don't need server-side rendering — the Tabulator config is static
    JavaScript inside that template, so a substring grep is enough.
    """
    return FRONTEND_PY.read_text(encoding="utf-8")


def _extract_column_config(html: str, column_title: str) -> str:
    """Return the substring covering one column's config block.

    Each column is declared as `{title: "Foo", ...}`. We grab the
    block starting at title and ending at the matching closing `}}`
    pair (rough but adequate for asserting headerFilter options).
    """
    needle = f'title: "{column_title}"'
    start = html.find(needle)
    if start < 0:
        raise AssertionError(f'Column "{column_title}" not found in frontend.py')
    # Look 800 chars ahead — enough for column block, short enough to
    # avoid spilling into next column.
    return html[start: start + 800]


# ---------- FILT_01 — Repo multiselect filter ----------

def test_FILT_01_repo_column_has_multiselect_list_filter():
    """Repo column must declare list+multiselect+'in' filter combo."""
    cfg = _extract_column_config(_load_html_template(), "Repo")
    assert 'headerFilter: "list"' in cfg, (
        f'Repo column missing headerFilter: "list".\nGot: {cfg[:300]}'
    )
    assert "multiselect: true" in cfg, (
        f'Repo column missing multiselect: true.\nGot: {cfg[:300]}'
    )
    # Tabulator 6.x: with async data (replaceData after init), `values: true` doesn't
    # populate dropdown — must use valuesLookup ("active" reads current table contents).
    assert "valuesLookup:" in cfg, (
        f"Repo column missing valuesLookup — dropdown won't populate with async data.\nGot: {cfg[:300]}"
    )
    assert 'headerFilterFunc: "in"' in cfg, (
        f'Repo column missing headerFilterFunc: "in" — multiselect requires "in" matcher.\nGot: {cfg[:300]}'
    )


# ---------- FILT_02 — Branch input filter ----------

def test_FILT_02_branch_column_has_input_filter():
    """Branch column must declare a text-input headerFilter."""
    cfg = _extract_column_config(_load_html_template(), "Branch")
    assert 'headerFilter: "input"' in cfg, (
        f'Branch column missing headerFilter: "input".\nGot: {cfg[:300]}'
    )


# ---------- FILT_03 — invariant on Tabulator filter option combinations ----------

# Each entry: (bad_combo_pattern, why_invalid)
INVALID_TABULATOR_FILTER_COMBOS = [
    (
        # multiselect + autocomplete — Tabulator 6.x silently drops multiselect,
        # filter degrades to single-select.
        re.compile(r"multiselect:\s*true[^}]*autocomplete:\s*true", re.DOTALL),
        "multiselect:true cannot coexist with autocomplete:true (Tabulator drops multiselect, "
        "user can't select multiple repos)",
    ),
    (
        re.compile(r"autocomplete:\s*true[^}]*multiselect:\s*true", re.DOTALL),
        "same as above — order-agnostic check",
    ),
]


# Options that REQUIRE autocomplete to function — if present without
# autocomplete:true, Tabulator emits a warning and ignores the option.
# We assert: every occurrence of these options must be inside a config
# block that also has autocomplete:true.
OPTIONS_REQUIRING_AUTOCOMPLETE = ["listOnEmpty", "placeholderEmpty", "placeholderLoading", "freetext"]


def _all_header_filter_param_blocks(html: str):
    """Return every `headerFilterParams: {...}` block as a string."""
    matches = []
    for m in re.finditer(r"headerFilterParams:\s*\{", html):
        start = m.end()
        depth = 1
        i = start
        while i < len(html) and depth > 0:
            if html[i] == "{":
                depth += 1
            elif html[i] == "}":
                depth -= 1
            i += 1
        matches.append(html[start: i - 1])
    return matches


def test_FILT_03_no_invalid_tabulator_filter_option_combos():
    """For every Tabulator headerFilterParams block in the frontend,
    none of the known-broken combinations may appear, and any option that
    requires autocomplete must be paired with autocomplete:true.

    This is the invariant test from output-invariants-first.md applied to
    Tabulator config: instead of asserting one option at a time, we assert
    the *combination space* — which is exactly where Tabulator 6.x warnings
    fire and options silently degrade.
    """
    html = _load_html_template()
    blocks = _all_header_filter_param_blocks(html)
    assert len(blocks) > 0, "No headerFilterParams blocks found — no filters configured at all"

    for block in blocks:
        # 1. Forbidden combinations
        for pat, why in INVALID_TABULATOR_FILTER_COMBOS:
            assert not pat.search(block), (
                f"Invalid Tabulator filter combination in block:\n  {block.strip()[:200]}\n"
                f"Reason: {why}"
            )

        # 2. Options that need autocomplete
        has_autocomplete = re.search(r"autocomplete:\s*true", block)
        for opt in OPTIONS_REQUIRING_AUTOCOMPLETE:
            if re.search(rf"{opt}:\s*(true|['\"])", block):
                assert has_autocomplete, (
                    f'Option "{opt}" used without autocomplete:true in block:\n  '
                    f'{block.strip()[:200]}\n'
                    f'Tabulator 6.x emits warning "{opt} option is only available when '
                    f'autocomplete is enabled" and drops the option.'
                )


def test_FILT_04_repo_filter_persists_to_localstorage():
    """Selected repo filter must survive page refresh.

    Asserts the frontend code contains both save-on-change and
    restore-on-init paths against localStorage key wtdash_filter_v1_repo.
    Without this, user has to re-select repos every time they F5.

    This is a static HTML smoke test — full round-trip is verified via
    Claude-in-Chrome MCP browser test (see manual verification step).
    """
    html = _load_html_template()
    # Save path — must reference localStorage and the versioned key
    assert "wtdash_filter_v1_repo" in html, (
        "localStorage key 'wtdash_filter_v1_repo' missing from HTML — filter won't persist"
    )
    assert "localStorage.setItem" in html, "no localStorage.setItem call in HTML"
    # Restore path — must read on init and apply via setHeaderFilterValue
    assert "localStorage.getItem" in html, "no localStorage.getItem call in HTML"
    assert "setHeaderFilterValue" in html, (
        "setHeaderFilterValue call missing — filter loaded from localStorage won't apply to Tabulator"
    )


if __name__ == "__main__":
    failed = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                print(f"FAIL {name}: {e}")
                failed += 1
            except Exception as e:
                print(f"ERROR {name}: {type(e).__name__}: {e}")
                failed += 1
    sys.exit(1 if failed else 0)
