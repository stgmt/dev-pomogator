import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DETECTOR_PATH = path.join(
  REPO_ROOT,
  '.claude',
  'skills',
  'strong-tests',
  'scripts',
  'detect-invariant-candidates.ts',
);
const HOOK_PATH = path.join(
  REPO_ROOT,
  'extensions',
  'test-quality',
  'tools',
  'test-quality',
  'posttool-jit.ts',
);
const SKILL_PATH = path.join(REPO_ROOT, '.claude', 'skills', 'strong-tests', 'SKILL.md');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'strong-tests-jit-'));
}

describe('TESTQUAL001_JiT: PostToolUse auto-trigger', () => {
  // @feature7
  it('TESTQUAL001_06: detector identifies Collection-returning function with N×M nested for-loops on TS file', () => {
    const tmpDir = makeTempDir();
    const fixturePath = path.join(tmpDir, 'indexer.ts');
    fs.writeFileSync(
      fixturePath,
      `interface WorktreeEntry { path: string; }
declare const repos: any[];
declare const worktrees: any[];

function buildIndex(): WorktreeEntry[] {
  const out: WorktreeEntry[] = [];
  for (const repo of repos) {
    for (const wt of worktrees) {
      out.push({ path: wt.path });
    }
  }
  return out;
}
`,
    );

    const result = spawnSync('npx', ['tsx', DETECTOR_PATH, fixturePath], {
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });
    expect(result.status, `detector exit non-zero. stderr=${result.stderr}`).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.schemaVersion).toBe(1);
    expect(output.stack).toBe('ts');
    expect(output.candidates.length).toBeGreaterThan(0);
    const buildIndex = output.candidates.find((c: any) => c.function === 'buildIndex');
    expect(buildIndex, 'buildIndex candidate not found').toBeDefined();
    expect(buildIndex.kind).toBe('nxm-overlap');
    expect(buildIndex.suggestedInvariants).toContain('cardinality');
    expect(buildIndex.suggestedInvariants).toContain('uniqueness');
    expect(buildIndex.suggestedInvariants).toContain('conservation');
    expect(output.scanDurationMs).toBeLessThan(500);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // @feature7
  it('TESTQUAL001_07: suppression comment skips detection and emits suppressed entry with correct audit-log schema', () => {
    const tmpDir = makeTempDir();
    const fixturePath = path.join(tmpDir, 'tally.py');
    fs.writeFileSync(
      fixturePath,
      `# strong-tests:skip pure-leaf reducer — type system enforces
def tally(items: list[int]) -> int:
    return len(items)
`,
    );

    const result = spawnSync('npx', ['tsx', DETECTOR_PATH, fixturePath], {
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });
    expect(result.status, `detector exit non-zero. stderr=${result.stderr}`).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.stack).toBe('python');
    expect(output.suppressed.length).toBe(1);
    const sup = output.suppressed[0];
    expect(sup.function).toMatch(/^tally:\d+$/);
    expect(sup.reason).toContain('pure-leaf reducer');
    expect(sup.reasonLength).toBeGreaterThanOrEqual(8);
    expect(sup.reasonWarning).toBeNull();

    const shortFixture = path.join(tmpDir, 'short.py');
    fs.writeFileSync(
      shortFixture,
      `# strong-tests:skip ok
def f(items: list[int]) -> int:
    return len(items)
`,
    );
    const shortResult = spawnSync('npx', ['tsx', DETECTOR_PATH, shortFixture], {
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });
    const shortOutput = JSON.parse(shortResult.stdout);
    expect(shortOutput.suppressed[0].reasonLength).toBe(2);
    expect(shortOutput.suppressed[0].reasonWarning).toBe('REASON_TOO_SHORT');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // @feature7
  it('TESTQUAL001_08: SKILL.md §1.5 Behavioural prior loads BEFORE §2 Pre-write checklist with all required sub-blocks', () => {
    expect(fs.existsSync(SKILL_PATH), `SKILL.md missing at ${SKILL_PATH}`).toBe(true);
    const skillBody = fs.readFileSync(SKILL_PATH, 'utf-8');

    expect(skillBody).toMatch(/##\s+1\.5\s+Behavioural prior/);

    const idx15 = skillBody.indexOf('## 1.5 Behavioural prior');
    const idx2 = skillBody.indexOf('## 2. Pre-write checklist');
    const idx1Marker = skillBody.indexOf('Internal evidence:');
    expect(idx1Marker, '§1 marker missing').toBeGreaterThan(-1);
    expect(idx15, '§1.5 marker missing').toBeGreaterThan(idx1Marker);
    expect(idx2, '§2 marker missing').toBeGreaterThan(idx15);

    expect(skillBody).toContain('Реактивный');
    expect(skillBody).toContain('Проактивный');
    expect(skillBody).toContain('«Доложил без проверки в реальности»');
    expect(skillBody).toContain('«Happy-path fixture как доказательство покрытия»');
    expect(skillBody).toContain('«Реактивная дисциплина — пока не пнут»');
    expect(skillBody).toContain('тестов нет нихуя не работает');
    expect(skillBody).toContain('почему тестов опять нет');
    expect(skillBody).toContain('Знание правила ≠ применение правила');
  });

  // @feature7
  it('TESTQUAL001_09: detector identifies Collection-returning C# method with nested for+foreach loops', () => {
    const tmpDir = makeTempDir();
    const fixturePath = path.join(tmpDir, 'IndexerService.cs');
    fs.writeFileSync(
      fixturePath,
      `using System.Collections.Generic;

namespace MyApp.Services;

public class WorktreeEntry
{
    public string Path { get; set; } = "";
}

public class IndexerService
{
    public List<WorktreeEntry> BuildIndex(List<string> repos, List<string> worktrees)
    {
        var output = new List<WorktreeEntry>();
        for (int i = 0; i < repos.Count; i++)
        {
            foreach (var wt in worktrees)
            {
                output.Add(new WorktreeEntry { Path = wt });
            }
        }
        return output;
    }
}
`,
    );

    const result = spawnSync('npx', ['tsx', DETECTOR_PATH, fixturePath], {
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });
    expect(result.status, `detector exit non-zero. stderr=${result.stderr}`).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.schemaVersion).toBe(1);
    expect(output.stack).toBe('csharp');
    expect(output.candidates.length).toBeGreaterThan(0);
    const buildIndex = output.candidates.find((c: any) => c.function === 'BuildIndex');
    expect(buildIndex, 'BuildIndex candidate not found in C# detection output').toBeDefined();
    expect(buildIndex.kind).toBe('nxm-overlap');
    expect(buildIndex.returnType).toBe('List<WorktreeEntry>');
    expect(buildIndex.suggestedInvariants).toContain('cardinality');
    expect(buildIndex.suggestedInvariants).toContain('uniqueness');
    expect(buildIndex.suggestedInvariants).toContain('conservation');
    expect(buildIndex.rationale).toMatch(/for\/foreach/);
    expect(output.scanDurationMs).toBeLessThan(500);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // @feature7
  it('TESTQUAL001_09b: hook excludes C# test files (Steps.cs, Tests.cs, capital Tests/ folder)', () => {
    const tmpDir = makeTempDir();
    const testsDir = path.join(tmpDir, 'Tests');
    fs.mkdirSync(testsDir, { recursive: true });

    const stepsPath = path.join(tmpDir, 'IndexerSteps.cs');
    const testsPath = path.join(tmpDir, 'IndexerTests.cs');
    const folderTestPath = path.join(testsDir, 'IndexerSpec.cs');
    const productionPath = path.join(tmpDir, 'Indexer.cs');
    const csharpBody = `using System.Collections.Generic;

public class C
{
    public List<int> M()
    {
        for (int i = 0; i < 10; i++)
        {
            foreach (var x in new[] { 1, 2, 3 })
            {
                System.Console.WriteLine(x);
            }
        }
        return new List<int>();
    }
}
`;

    for (const p of [stepsPath, testsPath, folderTestPath, productionPath]) {
      fs.writeFileSync(p, csharpBody);
    }

    const hookPath = path.join(REPO_ROOT, '.dev-pomogator', 'tools', 'test-quality', 'posttool-jit.ts');
    const runHook = (filePath: string): { stdout: string; status: number | null } => {
      const input = JSON.stringify({
        tool_name: 'Edit',
        tool_input: { file_path: filePath },
        session_id: 'cs-exclude-test',
        cwd: REPO_ROOT,
      });
      const r = spawnSync('npx', ['tsx', hookPath], {
        encoding: 'utf-8',
        shell: process.platform === 'win32',
        input,
        env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
      });
      return { stdout: r.stdout ?? '', status: r.status };
    };

    expect(runHook(stepsPath).stdout.trim()).toBe('');
    expect(runHook(testsPath).stdout.trim()).toBe('');
    expect(runHook(folderTestPath).stdout.trim()).toBe('');
    const prodOut = runHook(productionPath);
    expect(prodOut.stdout).toContain('hookSpecificOutput');
    expect(prodOut.stdout).toContain('PostToolUse');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // @feature7
  it('TESTQUAL001_06b: hook handler exists and is executable as a Node module', () => {
    expect(fs.existsSync(HOOK_PATH), `posttool-jit.ts missing at ${HOOK_PATH}`).toBe(true);
    const body = fs.readFileSync(HOOK_PATH, 'utf-8');
    expect(body).toContain('hookSpecificOutput');
    expect(body).toContain('PostToolUse');
    expect(body).toContain('strong-tests-skips.jsonl');
  });
});
