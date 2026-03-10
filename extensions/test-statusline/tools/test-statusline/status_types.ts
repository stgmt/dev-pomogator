/**
 * YAML Status File Protocol v1
 * Contract between test_runner_wrapper.sh and statusline_render.sh
 */

export interface TestSuite {
  name: string;
  status: 'running' | 'passed' | 'failed';
  passed: number;
  failed: number;
  total: number;
}

export interface TestStatus {
  version: number;
  session_id: string;
  started_at: string;
  updated_at: string;
  state: 'idle' | 'running' | 'passed' | 'failed' | 'error';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  running: number;
  percent: number;
  duration_ms: number;
  error_message: string;
  suites?: TestSuite[];
}

export interface HookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
}
