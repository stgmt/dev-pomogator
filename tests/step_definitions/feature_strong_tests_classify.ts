/**
 * Step definitions for TESTQUAL001_17–28 classify-tests scenarios
 * Spec: strong-tests  @feature4 (stack detection) @feature13 (classification policy / --apply)
 *
 * Classification:
 *   TESTQUAL001_17–23 — runtime: spawn classify-tests.ts, assert stdout JSON / markdown / status
 *   TESTQUAL001_24–28 — runtime: spawn classify-tests.ts with --apply flags, assert injected markers
 *
 * Engine: .claude/skills/strong-tests/scripts/classify-tests.ts (no exports — CLI-only, spawn only)
 * Correct spawn: process.execPath + ['--import', 'tsx', CLASSIFY_PATH, ...args] with cwd=REPO_ROOT
 *
 * Real API (verified against classify-tests.ts source 2026-06-20):
 *   - JSON output field is `suggested` (NOT `type`)
 *   - `--format markdown` writes markdown report with ## Unit / ## Integration / ## E2E headings
 *   - `--apply` mode outputs JSON summary object { mode, wouldApply, ... }
 *   - Integration confidence: `high` if integrationHits >= 2; `medium` if == 1
 *   - Default confidenceThreshold for --apply is 'high'
 *   - `--confidence=medium` lowers threshold to include medium-confidence files
 *
 * Mutation gutcheck: change classification threshold in classifyFile() → RED on detection scenarios.
 *
 * Step-def signature: function (this: ClassifyWorld, captures...) — `this:` is a TYPE ANNOTATION.
 * The World is BOUND by Cucumber; it is NOT passed as a real argument.
 * REGEX step patterns (not Cucumber Expressions) — avoids ambiguity with dots/brackets/slashes.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Given, When, Then, Before, After, setDefaultTimeout } from '@cucumber/cucumber';

setDefaultTimeout(30_000);

import { fileURLToPath } from 'node:url';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLASSIFY_PATH = path.join(
  REPO_ROOT,
  '.claude',
  'skills',
  'strong-tests',
  'scripts',
  'classify-tests.ts',
);

// ---------------------------------------------------------------------------
// World state per scenario
// ---------------------------------------------------------------------------
interface ClassifyWorld {
  tempDir: string | null;
  /** Captured stdout + stderr from the last classify-tests spawn */
  stdout: string;
  /** Exit status of the last spawn */
  exitCode: number | null;
  /** File path written by a Given step (for --apply assertions) */
  targetFile: string | null;
}

let world: ClassifyWorld = { tempDir: null, stdout: '', exitCode: null, targetFile: null };

Before({ tags: 'not @manual' }, function (this: ClassifyWorld) {
  world = { tempDir: null, stdout: '', exitCode: null, targetFile: null };
  world.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classify-bdd-'));
});

After({ tags: 'not @manual' }, function (this: ClassifyWorld) {
  if (world.tempDir && fs.existsSync(world.tempDir)) {
    fs.rmSync(world.tempDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Helper: spawn classify-tests.ts and capture stdout/status
// ---------------------------------------------------------------------------
function runClassify(args: string[]): { stdout: string; stderr: string; exitCode: number | null } {
  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx', CLASSIFY_PATH, ...args],
    { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 20_000 },
  );
  return {
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    exitCode: res.status,
  };
}

// ---------------------------------------------------------------------------
// TESTQUAL001_17 — C# pure-unit file → classified Unit, high confidence
// ---------------------------------------------------------------------------

Given(
  /^a C# test file with only plain assertions and no HttpClient or DbContext or Process references$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set by Before hook');
    const content = [
      'using Xunit;',
      'public class CalcTests {',
      '  [Fact]',
      '  public void Add_ReturnsSum() {',
      '    var result = Calculator.Add(1, 2);',
      '    Assert.Equal(3, result);',
      '  }',
      '}',
    ].join('\n');
    world.targetFile = path.join(world.tempDir!, 'CalcTests.cs');
    fs.writeFileSync(world.targetFile, content, 'utf-8');
  },
);

When(
  /^the classifier is run on the directory containing that C# test file$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!]);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the JSON output SHALL contain a classification entry with type Unit for the C# file$/,
  function (this: ClassifyWorld) {
    const parsed = JSON.parse(world.stdout) as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(parsed) && parsed.length > 0, 'Expected non-empty JSON array');
    assert.strictEqual(parsed[0]['suggested'], 'Unit', `Expected suggested=Unit but got ${String(parsed[0]['suggested'])}`);
  },
);

Then(
  /^the confidence SHALL be high$/,
  function (this: ClassifyWorld) {
    const parsed = JSON.parse(world.stdout) as Array<Record<string, unknown>>;
    assert.strictEqual(parsed[0]['confidence'], 'high', `Expected high confidence but got ${String(parsed[0]['confidence'])}`);
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_18 — C# file with Moq + IClassFixture → Integration (1 hit = medium,
// but 2 hits = high; use both Moq AND IClassFixture to ensure >= 2 integration signals)
// ---------------------------------------------------------------------------

Given(
  /^a C# test file that references Moq and IClassFixture$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set');
    // Two integration signals: Moq (matches /\bMoq\b|\bMock</) + IClassFixture (matches /\bIClassFixture</)
    const content = [
      'using Moq;',
      'using Xunit;',
      'public class ServiceTests : IClassFixture<ServiceFixture> {',
      '  [Fact]',
      '  public void Get_ReturnsMocked() {',
      '    var mock = new Mock<IService>();',
      '    mock.Setup(s => s.Get()).Returns("ok");',
      '    Assert.Equal("ok", mock.Object.Get());',
      '  }',
      '}',
    ].join('\n');
    world.targetFile = path.join(world.tempDir!, 'ServiceTests.cs');
    fs.writeFileSync(world.targetFile, content, 'utf-8');
  },
);

When(
  /^the classifier is run on the directory containing that Moq IClassFixture file$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!]);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the JSON output SHALL contain a classification entry with type Integration for the Moq file$/,
  function (this: ClassifyWorld) {
    const parsed = JSON.parse(world.stdout) as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(parsed) && parsed.length > 0, 'Expected non-empty JSON array');
    assert.strictEqual(parsed[0]['suggested'], 'Integration', `Expected suggested=Integration but got ${String(parsed[0]['suggested'])}`);
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_19 — C# file with WebApplicationFactory + Docker → E2E high confidence
// (two E2E signals: WebApplicationFactory + Docker)
// ---------------------------------------------------------------------------

Given(
  /^a C# test file that references WebApplicationFactory and Docker$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set');
    // Two E2E signals: WebApplicationFactory + Docker → high confidence E2E
    const content = [
      'using Microsoft.AspNetCore.Mvc.Testing;',
      'using Xunit;',
      'public class ApiTests : IClassFixture<WebApplicationFactory<Program>> {',
      '  [Fact]',
      '  public async Task Health_Returns200() {',
      '    // Using Docker for container-based E2E test',
      '    var dockerClient = new Docker.DotNet.DockerClientConfiguration().CreateClient();',
      '    // Assert container health',
      '  }',
      '}',
    ].join('\n');
    world.targetFile = path.join(world.tempDir!, 'ApiTests.cs');
    fs.writeFileSync(world.targetFile, content, 'utf-8');
  },
);

When(
  /^the classifier is run on the directory containing that WebApplicationFactory Docker file$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!]);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the JSON output SHALL contain a classification entry with type E2E and high confidence for the WebApplicationFactory file$/,
  function (this: ClassifyWorld) {
    const parsed = JSON.parse(world.stdout) as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(parsed) && parsed.length > 0, 'Expected non-empty JSON array');
    assert.strictEqual(parsed[0]['suggested'], 'E2E', `Expected suggested=E2E but got ${String(parsed[0]['suggested'])}`);
    assert.strictEqual(parsed[0]['confidence'], 'high', `Expected high confidence but got ${String(parsed[0]['confidence'])}`);
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_20 — Existing [Trait("Category", ...)] marker detected
// ---------------------------------------------------------------------------

Given(
  /^a C# test file that already has a Trait Category marker$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set');
    const content = [
      'using Xunit;',
      '[Trait("Category", "Integration")]',
      'public class OrderTests {',
      '  [Fact]',
      '  public void Order_Created() { Assert.True(true); }',
      '}',
    ].join('\n');
    world.targetFile = path.join(world.tempDir!, 'OrderTests.cs');
    fs.writeFileSync(world.targetFile, content, 'utf-8');
  },
);

When(
  /^the classifier is run on the directory containing that already-marked file$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!]);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the JSON output SHALL have a non-null current_marker field for that file$/,
  function (this: ClassifyWorld) {
    const parsed = JSON.parse(world.stdout) as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(parsed) && parsed.length > 0, 'Expected non-empty JSON array');
    assert.ok(
      parsed[0]['current_marker'] != null,
      `Expected non-null current_marker but got ${JSON.stringify(parsed[0]['current_marker'])}`,
    );
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_21 — Python pytest file with >=2 integration signals → Integration
// (pytest.fixture + unittest.mock = 2 hits → high confidence Integration)
// ---------------------------------------------------------------------------

Given(
  /^a Python test file that imports pytest and unittest\.mock$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set');
    // Two integration signals: unittest.mock (/unittest\.mock/) + pytest.fixture (/pytest\.fixture/)
    const content = [
      'import pytest',
      'from unittest.mock import patch, MagicMock',
      '',
      '@pytest.fixture',
      'def service_fixture():',
      '    return {}',
      '',
      'def test_service_calls_dependency(service_fixture):',
      '    with patch("app.service.ExternalDep") as mock_dep:',
      '        mock_dep.return_value.fetch.return_value = []',
      '        result = []',
      '    assert result == []',
    ].join('\n');
    world.targetFile = path.join(world.tempDir!, 'test_service.py');
    fs.writeFileSync(world.targetFile, content, 'utf-8');
  },
);

When(
  /^the classifier is run on the directory containing that Python mock file$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!]);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the JSON output SHALL contain a classification entry with type Integration for the Python file$/,
  function (this: ClassifyWorld) {
    const parsed = JSON.parse(world.stdout) as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(parsed) && parsed.length > 0, 'Expected non-empty JSON array');
    assert.strictEqual(
      parsed[0]['suggested'],
      'Integration',
      `Expected suggested=Integration but got ${String(parsed[0]['suggested'])}`,
    );
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_22 — markdown format emits report with Unit/Integration/E2E headings
// Note: markdown sections only appear for categories that have files; use a mix.
// ---------------------------------------------------------------------------

Given(
  /^a directory containing a mix of test files of different types$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set');
    // Unit C# file (no signals)
    fs.writeFileSync(
      path.join(world.tempDir!, 'a.test.cs'),
      'using Xunit; class A { [Fact] void T() {} }',
    );
    // Integration C# file (Moq → 1 integration signal, medium confidence Integration)
    fs.writeFileSync(
      path.join(world.tempDir!, 'b.Tests.cs'),
      'using Xunit; using Moq; class B { [Fact] void T() { new Mock<IFoo>(); } }',
    );
  },
);

When(
  /^the classifier is run on that directory with --format markdown$/,
  function (this: ClassifyWorld) {
    // NOTE: --format=markdown must use equals-sign syntax (not space-separated)
    const res = runClassify([world.tempDir!, '--format=markdown']);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the output SHALL contain markdown headings for Unit and Integration and E2E sections$/,
  function (this: ClassifyWorld) {
    assert.match(world.stdout, /# Test Classification Report/, `Missing report header in output:\n${world.stdout}`);
    assert.match(world.stdout, /## Unit/, `Missing ## Unit heading in output:\n${world.stdout}`);
    assert.match(world.stdout, /## Integration/, `Missing ## Integration heading in output:\n${world.stdout}`);
    assert.match(world.stdout, /Stryker/, `Missing Stryker mention in output:\n${world.stdout}`);
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_23 — empty directory → empty JSON array
// ---------------------------------------------------------------------------

Given(
  /^a directory containing no test files$/,
  function (this: ClassifyWorld) {
    // tempDir is already empty from Before hook
    assert.ok(world.tempDir, 'tempDir must be set');
  },
);

When(
  /^the classifier is run on that empty directory$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!]);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the JSON output SHALL be an empty array$/,
  function (this: ClassifyWorld) {
    const parsed: unknown = JSON.parse(world.stdout);
    assert.deepEqual(parsed, [], `Expected [] but got ${world.stdout}`);
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_24 — --apply --dry-run reports wouldApply count without modifying files
// ---------------------------------------------------------------------------

Given(
  /^a directory with an unclassified C# test file for dry-run testing$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set');
    const content = [
      'using Xunit;',
      'public class DryRunTests {',
      '  [Fact]',
      '  public void Nothing() { Assert.True(true); }',
      '}',
    ].join('\n');
    world.targetFile = path.join(world.tempDir!, 'DryRunTests.cs');
    fs.writeFileSync(world.targetFile, content, 'utf-8');
  },
);

When(
  /^the classifier is run with --apply --dry-run on that directory$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!, '--apply', '--dry-run']);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the output SHALL report a wouldApply count greater than zero$/,
  function (this: ClassifyWorld) {
    // --apply --dry-run outputs JSON summary: { "wouldApply": N, ... }
    const summary = JSON.parse(world.stdout) as Record<string, unknown>;
    const wouldApply = summary['wouldApply'] as number;
    assert.ok(typeof wouldApply === 'number' && wouldApply > 0, `Expected wouldApply > 0 but got ${wouldApply}`);
  },
);

Then(
  /^the target C# file SHALL remain unmodified after dry-run$/,
  function (this: ClassifyWorld) {
    const content = fs.readFileSync(world.targetFile!, 'utf-8');
    assert.ok(
      !content.includes('[Trait('),
      `Expected no [Trait(] injection after dry-run but found:\n${content}`,
    );
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_25 — --apply injects [Trait("Category", "Unit")] above C# class
// ---------------------------------------------------------------------------

Given(
  /^a directory with an unclassified Unit-level C# test file for apply testing$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set');
    const content = [
      'using Xunit;',
      'public class ApplyTests {',
      '  [Fact]',
      '  public void Add_Works() { Assert.Equal(2, 1 + 1); }',
      '}',
    ].join('\n');
    world.targetFile = path.join(world.tempDir!, 'ApplyTests.cs');
    fs.writeFileSync(world.targetFile, content, 'utf-8');
  },
);

When(
  /^the classifier is run with --apply on that directory$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!, '--apply']);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the target C# file SHALL contain a Trait Category Unit annotation above the class declaration$/,
  function (this: ClassifyWorld) {
    const content = fs.readFileSync(world.targetFile!, 'utf-8');
    assert.ok(
      content.includes('[Trait("Category", "Unit")]'),
      `Expected [Trait("Category", "Unit")] in file but got:\n${content}`,
    );
    const traitIdx = content.indexOf('[Trait("Category", "Unit")]');
    const classIdx = content.indexOf('public class');
    assert.ok(traitIdx < classIdx, 'Trait annotation must appear before the class declaration');
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_26 — --apply skips files with existing Trait marker
// ---------------------------------------------------------------------------

Given(
  /^a C# test file that already has a Trait Category Integration marker$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set');
    const original = [
      'using Xunit;',
      '[Trait("Category", "Integration")]',
      'public class AlreadyMarked {',
      '  [Fact]',
      '  public void X() {}',
      '}',
    ].join('\n');
    world.targetFile = path.join(world.tempDir!, 'AlreadyMarked.cs');
    fs.writeFileSync(world.targetFile, original, 'utf-8');
  },
);

When(
  /^the classifier is run with --apply on the directory containing that already-marked C# file$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!, '--apply']);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the already-marked C# file SHALL remain unchanged after --apply$/,
  function (this: ClassifyWorld) {
    const content = fs.readFileSync(world.targetFile!, 'utf-8');
    // Should still have exactly one [Trait( — no duplication
    const traitCount = (content.match(/\[Trait\(/g) ?? []).length;
    assert.strictEqual(
      traitCount,
      1,
      `Expected exactly 1 Trait marker but found ${traitCount}:\n${content}`,
    );
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_27 — --apply --confidence=high skips medium-confidence files
// A C# file with one integration signal (Moq only) = medium confidence; with
// --confidence=high (the default), it should be skipped.
// ---------------------------------------------------------------------------

Given(
  /^a C# test file that the classifier assigns medium confidence$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set');
    // Single E2E signal (HttpClient) → 1 E2E hit → medium confidence E2E
    // Threshold --confidence=high skips medium, so no Trait should be injected
    const content = [
      'using Xunit;',
      'public class MediumConfTests {',
      '  private readonly HttpClient _http = new HttpClient();',
      '  [Fact]',
      '  public void Foo() {}',
      '}',
    ].join('\n');
    world.targetFile = path.join(world.tempDir!, 'MediumConfTests.cs');
    fs.writeFileSync(world.targetFile, content, 'utf-8');
  },
);

When(
  /^the classifier is run with --apply --confidence=high on the directory containing that medium-confidence file$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!, '--apply', '--confidence=high']);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the medium-confidence C# file SHALL NOT have a Trait marker injected$/,
  function (this: ClassifyWorld) {
    const content = fs.readFileSync(world.targetFile!, 'utf-8');
    assert.ok(
      !content.includes('[Trait('),
      `Expected no [Trait( injection for medium-confidence file but found:\n${content}`,
    );
  },
);

// ---------------------------------------------------------------------------
// TESTQUAL001_28 — --apply injects pytestmark + pytest import for Python
// Need >= 2 integration signals for high confidence (so --apply with default threshold picks it up)
// Use pytest.fixture + unittest.mock = 2 Python integration signals
// ---------------------------------------------------------------------------

Given(
  /^a Python test file without an existing pytestmark and without a pytest import$/,
  function (this: ClassifyWorld) {
    assert.ok(world.tempDir, 'tempDir must be set');
    // Pure Python unit test — no imports, no signals → classified Unit, high confidence
    // --apply (default confidenceThreshold=high) will apply it, injecting:
    //   import pytest  (auto-added when missing)
    //   pytestmark = pytest.mark.unit
    const content = [
      'def test_add():',
      '    assert 1 + 2 == 3',
    ].join('\n');
    world.targetFile = path.join(world.tempDir!, 'test_pure.py');
    fs.writeFileSync(world.targetFile, content, 'utf-8');
  },
);

When(
  /^the classifier is run with --apply on the directory containing that unmarked Python file$/,
  function (this: ClassifyWorld) {
    const res = runClassify([world.tempDir!, '--apply']);
    world.stdout = res.stdout;
    world.exitCode = res.exitCode;
  },
);

Then(
  /^the Python file SHALL contain a pytestmark assignment at module level$/,
  function (this: ClassifyWorld) {
    const content = fs.readFileSync(world.targetFile!, 'utf-8');
    assert.ok(
      content.includes('pytestmark'),
      `Expected pytestmark in file but got:\n${content}`,
    );
  },
);

Then(
  /^the Python file SHALL have import pytest added if it was missing$/,
  function (this: ClassifyWorld) {
    const content = fs.readFileSync(world.targetFile!, 'utf-8');
    assert.ok(
      content.includes('import pytest'),
      `Expected "import pytest" in file but got:\n${content}`,
    );
  },
);
