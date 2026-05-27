import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CLASSIFY = path.join(REPO_ROOT, '.claude', 'skills', 'strong-tests', 'scripts', 'classify-tests.ts');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'classify-tests-'));
}

function runClassify(dir: string, extraArgs: string[] = []): { exit: number | null; out: any[] | string; stderr: string } {
  const result = spawnSync('npx', ['tsx', CLASSIFY, dir, ...extraArgs], {
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  let out: any;
  try {
    out = JSON.parse(result.stdout ?? '[]');
  } catch {
    out = result.stdout ?? '';
  }
  return { exit: result.status, out, stderr: result.stderr ?? '' };
}

describe('TESTQUAL001_CLASSIFY: test classification scanner', () => {
  // @feature4
  it('TESTQUAL001_17: classifies pure-unit C# test as Unit with high confidence', () => {
    const tmp = makeTempDir();
    try {
      const testFile = path.join(tmp, 'PurePure.test.cs');
      fs.writeFileSync(
        testFile,
        `using Xunit;
public class PurePureTests {
    [Fact]
    public void Add_Returns_Sum() {
        Assert.Equal(3, 1 + 2);
    }
}
`,
      );
      const r = runClassify(tmp);
      expect(r.exit).toBe(0);
      expect(Array.isArray(r.out)).toBe(true);
      const classifications = r.out as any[];
      expect(classifications.length).toBe(1);
      expect(classifications[0].suggested).toBe('Unit');
      expect(classifications[0].confidence).toBe('high');
      expect(classifications[0].language).toBe('csharp');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4
  it('TESTQUAL001_18: classifies C# test with Moq + IClassFixture as Integration', () => {
    const tmp = makeTempDir();
    try {
      const testFile = path.join(tmp, 'WithMocks.Tests.cs');
      fs.writeFileSync(
        testFile,
        `using Xunit;
using Moq;
public class WithMocksTests : IClassFixture<MyFixture> {
    private readonly Mock<IFoo> _foo = new();
    [Fact]
    public void Calls_Mock() {
        _foo.Setup(x => x.Bar()).Returns(42);
    }
}
`,
      );
      const r = runClassify(tmp);
      expect(r.exit).toBe(0);
      const classifications = r.out as any[];
      expect(classifications.length).toBe(1);
      expect(classifications[0].suggested).toBe('Integration');
      expect(['high', 'medium']).toContain(classifications[0].confidence);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4
  it('TESTQUAL001_19: classifies C# test with WebApplicationFactory + real HTTP as E2E', () => {
    const tmp = makeTempDir();
    try {
      const testFile = path.join(tmp, 'FullStack.Tests.cs');
      fs.writeFileSync(
        testFile,
        `using Xunit;
using Microsoft.AspNetCore.Mvc.Testing;
public class FullStackTests : IClassFixture<WebApplicationFactory<Program>> {
    private readonly HttpClient _client = new HttpClient() { BaseAddress = new Uri("http://localhost:5000") };
    [Fact]
    public async Task EndToEnd() {
        Process.Start("docker", "ps");
        var response = await _client.GetAsync("/api/users");
    }
}
`,
      );
      const r = runClassify(tmp);
      expect(r.exit).toBe(0);
      const classifications = r.out as any[];
      expect(classifications.length).toBe(1);
      expect(classifications[0].suggested).toBe('E2E');
      expect(classifications[0].confidence).toBe('high');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4
  it('TESTQUAL001_20: detects existing [Trait("Category", ...)] marker', () => {
    const tmp = makeTempDir();
    try {
      const testFile = path.join(tmp, 'Already.Tests.cs');
      fs.writeFileSync(
        testFile,
        `using Xunit;
[Trait("Category", "Integration")]
public class AlreadyTaggedTests {
    [Fact]
    public void Foo() {}
}
`,
      );
      const r = runClassify(tmp);
      expect(r.exit).toBe(0);
      const classifications = r.out as any[];
      expect(classifications[0].current_marker).toBe('Integration');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4
  it('TESTQUAL001_21: classifies Python pytest test with mock as Integration', () => {
    const tmp = makeTempDir();
    try {
      const testFile = path.join(tmp, 'test_with_mocks.py');
      fs.writeFileSync(
        testFile,
        `import pytest
from unittest.mock import MagicMock, Mock

@pytest.fixture
def mock_api():
    return MagicMock()

def test_uses_mock(mock_api):
    mock_api.fetch.return_value = {"ok": True}
    assert mock_api.fetch() == {"ok": True}
`,
      );
      const r = runClassify(tmp);
      expect(r.exit).toBe(0);
      const classifications = r.out as any[];
      expect(classifications.length).toBe(1);
      expect(classifications[0].suggested).toBe('Integration');
      expect(classifications[0].language).toBe('python');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4
  it('TESTQUAL001_22: markdown format emits report with sections per category', () => {
    const tmp = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmp, 'a.test.cs'), 'using Xunit; class A { [Fact] void T() {} }');
      fs.writeFileSync(
        path.join(tmp, 'b.Tests.cs'),
        'using Xunit; using Moq; class B { [Fact] void T() { new Mock<IFoo>(); } }',
      );
      const r = runClassify(tmp, ['--format=markdown']);
      expect(r.exit).toBe(0);
      const md = r.out as string;
      expect(md).toContain('# Test Classification Report');
      expect(md).toContain('## Unit');
      expect(md).toContain('## Integration');
      expect(md).toContain('Stryker.NET');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4 — v0.5.3 --apply flag
  it('TESTQUAL001_24: --apply --dry-run produces wouldApply count without modifying files', () => {
    const tmp = makeTempDir();
    try {
      const file = path.join(tmp, 'Pure.test.cs');
      const original = `using Xunit;\npublic class PureTests {\n    [Fact]\n    public void Add() { Assert.Equal(3, 1 + 2); }\n}\n`;
      fs.writeFileSync(file, original);
      const r = runClassify(tmp, ['--apply', '--dry-run']);
      expect(r.exit).toBe(0);
      const out = r.out as any;
      expect(out.mode).toBe('dry-run');
      expect(out.wouldApply).toBe(1);
      expect(out.applied).toBe(0);
      // File NOT modified
      expect(fs.readFileSync(file, 'utf-8')).toBe(original);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4 — v0.5.3 --apply flag
  it('TESTQUAL001_25: --apply injects [Trait("Category", "Unit")] above C# class', () => {
    const tmp = makeTempDir();
    try {
      const file = path.join(tmp, 'Pure.test.cs');
      const original = `using Xunit;\npublic class PureTests {\n    [Fact]\n    public void Add() { Assert.Equal(3, 1 + 2); }\n}\n`;
      fs.writeFileSync(file, original);
      const r = runClassify(tmp, ['--apply']);
      expect(r.exit).toBe(0);
      const out = r.out as any;
      expect(out.mode).toBe('apply');
      expect(out.applied).toBe(1);
      const updated = fs.readFileSync(file, 'utf-8');
      expect(updated).toContain('[Trait("Category", "Unit")]');
      expect(updated).toContain('public class PureTests');
      // Trait must appear BEFORE class declaration
      const traitIdx = updated.indexOf('[Trait');
      const classIdx = updated.indexOf('public class');
      expect(traitIdx).toBeGreaterThan(0);
      expect(traitIdx).toBeLessThan(classIdx);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4 — v0.5.3 --apply flag
  it('TESTQUAL001_26: --apply skips files with existing [Trait("Category", ...)] marker', () => {
    const tmp = makeTempDir();
    try {
      const file = path.join(tmp, 'Already.test.cs');
      const original = `using Xunit;\n[Trait("Category", "Integration")]\npublic class AlreadyTaggedTests {\n    [Fact]\n    public void Foo() {}\n}\n`;
      fs.writeFileSync(file, original);
      const r = runClassify(tmp, ['--apply']);
      expect(r.exit).toBe(0);
      const out = r.out as any;
      expect(out.applied).toBe(0);
      expect(out.skipped).toBe(1);
      expect(out.results[0].reason).toContain('existing marker');
      // File NOT modified
      expect(fs.readFileSync(file, 'utf-8')).toBe(original);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4 — v0.5.3 --apply flag
  it('TESTQUAL001_27: --apply --confidence=high skips medium confidence Integration', () => {
    const tmp = makeTempDir();
    try {
      // Single E2E signal → medium confidence
      const file = path.join(tmp, 'Medium.test.cs');
      const original = `using Xunit;\npublic class MediumTests {\n    private readonly HttpClient _http = new HttpClient();\n    [Fact]\n    public void Foo() {}\n}\n`;
      fs.writeFileSync(file, original);
      const r = runClassify(tmp, ['--apply', '--confidence=high']);
      expect(r.exit).toBe(0);
      const out = r.out as any;
      expect(out.belowThreshold).toBe(1);
      expect(fs.readFileSync(file, 'utf-8')).toBe(original);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4 — v0.5.3 --apply flag
  it('TESTQUAL001_28: --apply injects pytestmark for Python with pytest import auto-added', () => {
    const tmp = makeTempDir();
    try {
      const file = path.join(tmp, 'test_pure.py');
      const original = `def test_add():\n    assert 1 + 2 == 3\n`;
      fs.writeFileSync(file, original);
      const r = runClassify(tmp, ['--apply']);
      expect(r.exit).toBe(0);
      const updated = fs.readFileSync(file, 'utf-8');
      expect(updated).toContain('import pytest');
      expect(updated).toContain('pytestmark = pytest.mark.unit');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  // @feature4
  it('TESTQUAL001_23: emits empty array if no test files found', () => {
    const tmp = makeTempDir();
    try {
      fs.writeFileSync(path.join(tmp, 'not-a-test.txt'), 'plain text');
      const r = runClassify(tmp);
      expect(r.exit).toBe(0);
      expect(Array.isArray(r.out)).toBe(true);
      expect((r.out as any[]).length).toBe(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
