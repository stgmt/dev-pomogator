import semver from 'semver';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';

export const versionMatchCheck: CheckDefinition = {
  id: 'C13',
  fr: 'FR-11',
  name: 'Version match (package.json vs config)',
  group: 'self-sufficient',
  reinstallable: true,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult> {
    const configVersion = ctx.config?.version ?? null;
    const packageVersion = ctx.packageVersion;

    if (!configVersion || !packageVersion) {
      return build(
        'warning',
        `cannot compare versions (config=${configVersion ?? 'unknown'}, package=${packageVersion ?? 'unknown'})`,
        'Reinstall to record current version',
      );
    }

    if (!semver.valid(configVersion) || !semver.valid(packageVersion)) {
      return build(
        'warning',
        `invalid semver: config=${configVersion}, package=${packageVersion}`,
      );
    }

    const diff = semver.diff(configVersion, packageVersion);
    if (diff === null) {
      return build('ok', `versions match: ${configVersion}`);
    }
    if (diff === 'major') {
      return build(
        'critical',
        `major version mismatch: package=${packageVersion}, config=${configVersion}`,
        'Reinstall with `npx dev-pomogator` to sync tools + hooks to new major',
      );
    }
    if (diff === 'minor') {
      return build(
        'warning',
        `minor version drift: package=${packageVersion}, config=${configVersion}`,
        'Reinstall to pick up new minor features',
      );
    }
    return build(
      'ok',
      `patch-level drift only (package=${packageVersion}, config=${configVersion}) — no reinstall required`,
    );
  },
};

function build(
  severity: CheckResult['severity'],
  message: string,
  hint?: string,
): CheckResult {
  return {
    id: 'C13',
    fr: 'FR-11',
    name: 'Version match',
    group: 'self-sufficient',
    severity,
    reinstallable: severity !== 'ok',
    message,
    hint,
    reinstallHint: 'Run `npx dev-pomogator` to align ~/.dev-pomogator/config.json with current package version',
    durationMs: 0,
  };
}
