import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const targetFrom = command => {
  const direct = command.match(/--\s+"([^\"]+\.(?:ts|mjs|cjs))"((?:\s+[^\"]+)*)$/);
  if (direct) return {target:direct[1], args:direct[2].trim().split(/\s+/).filter(Boolean)};
  const bundle = command.match(/['"](tools\/[^'"]+?\.bundle\.mjs)['"]/);
  if (bundle) return {target:bundle[1], args:[]};
  const inlineBundle = command.match(/['"](tools\/[^'",;]+?\.bundle\.mjs)/);
  if (inlineBundle) return {target:inlineBundle[1], args:[]};
  const joinedBundle = command.match(/['"]tools['"],['"]([^'"]+)['"],['"]([^'"]+\.bundle\.mjs)['"]/);
  if (joinedBundle) return {target:`tools/${joinedBundle[1]}/${joinedBundle[2]}`, args:[]};
  const proxy = command.match(/['"](tools\/claude-subscription-proxy\/ensure-up\.cjs)['"]/);
  if (proxy) return {target:proxy[1], args:[]};
  if (/claude-subscription-proxy.*ensure-up\.cjs/.test(command)) return {target:'tools/claude-subscription-proxy/ensure-up.cjs', args:[]};
  if (/tools\/bg-task-guard\/stop-guard\.sh/.test(command)) return {target:'tools/bg-task-guard/stop-guard.mjs', args:[]};
  const doctor = command.match(/(\.claude\/skills\/pomogator-doctor\/scripts\/engine\/doctor\.bundle\.mjs)/);
  if (doctor) return {target:doctor[1], args:['--hook']};
  return null;
};

/** Build routes from the canonical manifest; route identity preserves event, matcher, and ordering. */
export async function buildRegistry(pluginRoot) {
  const manifest = JSON.parse(await readFile(join(pluginRoot, '.claude-plugin', 'hooks.legacy.json'), 'utf8'));
  const routes = {};
  for (const [event, groups] of Object.entries(manifest.hooks)) {
    groups.forEach((group, groupIndex) => group.hooks.forEach((hook, hookIndex) => {
      const route = targetFrom(hook.command);
      if (!route) throw new Error(`Unregistered shell-free route: ${event}/${groupIndex}/${hookIndex}`);
      routes[`${event}/${groupIndex}/${hookIndex}`] = {...route, event, timeout:hook.timeout, matcher:group.matcher || ''};
    }));
  }
  return {version:1, routes};
}

/** Supervised client entries retain the source manifest's event/matcher/ordering/timeout semantics. */
export async function renderHttpManifest(pluginRoot) {
  const manifest = JSON.parse(await readFile(join(pluginRoot, '.claude-plugin', 'hooks.legacy.json'), 'utf8'));
  const registry = await buildRegistry(pluginRoot);
  const hooks = {};
  for (const [event, groups] of Object.entries(manifest.hooks)) hooks[event] = groups.map((group, groupIndex) => ({
    ...group,
    hooks: group.hooks.map((hook, hookIndex) => ({
      type: 'command',
      command: `node "${'${CLAUDE_PLUGIN_ROOT:-${CLAUDE_PROJECT_DIR:-.}}'}/tools/hook-service/client.mjs" "${event}/${groupIndex}/${hookIndex}"`,
      timeout: hook.timeout,
    })),
  }));
  return {hooks};
}
