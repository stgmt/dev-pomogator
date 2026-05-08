import type { CheckContext } from './types.js';

export function buildCheckContextForTests(
  overrides: Partial<CheckContext> & { homeDir: string; projectRoot: string },
): CheckContext {
  return {
    config: overrides.config ?? null,
    configError: overrides.configError ?? null,
    referencedMcpServers: overrides.referencedMcpServers ?? new Set(),
    installedExtensions: overrides.installedExtensions ?? [],
    projectRoot: overrides.projectRoot,
    homeDir: overrides.homeDir,
    signal: overrides.signal ?? new AbortController().signal,
    packageVersion: overrides.packageVersion ?? null,
  };
}
