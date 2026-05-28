# Acceptance Criteria (EARS)

## AC-1 (FR-1): Verified — has test evidence

WHEN feature triggered THEN system SHALL produce expected output. Evidence: `tests/e2e/mock-feature-a.test.ts:42`.

## AC-2 (FR-2): Verified — has commit evidence

WHEN condition met THEN system SHALL log event. Evidence: commit abc1234 line 18.

## AC-3 (FR-3): Verified — has smoke evidence

WHEN user invokes command THEN output emitted. Evidence: manual smoke recorded in PR #99.

## AC-4 (FR-4): Claimed-only (no evidence path provided)

WHEN error occurs THEN system SHALL retry 3 times. No evidence file/test/commit referenced.

## AC-5 (FR-5): Claimed-only

WHEN feature flag enabled THEN behavior X applies. No evidence link.
