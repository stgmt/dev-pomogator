import fs from 'node:fs';
import path from 'node:path';
import type {
  CheckContext,
  CheckDefinition,
  CheckResult,
  PluginLoaderState,
} from '../types.js';

interface PluginManifest {
  commands?: Array<{ name: string }>;
  skills?: Array<{ name: string }>;
}

function readPluginManifest(projectRoot: string): PluginManifest | null {
  const candidates = [
    path.join(projectRoot, '.dev-pomogator', '.claude-plugin', 'plugin.json'),
    path.join(projectRoot, '.claude-plugin', 'plugin.json'),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8')) as PluginManifest;
    } catch {
      continue;
    }
  }
  return null;
}

function classify(
  declaredName: string,
  kind: 'command' | 'skill',
  projectRoot: string,
  homeDir: string,
): PluginLoaderState {
  const projectDir =
    kind === 'command'
      ? path.join(projectRoot, '.claude', 'commands')
      : path.join(projectRoot, '.claude', 'skills');
  const projectPath =
    kind === 'command' ? path.join(projectDir, `${declaredName}.md`) : path.join(projectDir, declaredName);
  if (exists(projectPath)) return 'OK-physical';
  const pluginRoot = path.join(homeDir, '.claude', 'plugins');
  if (searchPluginRegistry(pluginRoot, declaredName, kind)) return 'OK-dynamic';
  return 'BROKEN-missing';
}

function searchPluginRegistry(
  pluginRoot: string,
  name: string,
  kind: 'command' | 'skill',
): boolean {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(pluginRoot, { withFileTypes: true });
  } catch {
    return false;
  }
  const needle = kind === 'command' ? `${name}.md` : name;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(pluginRoot, entry.name);
    if (containsEntry(nested, kind, needle)) return true;
  }
  return false;
}

function containsEntry(root: string, kind: 'command' | 'skill', needle: string): boolean {
  const target =
    kind === 'command' ? path.join(root, 'commands') : path.join(root, 'skills');
  try {
    const inside = fs.readdirSync(target, { withFileTypes: true });
    return inside.some((e) => e.name === needle);
  } catch {
    return false;
  }
}

function exists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export const pluginLoaderCheck: CheckDefinition = {
  id: 'C15',
  fr: 'FR-13',
  name: 'Plugin-loader (commands/skills)',
  group: 'self-sufficient',
  reinstallable: true,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const manifest = readPluginManifest(ctx.projectRoot);
    if (!manifest) {
      return [
        {
          id: 'C15',
          fr: 'FR-13',
          name: 'Plugin-loader',
          group: 'self-sufficient',
          severity: 'ok',
          reinstallable: true,
          message: 'no plugin.json manifest found — nothing to verify',
          durationMs: 0,
        },
      ];
    }

    const results: CheckResult[] = [];
    const declared = [
      ...(manifest.commands ?? []).map((c) => ({ name: c.name, kind: 'command' as const })),
      ...(manifest.skills ?? []).map((s) => ({ name: s.name, kind: 'skill' as const })),
    ];

    if (declared.length === 0) {
      results.push({
        id: 'C15',
        fr: 'FR-13',
        name: 'Plugin-loader',
        group: 'self-sufficient',
        severity: 'ok',
        reinstallable: true,
        message: 'plugin.json declares no commands or skills',
        durationMs: 0,
      });
      return results;
    }

    const broken: string[] = [];
    for (const entry of declared) {
      const state = classify(entry.name, entry.kind, ctx.projectRoot, ctx.homeDir);
      if (state === 'BROKEN-missing') broken.push(`${entry.kind}:${entry.name}`);
      results.push({
        id: `C15:${entry.kind}:${entry.name}`,
        fr: 'FR-13',
        name: `${entry.kind} ${entry.name}`,
        group: 'self-sufficient',
        severity: state === 'BROKEN-missing' ? 'critical' : 'ok',
        reinstallable: true,
        message: `state=${state}`,
        hint:
          state === 'BROKEN-missing'
            ? 'Reinstall to re-register commands and skills with plugin-loader'
            : undefined,
        reinstallHint: 'Run `npx dev-pomogator`',
        state,
        durationMs: 0,
      });
    }

    if (broken.length > 0) {
      results.unshift({
        id: 'C15',
        fr: 'FR-13',
        name: 'Plugin-loader',
        group: 'self-sufficient',
        severity: 'critical',
        reinstallable: true,
        message: `${broken.length} declared entry(ies) not registered: ${broken.join(', ')}`,
        hint: 'Reinstall to repopulate plugin-loader registry',
        reinstallHint: 'Run `npx dev-pomogator`',
        state: 'BROKEN-missing',
        durationMs: 0,
      });
    }

    return results;
  },
};
