import fs from 'node:fs';
import path from 'node:path';

export interface HookRoute {
  target: string;
  args: string[];
  event: string;
  timeout: number;
  matcher: string;
}

export interface HookManifestEntry {
  event: string;
  groupIndex: number;
  hookIndex: number;
  matcher: string;
  type: string;
  command: string;
  timeout: number;
  routeId: string | null;
}

export interface LegacyRouteSource {
  target: string;
  args: string[];
}

export interface HookDispatcherContracts {
  generated: Record<string, unknown>;
  dogfood: Record<string, unknown>;
  legacy: Record<string, unknown>;
  registry: { version?: number; routes?: Record<string, HookRoute> };
  generatedEntries: HookManifestEntry[];
  dogfoodEntries: HookManifestEntry[];
  legacyEntries: HookManifestEntry[];
}

interface HookGroup {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function hooksOf(manifest: Record<string, unknown>): Record<string, HookGroup[]> {
  const hooks = manifest.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) {
    throw new Error('hook manifest must contain an object-valued hooks field');
  }
  return hooks as Record<string, HookGroup[]>;
}

export function manifestEntries(manifest: Record<string, unknown>): HookManifestEntry[] {
  const entries: HookManifestEntry[] = [];
  for (const [event, groups] of Object.entries(hooksOf(manifest))) {
    if (!Array.isArray(groups)) throw new Error(`${event} hook groups must be an array`);
    groups.forEach((group, groupIndex) => {
      if (!Array.isArray(group.hooks)) throw new Error(`${event}/${groupIndex} hooks must be an array`);
      group.hooks.forEach((hook, hookIndex) => {
        if (typeof hook.command !== 'string' || hook.command.length === 0) {
          throw new Error(`${event}/${groupIndex}/${hookIndex} must have a command`);
        }
        entries.push({
          event,
          groupIndex,
          hookIndex,
          matcher: group.matcher ?? '',
          type: hook.type ?? '',
          command: hook.command,
          timeout: hook.timeout ?? 0,
          routeId: dispatcherRouteId(hook.command),
        });
      });
    });
  }
  return entries;
}

/** Extract the exact local-dispatch route id from a generated client command. */
export function dispatcherRouteId(command: string): string | null {
  const match = command.match(
    /^node "\$\{CLAUDE_PLUGIN_ROOT:-\$\{CLAUDE_PROJECT_DIR:-\.\}\}\/tools\/hook-service\/client\.mjs" "([^"]+)"$/,
  );
  return match?.[1] ?? null;
}

/** Return the target and arguments represented by one legacy shell hook command. */
export function legacyTarget(command: string): LegacyRouteSource | null {
  const direct = command.match(/--\s+"([^"]+)"(.*)$/);
  if (direct) {
    return { target: direct[1], args: shellArgs(direct[2]) };
  }

  const doctor = command.match(/(\.claude\/skills\/pomogator-doctor\/scripts\/engine\/doctor\.bundle\.mjs)/);
  if (doctor) return { target: doctor[1], args: command.includes('--hook') ? ['--hook'] : [] };

  const slashBundle = command.match(/["'](tools\/[^"']+?\.bundle\.mjs)["']/);
  if (slashBundle) return { target: slashBundle[1], args: [] };

  const joinedBundle = command.match(/["']tools["'],["']([^"']+)["'],["']([^"']+\.bundle\.mjs)["']/);
  if (joinedBundle) return { target: `tools/${joinedBundle[1]}/${joinedBundle[2]}`, args: [] };

  if (command.includes('tools/claude-subscription-proxy/ensure-up.cjs')) {
    return { target: 'tools/claude-subscription-proxy/ensure-up.cjs', args: [] };
  }
  if (command.includes('tools/bg-task-guard/stop-guard.sh')) {
    return { target: 'tools/bg-task-guard/stop-guard.mjs', args: [] };
  }
  return null;
}

function shellArgs(raw: string): string[] {
  const args: string[] = [];
  const tokenPattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (const match of raw.matchAll(tokenPattern)) args.push(match[1] ?? match[2] ?? match[3]);
  return args;
}

export function routeId(entry: HookManifestEntry): string {
  return `${entry.event}/${entry.groupIndex}/${entry.hookIndex}`;
}

export function routeEntriesFromLegacy(manifest: Record<string, unknown>): Map<string, LegacyRouteSource> {
  const routes = new Map<string, LegacyRouteSource>();
  for (const entry of manifestEntries(manifest)) {
    const parsed = legacyTarget(entry.command);
    if (parsed) routes.set(routeId(entry), parsed);
  }
  return routes;
}

export function loadHookDispatcherContracts(repoRoot: string): HookDispatcherContracts {
  const generated = readJson(path.join(repoRoot, '.claude-plugin', 'hooks.json'));
  const dogfood = readJson(path.join(repoRoot, '.claude', 'settings.json'));
  const legacy = readJson(path.join(repoRoot, '.claude-plugin', 'hooks.legacy.json'));
  const registry = readJson(path.join(repoRoot, 'tools', 'hook-service', 'registry.json')) as HookDispatcherContracts['registry'];
  return {
    generated,
    dogfood,
    legacy,
    registry,
    generatedEntries: manifestEntries(generated),
    dogfoodEntries: manifestEntries(dogfood),
    legacyEntries: manifestEntries(legacy),
  };
}

export function generatedRouteIds(entries: HookManifestEntry[]): string[] {
  return entries.flatMap((entry) => (entry.routeId ? [entry.routeId] : []));
}

export function registryRouteIds(registry: HookDispatcherContracts['registry'], excludedEvents: string[] = []): string[] {
  return Object.keys(registry.routes ?? {}).filter((id) => !excludedEvents.includes(id.split('/')[0]));
}

export function absoluteRouteTarget(repoRoot: string, route: HookRoute): string {
  return path.resolve(repoRoot, ...route.target.split('/'));
}

export interface ResolvedHookRoute {
  entry: HookManifestEntry;
  route: HookRoute;
}

export function routesForTarget(
  contracts: HookDispatcherContracts,
  target: string,
  event?: string,
): ResolvedHookRoute[] {
  return contracts.generatedEntries.flatMap((entry) => {
    if (!entry.routeId || (event && entry.event !== event)) return [];
    const route = contracts.registry.routes?.[entry.routeId];
    return route?.target === target ? [{ entry, route }] : [];
  });
}

export function assertLegacyTargetContract(
  contracts: HookDispatcherContracts,
  expected: {
    target: string;
    event: string;
    matcher: string;
    timeout: number;
    args?: string[];
  },
): HookManifestEntry {
  const matches = contracts.legacyEntries.filter((entry) => {
    if (entry.event !== expected.event) return false;
    const direct = entry.command.match(/--\s+"([^"]+\.(?:ts|mjs|cjs))"((?:\s+[^"\s]+)*)$/);
    return direct?.[1] === expected.target;
  });
  if (matches.length !== 1) {
    throw new Error(
      `expected one legacy ${expected.event} target for ${expected.target}, found ${matches.length}`,
    );
  }
  const match = matches[0];
  if (match.matcher !== expected.matcher || match.timeout !== expected.timeout) {
    throw new Error(
      `${expected.target} legacy contract drift: matcher=${match.matcher}, timeout=${match.timeout}`,
    );
  }
  const direct = match.command.match(/--\s+"([^"]+\.(?:ts|mjs|cjs))"((?:\s+[^"\s]+)*)$/);
  const args = direct?.[2].trim().split(/\s+/).filter(Boolean) ?? [];
  if (expected.args && JSON.stringify(args) !== JSON.stringify(expected.args)) {
    throw new Error(
      `${expected.target} legacy args drift: ${JSON.stringify(args)} !== ${JSON.stringify(expected.args)}`,
    );
  }
  return match;
}

export function assertRouteContract(
  contracts: HookDispatcherContracts,
  expected: {
    target: string;
    event: string;
    matcher: string;
    timeout: number;
    args?: string[];
  },
): ResolvedHookRoute {
  const matches = routesForTarget(contracts, expected.target, expected.event);
  if (matches.length !== 1) {
    throw new Error(
      `expected one ${expected.event} route for ${expected.target}, found ${matches.length}`,
    );
  }
  const match = matches[0];
  if (match.entry.matcher !== expected.matcher || match.route.matcher !== expected.matcher) {
    throw new Error(
      `${expected.target} matcher drift: generated=${match.entry.matcher}, registry=${match.route.matcher}, expected=${expected.matcher}`,
    );
  }
  if (match.entry.timeout !== expected.timeout || match.route.timeout !== expected.timeout) {
    throw new Error(
      `${expected.target} timeout drift: generated=${match.entry.timeout}, registry=${match.route.timeout}, expected=${expected.timeout}`,
    );
  }
  if (match.route.event !== expected.event) {
    throw new Error(`${expected.target} event drift: ${match.route.event} !== ${expected.event}`);
  }
  if (match.entry.type !== 'command') {
    throw new Error(`${expected.target} generated hook type must be command`);
  }
  if (expected.args && JSON.stringify(match.route.args) !== JSON.stringify(expected.args)) {
    throw new Error(
      `${expected.target} args drift: ${JSON.stringify(match.route.args)} !== ${JSON.stringify(expected.args)}`,
    );
  }
  return match;
}
