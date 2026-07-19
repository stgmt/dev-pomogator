import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { CANONICAL_REINSTALL_HINT } from './canonical.js';

interface Hook { type?: string; command?: string; url?: string; timeout?: number; headers?: Record<string, string>; allowedEnvVars?: string[] }
interface Group { matcher?: string; hooks?: Hook[] }
interface Manifest { hooks?: Record<string, Group[]> }
interface Registry { routes?: Record<string, { target?: string; timeout?: number; matcher?: string }> }

const requiredRuntimeFiles = [
  'tools/hook-service/server.mjs',
  'tools/hook-service/ensure-up.mjs',
  'tools/hook-service/session-bootstrap.mjs',
  'tools/hook-service/migrate-managed-hooks.mjs',
  'tools/hook-service/registry.json',
  '.claude-plugin/hooks.legacy.json',
];

function result(severity: CheckResult['severity'], message: string, details?: Record<string, unknown>): CheckResult {
  return {
    id: 'C32', fr: 'FR-24', name: 'Shell-free hook service', group: 'self-sufficient', severity,
    reinstallable: severity !== 'ok', message,
    hint: severity === 'ok' ? undefined : 'Reinstall or update dev-pomogator to regenerate the managed HTTP hook transport.',
    reinstallHint: severity === 'ok' ? undefined : CANONICAL_REINSTALL_HINT,
    durationMs: 0, details,
  };
}

export const hookServiceCheck: CheckDefinition = {
  id: 'C32', fr: 'FR-24', name: 'Shell-free hook service', group: 'self-sufficient', reinstallable: true, pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult> {
    const root = ctx.projectRoot;
    const absent = requiredRuntimeFiles.filter(file => !fs.existsSync(path.join(root, file)));
    if (absent.length) return result('warning', `shell-free hook service is not installed (${absent.join(', ')})`, { absent });

    let manifest: Manifest;
    let registry: Registry;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin/hooks.json'), 'utf8')) as Manifest;
      registry = JSON.parse(fs.readFileSync(path.join(root, 'tools/hook-service/registry.json'), 'utf8')) as Registry;
    } catch (error) {
      return result('critical', `cannot parse shell-free hook assets: ${(error as Error).message}`);
    }

    const problems: string[] = [];
    const bootstrap = manifest.hooks?.SessionStart?.flatMap(group => group.hooks ?? []) ?? [];
    if (bootstrap.length !== 1 || bootstrap[0]?.type !== 'command' || !bootstrap[0]?.command?.includes('tools/hook-service/session-bootstrap.mjs')) {
      problems.push('SessionStart must have exactly one hook-service bootstrap');
    }

    for (const [event, groups] of Object.entries(manifest.hooks ?? {})) {
      if (event === 'SessionStart') continue;
      groups.forEach((group, groupIndex) => (group.hooks ?? []).forEach((hook, hookIndex) => {
        const id = `${event}/${groupIndex}/${hookIndex}`;
        const expected = `http://127.0.0.1:42619/v1/dispatch/${encodeURIComponent(id)}`;
        if (hook.type !== 'http' || hook.url !== expected) problems.push(`${id} is not the canonical loopback HTTP route`);
        if (hook.headers || hook.allowedEnvVars) problems.push(`${id} must not declare hook-service authentication metadata`);
        const route = registry.routes?.[id];
        const target = route?.target;
        if (!target || path.isAbsolute(target) || target.split(/[\\/]/).includes('..') || !fs.existsSync(path.join(root, target))) {
          problems.push(`${id} has no valid registry target`);
        }
        if (route?.timeout !== hook.timeout) problems.push(`${id} timeout drifts from registry`);
        if ((route?.matcher ?? '') !== (group.matcher ?? '')) problems.push(`${id} matcher drifts from registry`);
      }));
    }
    if (problems.length) return result('critical', problems.join('; '), { problems });
    return result('ok', 'one SessionStart bootstrap and all managed hook routes use the local HTTP service');
  },
};
