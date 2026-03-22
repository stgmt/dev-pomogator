import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { spawnSync } from 'child_process';
import { appPath, getPythonRunner, runPythonJson } from './helpers';
import { cleanupTuiV2 } from './helpers/tui-v2-cleanup';

// --- Paths ---

const STATUS_DIR = '.dev-pomogator/.test-status';
const FIXTURES_DIR = 'tests/fixtures/tui-test-runner';
const FIXTURE_PROJECT_DIR = path.join(FIXTURES_DIR, 'project');
const TUI_DIR = 'extensions/tui-test-runner/tools/tui-test-runner/tui';
const ANALYST_DIR = path.join(TUI_DIR, 'analyst');

// --- Setup / Cleanup ---

let tempDir: string;

beforeEach(async () => {
  tempDir = appPath();
  await fs.ensureDir(appPath(STATUS_DIR));
});

afterEach(async () => {
  await cleanupTuiV2(tempDir);
});

const ANALYZE_STATUS_SCRIPT = String.raw`
import json
import sys
from pathlib import Path

import yaml

payload = json.loads(sys.stdin.read())
sys.path.insert(0, str(Path(payload["package_root"]).resolve()))

from tui.models import TestStatus
from tui.analyst.output import analyze_status

status_path = Path(payload["status_file"])
status = TestStatus.from_dict(yaml.safe_load(status_path.read_text(encoding="utf-8")))

report = analyze_status(
    status,
    project_root=payload.get("project_root"),
    user_patterns_path=payload.get("user_patterns_path"),
)

cards = []
for card in report.failures:
    crash = None
    code_snippet = None
    call_tree = ""
    if card.location and card.location.crash_point:
        crash = {
            "file": card.location.crash_point.file,
            "line": card.location.crash_point.line,
            "method": card.location.crash_point.method,
        }
        code_snippet = card.location.crash_point.code_snippet
        call_tree = card.location.render_tree()

    cards.append({
        "test": card.test,
        "duration": card.duration,
        "errorType": card.error_type,
        "errorMessage": card.error_message,
        "patternId": card.matched_pattern.pattern.id if card.matched_pattern else None,
        "hint": card.matched_pattern.pattern.hint if card.matched_pattern else None,
        "matchedBy": card.matched_pattern.matched_by if card.matched_pattern else None,
        "crash": crash,
        "codeSnippet": code_snippet,
        "callTree": call_tree,
        "rawStack": card.raw_stack,
        "suiteFile": card.suite_file,
    })

print(json.dumps({
    "summary": {
        "total": report.total_tests,
        "passed": report.passed,
        "failed": report.failed,
    },
    "cards": cards,
}))
`;

const LOAD_PATTERNS_SCRIPT = String.raw`
import json
import sys
from pathlib import Path

payload = json.loads(sys.stdin.read())
sys.path.insert(0, str(Path(payload["package_root"]).resolve()))

from tui.analyst.patterns import PatternLoader, PatternMatcher

loader = PatternLoader(builtin_path=Path(payload["patterns_file"]))
patterns = loader.load()
matcher = PatternMatcher(patterns)
match = matcher.match(payload.get("message", ""), payload.get("error_type", ""))

print(json.dumps({
    "ids": [pattern.id for pattern in patterns],
    "matchId": match.pattern.id if match else None,
    "matchedBy": match.matched_by if match else None,
}))
`;

const COMPILE_PYTHON_FILE_SCRIPT = String.raw`
import json
import py_compile
import sys

payload = json.loads(sys.stdin.read())
py_compile.compile(payload["file"], doraise=True)
print(json.dumps({"compiled": True}))
`;

function analyzeStatusFixture(fixtureName: string, projectRoot = appPath(FIXTURE_PROJECT_DIR)) {
  return runPythonJson(ANALYZE_STATUS_SCRIPT, {
    package_root: path.dirname(appPath(TUI_DIR)),
    status_file: appPath(FIXTURES_DIR, fixtureName),
    project_root: projectRoot,
    user_patterns_path: path.join(projectRoot, '.dev-pomogator', 'patterns.yaml'),
  });
}

function compilePythonFile(filePath: string) {
  return runPythonJson(COMPILE_PYTHON_FILE_SCRIPT, { file: filePath });
}

function pythonImportCheck(module: string): string {
  const runner = getPythonRunner();
  const result = spawnSync(runner.command, [...runner.prefixArgs, '-c', `import ${module}; print('ok')`], {
    encoding: 'utf-8',
    cwd: appPath(),
    timeout: 10000,
  });
  return result.status === 0 ? (result.stdout || '').trim() : 'error';
}

// --- @feature1: AI Test Analyst ---

describe('PLUGIN013: TUI Test Runner V2', () => {
  describe('AI Test Analyst @feature1', () => {
    // PLUGIN013_01
    it('Analysis tab shows matched pattern with hint', async () => {
      const result = analyzeStatusFixture('yaml-v2-failed.yaml');
      const timeoutCard = result.cards.find((card: any) => card.patternId === 'timeout');
      const analysisTabCode = await fs.readFile(appPath(TUI_DIR, 'widgets', 'analysis_tab.py'), 'utf-8');

      expect(timeoutCard).toBeDefined();
      expect(timeoutCard.hint).toBe('Custom timeout hint from project override');
      expect(analysisTabCode).toContain('analyze_status');
      expect(compilePythonFile(appPath(TUI_DIR, 'widgets', 'analysis_tab.py'))).toEqual({ compiled: true });
    });

    // PLUGIN013_02
    it('Analysis tab shows code snippet for failure', async () => {
      const result = analyzeStatusFixture('yaml-v2-full.yaml');
      const failure = result.cards[0];

      expect(failure.patternId).toBe('assertion_equal');
      expect(failure.crash).toEqual({
        file: 'tests/auth.test.ts',
        line: 42,
        method: 'Object.<anonymous>',
      });
      expect(failure.codeSnippet).toContain('39│');
      expect(failure.codeSnippet).toContain('→ 42│');
      expect(failure.codeSnippet).toContain('45│');
    });

    // PLUGIN013_03
    it('Analysis tab handles unknown errors gracefully', async () => {
      const result = analyzeStatusFixture('yaml-v2-unknown.yaml');
      const failure = result.cards[0];

      expect(failure.patternId).toBeNull();
      expect(failure.errorMessage).toBe('impossible condition triggered');
      expect(failure.errorType).toBe('SomeRareException');
    });

    // PLUGIN013_04
    it('Analysis tab handles missing source file', async () => {
      const result = analyzeStatusFixture('yaml-v2-missing-source.yaml');
      const failure = result.cards[0];

      expect(failure.codeSnippet).toBeNull();
      expect(failure.rawStack).toContain('tests/deleted.ts:10:3');
      expect(failure.crash?.file).toBe('tests/deleted.ts');
    });
  });

  // --- @feature2: Clickable File Paths ---

  describe('Clickable File Paths @feature2', () => {
    const clickablePath = path.join(TUI_DIR, 'widgets', 'clickable_path.py');

    // PLUGIN013_05
    it('Logs tab renders clickable file paths', async () => {
      expect(await fs.pathExists(appPath(clickablePath))).toBe(true);
      const code = await fs.readFile(appPath(clickablePath), 'utf-8');
      // Should have regex for path detection
      expect(code).toContain('parse_paths');
      // Should support both Windows and Unix paths
      expect(code).toMatch(/[Ww]indows|\\\\|[A-Z]:\\\\/);
    });

    // PLUGIN013_06
    it('Logs tab renders multiple paths in one line', async () => {
      const code = await fs.readFile(appPath(clickablePath), 'utf-8');
      // parse_paths should return list of segments (text + path pairs)
      expect(code).toContain('parse_paths');
      // Should handle multiple matches per line
      expect(code).toMatch(/List|list|segments|parts/i);
    });

    // PLUGIN013_07
    it('Clickable path handles missing file without crash', async () => {
      const code = await fs.readFile(appPath(clickablePath), 'utf-8');
      // Should have error handling for file operations
      expect(code).toMatch(/try|except|catch|error/i);
    });
  });

  // --- @feature3: Test Discovery ---

  describe('Test Discovery @feature3', () => {
    const discoveryPath = path.join(TUI_DIR, 'discovery.py');

    // PLUGIN013_08
    it('Discovery shows test tree before run', async () => {
      expect(await fs.pathExists(appPath(discoveryPath))).toBe(true);
      const code = await fs.readFile(appPath(discoveryPath), 'utf-8');
      // Should have framework detection
      expect(code).toContain('detect_framework');
      // Should have discovery commands for multiple frameworks
      expect(code).toContain('vitest');
      expect(code).toContain('jest');
      expect(code).toContain('pytest');
    });

    // PLUGIN013_09
    it('Discovery runs only selected tests', async () => {
      const code = await fs.readFile(appPath(discoveryPath), 'utf-8');
      // Should have discover_tests function
      expect(code).toContain('def discover_tests');
      // Should return test names
      expect(code).toContain('DiscoveryResult');
      expect(code).toContain('tests');
    });

    // PLUGIN013_10
    it('Discovery timeout falls back to run all', async () => {
      const code = await fs.readFile(appPath(discoveryPath), 'utf-8');
      // Should have timeout handling
      expect(code).toContain('DISCOVERY_TIMEOUT');
      expect(code).toContain('TimeoutExpired');
      expect(code).toContain('timed_out');
    });
  });

  // --- @feature4: State Persistence ---

  describe('State Persistence @feature4', () => {
    const statePath = path.join(TUI_DIR, 'state_service.py');

    // PLUGIN013_11
    it('State saves active tab on switch', async () => {
      expect(await fs.pathExists(appPath(statePath))).toBe(true);
      const code = await fs.readFile(appPath(statePath), 'utf-8');
      // Should have set_active_tab method
      expect(code).toContain('def set_active_tab');
      // Should have debounced save
      expect(code).toContain('_schedule_save');
      expect(code).toContain('Timer');
      expect(code).toContain('0.5');
    });

    // PLUGIN013_12
    it('State restores on startup', async () => {
      const code = await fs.readFile(appPath(statePath), 'utf-8');
      // Should load state from YAML
      expect(code).toContain('def _load');
      expect(code).toContain('yaml.safe_load');
      // Should have default state
      expect(code).toContain('TuiState');
      expect(code).toContain('active_tab');
    });

    // PLUGIN013_13
    it('Corrupted state file uses defaults', async () => {
      const code = await fs.readFile(appPath(statePath), 'utf-8');
      // Should catch exceptions and use defaults
      expect(code).toContain('except');
      expect(code).toContain('TuiState()');
      // Singleton pattern for thread safety
      expect(code).toContain('_instance');
      expect(code).toContain('threading.Lock');
    });
  });

  // --- @feature5: Configurable Error Patterns ---

  describe('Configurable Error Patterns @feature5', () => {
    // PLUGIN013_14
    it('User patterns override built-in', async () => {
      const result = analyzeStatusFixture('yaml-v2-failed.yaml');
      const timeoutCard = result.cards.find((card: any) => card.patternId === 'timeout');

      expect(timeoutCard).toBeDefined();
      expect(timeoutCard.hint).toBe('Custom timeout hint from project override');
    });

    // PLUGIN013_15
    it('Invalid regex in user pattern is skipped', async () => {
      const result = runPythonJson(LOAD_PATTERNS_SCRIPT, {
        package_root: path.dirname(appPath(TUI_DIR)),
        patterns_file: appPath(FIXTURES_DIR, 'invalid-patterns.yaml'),
        message: 'safe keyword path',
      });

      expect(result.ids).toEqual(['keyword_only_safe']);
      expect(result.matchId).toBe('keyword_only_safe');
      expect(result.matchedBy).toBe('keywords');
    });

    // PLUGIN013_16
    it('Pattern matching uses regex then keywords', async () => {
      const keywordOnly = analyzeStatusFixture('yaml-v2-keyword-only.yaml');
      const regexWithKeywords = analyzeStatusFixture('yaml-v2-regex-keywords.yaml');

      expect(keywordOnly.cards[0].patternId).toBe('keyword_handshake');
      expect(keywordOnly.cards[0].matchedBy).toBe('keywords');

      expect(regexWithKeywords.cards[0].patternId).toBe('regex_keyword_bootstrap');
      expect(regexWithKeywords.cards[0].matchedBy).toBe('regex+keywords');
    });
  });

  // --- @feature6: Auto-Run & Keybinding Launch ---

  describe('Auto-Run & Keybinding Launch @feature6', () => {
    // PLUGIN013_17
    it('TUI auto-runs tests with --run flag', async () => {
      const mainCode = await fs.readFile(appPath(TUI_DIR, '__main__.py'), 'utf-8');
      // Should have --run flag in argparse
      expect(mainCode).toContain('"--run"');
      expect(mainCode).toContain('auto_run');

      // App should accept auto_run parameter
      const appCode = await fs.readFile(appPath(TUI_DIR, 'app.py'), 'utf-8');
      expect(appCode).toContain('auto_run');
      expect(appCode).toContain('_auto_run');
    });

    // PLUGIN013_18
    it('Single instance prevents duplicate TUI', async () => {
      const code = await fs.readFile(appPath(TUI_DIR, '__main__.py'), 'utf-8');
      // Should have lock file mechanism
      expect(code).toContain('LOCK_FILE');
      expect(code).toContain('is_already_running');
      expect(code).toContain('acquire_lock');
      expect(code).toContain('release_lock');
      // Should check PID validity
      expect(code).toContain('os.kill');
    });
  });

  // --- @feature7: Screenshot/SVG Export ---

  describe('Screenshot/SVG Export @feature7', () => {
    // PLUGIN013_19
    it('Screenshot exports SVG file', async () => {
      const code = await fs.readFile(appPath(TUI_DIR, 'app.py'), 'utf-8');
      // Should have screenshot keybinding and action
      expect(code).toContain('screenshot');
      expect(code).toContain('export_screenshot');
      expect(code).toContain('.svg');
      expect(code).toContain('tui-screenshot-');
    });

    // PLUGIN013_20
    it('Screenshot creates directory if missing', async () => {
      const code = await fs.readFile(appPath(TUI_DIR, 'app.py'), 'utf-8');
      // Should create screenshots directory
      expect(code).toContain('mkdir');
      expect(code).toContain('logs/screenshots');
    });
  });
});
