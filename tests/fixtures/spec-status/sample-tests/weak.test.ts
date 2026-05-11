// Fixture F-4: WEAK assertions sample
// Sub-agent test quality audit should classify all it() blocks as WEAK
// because assertions are presence-only, not value-level.

import { describe, it, expect } from 'vitest';

function getValue(): unknown {
  return { foo: 'bar' };
}

describe('weak assertions sample', () => {
  it('returns defined value', () => {
    expect(getValue()).toBeDefined(); // WEAK — no value check
  });

  it('returns truthy', () => {
    expect(getValue()).toBeTruthy(); // WEAK — same
  });
});
