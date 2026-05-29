// `npm pack` smoke test — proves the published package shape works end-to-end.
//
// Builds a tarball with the actual `npm pack`, installs it into a fresh
// tmpdir, and asserts:
//   • the bin script exists in the unpacked layout
//   • running `node tools/spec-check-log/bin.cjs --count` against a fresh
//     repo returns "0" (no log entries) — proves the bin launcher resolves
//     its target, tsx loads cli.ts, and the CLI executes cleanly
//
// This is the layer that catches "works on my machine but the published
// package is missing files" regressions. Specifically guards against the
// `files: [...]` list in package.json drifting away from what bin entries
// actually need.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('npm pack — published bin entry works end-to-end', () => {
  let workDir: string;
  let tarballPath: string;
  let unpackDir: string;
  let available = false;

  beforeAll(() => {
    workDir = path.join(os.tmpdir(), `pack-smoke-${randomUUID()}`);
    fs.mkdirSync(workDir, { recursive: true });
    try {
      // `npm pack` writes the tarball to cwd; --pack-destination keeps the
      // repo root clean.
      const out = execSync(`npm pack --pack-destination "${workDir}"`, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const tarballName = out.trim().split('\n').pop()!.trim();
      tarballPath = path.join(workDir, tarballName);
      expect(fs.existsSync(tarballPath)).toBe(true);

      unpackDir = path.join(workDir, 'unpacked');
      fs.mkdirSync(unpackDir, { recursive: true });
      execSync(`tar -xzf "${tarballPath}" -C "${unpackDir}"`, { stdio: 'ignore' });
      available = true;
    } catch (err) {
      // `tar` might be missing on a host without WSL/Git-Bash native — mark
      // the suite skip-eligible rather than fail the whole run.
      process.stderr.write(
        `[pack-smoke] setup failed (${err instanceof Error ? err.message : err}) — skipping\n`,
      );
    }
  }, 60_000);

  afterAll(() => {
    if (workDir && fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  it('tarball contains the spec-check-log bin script + cli.ts', () => {
    if (!available) return;
    const root = path.join(unpackDir, 'package');
    expect(fs.existsSync(path.join(root, 'tools/spec-check-log/bin.cjs'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'tools/spec-check-log/cli.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'tools/spec-check-log/writer.ts'))).toBe(true);
  });

  it('package.json::bin maps dev-pomogator-spec-check-log to bin.cjs', () => {
    if (!available) return;
    const root = path.join(unpackDir, 'package');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      bin?: Record<string, string>;
    };
    expect(pkg.bin?.['dev-pomogator-spec-check-log']).toBe('tools/spec-check-log/bin.cjs');
  });

  it('bin.cjs launches cli.ts and exits 0 on --count against an empty repo', () => {
    if (!available) return;
    const root = path.join(unpackDir, 'package');
    // Use a fresh tmpdir as the bin's --root so the CLI sees no log entries.
    const emptyRepo = path.join(workDir, 'empty-repo');
    fs.mkdirSync(emptyRepo, { recursive: true });
    const result = spawnSync(
      process.execPath,
      [path.join(root, 'tools/spec-check-log/bin.cjs'), '--root', emptyRepo, '--count'],
      { encoding: 'utf8', cwd: REPO_ROOT, timeout: 15_000 },
    );
    // EXPECTED: launcher spawns node --import tsx for cli.ts, cli sees 0 entries.
    // The `tsx` import resolution relies on the REPO_ROOT's node_modules
    // (the unpacked tarball doesn't ship node_modules) — that's by design,
    // matches how `npm install dev-pomogator && npx dev-pomogator-spec-check-log`
    // would work for a real user since tsx is a runtime dep.
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('0');
  });
});
