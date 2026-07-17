#!/usr/bin/env node
/**
 * Authoring gate for managed Claude Code hook registries.
 *
 * The steady-state hook path is HTTP only. A narrowly scoped SessionStart
 * bootstrap may start or verify the local service, but it must not handle a
 * normal hook event. This checker is intentionally dependency-free so it can
 * run in pre-push and CI.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Hook = { type?: unknown; command?: unknown; url?: unknown; headers?: unknown };
type HookGroup = { matcher?: unknown; hooks?: unknown[] };
type Manifest = { hooks?: Record<string, HookGroup[]> };
type ServiceRoute = { matcher?: unknown };
type Registry = {
  version?: unknown;
  routes?: Record<string, ServiceRoute>;
};

export type Finding = { file: string; event?: string; message: string };
const HOT_PATH_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop', 'UserPromptSubmit', 'SessionEnd', 'PreCompact', 'Notification']);
const SHELL_RE = /(?:^|\s)(?:bash|sh)(?:\s|$)|\.(?:sh)(?:\s|$)/i;
const INLINE_NODE_RE = /(?:^|\s)node(?:\.exe)?\s+-e(?:\s|$)/i;

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function routeId(event: string, groupIndex: number, hookIndex: number): string {
  return `${event}/${groupIndex}/${hookIndex}`;
}

function hasApprovedServiceRegistry(registry: Registry): boolean {
  return registry.version === 1 && typeof registry.routes === 'object' && registry.routes !== null;
}

function isServiceClient(command: string, event: string, groupIndex: number, hookIndex: number): boolean {
  return /tools\/hook-service\/client\.mjs/.test(command) && command.includes(`\"${routeId(event, groupIndex, hookIndex)}\"`);
}

/** Review a hook manifest against its approved HTTP route registry. */
export function reviewHookManifest(manifestFile: string, registryFile: string): Finding[] {
  const manifest = readJson<Manifest>(manifestFile);
  const registry = readJson<Registry>(registryFile);
  const findings: Finding[] = [];
  const registryApproved = hasApprovedServiceRegistry(registry);
  if (!registryApproved) findings.push({ file: registryFile, message: 'hook-service registry must be version 1 with a routes object' });

  for (const [event, groups] of Object.entries(manifest.hooks ?? {})) {
    for (const [groupIndex, group] of (groups ?? []).entries()) {
      const matcher = typeof group.matcher === 'string' ? group.matcher : '';
      for (const [hookIndex, hook] of ((group.hooks ?? []) as Hook[]).entries()) {
        const command = typeof hook.command === 'string' ? hook.command : '';
        if (HOT_PATH_EVENTS.has(event) && (SHELL_RE.test(command) || INLINE_NODE_RE.test(command))) {
          findings.push({ file: manifestFile, event, message: 'managed hot-path hooks must not spawn bash/sh/.sh or inline node -e' });
          continue;
        }
        if (!HOT_PATH_EVENTS.has(event)) continue;
        const id = routeId(event, groupIndex, hookIndex);
        if (!isServiceClient(command, event, groupIndex, hookIndex)) {
          findings.push({ file: manifestFile, event, message: 'managed hot-path hooks must dispatch through the hook-service client' });
          continue;
        }
        const registered = registry.routes?.[id];
        if (!registered || registered.matcher !== matcher) {
          findings.push({ file: manifestFile, event, message: 'hook route is missing from the approved registry (registry drift)' });
        }
      }
    }
  }
  return findings;
}

function stagedHookFiles(cwd: string): string[] {
  const changed = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd, encoding: 'utf8' }).split(/\r?\n/);
  return changed.filter((file) => /(?:hooks\.json$|hook-registry\.json$)/.test(file)).map((file) => path.join(cwd, file));
}

function main(): number {
  const args = process.argv.slice(2);
  const staged = args[0] === '--staged';
  const positional = staged ? args.slice(1) : args;
  if (staged && positional.length === 0 && stagedHookFiles(process.cwd()).length === 0) return 0;
  const [manifest = '.claude-plugin/hooks.json', registry = 'tools/hook-service/registry.json'] = positional;
  if (positional.length > 2) {
    process.stderr.write('Usage: tsx tools/hook-review/check.ts [manifest.json] [hook-service-registry.json]\n');
    return 2;
  }
  const findings = reviewHookManifest(path.resolve(manifest), path.resolve(registry));
  for (const finding of findings) process.stderr.write(`${finding.file}${finding.event ? ` [${finding.event}]` : ''}: ${finding.message}\n`);
  return findings.length === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) process.exitCode = main();
