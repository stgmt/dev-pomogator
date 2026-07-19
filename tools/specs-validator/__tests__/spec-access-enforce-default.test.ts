/**
 * FR-39 — `enforceEnabled` honours the manifest default.
 *
 * Regression guard for the phantom-default bug: `plugin.json` declares
 * `userConfig.spec_access_enforce.default: true` ("When ON (default)"), but Claude Code
 * exports `CLAUDE_PLUGIN_OPTION_*` ONLY for options the user explicitly touched at enable
 * time. The old opt-in form (`onish(a) || onish(b) || onish(c)`) therefore evaluated to
 * `false` on every installation that never hand-edited settings.json, so the guard ran
 * shadow-only forever. Field evidence before the fix (lm-saas, one week of real sessions):
 * 525 `shadow` decisions, 0 `denied`.
 *
 * Contract asserted here: UNSET -> ON; OFF requires an EXPLICIT false/0; the first DEFINED
 * source wins, so a deliberate opt-out is never resurrected by a later source.
 *
 * Pure function, no I/O — env is injected, `process.env` is never touched.
 */
import { describe, it, expect } from 'vitest';
import { enforceEnabled } from '../spec-access-guard';

describe('enforceEnabled — manifest default', () => {
  it('is ON when no source is set (the bug: used to be OFF)', () => {
    expect(enforceEnabled({})).toBe(true);
  });

  it('is ON when sources are present but empty/unparsable', () => {
    expect(enforceEnabled({ SPEC_ACCESS_ENFORCE: '' })).toBe(true);
    expect(enforceEnabled({ SPEC_ACCESS_ENFORCE: '   ' })).toBe(true);
    expect(enforceEnabled({ SPEC_ACCESS_ENFORCE: 'maybe' })).toBe(true);
  });
});

describe('enforceEnabled — explicit values', () => {
  it('accepts true/1 and false/0, case- and space-insensitively', () => {
    for (const on of ['true', '1', 'TRUE', ' true ']) {
      expect(enforceEnabled({ SPEC_ACCESS_ENFORCE: on })).toBe(true);
    }
    for (const off of ['false', '0', 'FALSE', ' false ']) {
      expect(enforceEnabled({ SPEC_ACCESS_ENFORCE: off })).toBe(false);
    }
  });

  it('honours the plugin toggle in both casings', () => {
    expect(enforceEnabled({ CLAUDE_PLUGIN_OPTION_spec_access_enforce: 'false' })).toBe(false);
    expect(enforceEnabled({ CLAUDE_PLUGIN_OPTION_SPEC_ACCESS_ENFORCE: 'false' })).toBe(false);
    expect(enforceEnabled({ CLAUDE_PLUGIN_OPTION_spec_access_enforce: 'true' })).toBe(true);
  });
});

describe('enforceEnabled — precedence', () => {
  it('first DEFINED source wins: an explicit opt-out is not overridden by a later ON', () => {
    expect(
      enforceEnabled({
        SPEC_ACCESS_ENFORCE: 'false',
        CLAUDE_PLUGIN_OPTION_spec_access_enforce: 'true',
      }),
    ).toBe(false);
  });

  it('an unparsable earlier source falls through to a defined later one', () => {
    expect(
      enforceEnabled({
        SPEC_ACCESS_ENFORCE: 'yes-please',
        CLAUDE_PLUGIN_OPTION_spec_access_enforce: 'false',
      }),
    ).toBe(false);
  });
});
