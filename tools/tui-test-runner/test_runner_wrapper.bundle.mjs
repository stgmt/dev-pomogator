#!/usr/bin/env node

// tools/tui-test-runner/test_runner_wrapper.ts
import { spawn, spawnSync as spawnSync2 } from "node:child_process";
import * as fs4 from "node:fs";
import * as path3 from "node:path";

// tools/tui-test-runner/adapters/adapter_base.ts
var AdapterBase = class {
  suiteName;
  suiteFile;
  /** Create a TestEvent with current timestamp */
  event(type, overrides = {}) {
    return {
      type,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      suiteName: this.suiteName,
      suiteFile: this.suiteFile,
      ...overrides
    };
  }
  /** Process multiple lines, yielding events */
  *processLines(lines) {
    for (const line of lines) {
      const ev = this.parseLine(line);
      if (ev) yield ev;
    }
  }
};

// tools/tui-test-runner/adapters/rust_adapter.ts
var RE_TEST_RESULT = /^test\s+(.+?)\s+\.\.\.\s+(ok|FAILED|ignored)$/;
var RE_SUMMARY = /^test result:\s+(ok|FAILED)\.\s+(.+)$/;
var RE_SUMMARY_COUNTS = /(\d+)\s+(passed|failed|ignored)/g;
var RustAdapter = class extends AdapterBase {
  parseLine(line) {
    const resultMatch = line.match(RE_TEST_RESULT);
    if (resultMatch) {
      const { suite, test } = this.splitRustName(resultMatch[1].trim());
      this.suiteName = suite;
      this.suiteFile = suite;
      switch (resultMatch[2]) {
        case "ok":
          return this.event("test_pass", { testName: test });
        case "FAILED":
          return this.event("test_fail", { testName: test });
        case "ignored":
          return this.event("test_skip", { testName: test });
        default:
          return null;
      }
    }
    if (RE_SUMMARY.test(line)) {
      const counts = {};
      let match;
      while ((match = RE_SUMMARY_COUNTS.exec(line)) !== null) {
        counts[match[2]] = parseInt(match[1], 10);
      }
      return this.event("summary", {
        summary: {
          passed: counts.passed || 0,
          failed: counts.failed || 0,
          skipped: counts.ignored || 0,
          total: (counts.passed || 0) + (counts.failed || 0) + (counts.ignored || 0)
        }
      });
    }
    return null;
  }
  splitRustName(fullName) {
    const lastSep = fullName.lastIndexOf("::");
    if (lastSep === -1) {
      return { suite: "rust", test: fullName };
    }
    return {
      suite: fullName.substring(0, lastSep),
      test: fullName.substring(lastSep + 2)
    };
  }
};

// tools/tui-test-runner/adapters/dotnet_adapter.ts
var RE_TEST_PASSED = /^\s*Passed\s+(.+?)(?:\s+\[(\d+)\s*(?:ms|s)\])?$/;
var RE_TEST_FAILED = /^\s*Failed\s+(.+?)(?:\s+\[(\d+)\s*(?:ms|s)\])?$/;
var RE_TEST_SKIPPED = /^\s*Skipped\s+(.+)$/;
var RE_SUMMARY2 = /^\s*(Total tests|Passed|Failed|Skipped):\s*(\d+)/;
var RE_MINIMAL_SUMMARY = /^(Passed|Failed)!\s+-\s+Failed:\s*(\d+),\s*Passed:\s*(\d+),\s*Skipped:\s*(\d+),\s*Total:\s*(\d+)/;
var RE_TEST_RUN = /^Test Run (Successful|Failed)/;
var DotnetAdapter = class extends AdapterBase {
  summaryStats = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0
  };
  parseLine(line) {
    const passMatch = line.match(RE_TEST_PASSED);
    if (passMatch) {
      const { suite, test } = this.splitDotnetName(passMatch[1].trim());
      this.suiteName = suite;
      return this.event("test_pass", {
        testName: test,
        duration: passMatch[2] ? this.parseDuration(passMatch[2], line) : void 0
      });
    }
    const failMatch = line.match(RE_TEST_FAILED);
    if (failMatch) {
      const { suite, test } = this.splitDotnetName(failMatch[1].trim());
      this.suiteName = suite;
      return this.event("test_fail", {
        testName: test,
        duration: failMatch[2] ? this.parseDuration(failMatch[2], line) : void 0
      });
    }
    const skipMatch = line.match(RE_TEST_SKIPPED);
    if (skipMatch) {
      const { suite, test } = this.splitDotnetName(skipMatch[1].trim());
      this.suiteName = suite;
      return this.event("test_skip", { testName: test });
    }
    const summaryMatch = line.match(RE_SUMMARY2);
    if (summaryMatch) {
      const key = summaryMatch[1].toLowerCase();
      const value = parseInt(summaryMatch[2], 10);
      if (key === "total tests") this.summaryStats.total = value;
      if (key === "passed") this.summaryStats.passed = value;
      if (key === "failed") this.summaryStats.failed = value;
      if (key === "skipped") this.summaryStats.skipped = value;
      return this.event("summary", {
        summary: {
          total: this.summaryStats.total,
          passed: this.summaryStats.passed,
          failed: this.summaryStats.failed,
          skipped: this.summaryStats.skipped
        }
      });
    }
    const minimalMatch = line.match(RE_MINIMAL_SUMMARY);
    if (minimalMatch) {
      this.summaryStats.failed = parseInt(minimalMatch[2], 10);
      this.summaryStats.passed = parseInt(minimalMatch[3], 10);
      this.summaryStats.skipped = parseInt(minimalMatch[4], 10);
      this.summaryStats.total = parseInt(minimalMatch[5], 10);
      return this.event("summary", {
        summary: {
          total: this.summaryStats.total,
          passed: this.summaryStats.passed,
          failed: this.summaryStats.failed,
          skipped: this.summaryStats.skipped
        }
      });
    }
    if (RE_TEST_RUN.test(line)) {
      return this.event("summary", {
        summary: {
          total: this.summaryStats.total,
          passed: this.summaryStats.passed,
          failed: this.summaryStats.failed,
          skipped: this.summaryStats.skipped
        }
      });
    }
    return null;
  }
  /** Split dotnet Namespace.Class.Method into suite/test */
  splitDotnetName(fullName) {
    const lastDot = fullName.lastIndexOf(".");
    if (lastDot === -1) return { suite: "default", test: fullName };
    return {
      suite: fullName.substring(0, lastDot),
      test: fullName.substring(lastDot + 1)
    };
  }
  parseDuration(value, line) {
    const num = parseInt(value, 10);
    if (line.includes("s]") && !line.includes("ms]")) return num * 1e3;
    return num;
  }
};

// tools/tui-test-runner/adapters/generic_adapter.ts
var GenericAdapter = class extends AdapterBase {
  parseLine(_line) {
    return null;
  }
};

// tools/tui-test-runner/adapters/go_adapter.ts
var RE_TEST_START = /^=== RUN\s+(.+)$/;
var RE_TEST_RESULT2 = /^--- (PASS|FAIL|SKIP):\s+(.+?)(?:\s+\(([\d.]+)s\))?$/;
var GoAdapter = class extends AdapterBase {
  constructor() {
    super();
    this.suiteName = "go";
    this.suiteFile = "go";
  }
  parseLine(line) {
    const startMatch = line.match(RE_TEST_START);
    if (startMatch) {
      return this.event("test_start", { testName: startMatch[1].trim() });
    }
    const resultMatch = line.match(RE_TEST_RESULT2);
    if (resultMatch) {
      const durationSeconds = resultMatch[3] ? Number.parseFloat(resultMatch[3]) : void 0;
      const duration = durationSeconds !== void 0 ? Math.round(durationSeconds * 1e3) : void 0;
      switch (resultMatch[1]) {
        case "PASS":
          return this.event("test_pass", { testName: resultMatch[2].trim(), duration });
        case "FAIL":
          return this.event("test_fail", { testName: resultMatch[2].trim(), duration });
        case "SKIP":
          return this.event("test_skip", { testName: resultMatch[2].trim(), duration });
        default:
          return null;
      }
    }
    return null;
  }
};

// tools/tui-test-runner/adapters/jest_adapter.ts
var RE_SUITE_PASS = /^\s*(PASS)\s+(.+)$/;
var RE_SUITE_FAIL = /^\s*(FAIL)\s+(.+)$/;
var RE_TEST_PASS = /^\s*(✓|√)\s+(.+?)\s*(?:\((\d+)\s*ms\))?$/;
var RE_TEST_FAIL = /^\s*(✕|✗|×)\s+(.+?)\s*(?:\((\d+)\s*ms\))?$/;
var RE_TEST_SKIP = /^\s*(○|⊘)\s+(.+)$/;
var RE_SUMMARY3 = /Tests:\s+/;
var RE_SUMMARY_PASSED = /(\d+)\s+passed/;
var RE_SUMMARY_FAILED = /(\d+)\s+failed/;
var RE_SUMMARY_TOTAL = /(\d+)\s+total/;
var JestAdapter = class extends AdapterBase {
  parseLine(line) {
    const suitePassMatch = line.match(RE_SUITE_PASS);
    if (suitePassMatch) {
      this.suiteName = suitePassMatch[2].trim();
      this.suiteFile = this.suiteName;
      return this.event("suite_start");
    }
    const suiteFailMatch = line.match(RE_SUITE_FAIL);
    if (suiteFailMatch) {
      this.suiteName = suiteFailMatch[2].trim();
      this.suiteFile = this.suiteName;
      return this.event("suite_start");
    }
    const passMatch = line.match(RE_TEST_PASS);
    if (passMatch) {
      return this.event("test_pass", {
        testName: passMatch[2].trim(),
        duration: passMatch[3] ? parseInt(passMatch[3], 10) : void 0
      });
    }
    const failMatch = line.match(RE_TEST_FAIL);
    if (failMatch) {
      return this.event("test_fail", {
        testName: failMatch[2].trim(),
        duration: failMatch[3] ? parseInt(failMatch[3], 10) : void 0
      });
    }
    const skipMatch = line.match(RE_TEST_SKIP);
    if (skipMatch) {
      return this.event("test_skip", { testName: skipMatch[2].trim() });
    }
    if (RE_SUMMARY3.test(line)) {
      const passed = line.match(RE_SUMMARY_PASSED)?.[1];
      const failed = line.match(RE_SUMMARY_FAILED)?.[1];
      const total = line.match(RE_SUMMARY_TOTAL)?.[1];
      return this.event("summary", {
        summary: {
          passed: passed ? parseInt(passed, 10) : 0,
          failed: failed ? parseInt(failed, 10) : 0,
          total: total ? parseInt(total, 10) : 0
        }
      });
    }
    return null;
  }
};

// tools/tui-test-runner/adapters/pytest_adapter.ts
var RE_TEST_RESULT3 = /^(.+?::.*?)\s+(PASSED|FAILED|SKIPPED|ERROR)(?:\s+\[.*?\])?\s*$/;
var RE_SHORT_RESULT = /^\s*(PASSED|FAILED|SKIPPED|ERROR)\s+(.+)$/;
var RE_PROGRESS = /^\s*(.+?)\s+(PASSED|FAILED|SKIPPED|ERROR)\s+\[\s*(\d+)%\]/;
var RE_SUMMARY4 = /^=+\s+(.+?)\s+=+$/;
var RE_SUMMARY_COUNTS2 = /(\d+)\s+(passed|failed|skipped|error|warning)/g;
var PytestAdapter = class extends AdapterBase {
  parseLine(line) {
    const progressMatch = line.match(RE_PROGRESS);
    if (progressMatch) {
      return this.parseResult(
        progressMatch[1].trim(),
        progressMatch[2],
        parseInt(progressMatch[3], 10)
      );
    }
    const resultMatch = line.match(RE_TEST_RESULT3);
    if (resultMatch) {
      return this.parseResult(resultMatch[1].trim(), resultMatch[2]);
    }
    const shortMatch = line.match(RE_SHORT_RESULT);
    if (shortMatch) {
      return this.parseResult(shortMatch[2].trim(), shortMatch[1]);
    }
    if (RE_SUMMARY4.test(line)) {
      const counts = {};
      let m;
      while ((m = RE_SUMMARY_COUNTS2.exec(line)) !== null) {
        counts[m[2]] = parseInt(m[1], 10);
      }
      return this.event("summary", {
        summary: {
          passed: counts.passed || 0,
          failed: counts.failed || 0,
          skipped: counts.skipped || 0,
          total: (counts.passed || 0) + (counts.failed || 0) + (counts.skipped || 0)
        }
      });
    }
    return null;
  }
  parseResult(fullName, status, percent) {
    const parts = fullName.split("::");
    const file = parts[0];
    const testName = parts.slice(1).join("::") || fullName;
    this.suiteName = file;
    this.suiteFile = file;
    const statusMap = {
      "PASSED": "test_pass",
      "FAILED": "test_fail",
      "SKIPPED": "test_skip",
      "ERROR": "test_fail"
    };
    return this.event(statusMap[status] || "test_fail", {
      testName
    });
  }
};

// tools/tui-test-runner/adapters/vitest_adapter.ts
var RE_SUITE_START = /^\s*(❯|>)\s+(.+\.(?:test|spec)\.\w+)/;
var RE_DOCKER_SUITE = /^(?:stdout|stderr)\s+\|\s+(.+\.(?:test|spec)\.\w+)/;
var RE_TEST_PASS2 = /^\s*(✓|√)\s+(.+?)(?:\s+(\d+)\s*ms)?$/;
var RE_TEST_FAIL2 = /^\s*(✗|×)\s+(.+?)(?:\s+(\d+)\s*ms)?$/;
var RE_FILE_LEVEL_RESULT = /^\s*(?:✓|√|✗|×)\s+\S+\.(?:test|spec)\.\w+\s*\(/;
var RE_TEST_SKIP2 = /^\s*(○|↓|SKIP|skipped)\s+(.+)$/;
var RE_SUMMARY5 = /Tests?\s+(\d+)\s+(passed|failed)/i;
var RE_SUMMARY_TOTAL2 = /(\d+)\s+total/i;
var RE_SUMMARY_FAILED2 = /(\d+)\s+failed/i;
var RE_SUMMARY_PASSED2 = /(\d+)\s+passed/i;
var RE_ERROR_LINE = /^(Error|AssertionError|TypeError|ReferenceError):/;
var RE_STACK_LINE = /^\s+at\s+/;
var VitestAdapter = class extends AdapterBase {
  pendingError;
  pendingStack = [];
  parseLine(line) {
    const suiteMatch = line.match(RE_SUITE_START);
    if (suiteMatch) {
      this.suiteName = suiteMatch[2].trim();
      this.suiteFile = this.suiteName;
      return this.event("suite_start");
    }
    const dockerSuiteMatch = line.match(RE_DOCKER_SUITE);
    if (dockerSuiteMatch) {
      this.suiteName = dockerSuiteMatch[1].trim();
      this.suiteFile = this.suiteName;
      return this.event("suite_start");
    }
    if (RE_FILE_LEVEL_RESULT.test(line)) {
      return null;
    }
    const passMatch = line.match(RE_TEST_PASS2);
    if (passMatch) {
      return this.event("test_pass", {
        testName: passMatch[2].trim(),
        duration: passMatch[3] ? parseInt(passMatch[3], 10) : void 0
      });
    }
    const failMatch = line.match(RE_TEST_FAIL2);
    if (failMatch) {
      const ev = this.event("test_fail", {
        testName: failMatch[2].trim(),
        duration: failMatch[3] ? parseInt(failMatch[3], 10) : void 0,
        errorMessage: this.pendingError,
        stackTrace: this.pendingStack.length > 0 ? this.pendingStack.join("\n") : void 0
      });
      this.pendingError = void 0;
      this.pendingStack = [];
      return ev;
    }
    const skipMatch = line.match(RE_TEST_SKIP2);
    if (skipMatch) {
      return this.event("test_skip", {
        testName: skipMatch[2].trim()
      });
    }
    if (RE_ERROR_LINE.test(line)) {
      this.pendingError = line.trim();
      this.pendingStack = [];
      return null;
    }
    if (RE_STACK_LINE.test(line) && this.pendingError) {
      this.pendingStack.push(line.trim());
      return null;
    }
    if (RE_SUMMARY5.test(line)) {
      const passed = line.match(RE_SUMMARY_PASSED2)?.[1];
      const failed = line.match(RE_SUMMARY_FAILED2)?.[1];
      const total = line.match(RE_SUMMARY_TOTAL2)?.[1];
      return this.event("summary", {
        summary: {
          passed: passed ? parseInt(passed, 10) : 0,
          failed: failed ? parseInt(failed, 10) : 0,
          total: total ? parseInt(total, 10) : 0
        }
      });
    }
    return null;
  }
};

// tools/tui-test-runner/config.ts
import * as fs from "node:fs";
import * as path from "node:path";
var FRAMEWORK_INDICATORS = [
  { framework: "vitest", files: ["vitest.config.ts", "vitest.config.js", "vitest.config.mts"] },
  { framework: "jest", files: ["jest.config.ts", "jest.config.js", "jest.config.cjs"] },
  { framework: "pytest", files: ["pytest.ini", "pyproject.toml", "setup.cfg", "conftest.py"] },
  { framework: "rust", files: ["Cargo.toml"] },
  { framework: "go", files: ["go.mod"] },
  { framework: "dotnet", files: [] }
  // detected by .csproj glob
];
function detectFramework(projectDir) {
  const envFramework = process.env.TEST_STATUSLINE_FRAMEWORK;
  if (envFramework && envFramework !== "auto") {
    return envFramework;
  }
  for (const { framework, files } of FRAMEWORK_INDICATORS) {
    for (const file of files) {
      if (fs.existsSync(path.join(projectDir, file))) {
        if (framework === "pytest" && file === "pyproject.toml") {
          try {
            const content = fs.readFileSync(path.join(projectDir, file), "utf-8");
            if (!content.includes("[tool.pytest") && !content.includes("pytest")) continue;
          } catch {
            continue;
          }
        }
        return framework;
      }
    }
  }
  try {
    const entries = fs.readdirSync(projectDir);
    if (entries.some((e) => e.endsWith(".csproj") || e.endsWith(".sln"))) {
      return "dotnet";
    }
  } catch {
  }
  return "unknown";
}

// tools/tui-test-runner/yaml_writer.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";
function yamlEscape(val) {
  if (val === "") return '""';
  if (/[\n\r]/.test(val)) return JSON.stringify(val);
  if (/[:{}\[\],&*#?|<>=!%@`"']/.test(val) || val.trim() !== val) return JSON.stringify(val);
  return val;
}
function serializeYaml(obj, indent = 0) {
  const prefix = "  ".repeat(indent);
  let out = "";
  for (const [key, val] of Object.entries(obj)) {
    if (val === void 0) continue;
    if (val === null) {
      out += `${prefix}${key}: null
`;
    } else if (Array.isArray(val)) {
      if (val.length === 0) {
        out += `${prefix}${key}: []
`;
      } else {
        out += `${prefix}${key}:
`;
        for (const item of val) {
          if (typeof item === "object" && item !== null) {
            const entries = Object.entries(item).filter(([, v]) => v !== void 0);
            if (entries.length > 0) {
              const [firstKey, firstVal] = entries[0];
              out += `${prefix}  - ${firstKey}: ${formatScalar(firstVal)}
`;
              for (let i = 1; i < entries.length; i++) {
                const [k, v] = entries[i];
                if (Array.isArray(v)) {
                  if (v.length === 0) {
                    out += `${prefix}    ${k}: []
`;
                  } else {
                    out += `${prefix}    ${k}:
`;
                    for (const subItem of v) {
                      if (typeof subItem === "object" && subItem !== null) {
                        const subEntries = Object.entries(subItem).filter(([, sv]) => sv !== void 0);
                        if (subEntries.length > 0) {
                          const [sk, sv] = subEntries[0];
                          out += `${prefix}      - ${sk}: ${formatScalar(sv)}
`;
                          for (let j = 1; j < subEntries.length; j++) {
                            out += `${prefix}        ${subEntries[j][0]}: ${formatScalar(subEntries[j][1])}
`;
                          }
                        }
                      } else {
                        out += `${prefix}      - ${formatScalar(subItem)}
`;
                      }
                    }
                  }
                } else {
                  out += `${prefix}    ${k}: ${formatScalar(v)}
`;
                }
              }
            }
          } else {
            out += `${prefix}  - ${formatScalar(item)}
`;
          }
        }
      }
    } else if (typeof val === "object") {
      out += `${prefix}${key}:
`;
      out += serializeYaml(val, indent + 1);
    } else {
      out += `${prefix}${key}: ${formatScalar(val)}
`;
    }
  }
  return out;
}
function formatScalar(val) {
  if (val === null || val === void 0) return "null";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return String(val);
  return yamlEscape(String(val));
}
var YamlWriter = class {
  constructor(statusFile, sessionId, framework, logFile, throttleMs = 300, pid = process.pid) {
    this.statusFile = statusFile;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.throttleMs = throttleMs;
    this.status = {
      version: 2,
      session_id: sessionId,
      pid,
      started_at: now,
      updated_at: now,
      state: "building",
      framework,
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      running: 0,
      percent: 0,
      duration_ms: 0,
      error_message: "",
      log_file: logFile,
      suites: [],
      phases: [
        {
          name: "tests",
          status: "running",
          started_at: now,
          duration_ms: 0
        }
      ]
    };
  }
  statusFile;
  status;
  suiteMap = /* @__PURE__ */ new Map();
  throttleMs;
  lastWriteTime = 0;
  reportedSummary = {};
  _finalized = false;
  _aggregatesDirty = false;
  _discoveryTotal = 0;
  setDiscoveryTotal(count) {
    this._discoveryTotal = count;
  }
  processEvent(event) {
    switch (event.type) {
      case "suite_start":
        this.ensureSuite(event.suiteName || "unknown", event.suiteFile);
        break;
      case "test_start":
        this.upsertTest(event, "running");
        break;
      case "test_pass":
        this.upsertTest(event, "passed");
        break;
      case "test_fail":
        this.upsertTest(event, "failed");
        if (event.errorMessage) {
          this.status.error_message = event.errorMessage;
        }
        break;
      case "test_skip":
        this.upsertTest(event, "skipped");
        break;
      case "summary":
        if (event.summary) {
          this.reportedSummary = { ...this.reportedSummary, ...event.summary };
        }
        break;
      case "error":
        if (event.errorMessage) {
          this.status.error_message = event.errorMessage;
        }
        break;
      case "suite_end":
      case "log":
        break;
    }
    this._aggregatesDirty = true;
  }
  writeIfNeeded() {
    if (this._finalized) return false;
    const now = Date.now();
    if (now - this.lastWriteTime < this.throttleMs) {
      return false;
    }
    this.write();
    return true;
  }
  write() {
    if (this._finalized) return;
    if (this._aggregatesDirty) {
      this.updateAggregates();
      this._aggregatesDirty = false;
    }
    this.status.updated_at = (/* @__PURE__ */ new Date()).toISOString();
    this.updatePhaseDuration();
    this.status.suites = this.serializeSuites();
    const yaml = serializeYaml(this.status);
    fs2.mkdirSync(path2.dirname(this.statusFile), { recursive: true });
    const tmpFile = this.statusFile + ".tmp";
    fs2.writeFileSync(tmpFile, yaml, "utf-8");
    if (process.platform !== "win32") {
      fs2.renameSync(tmpFile, this.statusFile);
    } else {
      let renamed = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          fs2.renameSync(tmpFile, this.statusFile);
          renamed = true;
          break;
        } catch (err) {
          const code = err.code;
          if (code === "EPERM" || code === "EACCES" || code === "EBUSY") {
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
          } else {
            throw err;
          }
        }
      }
      if (!renamed) {
        fs2.copyFileSync(tmpFile, this.statusFile);
        try {
          fs2.unlinkSync(tmpFile);
        } catch {
        }
      }
    }
    this.lastWriteTime = Date.now();
  }
  /** Transition from 'building' to 'running' on first test event */
  markRunning() {
    if (this.status.state === "building") {
      this.status.state = "running";
    }
  }
  finalize(exitCode) {
    this._finalized = false;
    this.status.state = exitCode === 0 ? "passed" : "failed";
    if (exitCode !== 0 && !this.status.error_message) {
      this.status.error_message = `Test command exited with code ${exitCode}`;
    }
    if (this.status.phases.length > 0) {
      this.status.phases[0].status = exitCode === 0 ? "completed" : "failed";
    }
    this.write();
    this._finalized = true;
  }
  ensureSuite(name, file) {
    const key = file || name;
    const existing = this.suiteMap.get(key);
    if (existing) {
      return existing;
    }
    const suite = {
      name,
      file,
      status: "running",
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration_ms: 0,
      tests: []
    };
    const runtime = {
      suite,
      tests: /* @__PURE__ */ new Map()
    };
    this.suiteMap.set(key, runtime);
    return runtime;
  }
  upsertTest(event, status) {
    const suite = this.ensureSuite(event.suiteName || "unknown", event.suiteFile);
    const key = event.testName || "unknown";
    let test = suite.tests.get(key);
    if (!test) {
      test = {
        name: key,
        status: "pending"
      };
      suite.tests.set(key, test);
    }
    test.status = status;
    if (event.duration !== void 0) {
      test.duration_ms = event.duration;
    }
    if (status === "failed") {
      if (event.errorMessage !== void 0) {
        test.error = event.errorMessage;
      }
      if (event.stackTrace !== void 0) {
        test.stack = event.stackTrace;
      }
    } else if (status === "passed" || status === "skipped") {
      delete test.error;
      delete test.stack;
    }
    this.recalculateSuite(suite);
  }
  recalculateSuite(runtime) {
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let running = 0;
    let durationMs = 0;
    for (const test of runtime.tests.values()) {
      if (test.status === "passed") {
        passed++;
      } else if (test.status === "failed") {
        failed++;
      } else if (test.status === "skipped") {
        skipped++;
      } else if (test.status === "running") {
        running++;
      }
      if (typeof test.duration_ms === "number") {
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
      runtime.suite.status = "failed";
      return;
    }
    if (running > 0 || this.status.state === "running" && runtime.tests.size === 0) {
      runtime.suite.status = "running";
      return;
    }
    runtime.suite.status = "passed";
  }
  updateAggregates() {
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
      discoveredRunning += runtime.suite.tests.filter((test) => test.status === "running").length;
    }
    const reportedTotal = this.reportedSummary.total ?? 0;
    const knownTotal = Math.max(this._discoveryTotal, reportedTotal);
    const passed = Math.max(discoveredPassed, this.reportedSummary.passed ?? 0);
    const failed = Math.max(discoveredFailed, this.reportedSummary.failed ?? 0);
    const skipped = Math.max(discoveredSkipped, this.reportedSummary.skipped ?? 0);
    const completed = passed + failed + skipped;
    let total;
    if (knownTotal > 0) {
      total = knownTotal;
    } else if (this.status.state !== "running") {
      total = completed;
    } else {
      total = 0;
    }
    let running = discoveredRunning;
    if (this.status.state === "running" && knownTotal > discoveredTotal) {
      running = Math.max(running, total - completed);
    }
    this.status.total = total;
    this.status.passed = passed;
    this.status.failed = failed;
    this.status.skipped = skipped;
    this.status.running = this.status.state === "running" ? Math.max(running, 0) : 0;
    if (this.status.state === "running") {
      if (total === 0) {
        this.status.percent = 0;
      } else {
        this.status.percent = Math.min(Math.round(completed * 100 / total), 99);
      }
    } else {
      this.status.percent = 100;
    }
    this.status.duration_ms = Date.now() - new Date(this.status.started_at).getTime();
  }
  updatePhaseDuration() {
    if (this.status.phases.length === 0) {
      return;
    }
    const phase = this.status.phases[0];
    if (!phase.started_at) {
      return;
    }
    phase.duration_ms = Date.now() - new Date(phase.started_at).getTime();
  }
  serializeSuites() {
    return Array.from(this.suiteMap.values(), (runtime) => {
      this.recalculateSuite(runtime);
      return {
        ...runtime.suite,
        tests: Array.from(runtime.tests.values())
      };
    });
  }
};

// tools/_shared/process-tree.ts
import { spawnSync } from "node:child_process";
import * as fs3 from "node:fs";
var DEFAULT_SELF_TIMEOUT_MS = 18e5;
var DEFAULT_KILL_GRACE_MS = 3e3;
function resolveSelfTimeoutMs(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_SELF_TIMEOUT_MS;
}
function resolveKillGraceMs(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_KILL_GRACE_MS;
}
function killIntent(pid, platform, signal, force) {
  const mode = force ? "force" : "graceful";
  if (platform === "win32") {
    const args = force ? ["/PID", String(pid), "/T", "/F"] : ["/PID", String(pid), "/T"];
    return { pid, platform, cmd: "taskkill", args, mode };
  }
  const sig = force ? "SIGKILL" : signal;
  return { pid, platform, cmd: "kill", args: [String(-pid), sig], mode };
}
function apply(pid, opts, force) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  const signal = opts.signal ?? "SIGTERM";
  const platform = opts.platform ?? process.platform;
  const recordFile = opts.recordFile ?? process.env.TEST_RUNNER_KILL_RECORD;
  const intent = killIntent(pid, platform, signal, force);
  if (recordFile) {
    try {
      const prev = fs3.existsSync(recordFile) ? JSON.parse(fs3.readFileSync(recordFile, "utf-8")) : [];
      prev.push(intent);
      fs3.writeFileSync(recordFile, JSON.stringify(prev));
    } catch {
    }
    return;
  }
  try {
    if (platform === "win32") {
      spawnSync("taskkill", intent.args, { windowsHide: true, timeout: 5e3 });
      return;
    }
    const sig = force ? "SIGKILL" : signal;
    try {
      process.kill(-pid, sig);
    } catch {
      process.kill(pid, sig);
    }
  } catch {
  }
}
function signalProcessTree(pid, opts = {}) {
  apply(pid, opts, false);
}
function forceKillProcessTree(pid, opts = {}) {
  apply(pid, opts, true);
}

// tools/tui-test-runner/test_runner_wrapper.ts
var SESSION = process.env.TEST_STATUSLINE_SESSION || "";
var PROJECT = process.env.TEST_STATUSLINE_PROJECT || process.cwd();
var KNOWN_FRAMEWORKS = /* @__PURE__ */ new Set([
  "vitest",
  "jest",
  "pytest",
  "dotnet",
  "rust",
  "go",
  "unknown",
  "generic"
]);
function parseArgs(args) {
  let framework;
  let commandStart = args.length;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") {
      commandStart = i + 1;
      break;
    }
    if (arg === "--framework" && i + 1 < args.length) {
      const candidate = args[i + 1];
      framework = KNOWN_FRAMEWORKS.has(candidate) ? candidate : "unknown";
      i++;
      continue;
    }
    if (arg.startsWith("--framework=")) {
      const candidate = arg.slice("--framework=".length);
      framework = KNOWN_FRAMEWORKS.has(candidate) ? candidate : "unknown";
      continue;
    }
    commandStart = i;
    break;
  }
  const childEnv = {};
  const commandArgs = args.slice(commandStart);
  while (commandArgs.length > 0) {
    const match = commandArgs[0].match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      break;
    }
    childEnv[match[1]] = match[2];
    commandArgs.shift();
  }
  return {
    framework,
    childEnv,
    commandArgs
  };
}
function getAdapter(framework) {
  switch (framework) {
    case "vitest":
      return new VitestAdapter();
    case "jest":
      return new JestAdapter();
    case "pytest":
      return new PytestAdapter();
    case "dotnet":
      return new DotnetAdapter();
    case "rust":
      return new RustAdapter();
    case "go":
      return new GoAdapter();
    case "generic":
      return new GenericAdapter();
    default:
      throw new Error(`Unsupported framework adapter: ${framework}`);
  }
}
function resolveFramework(explicitFramework, projectRoot) {
  if (explicitFramework && explicitFramework !== "unknown") {
    return explicitFramework;
  }
  const detected = detectFramework(projectRoot);
  return detected;
}
var DISCOVERY_COMMANDS = {
  vitest: {
    cmd: ["npx", "vitest", "list", "--json"],
    count: (out) => {
      try {
        const data = JSON.parse(out);
        if (Array.isArray(data)) return data.length;
      } catch {
        return out.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith(" ")).length;
      }
      return 0;
    }
  },
  jest: {
    cmd: ["npx", "jest", "--listTests"],
    count: (out) => out.split(/\r?\n/).filter((l) => l.trim()).length
  },
  pytest: {
    cmd: ["python3", "-m", "pytest", "--collect-only", "-q"],
    count: (out) => out.split(/\r?\n/).filter((l) => l.includes("::")).length
  },
  dotnet: {
    cmd: ["dotnet", "test", "--list-tests", "-v=q"],
    count: (out) => out.split(/\r?\n/).filter((l) => l.startsWith("    ")).length
  },
  rust: {
    cmd: ["cargo", "test", "--", "--list"],
    count: (out) => out.split(/\r?\n/).filter((l) => l.includes(": test")).length
  },
  go: {
    cmd: ["go", "test", "-list", ".*", "./..."],
    count: (out) => out.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("ok")).length
  }
};
function extractFileFilters(commandArgs) {
  const filters = [];
  let pastSubcommand = false;
  for (let i = 0; i < commandArgs.length; i++) {
    const arg = commandArgs[i];
    if (i < 2) continue;
    if (!pastSubcommand && ["run", "list", "test", "--", "-m"].includes(arg)) {
      pastSubcommand = true;
      continue;
    }
    if (arg.startsWith("-")) {
      if (i + 1 < commandArgs.length && !commandArgs[i + 1].startsWith("-")) i++;
      continue;
    }
    if (arg.includes("/") || arg.endsWith(".ts") || arg.endsWith(".js") || arg.endsWith(".py") || arg.endsWith(".rs")) {
      filters.push(arg);
    }
  }
  return filters;
}
function discoverTestCount(framework, projectRoot, commandArgs = []) {
  const config = DISCOVERY_COMMANDS[framework];
  if (!config) return 0;
  const fileFilters = extractFileFilters(commandArgs);
  const discoveryCmd = [...config.cmd, ...fileFilters];
  try {
    const result = spawnSync2(discoveryCmd[0], discoveryCmd.slice(1), {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 6e4,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", VITEST_LIST: "1" }
    });
    if (result.status !== 0 || !result.stdout) {
      if (result.stderr) {
        process.stderr.write(`[discovery] ${framework}: ${result.stderr.slice(0, 200)}
`);
      }
      return 0;
    }
    const count = config.count(result.stdout);
    if (count > 0) {
      process.stderr.write(`[discovery] ${framework}: ${count} tests found
`);
    }
    return count;
  } catch (err) {
    process.stderr.write(`[discovery] ${framework}: ${err instanceof Error ? err.message : String(err)}
`);
    return 0;
  }
}
async function passthrough(commandArgs, childEnv) {
  const child = spawn(commandArgs[0], commandArgs.slice(1), {
    stdio: "inherit",
    cwd: PROJECT,
    env: { ...process.env, ...childEnv },
    // POSIX: own process group so the whole tree can be signalled via kill(-pid) (FR-16/FR-4).
    detached: process.platform !== "win32"
  });
  let selfTimeout;
  let forceTimer;
  let terminating = false;
  const graceMs = resolveKillGraceMs(process.env.TEST_RUNNER_KILL_GRACE_MS);
  const beginTermination = (reason) => {
    if (terminating) return;
    terminating = true;
    if (selfTimeout) {
      clearTimeout(selfTimeout);
      selfTimeout = void 0;
    }
    if (!child.pid) return;
    process.stderr.write(`[terminate] graceful reason=${reason} pid=${child.pid} graceMs=${graceMs}
`);
    signalProcessTree(child.pid);
    forceTimer = setTimeout(() => {
      if (child.pid) {
        process.stderr.write(`[terminate] force pid=${child.pid}
`);
        forceKillProcessTree(child.pid);
      }
    }, graceMs);
  };
  process.on("SIGTERM", () => beginTermination("SIGTERM"));
  process.on("SIGINT", () => beginTermination("SIGINT"));
  process.on("SIGHUP", () => beginTermination("SIGHUP"));
  const selfTimeoutMs = resolveSelfTimeoutMs(process.env.TEST_RUNNER_TIMEOUT_MS);
  if (selfTimeoutMs > 0) {
    selfTimeout = setTimeout(() => beginTermination("timeout"), selfTimeoutMs);
    selfTimeout.unref?.();
  }
  return new Promise((resolve2) => {
    const done = (v) => {
      if (selfTimeout) {
        clearTimeout(selfTimeout);
        selfTimeout = void 0;
      }
      if (forceTimer) {
        clearTimeout(forceTimer);
        forceTimer = void 0;
      }
      resolve2(v);
    };
    child.on("error", () => done(1));
    child.on("close", (code, signal) => done(code ?? (signal ? 1 : 0)));
  });
}
function createEvent(type, errorMessage) {
  return {
    type,
    errorMessage,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.commandArgs.length === 0) {
    process.stderr.write("Usage: test_runner_wrapper.ts [--framework <name>] -- <test-command>\n");
    return 1;
  }
  if (!SESSION) {
    return passthrough(parsed.commandArgs, parsed.childEnv);
  }
  const prefix = SESSION.length >= 8 ? SESSION.slice(0, 8) : SESSION;
  const projectRoot = path3.resolve(PROJECT);
  const statusDirRel = process.env.TEST_STATUS_DIR || ".dev-pomogator/.test-status";
  const statusDir = path3.join(projectRoot, statusDirRel);
  const statusFile = path3.join(statusDir, `status.${prefix}.yaml`);
  const logFile = path3.join(statusDir, `test.${prefix}.log`);
  const logFileForYaml = statusDirRel.replace(/\\/g, "/") + `/test.${prefix}.log`;
  const framework = resolveFramework(parsed.framework, projectRoot);
  fs4.mkdirSync(statusDir, { recursive: true });
  fs4.writeFileSync(logFile, "", "utf-8");
  const skipDiscovery = process.env.TEST_SKIP_DISCOVERY === "1" || process.env.DEV_POMOGATOR_TEST_IN_DOCKER === "1";
  const discoveryTotal = skipDiscovery ? 0 : discoverTestCount(framework, projectRoot, parsed.commandArgs);
  const writer = new YamlWriter(statusFile, prefix, framework, logFileForYaml, 1e3, process.pid);
  if (discoveryTotal > 0) {
    writer.setDiscoveryTotal(discoveryTotal);
  }
  writer.write();
  const markerDir = path3.join(projectRoot, ".dev-pomogator");
  let sessionPrefix = "";
  try {
    const sessionEnvPath = path3.join(markerDir, ".test-status", "session.env");
    const envContent = fs4.readFileSync(sessionEnvPath, "utf-8");
    const match = envContent.match(/^TEST_STATUSLINE_SESSION=(.+)$/m);
    if (match) sessionPrefix = match[1].trim();
  } catch {
  }
  const markerName = sessionPrefix ? `.bg-task-active.${sessionPrefix}` : ".bg-task-active";
  const markerPath = path3.join(markerDir, markerName);
  try {
    if (fs4.existsSync(markerPath)) {
      const existing = fs4.readFileSync(markerPath, "utf-8").trim();
      const existingPid = parseInt(existing.split(" ")[0], 10);
      if (existingPid && existingPid !== process.pid) {
        try {
          process.kill(existingPid, 0);
        } catch {
          fs4.unlinkSync(markerPath);
          process.stderr.write(`[marker] CLEANED stale marker pid=${existingPid}
`);
        }
      }
    }
  } catch {
  }
  try {
    fs4.mkdirSync(markerDir, { recursive: true });
    fs4.writeFileSync(markerPath, `${process.pid} ${(/* @__PURE__ */ new Date()).toISOString()}
`);
    process.stderr.write(`[marker] CREATED ${markerPath} pid=${process.pid}
`);
  } catch {
  }
  const cleanupMarker = (reason) => {
    try {
      fs4.unlinkSync(markerPath);
      process.stderr.write(`[marker] DELETED ${markerPath} reason=${reason}
`);
    } catch {
    }
  };
  process.on("exit", (code) => cleanupMarker(`exit(${code})`));
  let selfTimeout;
  let adapter;
  try {
    adapter = getAdapter(framework);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}
`);
    writer.processEvent(createEvent("error", message));
    writer.finalize(2);
    return 2;
  }
  const logStream = fs4.createWriteStream(logFile, { flags: "a" });
  const child = spawn(parsed.commandArgs[0], parsed.commandArgs.slice(1), {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...parsed.childEnv },
    // POSIX: own process group so the whole tree can be signalled via kill(-pid) (FR-16/FR-4).
    detached: process.platform !== "win32"
  });
  child.stdin?.end();
  const heartbeat = setInterval(() => {
    writer.write();
  }, 2e3);
  let forceTimer;
  let terminating = false;
  const graceMs = resolveKillGraceMs(process.env.TEST_RUNNER_KILL_GRACE_MS);
  const beginTermination = (reason) => {
    if (terminating) return;
    terminating = true;
    if (selfTimeout) {
      clearTimeout(selfTimeout);
      selfTimeout = void 0;
    }
    if (!child.pid) return;
    process.stderr.write(`[terminate] graceful reason=${reason} pid=${child.pid} graceMs=${graceMs}
`);
    signalProcessTree(child.pid);
    forceTimer = setTimeout(() => {
      if (child.pid) {
        process.stderr.write(`[terminate] force pid=${child.pid}
`);
        forceKillProcessTree(child.pid);
      }
    }, graceMs);
  };
  process.on("SIGTERM", () => beginTermination("SIGTERM"));
  process.on("SIGINT", () => beginTermination("SIGINT"));
  process.on("SIGHUP", () => beginTermination("SIGHUP"));
  const selfTimeoutMs = resolveSelfTimeoutMs(process.env.TEST_RUNNER_TIMEOUT_MS);
  if (selfTimeoutMs > 0) {
    selfTimeout = setTimeout(() => {
      writer.processEvent(createEvent("error", `run exceeded TEST_RUNNER_TIMEOUT_MS (${selfTimeoutMs}ms) \u2014 terminating`));
      writer.write();
      beginTermination("timeout");
    }, selfTimeoutMs);
    selfTimeout.unref?.();
  }
  let childError = null;
  const buffers = {
    stdout: "",
    stderr: ""
  };
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
  const parseLines = (streamName, text) => {
    buffers[streamName] += text;
    const lines = buffers[streamName].split(/\r?\n/);
    buffers[streamName] = lines.pop() ?? "";
    let changed = false;
    for (const line of lines) {
      const event = adapter.parseLine(stripAnsi(line));
      if (!event) {
        continue;
      }
      writer.processEvent(event);
      changed = true;
    }
    if (changed) {
      writer.markRunning();
      writer.writeIfNeeded();
    }
  };
  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString("utf-8");
    process.stdout.write(text);
    logStream.write(text);
    parseLines("stdout", text);
  });
  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString("utf-8");
    process.stderr.write(text);
    logStream.write(text);
    parseLines("stderr", text);
  });
  child.on("error", (error) => {
    childError = error.message;
    writer.processEvent(createEvent("error", error.message));
    writer.write();
  });
  const flushRemainders = () => {
    for (const key of ["stdout", "stderr"]) {
      const line = buffers[key].trimEnd();
      if (!line) {
        continue;
      }
      const event = adapter.parseLine(stripAnsi(line));
      if (event) {
        writer.processEvent(event);
      }
      buffers[key] = "";
    }
  };
  return new Promise((resolve2) => {
    child.on("close", (code, signal) => {
      clearInterval(heartbeat);
      if (selfTimeout) {
        clearTimeout(selfTimeout);
        selfTimeout = void 0;
      }
      if (forceTimer) {
        clearTimeout(forceTimer);
        forceTimer = void 0;
      }
      flushRemainders();
      const exitCode = childError ? 1 : code !== null ? code : signal ? 1 : 0;
      if (childError) {
        writer.processEvent(createEvent("error", childError));
      }
      logStream.end(() => {
        writer.finalize(exitCode);
        resolve2(exitCode);
      });
    });
  });
}
main().then((code) => process.exit(code));
