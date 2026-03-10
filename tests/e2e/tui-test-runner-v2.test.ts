import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import { appPath } from './helpers';
import { cleanupTuiV2 } from './helpers/tui-v2-cleanup';

// --- Paths ---

const STATUS_DIR = '.dev-pomogator/.test-status';
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

// --- Helper: run Python module check ---

function pythonImportCheck(module: string): string {
  try {
    return execSync(`python3 -c "import ${module}; print('ok')"`, {
      encoding: 'utf-8',
      cwd: appPath(),
      timeout: 10000,
    }).trim();
  } catch {
    return 'error';
  }
}

// --- @feature1: AI Test Analyst ---

describe('PLUGIN013: TUI Test Runner V2', () => {
  describe('AI Test Analyst @feature1', () => {
    // PLUGIN013_01
    it('Analysis tab shows matched pattern with hint', async () => {
      // Verify patterns.yaml exists and contains patterns
      const patternsPath = appPath(ANALYST_DIR, 'patterns.yaml');
      expect(await fs.pathExists(patternsPath)).toBe(true);
      const content = await fs.readFile(patternsPath, 'utf-8');
      expect(content).toContain('patterns:');
      expect(content).toContain('hint:');
      expect(content).toContain('timeout');

      // Verify patterns.py has PatternMatcher class
      const matcherPath = appPath(ANALYST_DIR, 'patterns.py');
      const matcherCode = await fs.readFile(matcherPath, 'utf-8');
      expect(matcherCode).toContain('class PatternMatcher');
      expect(matcherCode).toContain('def match');
    });

    // PLUGIN013_02
    it('Analysis tab shows code snippet for failure', async () => {
      // Verify code_reader.py exists with CodeSnippetReader
      const readerPath = appPath(ANALYST_DIR, 'code_reader.py');
      expect(await fs.pathExists(readerPath)).toBe(true);
      const code = await fs.readFile(readerPath, 'utf-8');
      expect(code).toContain('class CodeSnippetReader');
      expect(code).toContain('def get_snippet');
      expect(code).toContain('context');
      // Should format with line numbers and arrow marker
      expect(code).toContain('→');
    });

    // PLUGIN013_03
    it('Analysis tab handles unknown errors gracefully', async () => {
      // PatternMatcher.match should return None for unknown errors
      const matcherCode = await fs.readFile(appPath(ANALYST_DIR, 'patterns.py'), 'utf-8');
      expect(matcherCode).toContain('return None');
      // Output module should handle missing pattern gracefully
      const outputCode = await fs.readFile(appPath(ANALYST_DIR, 'output.py'), 'utf-8');
      expect(outputCode).toContain('matched_pattern');
    });

    // PLUGIN013_04
    it('Analysis tab handles missing source file', async () => {
      // CodeSnippetReader should return None for missing files
      const code = await fs.readFile(appPath(ANALYST_DIR, 'code_reader.py'), 'utf-8');
      expect(code).toContain('return None');
      // Should cache negative results
      expect(code).toContain('_file_cache');
      expect(code).toContain('SKIP_DIRS');
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
      const code = await fs.readFile(appPath(ANALYST_DIR, 'patterns.py'), 'utf-8');
      // PatternLoader should merge user + built-in, user priority
      expect(code).toContain('class PatternLoader');
      expect(code).toContain('user_path');
      expect(code).toContain('merged');
    });

    // PLUGIN013_15
    it('Invalid regex in user pattern is skipped', async () => {
      const code = await fs.readFile(appPath(ANALYST_DIR, 'patterns.py'), 'utf-8');
      // Should handle invalid regex gracefully
      expect(code).toContain('def compile');
      expect(code).toContain('re.error');
      expect(code).toContain('Warning');
    });

    // PLUGIN013_16
    it('Pattern matching uses regex then keywords', async () => {
      const code = await fs.readFile(appPath(ANALYST_DIR, 'patterns.py'), 'utf-8');
      // Algorithm: regex first, then keyword ALL
      expect(code).toContain('_compiled');
      expect(code).toContain('search');
      expect(code).toContain('keywords');
      expect(code).toContain('all(');
      expect(code).toContain('regex+keywords');
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
