import fs from 'node:fs';
import path from 'node:path';
import type {
  CheckContext,
  CheckDefinition,
  CheckResult,
  PluginLoaderState,
} from '../types.js';
import { CANONICAL_REINSTALL_HINT } from './canonical.js';

// `skills`/`commands` may be EITHER the canonical v2 shape (array of path strings,
// e.g. "./.claude/skills") OR the legacy v1 shape (array of `{ name }` objects, still
// used by the doctor fixtures). Accept both; anything else is ignored, not crashed.
type ManifestEntry = string | { name?: string };
interface PluginManifest {
  commands?: ManifestEntry[];
  skills?: ManifestEntry[];
}

interface DeclaredEntry {
  name: string;
  kind: 'command' | 'skill';
  /** Resolved physical path when derived from a canonical path entry; undefined for legacy {name}. */
  physicalPath?: string;
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

/**
 * Expands one canonical path entry (a directory or a single file) into the
 * commands/skills it declares. Commands = `*.md` files; skills = subdirs (verified by
 * SKILL.md existence). A missing path yields one BROKEN-flagged entry (physicalPath
 * points at the absent target).
 */
function enumerateFromPath(
  rel: string,
  kind: 'command' | 'skill',
  projectRoot: string,
): DeclaredEntry[] {
  const abs = path.resolve(projectRoot, rel);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch {
    return [{ name: rel, kind, physicalPath: abs }]; // declared path missing → BROKEN
  }
  if (stat.isFile()) {
    const name = kind === 'command' ? path.basename(abs).replace(/\.md$/, '') : path.basename(abs);
    return [{ name, kind, physicalPath: abs }];
  }
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return [{ name: rel, kind, physicalPath: abs }];
  }
  if (kind === 'command') {
    return dirents
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => ({ name: e.name.replace(/\.md$/, ''), kind, physicalPath: path.join(abs, e.name) }));
  }
  // A skill is a subdirectory containing SKILL.md — that's exactly what Claude Code's
  // plugin loader registers. Support/workspace folders under skills/ (no SKILL.md) are
  // NOT skills, so they must not be flagged as broken declarations.
  return dirents
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, skillMd: path.join(abs, e.name, 'SKILL.md') }))
    .filter((d) => exists(d.skillMd))
    .map((d) => ({ name: d.name, kind, physicalPath: d.skillMd }));
}

/** Normalises both manifest shapes into a flat list of declared entries (crash-free). */
function normalizeDeclared(manifest: PluginManifest, projectRoot: string): DeclaredEntry[] {
  const out: DeclaredEntry[] = [];
  const groups: Array<{ arr: ManifestEntry[] | undefined; kind: 'command' | 'skill' }> = [
    { arr: manifest.commands, kind: 'command' },
    { arr: manifest.skills, kind: 'skill' },
  ];
  for (const { arr, kind } of groups) {
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (typeof entry === 'string') {
        out.push(...enumerateFromPath(entry, kind, projectRoot)); // canonical path
      } else if (entry && typeof entry.name === 'string') {
        out.push({ name: entry.name, kind }); // legacy { name }
      }
      // else: malformed entry — skip instead of crashing
    }
  }
  return out;
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

    const declared = normalizeDeclared(manifest, ctx.projectRoot);

    if (declared.length === 0) {
      return [
        {
          id: 'C15',
          fr: 'FR-13',
          name: 'Plugin-loader',
          group: 'self-sufficient',
          severity: 'ok',
          reinstallable: true,
          message: 'plugin.json declares no commands or skills',
          durationMs: 0,
        },
      ];
    }

    const broken: string[] = [];
    for (const entry of declared) {
      // Canonical path entries carry a resolved physicalPath → check it directly;
      // legacy { name } entries fall back to classify (physical dir OR plugin registry).
      const state: PluginLoaderState =
        entry.physicalPath !== undefined
          ? exists(entry.physicalPath)
            ? 'OK-physical'
            : 'BROKEN-missing'
          : classify(entry.name, entry.kind, ctx.projectRoot, ctx.homeDir);
      if (state === 'BROKEN-missing') broken.push(`${entry.kind}:${entry.name}`);
    }

    if (broken.length > 0) {
      return [
        {
          id: 'C15',
          fr: 'FR-13',
          name: 'Plugin-loader',
          group: 'self-sufficient',
          severity: 'critical',
          reinstallable: true,
          message: `${broken.length} declared entry(ies) not registered: ${broken.join(', ')}`,
          hint: 'Reinstall to repopulate plugin-loader registry',
          reinstallHint: CANONICAL_REINSTALL_HINT,
          state: 'BROKEN-missing',
          durationMs: 0,
        },
      ];
    }

    return [
      {
        id: 'C15',
        fr: 'FR-13',
        name: 'Plugin-loader',
        group: 'self-sufficient',
        severity: 'ok',
        reinstallable: true,
        message: `all ${declared.length} declared command(s)/skill(s) present`,
        state: 'OK-physical',
        durationMs: 0,
      },
    ];
  },
};
