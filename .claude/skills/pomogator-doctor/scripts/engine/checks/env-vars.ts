import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { readDotenvFile } from './_helpers.js';

interface SettingsLocal {
  env?: Record<string, string>;
}

export const envVarsCheck: CheckDefinition = {
  id: 'C7',
  fr: 'FR-5',
  name: 'Required env vars',
  group: 'needs-env',
  reinstallable: false,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const settingsLocalEnv = readSettingsLocalEnv(ctx.projectRoot);
    const dotenvValues = readDotenvFile(path.join(ctx.projectRoot, '.env'));

    const results: CheckResult[] = [];

    for (const ext of ctx.installedExtensions) {
      for (const req of ext.envRequirements ?? []) {
        if (!req.required) continue;

        const processVal = process.env[req.name];
        const dotenvVal = dotenvValues[req.name];
        const settingsVal = settingsLocalEnv[req.name];

        const sources: string[] = [];
        if (processVal) sources.push('process.env');
        if (dotenvVal) sources.push('.env');
        if (settingsVal) sources.push('settings.local.json');

        const isSet = sources.length > 0;
        results.push({
          id: `C7:${req.name}`,
          fr: 'FR-5',
          name: req.name,
          group: 'needs-env',
          severity: isSet ? 'ok' : 'critical',
          reinstallable: false,
          message: isSet
            ? `set in ${sources.join(', ')}`
            : 'required env var not set in .env or .claude/settings.local.json env block',
          hint: isSet
            ? undefined
            : `Set ${req.name} in .env (see .env.example) OR .claude/settings.local.json env block`,
          extension: ext.name,
          durationMs: 0,
          envStatus: { name: req.name, status: isSet ? 'set' : 'unset' },
        });
      }
    }

    if (results.length === 0) {
      results.push({
        id: 'C7',
        fr: 'FR-5',
        name: 'Required env vars',
        group: 'needs-env',
        severity: 'ok',
        reinstallable: false,
        message: 'no required envRequirements declared by installed extensions',
        durationMs: 0,
      });
    }

    return results;
  },
};

function readSettingsLocalEnv(projectRoot: string): Record<string, string> {
  const p = path.join(projectRoot, '.claude', 'settings.local.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as SettingsLocal;
    return parsed.env ?? {};
  } catch {
    return {};
  }
}
