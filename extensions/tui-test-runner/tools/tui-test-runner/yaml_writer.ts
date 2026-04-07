/**
 * Canonical status v2 writer.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  TestEvent,
  TestFramework,
  TestResultV2,
  TestStatusV2,
  TestSuiteV2,
  TestSummary,
} from './adapters/types.ts';

/**
 * Minimal YAML serializer — no npm dependencies.
 * Handles scalars, arrays, and nested objects for TestStatusV2 schema.
 */
function yamlEscape(val: string): string {
  if (val === '') return '""';
  if (/[\n\r]/.test(val)) return JSON.stringify(val);
  if (/[:{}\[\],&*#?|<>=!%@`"']/.test(val) || val.trim() !== val) return JSON.stringify(val);
  return val;
}

function serializeYaml(obj: Record<string, unknown>, indent = 0): string {
  const prefix = '  '.repeat(indent);
  let out = '';
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (val === null) {
      out += `${prefix}${key}: null\n`;
    } else if (Array.isArray(val)) {
      if (val.length === 0) {
        out += `${prefix}${key}: []\n`;
      } else {
        out += `${prefix}${key}:\n`;
        for (const item of val) {
          if (typeof item === 'object' && item !== null) {
            const entries = Object.entries(item as Record<string, unknown>).filter(([, v]) => v !== undefined);
            if (entries.length > 0) {
              const [firstKey, firstVal] = entries[0];
              out += `${prefix}  - ${firstKey}: ${formatScalar(firstVal)}\n`;
              for (let i = 1; i < entries.length; i++) {
                const [k, v] = entries[i];
                if (Array.isArray(v)) {
                  if ((v as unknown[]).length === 0) {
                    out += `${prefix}    ${k}: []\n`;
                  } else {
                    out += `${prefix}    ${k}:\n`;
                    for (const subItem of v as unknown[]) {
                      if (typeof subItem === 'object' && subItem !== null) {
                        const subEntries = Object.entries(subItem as Record<string, unknown>).filter(([, sv]) => sv !== undefined);
                        if (subEntries.length > 0) {
                          const [sk, sv] = subEntries[0];
                          out += `${prefix}      - ${sk}: ${formatScalar(sv)}\n`;
                          for (let j = 1; j < subEntries.length; j++) {
                            out += `${prefix}        ${subEntries[j][0]}: ${formatScalar(subEntries[j][1])}\n`;
                          }
                        }
                      } else {
                        out += `${prefix}      - ${formatScalar(subItem)}\n`;
                      }
                    }
                  }
                } else {
                  out += `${prefix}    ${k}: ${formatScalar(v)}\n`;
                }
              }
            }
          } else {
            out += `${prefix}  - ${formatScalar(item)}\n`;
          }
        }
      }
    } else if (typeof val === 'object') {
      out += `${prefix}${key}:\n`;
      out += serializeYaml(val as Record<string, unknown>, indent + 1);
    } else {
      out += `${prefix}${key}: ${formatScalar(val)}\n`;
    }
  }
  return out;
}

function formatScalar(val: unknown): string {
  if (val === null || val === undefined) return 'null';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  return yamlEscape(String(val));
}

interface SuiteRuntime {
  suite: TestSuiteV2;
  tests: Map<string, TestResultV2>;
}

export class YamlWriter {
  private status: TestStatusV2;
  private readonly suiteMap = new Map<string, SuiteRuntime>();
  private readonly throttleMs: number;
  private lastWriteTime = 0;
  private reportedSummary: TestSummary = {};
  private _finalized = false;
  private _aggregatesDirty = false;
  private _discoveryTotal = 0;

  constructor(
    private readonly statusFile: string,
    sessionId: string,
    framework: TestFramework,
    logFile: string,
    throttleMs = 300,
    pid: number = process.pid,
  ) {
    const now = new Date().toISOString();
    this.throttleMs = throttleMs;
    this.status = {
      version: 2,
      session_id: sessionId,
      pid,
      started_at: now,
      updated_at: now,
      state: 'building',
      framework,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      running: 0,
      percent: 0,
      duration_ms: 0,
      error_message: '',
      log_file: logFile,
      suites: [],
      phases: [
        {
          name: 'tests',
          status: 'running',
          started_at: now,
          duration_ms: 0,
        },
      ],
    };
  }

  setDiscoveryTotal(count: number): void {
    this._discoveryTotal = count;
  }

  processEvent(event: TestEvent): void {
    switch (event.type) {
      case 'suite_start':
        this.ensureSuite(event.suiteName || 'unknown', event.suiteFile);
        break;
      case 'test_start':
        this.upsertTest(event, 'running');
        break;
      case 'test_pass':
        this.upsertTest(event, 'passed');
        break;
      case 'test_fail':
        this.upsertTest(event, 'failed');
        if (event.errorMessage) {
          this.status.error_message = event.errorMessage;
        }
        break;
      case 'test_skip':
        this.upsertTest(event, 'skipped');
        break;
      case 'summary':
        if (event.summary) {
          this.reportedSummary = { ...this.reportedSummary, ...event.summary };
        }
        break;
      case 'error':
        if (event.errorMessage) {
          this.status.error_message = event.errorMessage;
        }
        break;
      case 'suite_end':
      case 'log':
        break;
    }

    this._aggregatesDirty = true;
  }

  writeIfNeeded(): boolean {
    if (this._finalized) return false;
    const now = Date.now();
    if (now - this.lastWriteTime < this.throttleMs) {
      return false;
    }

    this.write();
    return true;
  }

  write(): void {
    if (this._finalized) return;
    if (this._aggregatesDirty) {
      this.updateAggregates();
      this._aggregatesDirty = false;
    }
    this.status.updated_at = new Date().toISOString();
    this.updatePhaseDuration();
    this.status.suites = this.serializeSuites();

    const yaml = serializeYaml(this.status as unknown as Record<string, unknown>);

    fs.mkdirSync(path.dirname(this.statusFile), { recursive: true });
    // Atomic write: temp file + rename.
    // Windows: renameSync EPERM when reader holds file → retry with backoff (graceful-fs pattern).
    const tmpFile = this.statusFile + '.tmp';
    fs.writeFileSync(tmpFile, yaml, 'utf-8');

    if (process.platform !== 'win32') {
      // POSIX: rename is atomic, always succeeds even with open readers
      fs.renameSync(tmpFile, this.statusFile);
    } else {
      // Windows: retry rename up to 3 times with 10ms backoff (handles antivirus/indexer transient locks)
      let renamed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fs.renameSync(tmpFile, this.statusFile);
          renamed = true;
          break;
        } catch (err: unknown) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') {
            // Zero-CPU sync sleep 10ms (Atomics.wait on dummy buffer)
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
          } else {
            throw err; // unexpected error, don't swallow
          }
        }
      }
      if (!renamed) {
        // All retries failed — fallback to copyFile (non-atomic but data is written)
        fs.copyFileSync(tmpFile, this.statusFile);
        try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup */ }
      }
    }
    this.lastWriteTime = Date.now();
  }

  /** Transition from 'building' to 'running' on first test event */
  markRunning(): void {
    if (this.status.state === 'building') {
      this.status.state = 'running';
    }
  }

  finalize(exitCode: number): void {
    this._finalized = false; // temporarily allow the final write
    this.status.state = exitCode === 0 ? 'passed' : 'failed';
    if (exitCode !== 0 && !this.status.error_message) {
      this.status.error_message = `Test command exited with code ${exitCode}`;
    }

    if (this.status.phases.length > 0) {
      this.status.phases[0].status = exitCode === 0 ? 'completed' : 'failed';
    }

    this.write();
    this._finalized = true; // lock — no more writes after finalize
  }

  private ensureSuite(name: string, file?: string): SuiteRuntime {
    const key = file || name;
    const existing = this.suiteMap.get(key);
    if (existing) {
      return existing;
    }

    const suite: TestSuiteV2 = {
      name,
      file,
      status: 'running',
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration_ms: 0,
      tests: [],
    };
    const runtime: SuiteRuntime = {
      suite,
      tests: new Map<string, TestResultV2>(),
    };
    this.suiteMap.set(key, runtime);
    return runtime;
  }

  private upsertTest(event: TestEvent, status: TestResultV2['status']): void {
    const suite = this.ensureSuite(event.suiteName || 'unknown', event.suiteFile);
    const key = event.testName || 'unknown';

    let test = suite.tests.get(key);
    if (!test) {
      test = {
        name: key,
        status: 'pending',
      };
      suite.tests.set(key, test);
    }

    test.status = status;

    if (event.duration !== undefined) {
      test.duration_ms = event.duration;
    }

    if (status === 'failed') {
      if (event.errorMessage !== undefined) {
        test.error = event.errorMessage;
      }
      if (event.stackTrace !== undefined) {
        test.stack = event.stackTrace;
      }
    } else if (status === 'passed' || status === 'skipped') {
      delete test.error;
      delete test.stack;
    }

    this.recalculateSuite(suite);
  }

  private recalculateSuite(runtime: SuiteRuntime): void {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let running = 0;
    let durationMs = 0;

    for (const test of runtime.tests.values()) {
      if (test.status === 'passed') {
        passed++;
      } else if (test.status === 'failed') {
        failed++;
      } else if (test.status === 'skipped') {
        skipped++;
      } else if (test.status === 'running') {
        running++;
      }

      if (typeof test.duration_ms === 'number') {
        durationMs += test.duration_ms;
      }
    }

    runtime.suite.passed = passed;
    runtime.suite.failed = failed;
    runtime.suite.skipped = skipped;
    runtime.suite.total = runtime.tests.size;
    runtime.suite.duration_ms = durationMs;
    runtime.suite.tests = Array.from(runtime.tests.values());

    if (failed > 0) {
      runtime.suite.status = 'failed';
      return;
    }

    if (running > 0 || (this.status.state === 'running' && runtime.tests.size === 0)) {
      runtime.suite.status = 'running';
      return;
    }

    runtime.suite.status = 'passed';
  }

  private updateAggregates(): void {
    let discoveredTotal = 0;
    let discoveredPassed = 0;
    let discoveredFailed = 0;
    let discoveredSkipped = 0;
    let discoveredRunning = 0;

    for (const runtime of this.suiteMap.values()) {
      this.recalculateSuite(runtime);
      discoveredTotal += runtime.suite.total;
      discoveredPassed += runtime.suite.passed;
      discoveredFailed += runtime.suite.failed;
      discoveredSkipped += runtime.suite.skipped;
      discoveredRunning += runtime.suite.tests.filter((test) => test.status === 'running').length;
    }

    const reportedTotal = this.reportedSummary.total ?? 0;
    const knownTotal = Math.max(this._discoveryTotal, reportedTotal);
    const passed = Math.max(discoveredPassed, this.reportedSummary.passed ?? 0);
    const failed = Math.max(discoveredFailed, this.reportedSummary.failed ?? 0);
    const skipped = Math.max(discoveredSkipped, this.reportedSummary.skipped ?? 0);
    const completed = passed + failed + skipped;

    // Total: use pre-discovery or reported summary total ONLY (not discovered from events)
    // discoveredTotal from events = completed count, NOT useful as total
    let total: number;
    if (knownTotal > 0) {
      total = knownTotal;
    } else if (this.status.state !== 'running') {
      // After finalize: total = completed (final count)
      total = completed;
    } else {
      total = 0;
    }

    let running = discoveredRunning;
    if (this.status.state === 'running' && knownTotal > discoveredTotal) {
      running = Math.max(running, total - completed);
    }

    this.status.total = total;
    this.status.passed = passed;
    this.status.failed = failed;
    this.status.skipped = skipped;
    this.status.running = this.status.state === 'running' ? Math.max(running, 0) : 0;

    if (this.status.state === 'running') {
      if (total === 0) {
        this.status.percent = 0;
      } else {
        this.status.percent = Math.min(Math.round((completed * 100) / total), 99);
      }
    } else {
      // After finalize: 100% completion
      this.status.percent = 100;
    }

    this.status.duration_ms = Date.now() - new Date(this.status.started_at).getTime();
  }

  private updatePhaseDuration(): void {
    if (this.status.phases.length === 0) {
      return;
    }

    const phase = this.status.phases[0];
    if (!phase.started_at) {
      return;
    }

    phase.duration_ms = Date.now() - new Date(phase.started_at).getTime();
  }

  private serializeSuites(): TestSuiteV2[] {
    return Array.from(this.suiteMap.values(), (runtime) => {
      this.recalculateSuite(runtime);
      return {
        ...runtime.suite,
        tests: Array.from(runtime.tests.values()),
      };
    });
  }
}
