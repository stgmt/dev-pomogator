/**
 * BeforeEach hook (per-scenario) for onboard-repo-phase0 tests.
 * Setup:
 *  - Copy fixture fake-repo into tmpdir
 *  - Optionally init git + commit
 *  - Capture managed-registry snapshot for later restore
 *
 * See DESIGN.md > BDD Test Infrastructure > Новые hooks.
 */

import { setupFakeRepo, snapshotRegistry, type SetupOptions, type RegistrySnapshot } from '../helpers.ts';


export interface BeforeEachContext {
  tmpdir: string;
  registrySnapshot: RegistrySnapshot;
}


export async function runBeforeEach(fixtureName: string, options: SetupOptions = {}): Promise<BeforeEachContext> {
  const registrySnapshot = snapshotRegistry();
  const tmpdir = await setupFakeRepo(fixtureName, options);
  return { tmpdir, registrySnapshot };
}
