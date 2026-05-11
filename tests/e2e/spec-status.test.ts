import { describe, it } from 'vitest';

// HSCMD001 — Honest Spec Status Command
// Integration tests для /spec-status slash command.
// Spec: .specs/honest-status-command/ (v0.1.0)
// Feature: tests/features/spec-status.feature (mirror)
//
// Phase 0 (Red): each it() throws "not implemented" — scenarios FAIL.
// Phase 1+ implementation gradually переводит each scenario Red → Green per TASKS.md.

describe('HSCMD001: Honest Spec Status Command', () => {
  // @feature1
  it('HSCMD001_01: AI proactive invocation auto-detects active spec + delegates to sub-agent', () => {
    throw new Error(
      'Not implemented — Phase 1 (autodetect) + Phase 2 (sub-agent invocation) required. ' +
        'See .specs/honest-status-command/TASKS.md T-1.2, T-1.3, T-2.1..T-2.3.',
    );
  });

  // @feature2
  it('HSCMD001_02: User explicit invocation flags AC as claimed-only when no evidence', () => {
    throw new Error(
      'Not implemented — Phase 3 (AC evidence classification) required. ' +
        'See .specs/honest-status-command/TASKS.md T-3.2 (FR-4).',
    );
  });

  // @feature3
  it('HSCMD001_03: Environmental blocker — Docker unreachable separated from test failures', () => {
    throw new Error(
      'Not implemented — Phase 4 (environmental blocker detection) required. ' +
        'See .specs/honest-status-command/TASKS.md T-4.1, T-4.2 (FR-5, FR-8).',
    );
  });

  // @feature4
  it('HSCMD001_04: Sub-agent flags weak test bodies as fake-positive risk', () => {
    throw new Error(
      'Not implemented — Phase 3 (test body quality audit) required. ' +
        'See .specs/honest-status-command/TASKS.md T-3.1 (FR-6).',
    );
  });
});
