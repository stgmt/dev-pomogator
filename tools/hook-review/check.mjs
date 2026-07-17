#!/usr/bin/env node
/** Windows-safe authoring review for managed Claude Code hooks. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Claude plugin manifests share the HTTP hook schema. Codex/settings registries have
// distinct command schemas and are intentionally reviewed by their own validators.
const REVIEWED_STAGE_PATH = /^(?:\.claude(?:-plugin)?\/hooks\.json|\.claude\/settings\.json|tools\/hook-service\/(?:registry\.json|session-bootstrap\.mjs|migrate-managed-hooks\.mjs|generate-(?:manifest|registry)\.mjs|registry\.mjs)|tools\/hook-review\/|plugin-dev\/skills\/(?:hook-development|plugin-structure|plugin-settings)\/|\.claude\/skills\/create-spec\/)/;
const SHELL = /(?:^|\s)(?:bash|sh)(?:\s|$)|\.(?:sh)(?:\s|$)/i;
const INLINE_NODE = /(?:^|\s)node(?:\.exe)?\s+-e(?:\s|$)/i;
const SERVICE_URL = /^http:\/\/127\.0\.0\.1:42619\/v1\/dispatch\/([^/?#]+)$/;

export function routeId(event, groupIndex, hookIndex) {
  return `${event}/${groupIndex}/${hookIndex}`;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function finding(file, event, message) { return { file, ...(event ? { event } : {}), message }; }
function expectedUrl(id) { return `http://127.0.0.1:42619/v1/dispatch/${encodeURIComponent(id)}`; }

/** Review an on-disk manifest against the generated hook-service registry. */
export function reviewHookManifest(manifestFile, registryFile, root = process.cwd(), settingsFile) {
  const manifest = readJson(manifestFile);
  const registry = readJson(registryFile);
  const findings = [];
  if (registry.version !== 1 || !registry.routes || typeof registry.routes !== 'object') {
    findings.push(finding(registryFile, undefined, 'hook-service registry must be version 1 with routes'));
  }
  const bootstrap = path.join(root, 'tools/hook-service/session-bootstrap.mjs');
  if (!fs.existsSync(bootstrap)) findings.push(finding(bootstrap, undefined, 'required SessionStart bootstrap source is missing'));
  const manifestRouteIds = new Set();
  for (const [event, groups] of Object.entries(manifest.hooks ?? {})) {
    for (const [groupIndex, group] of groups.entries()) {
      const matcher = typeof group.matcher === 'string' ? group.matcher : '';
      for (const [hookIndex, hook] of (group.hooks ?? []).entries()) {
        const command = typeof hook.command === 'string' ? hook.command : '';
        const id = routeId(event, groupIndex, hookIndex);
        if (event === 'SessionStart') {
          if (groupIndex !== 0 || hookIndex !== 0 || matcher !== '' || hook.type !== 'command' || !/tools\/hook-service\/session-bootstrap\.mjs(?:["'\s]|$)/.test(command)) {
            findings.push(finding(manifestFile, event, 'SessionStart must contain exactly one documented session-bootstrap.mjs command with an empty matcher'));
          }
          continue;
        }
        if (SHELL.test(command) || INLINE_NODE.test(command) || command) {
          findings.push(finding(manifestFile, event, 'managed hot-path hooks must be URL entries, not command/client/shell/inline-node launchers'));
          continue;
        }
        const url = typeof hook.url === 'string' ? hook.url : '';
        if (hook.type !== 'http' || !SERVICE_URL.test(url) || url !== expectedUrl(id)) {
          findings.push(finding(manifestFile, event, 'managed hot-path hooks must use the approved hook-service HTTP URL for their route'));
          continue;
        }
        manifestRouteIds.add(id);
        const registered = registry.routes?.[id];
        if (!registered || registered.matcher !== matcher || registered.timeout !== hook.timeout) {
          findings.push(finding(manifestFile, event, 'hook route is missing from the approved registry (registry drift)'));
        }
      }
    }
  }
  const sessionStarts = manifest.hooks?.SessionStart ?? [];
  if (sessionStarts.length !== 1 || sessionStarts[0]?.hooks?.length !== 1) {
    findings.push(finding(manifestFile, 'SessionStart', 'SessionStart must contain exactly one documented session-bootstrap.mjs command with an empty matcher'));
  }
  for (const id of Object.keys(registry.routes ?? {})) {
    const event = id.split('/', 1)[0];
    if (event !== 'SessionStart' && !manifestRouteIds.has(id)) {
      findings.push(finding(registryFile, event, `registry route has no managed manifest HTTP hook (orphaned route: ${id})`));
    }
  }
  if (settingsFile && fs.existsSync(settingsFile)) {
    const settings = readJson(settingsFile);
    for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
      for (const group of groups ?? []) for (const hook of group.hooks ?? []) {
        const command = typeof hook.command === 'string' ? hook.command : '';
        if (SHELL.test(command) || INLINE_NODE.test(command)) {
          findings.push(finding(settingsFile, event, 'settings hook must not spawn bash/sh/.sh or inline node -e'));
        }
      }
    }
  }
  return findings;
}

function stagedPaths(cwd) {
  return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { cwd, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const staged = args[0] === '--staged';
  const files = staged ? args.slice(1) : args;
  const root = process.cwd();
  if (staged && files.length === 0 && !stagedPaths(root).some((file) => REVIEWED_STAGE_PATH.test(file))) return 0;
  if (files.length > 2) {
    process.stderr.write('Usage: node tools/hook-review/check.mjs [--staged] [manifest.json] [registry.json]\n');
    return 2;
  }
  const [manifest, registry] = files;
  const manifestFile = path.resolve(root, manifest ?? '.claude-plugin/hooks.json');
  const pluginRoot = path.dirname(path.dirname(manifestFile));
  const registryFile = registry ? path.resolve(root, registry) : path.join(pluginRoot, 'tools', 'hook-service', 'registry.json');
  const settingsFile = path.join(pluginRoot, '.claude', 'settings.json');
  const findings = reviewHookManifest(manifestFile, registryFile, pluginRoot, settingsFile);
  for (const issue of findings) process.stderr.write(`${issue.file}${issue.event ? ` [${issue.event}]` : ''}: ${issue.message}\n`);
  return findings.length ? 1 : 0;
}

if (import.meta.main) process.exitCode = main();
