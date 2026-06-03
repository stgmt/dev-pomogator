// Tests for the real-marksman e2e skip policy (FR-7). The 'fail' case is the
// important one: it proves the guard FIRES when Docker lacks the binary, so a
// silent skip can never masquerade as a passing real e2e.

import { describe, it, expect } from 'vitest';
import { decideE2e, e2eEnvFromProcess } from '../skip-policy.ts';

describe('decideE2e', () => {
  it("runs when the binary is present (regardless of Docker)", () => {
    expect(decideE2e({ haveBinary: true, inDocker: true })).toBe('run');
    expect(decideE2e({ haveBinary: true, inDocker: false })).toBe('run');
  });

  it("skips on a dev box / host without the binary", () => {
    expect(decideE2e({ haveBinary: false, inDocker: false })).toBe('skip');
  });

  it("FAILS (guard fires) when inside Docker but the binary is absent", () => {
    expect(decideE2e({ haveBinary: false, inDocker: true })).toBe('fail');
  });
});

describe('e2eEnvFromProcess', () => {
  it('reads binary path + Docker marker from env', () => {
    const exists = (p: string): boolean => p === '/usr/local/bin/marksman';
    const present = e2eEnvFromProcess(exists, {
      DEV_POMOGATOR_MARKSMAN_BIN: '/usr/local/bin/marksman',
      DEV_POMOGATOR_TEST_IN_DOCKER: '1',
    });
    expect(present).toEqual({ haveBinary: true, inDocker: true });

    const missing = e2eEnvFromProcess(exists, { DEV_POMOGATOR_TEST_IN_DOCKER: '1' });
    expect(missing).toEqual({ haveBinary: false, inDocker: true });
    expect(decideE2e(missing)).toBe('fail');
  });
});
