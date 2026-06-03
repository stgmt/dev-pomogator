// Real-binary e2e for the Marksman bridge (FR-7 / SPECGEN004_15, _16).
//
// Spawns the REAL marksman provided by the Docker test image
// (DEV_POMOGATOR_MARKSMAN_BIN) through the production bridge and drives a real
// initialize + wiki-link definition/references round-trip. A green result here
// MEANS the downloaded binary actually serves LSP — the honest proof FR-7 needs.
//
// Skip policy (skip-policy.ts): present -> run; absent on host -> skip-with-reason;
// absent INSIDE Docker -> hard FAIL (silent skip would be the fake-green we kill).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startBridge, type BridgeHandle } from '../bridge.ts';
import { decideE2e, e2eEnvFromProcess } from '../skip-policy.ts';

const decision = decideE2e(e2eEnvFromProcess((p) => fs.existsSync(p)));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('Marksman bridge — real binary e2e (FR-7 / _15, _16)', () => {
  if (decision === 'fail') {
    it('FAILS — real Marksman missing inside Docker (silent skip forbidden)', () => {
      throw new Error(
        'DEV_POMOGATOR_MARKSMAN_BIN unset/missing in the Docker test image — the real e2e must run, ' +
          'not skip. Check the Dockerfile.test marksman layer.',
      );
    });
    return;
  }
  if (decision === 'skip') {
    it.skip('real bridge round-trip (no Marksman binary on this host)', () => undefined);
    return;
  }

  const bin = process.env.DEV_POMOGATOR_MARKSMAN_BIN as string;
  let root: string;
  let indexUri: string;
  let handle: BridgeHandle;

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-e2e-'));
    fs.writeFileSync(path.join(root, '.marksman.toml'), '# project root marker\n');
    fs.writeFileSync(path.join(root, 'index.md'), '# Index\n\nSee [[note]] for details.\n');
    fs.writeFileSync(path.join(root, 'note.md'), '# Note\n\nReferenced from the index.\n');
    indexUri = pathToFileURL(path.join(root, 'index.md')).href;
    handle = await startBridge({
      binaryPath: bin,
      rootUri: pathToFileURL(root).href,
      initializeTimeoutMs: 15000,
    });
    // Open both docs so Marksman has them in scope while it indexes the folder.
    for (const f of ['index.md', 'note.md']) {
      handle.didOpen({
        uri: pathToFileURL(path.join(root, f)).href,
        text: fs.readFileSync(path.join(root, f), 'utf8'),
      });
    }
  }, 30000);

  afterAll(async () => {
    await handle?.stop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('SPECGEN004_15: the real binary responds to initialize with LSP capabilities', () => {
    expect(handle.capabilities.referencesProvider).toBe(true);
    expect(handle.capabilities.definitionProvider).toBe(true);
  });

  it('wiki-link references + definition resolve through the bridge (md_references round-trip)', async () => {
    // Marksman indexes asynchronously — poll until the folder is indexed.
    let refs: Awaited<ReturnType<BridgeHandle['references']>> = [];
    for (let i = 0; i < 25 && refs.length === 0; i++) {
      await sleep(300);
      refs = await handle.references({ uri: indexUri, position: { line: 2, character: 7 } });
    }
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(refs.some((r) => r.uri.endsWith('note.md'))).toBe(true);

    const def = await handle.definition({ uri: indexUri, position: { line: 2, character: 7 } });
    expect(def).not.toBeNull();
    expect(def?.uri).toMatch(/note\.md$/);
  }, 20000);
});
