/**
 * Marksman LSP postinstall — silent, sha256-verified, fail-OPEN per FR-7.
 *
 * Runs as part of `npm install` via `package.json::scripts.postinstall`.
 * Detects the host platform/arch, downloads the matching binary from the
 * release URL pinned in `marksman-hashes.json`, verifies sha256 against the
 * pinned value (FR-27), and copies it to `.dev-pomogator/bin/marksman`
 * (`.exe` on Windows).
 *
 * Failure-mode policy per FR-7 last paragraph: this script NEVER exits
 * non-zero. Every failure path writes a structured `install-log.json`
 * with a `reason` and the script returns 0 so npm install completes.
 * The MCP server reads the log at startup and falls back to a custom
 * JS-based LSP subset when `marksman.available === false`.
 *
 * sha256 mismatch (FR-27) ALSO unlinks the downloaded artefact before
 * exit so a tampered binary is not left in place on disk.
 *
 * The implementation is split into pure helpers so unit tests can drive
 * each branch without touching the network: `selectAsset`, `verifyHash`,
 * `runInstall` — all exported.
 *
 * @see ./marksman-hashes.json
 * @see ./install-log.ts
 * @see .specs/spec-generator-v4/FR.md FR-7, FR-27
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { pathToFileURL } from 'node:url';
import { writeLog, type MarksmanState, type Reason } from './install-log.ts';

interface HashEntry {
  asset: string;
  sha256: string;
}

interface HashesFile {
  version: string;
  release_url_template: string;
  platforms: Record<string, Record<string, HashEntry>>;
}

export interface InstallOptions {
  repoRoot: string;
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  /**
   * Override the download function for tests. Default = real https.get.
   * Must resolve with a Buffer of the binary or reject on network error.
   */
  download?: (url: string) => Promise<Buffer>;
  /**
   * Override the source of pinned hashes. Default = ./marksman-hashes.json.
   */
  hashes?: HashesFile;
  /** Where to write the verified binary. Default = `<repoRoot>/.dev-pomogator/bin/marksman[.exe]`. */
  binaryDestination?: string;
}

export interface InstallResult {
  state: MarksmanState;
}

function defaultHashes(): HashesFile {
  const here = path.dirname(new URL(import.meta.url).pathname);
  // The pathname above starts with a leading `/` on Windows (`/D:/...`) —
  // strip it so fs.readFileSync gets a real path.
  const resolved = process.platform === 'win32' && here.startsWith('/')
    ? here.slice(1)
    : here;
  const raw = fs.readFileSync(path.join(resolved, 'marksman-hashes.json'), 'utf8');
  return JSON.parse(raw) as HashesFile;
}

/** Pick the per-platform/per-arch asset spec or null on unsupported combos. */
export function selectAsset(
  hashes: HashesFile,
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
): { asset: string; sha256: string; url: string } | null {
  const platformEntry = hashes.platforms[platform];
  if (!platformEntry) return null;
  const archEntry = platformEntry[arch];
  if (!archEntry) return null;
  const url = hashes.release_url_template
    .replace('{version}', hashes.version)
    .replace('{asset}', archEntry.asset);
  return { asset: archEntry.asset, sha256: archEntry.sha256, url };
}

/** sha256 hex of an in-memory buffer. */
export function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Compare `(expected, actual)` and return diagnostic. */
export function verifyHash(
  expected: string,
  actual: string,
): { ok: boolean; expected: string; actual: string } {
  return { ok: expected === actual, expected, actual };
}

function defaultDownload(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 30_000 }, (res) => {
      // Follow a single redirect — GitHub releases redirect once to
      // objects.githubusercontent.com.
      if (res.statusCode === 301 || res.statusCode === 302) {
        const next = res.headers.location;
        if (!next) {
          reject(new Error(`redirect without location from ${url}`));
          return;
        }
        defaultDownload(next).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`http ${res.statusCode} from ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`timeout fetching ${url}`));
    });
  });
}

function defaultBinaryPath(repoRoot: string, platform: NodeJS.Platform): string {
  const name = platform === 'win32' ? 'marksman.exe' : 'marksman';
  return path.join(repoRoot, '.dev-pomogator', 'bin', name);
}

/**
 * Run the install once. Always resolves (never throws) — fault-OPEN per FR-7.
 * The returned state is whatever was just written to the on-disk log.
 */
export async function runInstall(opts: InstallOptions): Promise<InstallResult> {
  const installed_at = new Date().toISOString();
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  const hashes = opts.hashes ?? defaultHashes();

  const target = opts.binaryDestination ?? defaultBinaryPath(opts.repoRoot, platform);
  const writeFail = (reason: Reason, extra: Partial<MarksmanState> = {}): InstallResult => {
    const state: MarksmanState = { available: false, reason, installed_at, ...extra };
    writeLog(opts.repoRoot, state);
    return { state };
  };

  const pick = selectAsset(hashes, platform, arch);
  if (!pick) {
    return writeFail('unsupported_platform');
  }

  let buf: Buffer;
  try {
    buf = await (opts.download ?? defaultDownload)(pick.url);
  } catch {
    return writeFail('offline');
  }

  const actualSha = sha256Hex(buf);
  if (!verifyHash(pick.sha256, actualSha).ok) {
    return writeFail('sha256_mismatch', { expected_sha: pick.sha256, got_sha: actualSha });
  }

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, buf, { mode: 0o755 });
  } catch {
    return writeFail('extract_failed');
  }

  const state: MarksmanState = {
    available: true,
    version: hashes.version,
    binary_path: target,
    installed_at,
  };
  writeLog(opts.repoRoot, state);
  return { state };
}

async function main(): Promise<void> {
  const repoRoot = process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd();
  await runInstall({ repoRoot });
  // FR-7: always exit 0 so `npm install` completes.
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`[marksman-installer] unexpected: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(0);
  });
}
