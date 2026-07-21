export type PathClass = 'source' | 'config' | 'spec' | 'log' | 'generated' | 'lockfile' | 'unknown';

export interface HookDecision {
  permissionDecision: 'allow' | 'deny';
  reason: string;
  pathClass: PathClass;
  ctxToolsAvailable: boolean;
  killSwitch: boolean;
}

const SOURCE_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|cs|java)$/i;
const LOG_RE = /\.(?:log|ndjson|jsonl|trace|out|err)$/i;
const CONFIG_RE = /(?:^|[/\\])(?:package\.json|tsconfig\.json|cucumber\.json|\.claude\.json|settings\.json|AGENTS\.md)$/i;
const LOCK_RE = /(?:^|[/\\])(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lock)$/i;

export function classifyContextModePath(filePath: string | undefined): PathClass {
  if (!filePath) return 'unknown';
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('/.specs/')) return 'spec';
  if (LOCK_RE.test(normalized)) return 'lockfile';
  if (CONFIG_RE.test(normalized)) return 'config';
  if (LOG_RE.test(normalized)) return 'log';
  if (/(?:^|\/)(?:dist|build|coverage|tmp|\.tmp)\//i.test(normalized) || /\.min\.js$/i.test(normalized) || /\.map$/i.test(normalized)) {
    return 'generated';
  }
  if (SOURCE_RE.test(normalized) || /\.(?:md|mdx|feature)$/i.test(normalized)) return 'source';
  return 'unknown';
}

export function evaluateContextModeHook(options: {
  toolName: string;
  filePath?: string;
  ctxToolsAvailable: boolean;
  forceCtx?: boolean;
  env?: NodeJS.ProcessEnv;
}): HookDecision {
  const killSwitch = options.env?.FORCE_CTX_OFF === '1' || options.env?.DEV_POMOGATOR_CONTEXT_MODE === 'off';
  const pathClass = classifyContextModePath(options.filePath);

  if (!options.ctxToolsAvailable) {
    return {
      permissionDecision: 'allow',
      reason: 'native fallback because context-mode MCP unavailable; reconnect with /mcp when convenient',
      pathClass,
      ctxToolsAvailable: false,
      killSwitch,
    };
  }
  if (killSwitch || !options.forceCtx) {
    return {
      permissionDecision: 'allow',
      reason: killSwitch ? 'force-ctx disabled by kill switch' : 'force-ctx policy not enabled',
      pathClass,
      ctxToolsAvailable: true,
      killSwitch,
    };
  }
  if (pathClass === 'log' || pathClass === 'generated' || pathClass === 'lockfile') {
    return {
      permissionDecision: 'deny',
      reason: 'CASE-A: use context-mode; run ctx_execute_file for project files or ctx_batch_execute for external/generated artifacts',
      pathClass,
      ctxToolsAvailable: true,
      killSwitch,
    };
  }
  return {
    permissionDecision: 'allow',
    reason: `native ${options.toolName} allowed for read-to-edit ${pathClass} path`,
    pathClass,
    ctxToolsAvailable: true,
    killSwitch,
  };
}
