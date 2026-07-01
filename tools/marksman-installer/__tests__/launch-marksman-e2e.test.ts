// Hop-1 real-artifact e2e (FR-7): the native-LSP launcher shim, driven against
// the REAL Marksman binary, MUST answer an LSP `initialize` with the nav
// capabilities FR-7b assigns to the LSP. Replaces the retired bridge e2e as the
// regression guard. skip-policy semantic preserved via decideE2e: a binary
// present ⇒ run; absent inside Docker ⇒ hard FAIL; absent on a dev host ⇒ skip.

import { describe, it, expect } from 'vitest';
import { resolveMarksmanBinary } from '../resolve-binary.ts';
import { createMarksmanWorkspace, decideE2e, isInDocker, probeInitialize, removeMarksmanWorkspace } from '../lsp-probe.ts';

const resolved = resolveMarksmanBinary({ repoRoot: process.cwd() });
const decision = decideE2e({ binaryPath: resolved?.binaryPath ?? null, inDocker: isInDocker() });

describe('launch-marksman e2e — real binary answers LSP initialize (FR-7 hop-1)', () => {
  if (decision === 'fail') {
    it('FAILS hard: inside Docker but no Marksman binary resolved (silent-skip = fake-green)', () => {
      throw new Error(
        'DEV_POMOGATOR_TEST_IN_DOCKER=1 but no Marksman binary resolved — the Docker image MUST ' +
          'install it (Dockerfile.test Layer 1b sets DEV_POMOGATOR_MARKSMAN_BIN). A silent skip here ' +
          'would be fake-green per dead-integration-guard.',
      );
    });
    return;
  }

  if (decision === 'skip') {
    it.skip('skipped — no Marksman binary on this dev host (set DEV_POMOGATOR_MARKSMAN_BIN or run in Docker)', () => {});
    return;
  }

  it(
    'launcher → `marksman server` → initialize returns definition/references/rename/documentSymbol',
    async () => {
      const ws = createMarksmanWorkspace();
      try {
        const { capabilities } = await probeInitialize({
          binaryPath: resolved!.binaryPath,
          workspaceDir: ws,
        });
        // The exact nav/edit primitives FR-7b assigns to the native LSP.
        expect(capabilities.definitionProvider).toBeTruthy();
        expect(capabilities.referencesProvider).toBeTruthy();
        expect(capabilities.renameProvider).toBeTruthy();
        expect(capabilities.documentSymbolProvider).toBeTruthy();
      } finally {
        removeMarksmanWorkspace(ws);
      }
    },
    25000,
  );
});
