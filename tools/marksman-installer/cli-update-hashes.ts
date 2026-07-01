// Refresh marksman-hashes.json with REAL sha256 for a given release (FR-27).
//
// The "without crutches" answer to integrity pinning: hashes are COMPUTED from
// the actual release assets by this script, never hand-pasted. A maintainer
// runs it after a version bump, reviews the diff, commits.
//
//   npx tsx tools/marksman-installer/cli-update-hashes.ts --version 2026-02-08
//
// Downloads each unique asset once (macOS is shared across darwin x64/arm64),
// computes sha256, and rewrites the pinned file in place.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HASHES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'marksman-hashes.json');

interface Entry { asset: string; sha256: string }
interface Hashes {
  version: string;
  release_url_template: string;
  platforms: Record<string, Record<string, Entry>>;
  [k: string]: unknown;
}

async function fetchSha256(url: string): Promise<{ sha: string; bytes: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { sha: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const vIdx = argv.indexOf('--version');
  const cfg = JSON.parse(fs.readFileSync(HASHES, 'utf8')) as Hashes;
  const version = vIdx >= 0 ? argv[vIdx + 1] : cfg.version;
  cfg.version = version;

  const cache = new Map<string, string>();
  for (const arches of Object.values(cfg.platforms)) {
    for (const entry of Object.values(arches)) {
      if (!cache.has(entry.asset)) {
        const url = cfg.release_url_template.replace('{version}', version).replace('{asset}', entry.asset);
        process.stderr.write(`fetching ${entry.asset} (${version}) ...\n`);
        const { sha, bytes } = await fetchSha256(url);
        process.stderr.write(`  ${sha}  ${(bytes / 1e6).toFixed(1)}MB\n`);
        cache.set(entry.asset, sha);
      }
      entry.sha256 = cache.get(entry.asset)!;
    }
  }

  fs.writeFileSync(HASHES, JSON.stringify(cfg, null, 2) + '\n');
  process.stdout.write(`updated ${path.basename(HASHES)} → version ${version}\n`);
  for (const [os, arches] of Object.entries(cfg.platforms)) {
    for (const [arch, e] of Object.entries(arches)) {
      process.stdout.write(`  ${os}/${arch}  ${e.asset}  ${e.sha256.slice(0, 16)}…\n`);
    }
  }
}

main().catch((e) => {
  process.stderr.write(`[cli-update-hashes] ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
