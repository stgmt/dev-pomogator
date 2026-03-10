/**
 * YAML v2 Status Writer
 * Converts TestEvent stream into atomic YAML v2 status file
 * Backward compatible with v1 (statusline_render.sh reads flat fields)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TestEvent, TestStatusV2, TestSuiteV2, TestResultV2, PhaseV2, TestFramework } from './adapters/types.js';

export class YamlWriter {
  private status: TestStatusV2;
  private suiteMap = new Map<string, TestSuiteV2>();
  private lastWriteTime = 0;
  private readonly throttleMs: number;

  constructor(
    private readonly statusFile: string,
    sessionId: string,
    framework: TestFramework,
    logFile: string,
    throttleMs = 1000,
  ) {
    this.throttleMs = throttleMs;
    this.status = {
      version: 2,
      session_id: sessionId,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      state: 'running',
      framework,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      running: 0,
      percent: 0,
      duration_ms: 0,
      error_message: '',
      suites: [],
      phases: [
        { name: 'tests', status: 'running', started_at: new Date().toISOString(), duration_ms: 0 },
      ],
      log_file: logFile,
    };
  }

  /** Process a single TestEvent and update internal state */
  processEvent(event: TestEvent): void {
    switch (event.type) {
      case 'suite_start':
        this.ensureSuite(event.suiteName || 'unknown', event.suiteFile);
        break;
      case 'test_pass':
        this.recordTest(event, 'passed');
        this.status.passed++;
        this.status.total++;
        break;
      case 'test_fail':
        this.recordTest(event, 'failed');
        this.status.failed++;
        this.status.total++;
        break;
      case 'test_skip':
        this.recordTest(event, 'skipped');
        this.status.skipped++;
        this.status.total++;
        break;
      case 'test_start':
        this.recordTest(event, 'running');
        break;
      case 'error':
        this.status.error_message = event.errorMessage || '';
        break;
    }

    this.updateAggregates();
  }

  /** Write YAML to disk (throttled) */
  writeIfNeeded(): boolean {
    const now = Date.now();
    if (now - this.lastWriteTime < this.throttleMs) return false;
    this.write();
    return true;
  }

  /** Force write YAML to disk */
  write(): void {
    this.status.updated_at = new Date().toISOString();
    this.status.suites = Array.from(this.suiteMap.values());
    this.updatePhaseDuration();

    const yaml = this.toYaml();
    const tmpFile = `${this.statusFile}.tmp.${process.pid}`;
    fs.writeFileSync(tmpFile, yaml, 'utf-8');
    fs.renameSync(tmpFile, this.statusFile);
    this.lastWriteTime = Date.now();
  }

  /** Finalize: set state to passed/failed, write final YAML */
  finalize(exitCode: number): void {
    this.status.state = exitCode === 0 ? 'passed' : 'failed';
    this.status.running = 0;
    this.status.percent = 100;
    this.status.phases[0].status = exitCode === 0 ? 'completed' : 'failed';
    this.updatePhaseDuration();

    // Update suite statuses
    for (const suite of this.suiteMap.values()) {
      if (suite.status === 'running') {
        suite.status = suite.failed > 0 ? 'failed' : 'passed';
      }
    }

    this.write();
  }

  private ensureSuite(name: string, file?: string): TestSuiteV2 {
    let suite = this.suiteMap.get(name);
    if (!suite) {
      suite = {
        name,
        file: file || name,
        status: 'running',
        passed: 0,
        failed: 0,
        skipped: 0,
        total: 0,
        duration_ms: 0,
        tests: [],
      };
      this.suiteMap.set(name, suite);
    }
    return suite;
  }

  private recordTest(event: TestEvent, status: TestResultV2['status']): void {
    const suite = this.ensureSuite(event.suiteName || 'unknown', event.suiteFile);
    const result: TestResultV2 = {
      name: event.testName || 'unknown',
      status,
      duration_ms: event.duration,
      error: event.errorMessage,
      stack: event.stackTrace,
    };
    suite.tests.push(result);
    suite.total++;

    if (status === 'passed') suite.passed++;
    else if (status === 'failed') { suite.failed++; suite.status = 'failed'; }
    else if (status === 'skipped') suite.skipped++;

    if (event.duration) suite.duration_ms += event.duration;
  }

  private updateAggregates(): void {
    const completed = this.status.passed + this.status.failed + this.status.skipped;
    this.status.running = Math.max(0, this.status.total - completed);
    this.status.percent = this.status.total > 0
      ? Math.min(100, Math.round(completed * 100 / this.status.total))
      : 0;
    this.status.duration_ms = Date.now() - new Date(this.status.started_at).getTime();
  }

  private updatePhaseDuration(): void {
    if (this.status.phases.length > 0) {
      const phase = this.status.phases[0];
      if (phase.started_at) {
        phase.duration_ms = Date.now() - new Date(phase.started_at).getTime();
      }
    }
  }

  private toYaml(): string {
    const s = this.status;
    const lines: string[] = [
      `version: ${s.version}`,
      `session_id: "${s.session_id}"`,
      `started_at: "${s.started_at}"`,
      `updated_at: "${s.updated_at}"`,
      `state: ${s.state}`,
      `framework: "${s.framework}"`,
      `total: ${s.total}`,
      `passed: ${s.passed}`,
      `failed: ${s.failed}`,
      `skipped: ${s.skipped}`,
      `running: ${s.running}`,
      `percent: ${s.percent}`,
      `duration_ms: ${s.duration_ms}`,
      `error_message: "${s.error_message.replace(/"/g, '\\"')}"`,
      `log_file: "${s.log_file}"`,
    ];

    // Suites
    if (s.suites.length > 0) {
      lines.push('suites:');
      for (const suite of s.suites) {
        lines.push(`  - name: "${suite.name}"`);
        if (suite.file) lines.push(`    file: "${suite.file}"`);
        lines.push(`    status: "${suite.status}"`);
        lines.push(`    passed: ${suite.passed}`);
        lines.push(`    failed: ${suite.failed}`);
        lines.push(`    skipped: ${suite.skipped}`);
        lines.push(`    total: ${suite.total}`);
        lines.push(`    duration_ms: ${suite.duration_ms}`);
        if (suite.tests.length > 0) {
          lines.push('    tests:');
          for (const test of suite.tests) {
            lines.push(`      - name: "${test.name.replace(/"/g, '\\"')}"`);
            lines.push(`        status: "${test.status}"`);
            if (test.duration_ms !== undefined) lines.push(`        duration_ms: ${test.duration_ms}`);
            if (test.error) lines.push(`        error: "${test.error.replace(/"/g, '\\"')}"`);
            if (test.stack) lines.push(`        stack: "${test.stack.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`);
          }
        }
      }
    }

    // Phases
    if (s.phases.length > 0) {
      lines.push('phases:');
      for (const phase of s.phases) {
        lines.push(`  - name: "${phase.name}"`);
        lines.push(`    status: "${phase.status}"`);
        if (phase.started_at) lines.push(`    started_at: "${phase.started_at}"`);
        lines.push(`    duration_ms: ${phase.duration_ms}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}
