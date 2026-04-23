import type { BaselineTestResult } from '../../../extensions/onboard-repo/tools/onboard-repo/lib/types.ts';


export interface RunTestsMockConfig {
  framework: string;
  passed: number;
  failed: number;
  skipped?: number;
  duration_s?: number;
  failed_test_ids?: string[];
  exit_code?: number;
}


export class RunTestsMock {
  private config: RunTestsMockConfig | null = null;

  register(config: RunTestsMockConfig): void {
    this.config = config;
  }

  invoke(): BaselineTestResult {
    if (!this.config) {
      throw new Error('RunTestsMock: no config registered. Call register() first.');
    }
    const { framework, passed, failed, skipped = 0, duration_s = 1.0, failed_test_ids = [] } = this.config;
    return {
      framework,
      command: `mock:${framework}`,
      via_skill: 'run-tests',
      passed,
      failed,
      skipped,
      duration_s,
      failed_test_ids,
      reason_if_null: null,
      skipped_by_user: false,
    };
  }

  reset(): void {
    this.config = null;
  }
}


export const runTestsMock = new RunTestsMock();
