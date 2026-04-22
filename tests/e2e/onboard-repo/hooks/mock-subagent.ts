/**
 * BeforeAll hook (per-test-file) — mocks Claude Code Explore subagent invocations.
 * Instead of real Agent tool calls (expensive, non-deterministic), tests register
 * a fixture name to load from tests/fixtures/subagent-outputs/{name}.json.
 *
 * See DESIGN.md > BDD Test Infrastructure > Новые hooks.
 */

import { loadSubagentOutput } from '../helpers.ts';
import type { ParallelReconOutput } from '../../../../extensions/onboard-repo/tools/onboard-repo/lib/types.ts';


class MockSubagents {
  private fixtureName: string | null = null;
  private cachedOutput: ParallelReconOutput | null = null;

  async register(fixtureName: string): Promise<void> {
    this.fixtureName = fixtureName;
    this.cachedOutput = (await loadSubagentOutput(fixtureName)) as ParallelReconOutput;
  }

  invoke(): ParallelReconOutput {
    if (!this.cachedOutput) {
      throw new Error(`MockSubagents: no fixture registered. Call register('<name>.json') first.`);
    }
    return this.cachedOutput;
  }

  isRegistered(): boolean {
    return this.cachedOutput !== null;
  }

  reset(): void {
    this.fixtureName = null;
    this.cachedOutput = null;
  }
}


export const mockSubagents = new MockSubagents();
