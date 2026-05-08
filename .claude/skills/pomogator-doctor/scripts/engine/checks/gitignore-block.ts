import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';

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
    const gitignorePath = path.join(ctx.projectRoot, '.gitignore');
    let content: string;
    try {
      content = fs.readFileSync(gitignorePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return build(
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
    return build(
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
    reinstallHint: 'Run `npx dev-pomogator` to refresh marker block',
    durationMs: 0,
  };
}
