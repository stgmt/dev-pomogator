import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';

const MAKE = (
  id: string,
  name: string,
  severity: CheckResult['severity'],
  message: string,
  hint?: string,
): CheckResult => ({
  id,
  fr: 'FR-3',
  name,
  group: 'self-sufficient',
  severity,
  reinstallable: true,
  message,
  hint,
  reinstallHint: 'Run `npx dev-pomogator` to recreate ~/.dev-pomogator/ artefacts',
  durationMs: 0,
});

export const pomogatorHomeCheck: CheckDefinition = {
  id: 'C3',
  fr: 'FR-3',
  name: '~/.dev-pomogator/ structure',
  group: 'self-sufficient',
  reinstallable: true,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const configPath = path.join(ctx.homeDir, '.dev-pomogator', 'config.json');

    if (ctx.configError) {
      const message = ctx.configError.message;
      results.push(
        MAKE(
          'C3',
          '~/.dev-pomogator/config.json',
          'critical',
          message.includes('not found')
            ? `config.json not found: ${configPath}`
            : `config.json invalid JSON: ${message}`,
          'Reinstall to regenerate config',
        ),
      );
      return results;
    }

    const configOk = fileExists(configPath);
    results.push(
      configOk
        ? MAKE('C3', '~/.dev-pomogator/config.json', 'ok', `config.json present at ${configPath}`)
        : MAKE('C3', '~/.dev-pomogator/config.json', 'critical', `config.json missing: ${configPath}`),
    );

    const bootstrapPath = path.join(
      ctx.homeDir,
      '.dev-pomogator',
      'scripts',
      'tsx-runner-bootstrap.cjs',
    );
    results.push(
      fileExists(bootstrapPath)
        ? MAKE(
            'C4',
            'tsx-runner-bootstrap.cjs',
            'ok',
            'hook bootstrap script present',
          )
        : MAKE(
            'C4',
            'tsx-runner-bootstrap.cjs',
            'critical',
            `bootstrap script missing: ${bootstrapPath}`,
            'All hooks will fail until this file exists',
          ),
    );

    const missingTools: string[] = [];
    for (const ext of ctx.installedExtensions) {
      const toolDir = path.join(ctx.homeDir, '.dev-pomogator', 'tools', ext.name);
      if (!fs.existsSync(toolDir)) missingTools.push(ext.name);
    }
    if (missingTools.length === 0 && ctx.installedExtensions.length > 0) {
      results.push(
        MAKE(
          'C5',
          'Extension tools directories',
          'ok',
          `all ${ctx.installedExtensions.length} installed extension tools present`,
        ),
      );
    } else if (missingTools.length > 0) {
      results.push(
        MAKE(
          'C5',
          'Extension tools directories',
          'critical',
          `missing tools for: ${missingTools.join(', ')}`,
          'Reinstall to restore extension tools',
        ),
      );
    }

    return results;
  },
};

function fileExists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
