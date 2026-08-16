import type { CheckDefinition } from '../types.js';
import { buildResult } from './_helpers.js';
// FR-10: reuse the single source of truth for the install health-check (DRY, builtins-only).
import { checkRootArtifactsInstall } from '../../../../../../tools/forbid-root-artifacts/doctor-check.js';

const META = {
  id: 'C25',
  fr: 'FR-10',
  name: 'forbid-root-artifacts pre-commit install',
  group: 'self-sufficient',
  reinstallable: true,
} as const;

export const forbidRootArtifactsCheck: CheckDefinition = {
  ...META,
  pool: 'fs',
  async run(ctx) {
    const r = checkRootArtifactsInstall(ctx.projectRoot);
    const severity = r.status === 'green' ? 'ok' : r.status === 'yellow' ? 'warning' : 'critical';
    return buildResult(
      META,
      severity,
      r.message,
      r.fixAction
        ? { hint: `Reinstall: ${r.fixAction}`, reinstallHint: r.fixAction }
        : {},
    );
  },
};
