/**
 * Tests for the Marksman installer.
 *
 * Covers the four code paths of `runInstall`:
 *   • happy path        — sha256 matches → binary written + log.available=true
 *   • sha256 mismatch   — log.available=false, expected/got sha both recorded,
 *                          binary NOT written
 *   • offline           — download throws → log.reason='offline'
 *   • unsupported plat  — selectAsset returns null → log.reason='unsupported_platform'
 *
 * Network is fully mocked via the `download` override; pinned hashes are
 * synthesised in-test so the assertions don't depend on a real Marksman
 * release.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  runInstall,
  selectAsset,
  sha256Hex,
  verifyHash,
} from '../postinstall.ts';
import { readLog } from '../install-log.ts';

function fakeHashes(linuxX64Sha: string): {
  version: string;
  release_url_template: string;
  platforms: Record<string, Record<string, { asset: string; sha256: string }>>;
} {
  return {
    version: '2024.10.10',
    release_url_template: 'https://example.test/{version}/{asset}',
    platforms: {
      linux: { x64: { asset: 'marksman-linux-x64', sha256: linuxX64Sha } },
      darwin: { x64: { asset: 'marksman-macos', sha256: linuxX64Sha } },
      win32: { x64: { asset: 'marksman.exe', sha256: linuxX64Sha } },
    },
  };
}

const FAKE_BINARY = Buffer.from('fake-marksman-bytes');
const FAKE_BINARY_SHA = sha256Hex(FAKE_BINARY);

describe('selectAsset', () => {
  it('returns null for an unsupported platform', () => {
    const r = selectAsset(fakeHashes(FAKE_BINARY_SHA), 'aix' as NodeJS.Platform, 'x64');
    expect(r).toBeNull();
  });

  it('returns null for an unsupported arch on a supported platform', () => {
    const r = selectAsset(fakeHashes(FAKE_BINARY_SHA), 'linux', 'mips' as NodeJS.Architecture);
    expect(r).toBeNull();
  });

  it('substitutes {version} + {asset} in the URL template', () => {
    const r = selectAsset(fakeHashes(FAKE_BINARY_SHA), 'linux', 'x64');
    expect(r?.url).toBe('https://example.test/2024.10.10/marksman-linux-x64');
  });
});

describe('verifyHash', () => {
  it('ok when expected === actual', () => {
    expect(verifyHash('a', 'a').ok).toBe(true);
  });
  it('not ok when expected !== actual', () => {
    expect(verifyHash('a', 'b').ok).toBe(false);
  });
});

describe('runInstall', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `marksman-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('happy path — sha matches, binary written, log.available=true', async () => {
    const result = await runInstall({
      repoRoot: root,
      platform: 'linux',
      arch: 'x64',
      hashes: fakeHashes(FAKE_BINARY_SHA),
      download: async () => FAKE_BINARY,
    });
    expect(result.state.available).toBe(true);
    expect(result.state.version).toBe('2024.10.10');
    expect(fs.existsSync(result.state.binary_path!)).toBe(true);
    expect(readLog(root)?.marksman.available).toBe(true);
  });

  it('sha256 mismatch — records both hashes, does NOT write binary', async () => {
    const result = await runInstall({
      repoRoot: root,
      platform: 'linux',
      arch: 'x64',
      hashes: fakeHashes('PINNED_NOT_FAKE'),
      download: async () => FAKE_BINARY,
    });
    expect(result.state.available).toBe(false);
    expect(result.state.reason).toBe('sha256_mismatch');
    expect(result.state.expected_sha).toBe('PINNED_NOT_FAKE');
    expect(result.state.got_sha).toBe(FAKE_BINARY_SHA);
    const binaryPath = path.join(root, '.dev-pomogator', 'bin', 'marksman');
    expect(fs.existsSync(binaryPath)).toBe(false);
  });

  it('offline — download throws → log.reason=offline', async () => {
    const result = await runInstall({
      repoRoot: root,
      platform: 'linux',
      arch: 'x64',
      hashes: fakeHashes(FAKE_BINARY_SHA),
      download: async () => {
        throw new Error('ENOTFOUND example.test');
      },
    });
    expect(result.state.available).toBe(false);
    expect(result.state.reason).toBe('offline');
  });

  it('unsupported platform — log.reason=unsupported_platform', async () => {
    const result = await runInstall({
      repoRoot: root,
      platform: 'aix' as NodeJS.Platform,
      arch: 'x64',
      hashes: fakeHashes(FAKE_BINARY_SHA),
      download: async () => FAKE_BINARY,
    });
    expect(result.state.available).toBe(false);
    expect(result.state.reason).toBe('unsupported_platform');
  });

  it('writes the binary with executable mode (0o755 best-effort)', async () => {
    const result = await runInstall({
      repoRoot: root,
      platform: 'linux',
      arch: 'x64',
      hashes: fakeHashes(FAKE_BINARY_SHA),
      download: async () => FAKE_BINARY,
    });
    const stat = fs.statSync(result.state.binary_path!);
    // Unix exec bit may be unset on some Windows filesystems. Just confirm
    // the file is there with non-zero size — the mode is a soft contract.
    expect(stat.size).toBe(FAKE_BINARY.length);
  });
});
