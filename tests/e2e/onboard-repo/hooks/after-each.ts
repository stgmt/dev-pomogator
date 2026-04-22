/**
 * AfterEach hook (per-scenario) for onboard-repo-phase0 tests.
 * Teardown:
 *  - Remove tmpdir
 *  - Restore managed-registry snapshot
 *  - Reset any global mocks
 *
 * See DESIGN.md > BDD Test Infrastructure > Новые hooks.
 */

import { teardownFakeRepo, restoreRegistry } from '../helpers.ts';
import type { BeforeEachContext } from './before-each.ts';
import { mockSubagents } from './mock-subagent.ts';
import { runTestsMock } from '../../../fixtures/skills/run-tests-mock.ts';


export async function runAfterEach(ctx: BeforeEachContext): Promise<void> {
  try {
    await teardownFakeRepo(ctx.tmpdir);
  } finally {
    await restoreRegistry(ctx.registrySnapshot);
    mockSubagents.reset();
    runTestsMock.reset();
  }
}
