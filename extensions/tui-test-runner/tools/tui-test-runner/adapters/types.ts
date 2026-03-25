/**
 * Canonical status v2 schema shared by the wrapper, statusline, and TUI.
 */

export type TestFramework = 'vitest' | 'jest' | 'pytest' | 'dotnet' | 'rust' | 'go' | 'unknown';

export type TestState = 'idle' | 'building' | 'running' | 'passed' | 'failed' | 'error';

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

export interface TestStatusV2 {
  version: 2;
  session_id: string;
  pid: number;
  started_at: string;
  updated_at: string;
  state: TestState;
  framework: TestFramework;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  running: number;
  percent: number;
  duration_ms: number;
  error_message: string;
  log_file: string;
  suites: TestSuiteV2[];
  phases: PhaseV2[];
}

export interface TestSummary {
  total?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
}

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
  summary?: TestSummary;
  timestamp: string;
}

export interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  transcript_path?: string;
  conversation_id?: string;
}
