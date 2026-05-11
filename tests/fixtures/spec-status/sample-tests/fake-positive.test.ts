// Fixture F-6: FAKE-POSITIVE-RISK assertions sample
// Sub-agent test quality audit should classify both it() blocks as FAKE-POSITIVE-RISK:
//   - top-level vi.mock for production path
//   - tautology assertion expect(true).toBe(true)

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/critical-parser.ts'); // mocks production path — fake-positive risk

describe('fake-positive sample', () => {
  it('tautology', () => {
    expect(true).toBe(true); // tautology — always passes
  });
});
