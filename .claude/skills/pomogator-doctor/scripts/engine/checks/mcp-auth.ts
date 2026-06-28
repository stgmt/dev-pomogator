import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { buildResult } from './_helpers.js';
import { readMcpConfigs } from './mcp-parse.js';
// Cross-tree reuse: the same real-check predicates the SessionStart hook + configure-mcp skill use.
import {
  context7Configured,
  octocodeConfigured,
  findEntry,
  ghAuthStatus,
  type McpEntry,
} from '../../../../../../tools/mcp-setup/mcp-auth-detect.ts';

const META = {
  id: 'C-MCPA',
  fr: 'FR-MCP',
  name: 'MCP auth (Context7 / Octocode)',
  group: 'needs-external' as const,
  reinstallable: false,
};

const FIX_HINT =
  'Запусти skill `configure-mcp` (или скажи «настрой mcp»): Context7 — дай API-ключ ' +
  '(https://context7.com/dashboard) или `npx ctx7 setup`; Octocode — `gh auth login` или GitHub-токен ' +
  '(scopes repo, read:user, read:org). Ключ впишется в ~/.claude.json, варнинг исчезнет со след. сессии.';

/**
 * C-MCPA — Context7/Octocode installed-but-not-auth-configured detector. Mirrors C-CMEM's
 * warning→ok transition: the result flips to `ok` once the real auth check passes (Context7 key
 * present; Octocode token OR `gh auth status` ok), so the SessionStart banner disappears.
 *
 * Relevance: a server counts if it is referenced by a rule/skill OR already present in config. The
 * bootstrap hook installs both, so in practice both are present. Servers neither referenced nor
 * present are ignored (foreign repos that don't use these MCPs get a clean `ok`).
 */
export const mcpAuthCheck: CheckDefinition = {
  ...META,
  pool: 'mcp',
  async run(ctx: CheckContext): Promise<CheckResult> {
    const configs = readMcpConfigs(ctx) as unknown as Map<string, McpEntry>;
    const referenced = ctx.referencedMcpServers;

    const relevant = (name: string): boolean =>
      referenced.has(name) || findEntry(configs, name) !== undefined;

    const unconfigured: string[] = [];
    if (relevant('context7') && !context7Configured(findEntry(configs, 'context7'), process.env)) {
      unconfigured.push('Context7 (нет API-ключа — анонимный тир)');
    }
    if (
      relevant('octocode') &&
      !octocodeConfigured(findEntry(configs, 'octocode'), process.env, () => ghAuthStatus())
    ) {
      unconfigured.push('Octocode (нет GitHub-доступа)');
    }

    if (unconfigured.length === 0) {
      return buildResult(META, 'ok', 'Context7/Octocode настроены (или не используются)');
    }
    return buildResult(META, 'warning', `MCP не настроены: ${unconfigured.join('; ')}`, {
      hint: FIX_HINT,
      details: { fixAction: 'configure-mcp', fixSkill: 'configure-mcp', unconfigured },
    });
  },
};
