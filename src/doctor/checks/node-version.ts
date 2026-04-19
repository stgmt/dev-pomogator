import semver from 'semver';
import type { CheckDefinition } from '../types.js';

const REQUIRED_RANGE = '>=22.6.0';

export const nodeVersionCheck: CheckDefinition = {
  id: 'C1',
  fr: 'FR-1',
  name: 'Node version',
  group: 'self-sufficient',
  reinstallable: false,
  pool: 'fs',
  async run() {
    const current = process.versions.node;
    const ok = semver.satisfies(current, REQUIRED_RANGE, { includePrerelease: true });
    if (ok) {
      return {
        id: 'C1',
        fr: 'FR-1',
        name: 'Node version',
        group: 'self-sufficient',
        severity: 'ok',
        reinstallable: false,
        message: `Node v${current} (${REQUIRED_RANGE} required)`,
        durationMs: 0,
      };
    }
    const isBelow18 = semver.lt(current, '18.0.0');
    return {
      id: 'C1',
      fr: 'FR-1',
      name: 'Node version',
      group: 'self-sufficient',
      severity: isBelow18 ? 'critical' : 'warning',
      reinstallable: false,
      message: `Node v${current}, ${REQUIRED_RANGE} required for native TypeScript strip-types in hooks`,
      hint: 'Upgrade Node to 22.6+ (https://nodejs.org). Below 22.6 hooks fall back to tsx (slower cold start).',
      durationMs: 0,
    };
  },
};
