import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUN_MUTATION_PATH = path.join(
  REPO_ROOT,
  '.claude',
  'skills',
  'strong-tests',
  'scripts',
  'run-mutation.ts',
);
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'dotnet-stryker-target');

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dotnet-stryker-fixture-'));
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'bin' || entry.name === 'obj' || entry.name === 'StrykerOutput') continue;
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function dotnetStrykerAvailable(): boolean {
  const result = spawnSync('dotnet-stryker', ['--help'], {
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

describe('TESTQUAL001_DOTNET_STRYKER: run-mutation.ts dispatches Stryker.NET on .NET fixture', () => {
  // @feature7
  it('TESTQUAL001_11: --dry-run on .NET fixture returns valid JSON with stack=csharp tool=stryker-net', () => {
    const tmpDir = makeTempDir();
    try {
      copyDirSync(FIXTURE_DIR, tmpDir);

      const result = spawnSync('npx', ['tsx', RUN_MUTATION_PATH, '--dry-run'], {
        encoding: 'utf-8',
        shell: process.platform === 'win32',
        cwd: tmpDir,
      });
      expect(result.status, `run-mutation.ts dry-run exit non-zero. stderr=${result.stderr}`).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.stack).toBe('csharp');
      expect(output.tool).toBe('stryker-net');
      expect(Array.isArray(output.warnings)).toBe(true);
      expect(output.warnings.some((w: string) => w.includes('--dry-run'))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // @feature7
  it('TESTQUAL001_11b: fixture detector smoke — composition-chain detected in CollectionPipeline.cs', () => {
    const detectorPath = path.join(
      REPO_ROOT,
      '.claude',
      'skills',
      'strong-tests',
      'scripts',
      'detect-invariant-candidates.ts',
    );
    const targetFile = path.join(FIXTURE_DIR, 'Library.Shared', 'CollectionPipeline.cs');

    const result = spawnSync('npx', ['tsx', detectorPath, targetFile], {
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });
    expect(result.status, `detector exit non-zero. stderr=${result.stderr}`).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.stack).toBe('csharp');
    expect(output.candidates.length).toBeGreaterThan(0);

    const processItems = output.candidates.find((c: any) => c.function === 'ProcessItems');
    expect(processItems, 'ProcessItems candidate not found').toBeDefined();
    expect(processItems.kind).toBe('composition-chain');
    expect(processItems.suggestedInvariants).toContain('monotonicity');
  });

  // @feature7
  it('TESTQUAL001_11d: CartesianProduct.cs CrossJoin detected as nxm-overlap (nested foreach)', () => {
    const detectorPath = path.join(
      REPO_ROOT,
      '.claude',
      'skills',
      'strong-tests',
      'scripts',
      'detect-invariant-candidates.ts',
    );
    const targetFile = path.join(FIXTURE_DIR, 'Library.Shared', 'CartesianProduct.cs');

    const result = spawnSync('npx', ['tsx', detectorPath, targetFile], {
      encoding: 'utf-8',
      shell: process.platform === 'win32',
    });
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    const crossJoin = output.candidates.find((c: any) => c.function === 'CrossJoin');
    expect(crossJoin, 'CrossJoin candidate not found').toBeDefined();
    expect(crossJoin.kind).toBe('nxm-overlap');
    expect(crossJoin.suggestedInvariants).toContain('conservation');
  });

  // @feature7
  it.skipIf(!dotnetStrykerAvailable())(
    'TESTQUAL001_11c: full Stryker.NET run produces measurable kill rate (requires dotnet-stryker installed)',
    () => {
      const tmpDir = makeTempDir();
      try {
        copyDirSync(FIXTURE_DIR, tmpDir);

        const result = spawnSync('npx', ['tsx', RUN_MUTATION_PATH], {
          encoding: 'utf-8',
          shell: process.platform === 'win32',
          cwd: tmpDir,
          timeout: 30 * 60_000,
        });

        // Stryker.NET exits 0 (above threshold) or 1 (below threshold) — both valid
        expect(
          [0, 1].includes(result.status as number),
          `run-mutation.ts unexpected exit ${result.status}. stderr=${result.stderr.slice(-1000)}`,
        ).toBe(true);

        const output = JSON.parse(result.stdout);
        expect(output.stack).toBe('csharp');
        expect(output.tool).toBe('stryker-net');
        expect(output.totalMutants).toBeGreaterThan(0);
        expect(typeof output.killRate === 'number' || output.killRate === null).toBe(true);

        // Verify HTML report generated
        const strykerOutputDir = path.join(tmpDir, 'StrykerOutput');
        expect(fs.existsSync(strykerOutputDir), 'StrykerOutput directory not created').toBe(true);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    60 * 60_000,
  );
});
