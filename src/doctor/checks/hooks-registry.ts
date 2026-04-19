import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';

interface SettingsLocal {
  hooks?: Record<string, unknown>;
  env?: Record<string, string>;
}

export const hooksRegistryCheck: CheckDefinition = {
  id: 'C6',
  fr: 'FR-4',
  name: 'Hooks registry sync',
  group: 'self-sufficient',
  reinstallable: true,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult> {
    const settingsPath = path.join(ctx.projectRoot, '.claude', 'settings.local.json');
    let settings: SettingsLocal = {};
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as SettingsLocal;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return build('warning', 'settings.local.json not found', 'Run installer to create it');
      }
      return build('critical', `settings.local.json parse error: ${(error as Error).message}`);
    }

    const expected = ctx.config?.managed?.[ctx.projectRoot]?.hooks ?? {};
    const actual = settings.hooks ?? {};

    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);

    const missing = expectedKeys.filter((k) => !actualKeys.includes(k));
    const stale = actualKeys.filter((k) => !expectedKeys.includes(k) && k !== 'user');

    if (missing.length === 0 && stale.length === 0) {
      return build(
        'ok',
        expectedKeys.length === 0
          ? 'no managed hooks expected'
          : `${expectedKeys.length} hook(s) registered as expected`,
      );
    }
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing in settings: ${missing.join(', ')}`);
    if (stale.length > 0) parts.push(`unexpected keys: ${stale.join(', ')}`);
    return build('critical', parts.join('; '), 'Reinstall to sync hooks');
  },
};

function build(
  severity: CheckResult['severity'],
  message: string,
  hint?: string,
): CheckResult {
  return {
    id: 'C6',
    fr: 'FR-4',
    name: 'Hooks registry sync',
    group: 'self-sufficient',
    severity,
    reinstallable: true,
    message,
    hint,
    reinstallHint: 'Run `npx dev-pomogator` to rewrite managed hooks',
    durationMs: 0,
  };
}
