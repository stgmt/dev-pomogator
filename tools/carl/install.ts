#!/usr/bin/env npx tsx
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { adaptProject, type AdaptRulesResult } from './adapt-rules.ts';
import { applyContextDiet, type ContextDietResult } from './context-diet.ts';
import { atomicWriteJson, buildDefaultManifest, codexPlatformState, manifestPath, readManifest, type ManagedCarlManifest } from './manifest.ts';

export interface InstallArgs {
  project: string;
  platform: 'claude-code' | 'codex';
  repair: boolean;
}

const MANAGED_OWNER = 'dev-pomogator';
const MANAGED_SETTINGS_KEY = 'devPomogatorCarl';
const MANAGED_HOOK_COMMAND = 'node --import tsx tools/carl/runner.ts';

function usage(): never {
  process.stderr.write([
    'Usage: node --import tsx tools/carl/install.ts --project <path> [--platform claude-code|codex] [--repair]',
    '',
    'Creates or repairs dev-pomogator managed CARL project artifacts without overwriting user-owned settings.',
  ].join('\n') + '\n');
  process.exit(2);
}

function parseArgs(argv: string[]): InstallArgs {
  let project = '';
  let platform: InstallArgs['platform'] = 'claude-code';
  let repair = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') {
      project = argv[++i] ?? '';
    } else if (arg === '--platform') {
      const value = argv[++i] ?? '';
      if (value !== 'claude-code' && value !== 'codex') usage();
      platform = value;
    } else if (arg === '--repair') {
      repair = true;
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      usage();
    }
  }

  if (!project) usage();
  return { project: path.resolve(project), platform, repair };
}

function readJsonObject(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
  return {};
}

function hasConflictingUserManagedKey(settings: Record<string, unknown>): boolean {
  const existing = settings[MANAGED_SETTINGS_KEY];
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return false;
  const owner = (existing as Record<string, unknown>).managedBy;
  return owner !== undefined && owner !== MANAGED_OWNER;
}

function managedSettingsValue(): Record<string, unknown> {
  return {
    managedBy: MANAGED_OWNER,
    managed: true,
    component: 'carl',
    hookEvent: 'UserPromptSubmit',
    command: MANAGED_HOOK_COMMAND,
  };
}

function writeSettings(projectRoot: string): 'updated' | 'user-conflict' {
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  const settings = readJsonObject(settingsPath);
  if (hasConflictingUserManagedKey(settings)) return 'user-conflict';

  const nextSettings: Record<string, unknown> = {
    ...settings,
    [MANAGED_SETTINGS_KEY]: managedSettingsValue(),
  };

  atomicWriteJson(settingsPath, nextSettings);
  return 'updated';
}

function mergeManifest(existing: ManagedCarlManifest | null, platform: InstallArgs['platform'], projectRoot: string): ManagedCarlManifest {
  const now = new Date().toISOString();
  const base = buildDefaultManifest(now);
  const existingRu = existing?.languageStatus?.ru;
  const ruStatus = existingRu?.status === 'ready' || existingRu?.status === 'partial' || existingRu?.status === 'project-language-stale'
    ? existingRu.status
    : 'project-language-missing';

  return {
    ...base,
    ...(existing?.sourceHashes ? { sourceHashes: existing.sourceHashes } : {}),
    generatedAt: now,
    runtime: {
      command: existing?.runtime?.command && !/missing|definitely-missing/u.test(existing.runtime.command)
        ? existing.runtime.command
        : base.runtime.command,
      status: existing?.runtime?.status === 'verified' ? 'verified' : 'unverified',
    },
    platforms: {
      claudeCode: {
        status: platform === 'claude-code' ? 'installed' : 'degraded',
        reason: platform === 'claude-code'
          ? 'managed Claude Code CARL install refreshed by dev-pomogator'
          : 'Claude Code CARL not selected during this install run',
      },
      codex: codexPlatformState(projectRoot),
    },
    languages: existing?.languages?.includes('ru') || ruStatus === 'ready' || ruStatus === 'partial'
      ? ['ru', 'en']
      : ['en'],
    languageStatus: {
      ru: {
        status: ruStatus,
        generatedAliases: existingRu?.generatedAliases ?? [],
        sourceHashes: existingRu?.sourceHashes ?? [],
        needsAliasSources: existingRu?.needsAliasSources ?? [],
        lastGeneratedAt: existingRu?.lastGeneratedAt ?? now,
      },
    },
    ...(existing?.contextDiet ? { contextDiet: existing.contextDiet } : {}),
    managed: {
      settingsKey: MANAGED_SETTINGS_KEY,
      hookCommand: MANAGED_HOOK_COMMAND,
    },
  };
}

export function install(args: InstallArgs): Record<string, unknown> {
  if (!fs.existsSync(args.project) || !fs.statSync(args.project).isDirectory()) {
    throw new Error(`Project directory does not exist: ${args.project}`);
  }

  fs.mkdirSync(path.join(args.project, '.carl'), { recursive: true });
  fs.mkdirSync(path.join(args.project, '.claude'), { recursive: true });

  const settingsResult = writeSettings(args.project);
  if (settingsResult === 'user-conflict') {
    return {
      ok: false,
      status: 'user-conflict',
      managedBy: MANAGED_OWNER,
      message: 'user-conflict: user-owned devPomogatorCarl key is not managed by dev-pomogator; refusing overwrite',
    };
  }

  const existing = readManifest(args.project);
  const manifest = mergeManifest(existing, args.platform, args.project);
  atomicWriteJson(manifestPath(args.project), manifest);

  let contextDiet: ContextDietResult | null = null;
  try {
    contextDiet = applyContextDiet(args.project);
  } catch {
    contextDiet = null;
  }

  let adaptation: AdaptRulesResult | null = null;
  try {
    adaptation = adaptProject({ project: args.project });
  } catch {
    adaptation = null;
  }

  const postAdaptManifest = readManifest(args.project) ?? manifest;
  if (contextDiet) {
    atomicWriteJson(manifestPath(args.project), {
      ...postAdaptManifest,
      contextDiet: {
        mode: contextDiet.mode,
        status: contextDiet.status,
        estimatedTokensBefore: contextDiet.estimatedTokensBefore,
        estimatedTokensAfter: contextDiet.estimatedTokensAfter,
        rulesManaged: contextDiet.rulesManaged,
        rulesTotal: contextDiet.rulesTotal,
      },
    });
  }

  const refreshedManifest = readManifest(args.project) ?? manifest;

  return {
    ok: true,
    status: args.repair ? 'repaired' : 'installed',
    managedBy: MANAGED_OWNER,
    manifest: manifestPath(args.project),
    platform: args.platform,
    languageStatus: refreshedManifest.languageStatus,
    runtime: refreshedManifest.runtime,
    settings: settingsResult,
    contextDiet,
    adaptation,
  };
}

function main(): void {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = install(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === 'user-conflict') process.exit(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main();
}
