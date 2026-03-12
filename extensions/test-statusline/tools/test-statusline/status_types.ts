/**
 * YAML Status File Protocol — flat fields for statusline_render.sh
 * Canonical schema: extensions/tui-test-runner/tools/tui-test-runner/adapters/types.ts (TestStatusV2)
 * This file documents the minimal contract; statusline reads flat top-level fields only.
 */

export interface TestSuite {
  name: string;
  status: 'running' | 'passed' | 'failed';
  passed: number;
  failed: number;
  total: number;
}

/** Flat top-level fields read by statusline_render.sh from canonical status v2 YAML. */
export interface TestStatus {
  version: 2;
  session_id: string;
  /** Required for stale-process repair. */
  pid: number;
  started_at: string;
  updated_at: string;
  state: 'idle' | 'running' | 'passed' | 'failed' | 'error';
  framework: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  running: number;
  percent: number;
  duration_ms: number;
  error_message: string;
  log_file: string;
  suites?: TestSuite[];
}

export interface HookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
}
