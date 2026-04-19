import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';

export const envExampleCheck: CheckDefinition = {
  id: 'C8',
  fr: 'FR-6',
  name: '.env.example presence',
  group: 'self-sufficient',
  reinstallable: true,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult | null> {
    const hasRequired = ctx.installedExtensions.some((ext) =>
      (ext.envRequirements ?? []).some((r) => r.required),
    );
    if (!hasRequired) {
      return {
        id: 'C8',
        fr: 'FR-6',
        name: '.env.example presence',
        group: 'self-sufficient',
        severity: 'ok',
        reinstallable: true,
        message: 'no required envRequirements → .env.example not needed',
        durationMs: 0,
      };
    }

    const envExamplePath = path.join(ctx.projectRoot, '.env.example');
    try {
      fs.accessSync(envExamplePath, fs.constants.F_OK);
      return {
        id: 'C8',
        fr: 'FR-6',
        name: '.env.example presence',
        group: 'self-sufficient',
        severity: 'ok',
        reinstallable: true,
        message: `.env.example present at ${envExamplePath}`,
        durationMs: 0,
      };
    } catch {
      return {
        id: 'C8',
        fr: 'FR-6',
        name: '.env.example presence',
        group: 'self-sufficient',
        severity: 'warning',
        reinstallable: true,
        message: `.env.example missing at ${envExamplePath}`,
        hint: 'Reinstall to regenerate .env.example template',
        reinstallHint: 'Installer writes .env.example based on installed extensions envRequirements',
        durationMs: 0,
      };
    }
  },
};
