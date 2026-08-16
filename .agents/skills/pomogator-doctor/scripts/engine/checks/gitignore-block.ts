import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { CANONICAL_REINSTALL_HINT, isCanonicalInstall } from './canonical.js';

// Inlined from former src/installer/gitignore.ts (deleted in Phase 1 destructive cleanup).
// Kept here for legacy v1 install detection — checks if user's project still has the v1 marker block.
const MARKER_BEGIN = '# >>> dev-pomogator (managed — do not edit) >>>';
const MARKER_END = '# <<< dev-pomogator (managed — do not edit) <<<';

export const gitignoreBlockCheck: CheckDefinition = {
  id: 'C14',
  fr: 'FR-12',
  name: 'Managed .gitignore block',
  group: 'self-sufficient',
  reinstallable: true,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult> {
    // The managed .gitignore block is a v1 personal-installer artefact. Canonical v2
    // installs never write it (skills/hooks live in the plugin cache, not the project),
    // so its absence is expected and must not warn.
    const canonical = isCanonicalInstall(ctx.projectRoot);
    const gitignorePath = path.join(ctx.projectRoot, '.gitignore');
    let content: string;
    try {
      content = fs.readFileSync(gitignorePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return canonical
          ? build('ok', 'canonical plugin install — managed .gitignore block not used')
          : build(
              'warning',
              '.gitignore missing at project root',
              'Reinstall to create .gitignore with managed block',
            );
      }
      return build('warning', `cannot read .gitignore: ${(error as Error).message}`);
    }

    const hasBegin = content.includes(MARKER_BEGIN);
    const hasEnd = content.includes(MARKER_END);
    if (hasBegin && hasEnd) {
      return build('ok', 'managed gitignore block present');
    }
    if (hasBegin !== hasEnd) {
      return build(
        'critical',
        'managed gitignore block truncated (missing BEGIN or END marker)',
        'Reinstall to rewrite marker block cleanly',
      );
    }
    return canonical
      ? build('ok', 'canonical plugin install — managed .gitignore block not used')
      : build(
          'warning',
          'no managed gitignore block — dev-pomogator files may leak via `git add .`',
          'Reinstall to add managed block automatically',
        );
  },
};

function build(
  severity: CheckResult['severity'],
  message: string,
  hint?: string,
): CheckResult {
  return {
    id: 'C14',
    fr: 'FR-12',
    name: 'Managed .gitignore block',
    group: 'self-sufficient',
    severity,
    reinstallable: severity !== 'ok',
    message,
    hint,
    reinstallHint: CANONICAL_REINSTALL_HINT,
    durationMs: 0,
  };
}
