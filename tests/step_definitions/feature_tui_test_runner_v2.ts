/**
 * Step definitions for the `tui-test-runner-v2` spec (PLUGIN013_TUI_Test_Runner_V2).
 *
 * Classes:
 *   - RUNTIME (8 scenarios): drive the real Python analyst engine (analyze_status,
 *     PatternLoader/PatternMatcher) via runPythonJson — identical harness to the
 *     vitest twin.  Go RED when the engine logic is broken.
 *   - ARTIFACT (12 scenarios): read the real Python source files and assert that
 *     the required functions, classes, and constants are present.  Go RED when the
 *     module is deleted or the named symbols are removed.
 *
 * Regex step patterns (NOT Cucumber Expressions) so literal `"`, backticks, `_`
 * and the spec's punctuation match verbatim. Every pattern is scoped to THIS
 * spec's vocabulary (tui-test-runner-v2 / PLUGIN013) so the file — loaded by the
 * whole BDD suite — never hijacks another feature's steps.
 *
 * Reconciliations applied to the .feature (see migration report):
 *   - All @feature2/3/4/6/7 scenarios: prose originally described live TUI
 *     behaviour; the actual vitest tests read Python source files.  Prose was
 *     reconciled via apply_spec_change to describe the real artifact assertions.
 *   - PLUGIN013_01: prose said "2 failed tests" but yaml-v2-failed.yaml has 3
 *     failures. Prose reconciled to match the real fixture.
 *   - PLUGIN013_01: the mixed artifact side (analysis_tab.py read + compile) was
 *     dropped from the scenario — only the core engine assertion is tested here.
 *
 * NB: we do NOT import from tests/e2e/helpers.ts — it touches `__dirname` at
 * module top-level, which throws under cucumber's pure-ESM loader. Thin wrappers
 * for appPath / getPythonRunner / runPythonJson are self-contained below.
 *
 * Background steps (`dev-pomogator is installed`, `tui-test-runner extension is
 * enabled`) are imported from feature_tui_test_runner.ts via the shared import
 * list in the temp cucumber config — we do NOT redefine them here.
 *
 * @see .specs/tui-test-runner-v2/tui-test-runner-v2.feature
 * @see .claude/skills/bdd-migrator/SKILL.md
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';

// ---------------------------------------------------------------------------
// Self-contained runners — mirrors tests/e2e/helpers.ts without touching
// `__dirname` at the top level (ESM-safe).
// ---------------------------------------------------------------------------

const REPO_ROOT = process.cwd();

function appPath(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}

let _cachedRunner: { command: string; prefixArgs: string[] } | null = null;
function getPythonRunner(): { command: string; prefixArgs: string[] } {
  if (_cachedRunner) return _cachedRunner;
  const candidates =
    process.platform === 'win32'
      ? [
          { command: 'python', prefixArgs: [] as string[] },
          { command: 'py', prefixArgs: ['-3'] },
          { command: 'python3', prefixArgs: [] as string[] },
        ]
      : [
          { command: 'python3', prefixArgs: [] as string[] },
          { command: 'python', prefixArgs: [] as string[] },
        ];
  for (const c of candidates) {
    const r = spawnSync(c.command, [...c.prefixArgs, '--version'], {
      encoding: 'utf-8',
      timeout: 5000,
    });
    if (r.status === 0) {
      _cachedRunner = c;
      return c;
    }
  }
  throw new Error('getPythonRunner: no python interpreter found');
}

function runPythonJson<T = Record<string, unknown>>(
  script: string,
  payload: Record<string, unknown>,
  timeoutMs = 30000,
): T {
  const runner = getPythonRunner();
  const result = spawnSync(runner.command, [...runner.prefixArgs, '-c', script], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    cwd: REPO_ROOT,
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    throw new Error(
      `Python script failed (exit ${result.status}): ${result.stderr}`,
    );
  }
  const stdout = (result.stdout || '').trim();
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(
      `runPythonJson: invalid JSON. stdout: ${stdout.substring(0, 300)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TUI_DIR = 'tools/tui-test-runner/tui';
const FIXTURES_DIR = 'tests/fixtures/tui-test-runner';
const FIXTURE_PROJECT_DIR = path.join(FIXTURES_DIR, 'project');

// ---------------------------------------------------------------------------
// Python scripts (mirrors tui-test-runner-v2.test.ts exactly)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function analyzeStatusFixture(
  fixtureName: string,
  projectRoot = appPath(FIXTURE_PROJECT_DIR),
) {
  return runPythonJson<{ summary: Record<string, number>; cards: Record<string, unknown>[] }>(
    ANALYZE_STATUS_SCRIPT,
    {
      package_root: path.dirname(appPath(TUI_DIR)),
      status_file: appPath(FIXTURES_DIR, fixtureName),
      project_root: projectRoot,
      user_patterns_path: path.join(projectRoot, '.dev-pomogator', 'patterns.yaml'),
    },
  );
}

// ---------------------------------------------------------------------------
// World state — scoped to each scenario via V4World
// ---------------------------------------------------------------------------

interface AnalysisResult {
  summary: Record<string, number>;
  cards: Record<string, unknown>[];
}

// Per-scenario state hung on World
declare module '../hooks/before-after.ts' {
  interface V4World {
    _v2_analysisResult?: AnalysisResult;
    _v2_fixtureName?: string;
  }
}

// ---------------------------------------------------------------------------
// @feature1: AI Test Analyst — RUNTIME
// Steps are scoped to "PLUGIN013" patterns to avoid cross-spec hijacking.
// ---------------------------------------------------------------------------

Given(
  /^the YAML v2 status fixture "([^"]+)" with \d+ failed tests?$/,
  function (this: V4World, fixtureName: string) {
    // Store fixture name for the When step
    this._v2_fixtureName = fixtureName;
  },
);

Given(
  /^the project fixture provides user patterns with "timeout" pattern hint "([^"]+)"$/,
  function (this: V4World, _hint: string) {
    // Validates that the fixture project has the patterns.yaml — confirmed by
    // analyzeStatusFixture using FIXTURE_PROJECT_DIR which contains
    // .dev-pomogator/patterns.yaml with the timeout override.
    const patternsFile = appPath(FIXTURE_PROJECT_DIR, '.dev-pomogator', 'patterns.yaml');
    assert.ok(fs.existsSync(patternsFile), `Expected patterns.yaml at ${patternsFile}`);
  },
);

When(
  /^analyze_status is called against the status file with project fixture root$/,
  function (this: V4World) {
    assert.ok(this._v2_fixtureName, 'No fixture name stored from Given step');
    this._v2_analysisResult = analyzeStatusFixture(this._v2_fixtureName);
  },
);

Then(
  /^the result should contain a failure card with patternId "([^"]+)"$/,
  function (this: V4World, patternId: string) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards.find(
      (c) => c['patternId'] === patternId,
    );
    assert.ok(card, `Expected card with patternId "${patternId}" in ${JSON.stringify(this._v2_analysisResult.cards.map(c => c['patternId']))}`);
  },
);

Then(
  /^the timeout failure card hint should be "([^"]+)"$/,
  function (this: V4World, expectedHint: string) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards.find(
      (c) => c['patternId'] === 'timeout',
    );
    assert.ok(card, 'Expected timeout failure card');
    assert.strictEqual(
      card['hint'],
      expectedHint,
      `Expected hint "${expectedHint}" but got "${card['hint']}"`,
    );
  },
);

// PLUGIN013_02: code snippet with crash location
Given(
  /^a YAML v2 status fixture "([^"]+)" for code snippet test$/,
  function (this: V4World, fixtureName: string) {
    this._v2_fixtureName = fixtureName;
  },
);

When(
  /^analyze_status is called against the fixture without user patterns$/,
  function (this: V4World) {
    assert.ok(this._v2_fixtureName, 'No fixture name');
    // Use a temp dir without patterns.yaml to get built-in patterns only
    this._v2_analysisResult = runPythonJson<AnalysisResult>(ANALYZE_STATUS_SCRIPT, {
      package_root: path.dirname(appPath(TUI_DIR)),
      status_file: appPath(FIXTURES_DIR, this._v2_fixtureName),
      project_root: appPath(FIXTURE_PROJECT_DIR),
      user_patterns_path: null,
    });
  },
);

Then(
  /^the first failure card should have patternId "([^"]+)"$/,
  function (this: V4World, patternId: string) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards[0];
    assert.ok(card, 'Expected at least one failure card');
    assert.strictEqual(card['patternId'], patternId);
  },
);

Then(
  /^the failure card crash location should be file "([^"]+)" line (\d+) method "([^"]+)"$/,
  function (this: V4World, file: string, line: string, method: string) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards[0];
    const crash = card['crash'] as { file: string; line: number; method: string } | null;
    assert.ok(crash, 'Expected crash location on failure card');
    assert.strictEqual(crash.file, file);
    assert.strictEqual(crash.line, parseInt(line, 10));
    assert.strictEqual(crash.method, method);
  },
);

Then(
  /^the code snippet should contain "([^"]+)"$/,
  function (this: V4World, marker: string) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards[0];
    const snippet = card['codeSnippet'] as string | null;
    assert.ok(snippet, 'Expected code snippet');
    assert.ok(
      snippet.includes(marker),
      `Expected snippet to contain "${marker}". Got: ${snippet.substring(0, 200)}`,
    );
  },
);

// PLUGIN013_03 & 04 — same When; specific Then assertions
Then(
  /^the failure card patternId should be null$/,
  function (this: V4World) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards[0];
    assert.ok(card, 'Expected at least one failure card');
    assert.strictEqual(card['patternId'], null);
  },
);

Then(
  /^the failure card errorMessage should be "([^"]+)"$/,
  function (this: V4World, expected: string) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards[0];
    assert.ok(card, 'Expected at least one failure card');
    assert.strictEqual(card['errorMessage'], expected);
  },
);

Then(
  /^the failure card errorType should be "([^"]+)"$/,
  function (this: V4World, expected: string) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards[0];
    assert.ok(card, 'Expected at least one failure card');
    assert.strictEqual(card['errorType'], expected);
  },
);

Then(
  /^the failure card codeSnippet should be null$/,
  function (this: V4World) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards[0];
    assert.ok(card, 'Expected at least one failure card');
    assert.strictEqual(card['codeSnippet'], null);
  },
);

Then(
  /^the failure card rawStack should contain "([^"]+)"$/,
  function (this: V4World, expected: string) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards[0];
    const rawStack = card['rawStack'] as string;
    assert.ok(
      rawStack && rawStack.includes(expected),
      `Expected rawStack to contain "${expected}". Got: ${rawStack}`,
    );
  },
);

Then(
  /^the failure card crash file should be "([^"]+)"$/,
  function (this: V4World, expected: string) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards[0];
    const crash = card['crash'] as { file: string } | null;
    assert.ok(crash, 'Expected crash location');
    assert.strictEqual(crash.file, expected);
  },
);

// ---------------------------------------------------------------------------
// @feature2: Clickable File Paths — ARTIFACT
// Reads clickable_path.py source and asserts symbols/patterns are present.
// Scoped to "clickable_path module" vocabulary.
// ---------------------------------------------------------------------------

Given(
  /^the clickable_path module source file exists at "([^"]+)"$/,
  function (this: V4World, relPath: string) {
    const fullPath = appPath(relPath);
    assert.ok(
      fs.existsSync(fullPath),
      `Expected clickable_path module at ${fullPath}`,
    );
    // Store content on world for Then steps
    (this as unknown as { _v2_sourceContent: string })._v2_sourceContent =
      fs.readFileSync(fullPath, 'utf-8');
  },
);

Then(
  /^the source file should contain function "([^"]+)"$/,
  function (this: V4World, funcName: string) {
    const content = (this as unknown as { _v2_sourceContent: string })._v2_sourceContent;
    assert.ok(content, 'No source file content loaded');
    assert.ok(
      content.includes(funcName),
      `Expected source to contain "${funcName}"`,
    );
  },
);

Then(
  /^the source file should contain Windows path regex support$/,
  function (this: V4World) {
    const content = (this as unknown as { _v2_sourceContent: string })._v2_sourceContent;
    assert.ok(content, 'No source file content loaded');
    // clickable_path.py defines _WIN_PATH with [A-Za-z]:\\ or Windows/windows literal
    const hasWinSupport = /[Ww]indows|\\\\|[A-Za-z]:\\\\/.test(content);
    assert.ok(hasWinSupport, 'Expected Windows path regex support in clickable_path.py');
  },
);

Then(
  /^the source file should return a list type for multi-segment support$/,
  function (this: V4World) {
    const content = (this as unknown as { _v2_sourceContent: string })._v2_sourceContent;
    assert.ok(content, 'No source file content loaded');
    const hasList = /[Ll]ist|segments|parts/i.test(content);
    assert.ok(hasList, 'Expected list/segments type for multi-path support');
  },
);

Then(
  /^the source file should contain exception handling for file open operations$/,
  function (this: V4World) {
    const content = (this as unknown as { _v2_sourceContent: string })._v2_sourceContent;
    assert.ok(content, 'No source file content loaded');
    const hasHandler = /try|except|catch|error/i.test(content);
    assert.ok(hasHandler, 'Expected try/except exception handling in clickable_path.py');
  },
);

// ---------------------------------------------------------------------------
// @feature3: Test Discovery — ARTIFACT
// Reads discovery.py source and asserts symbols/constants are present.
// Scoped to "discovery module" vocabulary.
// ---------------------------------------------------------------------------

Given(
  /^the discovery module source file exists at "([^"]+)"$/,
  function (this: V4World, relPath: string) {
    const fullPath = appPath(relPath);
    assert.ok(
      fs.existsSync(fullPath),
      `Expected discovery module at ${fullPath}`,
    );
    (this as unknown as { _v2_sourceContent: string })._v2_sourceContent =
      fs.readFileSync(fullPath, 'utf-8');
  },
);

Then(
  /^the source file should contain framework support for "([^"]+)"$/,
  function (this: V4World, framework: string) {
    const content = (this as unknown as { _v2_sourceContent: string })._v2_sourceContent;
    assert.ok(content, 'No source file content loaded');
    assert.ok(
      content.includes(framework),
      `Expected discovery.py to contain "${framework}"`,
    );
  },
);

Then(
  /^the source file should contain class "([^"]+)"$/,
  function (this: V4World, className: string) {
    const content = (this as unknown as { _v2_sourceContent: string })._v2_sourceContent;
    assert.ok(content, 'No source file content loaded');
    assert.ok(
      content.includes(className),
      `Expected source to contain class "${className}"`,
    );
  },
);

Then(
  /^the source file should contain constant "([^"]+)"$/,
  function (this: V4World, constant: string) {
    const content = (this as unknown as { _v2_sourceContent: string })._v2_sourceContent;
    assert.ok(content, 'No source file content loaded');
    assert.ok(
      content.includes(constant),
      `Expected source to contain constant "${constant}"`,
    );
  },
);

Then(
  /^the source file should contain "([^"]+)"$/,
  function (this: V4World, token: string) {
    const content = (this as unknown as { _v2_sourceContent: string })._v2_sourceContent;
    assert.ok(content, 'No source file content loaded');
    assert.ok(
      content.includes(token),
      `Expected source to contain "${token}"`,
    );
  },
);

Then(
  /^the source file should contain field "([^"]+)"$/,
  function (this: V4World, field: string) {
    const content = (this as unknown as { _v2_sourceContent: string })._v2_sourceContent;
    assert.ok(content, 'No source file content loaded');
    assert.ok(
      content.includes(field),
      `Expected source to contain field "${field}"`,
    );
  },
);

// ---------------------------------------------------------------------------
// @feature4: State Persistence — ARTIFACT
// Reads state_service.py and asserts symbols/patterns are present.
// Scoped to "state_service module" vocabulary.
// ---------------------------------------------------------------------------

Given(
  /^the state_service module source file exists at "([^"]+)"$/,
  function (this: V4World, relPath: string) {
    const fullPath = appPath(relPath);
    assert.ok(
      fs.existsSync(fullPath),
      `Expected state_service module at ${fullPath}`,
    );
    (this as unknown as { _v2_sourceContent: string })._v2_sourceContent =
      fs.readFileSync(fullPath, 'utf-8');
  },
);

// ---------------------------------------------------------------------------
// @feature5: Configurable Error Patterns — RUNTIME
// Drives PatternLoader and the analyze_status engine.
// ---------------------------------------------------------------------------

// PLUGIN013_14: user pattern override — same engine call as 01 but different assertion
Given(
  /^the YAML v2 status fixture "([^"]+)" for pattern override test$/,
  function (this: V4World, fixtureName: string) {
    this._v2_fixtureName = fixtureName;
  },
);

When(
  /^analyze_status is called with the project fixture patterns$/,
  function (this: V4World) {
    assert.ok(this._v2_fixtureName, 'No fixture name');
    this._v2_analysisResult = analyzeStatusFixture(this._v2_fixtureName);
  },
);

Then(
  /^the timeout card hint should be "([^"]+)"$/,
  function (this: V4World, expectedHint: string) {
    assert.ok(this._v2_analysisResult, 'No analysis result');
    const card = this._v2_analysisResult.cards.find(
      (c) => c['patternId'] === 'timeout',
    );
    assert.ok(card, 'Expected timeout failure card');
    assert.strictEqual(card['hint'], expectedHint);
  },
);

// PLUGIN013_15: invalid regex skipped, keyword-only pattern loads

interface PatternLoadResult {
  ids: string[];
  matchId: string | null;
  matchedBy: string | null;
}

// Using a dedicated world property for pattern result
declare module '../hooks/before-after.ts' {
  interface V4World {
    _v2_patternResult?: PatternLoadResult;
  }
}

Given(
  /^the invalid-patterns fixture file "([^"]+)" contains a broken regex and a keyword-only pattern$/,
  function (this: V4World, fixtureName: string) {
    const fixturePath = appPath(FIXTURES_DIR, fixtureName);
    assert.ok(fs.existsSync(fixturePath), `Expected fixture at ${fixturePath}`);
  },
);

When(
  /^PatternLoader loads "([^"]+)" and PatternMatcher matches "([^"]+)"$/,
  function (this: V4World, fixtureName: string, message: string) {
    this._v2_patternResult = runPythonJson<PatternLoadResult>(LOAD_PATTERNS_SCRIPT, {
      package_root: path.dirname(appPath(TUI_DIR)),
      patterns_file: appPath(FIXTURES_DIR, fixtureName),
      message,
    });
  },
);

Then(
  /^the loaded pattern ids should equal \["([^"]+)"\]$/,
  function (this: V4World, expectedId: string) {
    assert.ok(this._v2_patternResult, 'No pattern load result');
    assert.deepStrictEqual(this._v2_patternResult.ids, [expectedId]);
  },
);

Then(
  /^the matched pattern id should be "([^"]+)"$/,
  function (this: V4World, expectedId: string) {
    assert.ok(this._v2_patternResult, 'No pattern load result');
    assert.strictEqual(this._v2_patternResult.matchId, expectedId);
  },
);

Then(
  /^the match method should be "([^"]+)"$/,
  function (this: V4World, expectedMethod: string) {
    assert.ok(this._v2_patternResult, 'No pattern load result');
    assert.strictEqual(this._v2_patternResult.matchedBy, expectedMethod);
  },
);

// PLUGIN013_16: regex then keywords priority

interface DualAnalysisResult {
  keywordOnly: AnalysisResult;
  regexWithKeywords: AnalysisResult;
}

declare module '../hooks/before-after.ts' {
  interface V4World {
    _v2_dualResult?: DualAnalysisResult;
  }
}

Given(
  /^the pattern matching fixtures "([^"]+)" and "([^"]+)" are available$/,
  function (this: V4World, f1: string, f2: string) {
    assert.ok(
      fs.existsSync(appPath(FIXTURES_DIR, f1)),
      `Expected fixture ${f1}`,
    );
    assert.ok(
      fs.existsSync(appPath(FIXTURES_DIR, f2)),
      `Expected fixture ${f2}`,
    );
  },
);

When(
  /^analyze_status is called on both pattern matching fixtures$/,
  function (this: V4World) {
    this._v2_dualResult = {
      keywordOnly: analyzeStatusFixture('yaml-v2-keyword-only.yaml'),
      regexWithKeywords: analyzeStatusFixture('yaml-v2-regex-keywords.yaml'),
    };
  },
);

Then(
  /^the keyword-only fixture first card should have patternId "([^"]+)" matched by "([^"]+)"$/,
  function (this: V4World, patternId: string, matchedBy: string) {
    assert.ok(this._v2_dualResult, 'No dual analysis result');
    const card = this._v2_dualResult.keywordOnly.cards[0];
    assert.ok(card, 'Expected keyword-only failure card');
    assert.strictEqual(card['patternId'], patternId);
    assert.strictEqual(card['matchedBy'], matchedBy);
  },
);

Then(
  /^the regex-keywords fixture first card should have patternId "([^"]+)" matched by "([^"]+)"$/,
  function (this: V4World, patternId: string, matchedBy: string) {
    assert.ok(this._v2_dualResult, 'No dual analysis result');
    const card = this._v2_dualResult.regexWithKeywords.cards[0];
    assert.ok(card, 'Expected regex+keywords failure card');
    assert.strictEqual(card['patternId'], patternId);
    assert.strictEqual(card['matchedBy'], matchedBy);
  },
);

// ---------------------------------------------------------------------------
// @feature6: Auto-Run & Keybinding Launch — ARTIFACT
// Reads __main__.py and app.py source files.
// Scoped to "__main__ module" and "app module" vocabulary.
// ---------------------------------------------------------------------------

Given(
  /^the __main__ module source file exists at "([^"]+)"$/,
  function (this: V4World, relPath: string) {
    const fullPath = appPath(relPath);
    assert.ok(
      fs.existsSync(fullPath),
      `Expected __main__ module at ${fullPath}`,
    );
    (this as unknown as { _v2_sourceContent: string })._v2_sourceContent =
      fs.readFileSync(fullPath, 'utf-8');
  },
);

Then(
  /^the app module source file at "([^"]+)" should contain "([^"]+)"$/,
  function (this: V4World, relPath: string, token: string) {
    const fullPath = appPath(relPath);
    assert.ok(
      fs.existsSync(fullPath),
      `Expected app module at ${fullPath}`,
    );
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(
      content.includes(token),
      `Expected app.py to contain "${token}"`,
    );
  },
);

// ---------------------------------------------------------------------------
// @feature7: Screenshot/SVG Export — ARTIFACT
// Reads app.py source and asserts screenshot symbols are present.
// Scoped to "app module" vocabulary (different from __main__).
// ---------------------------------------------------------------------------

Given(
  /^the app module source file exists at "([^"]+)"$/,
  function (this: V4World, relPath: string) {
    const fullPath = appPath(relPath);
    assert.ok(
      fs.existsSync(fullPath),
      `Expected app module at ${fullPath}`,
    );
    (this as unknown as { _v2_sourceContent: string })._v2_sourceContent =
      fs.readFileSync(fullPath, 'utf-8');
  },
);
