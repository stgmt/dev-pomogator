/**
 * YAML Status Protocol v2 — extends v1 from test-statusline
 * Contract between framework adapters, yaml_writer, and Python TUI
 *
 * v1 fields preserved for backward compat with statusline_render.sh
 */

// Re-export v1 types for reference
export interface TestSuiteV1 {
  name: string;
  status: 'running' | 'passed' | 'failed';
  passed: number;
  failed: number;
  total: number;
}

export interface TestStatusV1 {
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
  suites?: TestSuiteV1[];
}

// --- v2 extensions ---

export type TestFramework = 'vitest' | 'jest' | 'pytest' | 'dotnet' | 'rust' | 'go' | 'unknown';

export interface TestResultV2 {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  duration_ms?: number;
  error?: string;
  stack?: string;
}

export interface TestSuiteV2 {
  name: string;
  file?: string;
  status: 'running' | 'passed' | 'failed';
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration_ms: number;
  tests: TestResultV2[];
}

export interface PhaseV2 {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at?: string;
  duration_ms: number;
}

export interface TestStatusV2 extends TestStatusV1 {
  version: 2;
  framework: TestFramework;
  suites: TestSuiteV2[];
  phases: PhaseV2[];
  log_file: string;
}

// --- TestEvent: adapter output ---

export type TestEventType =
  | 'suite_start'
  | 'suite_end'
  | 'test_start'
  | 'test_pass'
  | 'test_fail'
  | 'test_skip'
  | 'summary'
  | 'error'
  | 'log';

export interface TestEvent {
  type: TestEventType;
  suiteName?: string;
  suiteFile?: string;
  testName?: string;
  duration?: number;
  errorMessage?: string;
  stackTrace?: string;
  timestamp: string;
}

// --- Hook input ---

export interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  transcript_path?: string;
  conversation_id?: string;
}
