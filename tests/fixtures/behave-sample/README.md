# behave sample NDJSON fixture

Test fixture for `tests/e2e/multilang-ingest-roundtrip.test.ts` (FR-31, AC-31.1/2).

## Status: **handcrafted to schema**

This fixture is **handcrafted** to the canonical `@cucumber/messages` NDJSON
envelope schema (protocol version 32.2.0). It is **not** the live output of a
real `behave` process on the CI runner, because:

- `behave` did not gain a first-party Cucumber-Messages formatter until late
  in its development cycle (the `behave.formatter.cucumber_messages` adapter
  is still tracked as community work in upstream issues). A vendored adapter
  would add a Python sub-project just for one fixture.
- CI hosts are not guaranteed to have a Python interpreter with `behave`
  installed; FR-31 mandates the fixture must ship as committed bytes, not as
  a generation script that depends on a runtime.

The fixture is, however, **schema-correct** — every envelope conforms to the
canonical `@cucumber/messages` shape, and `meta.implementation.name = "behave"`
so `detectRunner()` returns `'behave'` per
`tools/spec-graph/parsers/multilang.ts:50`.

## Expected scenarios

| pickle id            | name                  | status  |
| -------------------- | --------------------- | ------- |
| `pk-add-item`        | Add item to cart      | PASSED  |
| `pk-coupon-expired`  | Apply expired coupon  | FAILED  |

Failing step error message includes
`AssertionError: Expected request to be refused, got HTTP 200`.

## Regeneration with a real behave runner (optional)

If you want to refresh this fixture from a real `behave` project, the
recipe is:

```bash
# 1. Install behave with the messages formatter adapter
pip install behave==1.2.7.dev6
pip install behave-messages-formatter  # community adapter

# 2. Create a minimal project:
#    features/checkout.feature   — same content as the fixture
#    features/steps/checkout_steps.py — @given/@when/@then for the 6 steps

# 3. Run with the messages formatter
behave -f cucumber_messages -o output.ndjson features/

# 4. Copy output.ndjson to this directory.
```

Runner command + version used to assemble the schema reference:

- **behave** 1.2.7.dev6 (https://pypi.org/project/behave/)
- **CPython** 3.13.7
- **Cucumber Messages protocol** 32.2.0

The handcrafted fixture mirrors the envelope sequence that the
`cucumber_messages` formatter would emit; if behave gains a built-in
`messages` formatter and the field shapes drift, this fixture will need
re-syncing.
