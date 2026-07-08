#!/usr/bin/env npx tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { install } from './install.ts';

interface RussianManifestSlice {
  languageStatus?: {
    ru?: {
      status?: string;
      generatedAliases?: string[];
      needsAliasSources?: string[];
    };
  };
}

interface MutationCheckResult {
  ok: boolean;
  realInstall: {
    pass: boolean;
    ruStatus?: string;
    aliases: string[];
    needsAliasSources: string[];
  };
  missingAdaptation: {
    mutantKilled: boolean;
    ruStatus?: string;
    aliases: string[];
    needsAliasSources: string[];
  };
}

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TOOL_DIR, '..', '..');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function writeRussianCarlSources(projectRoot: string): void {
  fs.mkdirSync(path.join(projectRoot, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, '.claude', 'rules', 'ru-root-cause.md'),
    '# Root cause rule\n\nЕсли пользователь пишет "че за ошибка", сначала воспроизведи и найди корень.\n',
    'utf-8',
  );
  fs.mkdirSync(path.join(projectRoot, '.claude', 'skills', 'ru-debug'), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, '.claude', 'skills', 'ru-debug', 'SKILL.md'),
    '# ru-debug\n\nTrigger: исследуй ошибку до конца.\n',
    'utf-8',
  );
  fs.mkdirSync(path.join(projectRoot, '.claude', 'skills', 'plain'), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, '.claude', 'skills', 'plain', 'SKILL.md'),
    '# Plain\n\nEnglish-only helper with no safe Russian trigger.\n',
    'utf-8',
  );
}

function readManifest(projectRoot: string): RussianManifestSlice {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, '.carl', 'carl.json'), 'utf-8')) as RussianManifestSlice;
}

function aliases(manifest: RussianManifestSlice): string[] {
  return manifest.languageStatus?.ru?.generatedAliases ?? [];
}

function needsAliasSources(manifest: RussianManifestSlice): string[] {
  return manifest.languageStatus?.ru?.needsAliasSources ?? [];
}

function passesRussianAcceptance(manifest: RussianManifestSlice): boolean {
  const gotAliases = aliases(manifest);
  return manifest.languageStatus?.ru?.status === 'partial'
    && gotAliases.includes('че за ошибка')
    && gotAliases.includes('исследуй')
    && needsAliasSources(manifest).includes('.claude/skills/plain/SKILL.md');
}

async function runMissingAdaptationMutant(workDir: string): Promise<MutationCheckResult['missingAdaptation']> {
  const sourcePath = path.join(TOOL_DIR, 'install.ts');
  const source = fs.readFileSync(sourcePath, 'utf-8');
  if (!source.includes('adaptation = adaptProject({ project: args.project });')) {
    throw new Error('Mutation target not found: install.ts no longer calls adaptProject in the expected form');
  }

  const mutantSource = source
    .replace("from './adapt-rules.ts'", `from '${pathToFileURL(path.join(TOOL_DIR, 'adapt-rules.ts')).href}'`)
    .replace("from './manifest.ts'", `from '${pathToFileURL(path.join(TOOL_DIR, 'manifest.ts')).href}'`)
    .replace('adaptation = adaptProject({ project: args.project });', 'adaptation = null;');

  const mutantPath = path.join(workDir, 'install-no-adaptation-mutant.ts');
  fs.writeFileSync(mutantPath, mutantSource, 'utf-8');

  const mutantProject = path.join(workDir, 'mutant-project');
  writeRussianCarlSources(mutantProject);

  const run = spawnSync(
    process.execPath,
    [
      TSX_CLI,
      mutantPath,
      '--project',
      mutantProject,
      '--platform',
      'claude-code',
    ],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, FORCE_COLOR: '0' },
      encoding: 'utf-8',
      timeout: 20_000,
    },
  );
  if ((run.status ?? -1) !== 0) {
    throw new Error(`Mutant execution failed: status=${run.status}; stderr=${run.stderr}; stdout=${run.stdout}`);
  }

  const manifest = readManifest(mutantProject);
  const mutantPasses = passesRussianAcceptance(manifest);
  return {
    mutantKilled: !mutantPasses,
    ruStatus: manifest.languageStatus?.ru?.status,
    aliases: aliases(manifest),
    needsAliasSources: needsAliasSources(manifest),
  };
}

export async function verifyCarlInstallMutations(): Promise<MutationCheckResult> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carl-install-mutation-'));
  const realProject = path.join(workDir, 'real-project');
  writeRussianCarlSources(realProject);
  install({ project: realProject, platform: 'claude-code', repair: false });

  const realManifest = readManifest(realProject);
  const realPass = passesRussianAcceptance(realManifest);
  const missingAdaptation = await runMissingAdaptationMutant(workDir);

  return {
    ok: realPass && missingAdaptation.mutantKilled,
    realInstall: {
      pass: realPass,
      ruStatus: realManifest.languageStatus?.ru?.status,
      aliases: aliases(realManifest),
      needsAliasSources: needsAliasSources(realManifest),
    },
    missingAdaptation,
  };
}

function parseArgs(argv: string[]): { json: boolean } {
  return { json: argv.includes('--json') };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const result = await verifyCarlInstallMutations();
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`CARL install mutation check: ${result.ok ? 'PASS' : 'FAIL'}\n`);
  }
  if (!result.ok) process.exit(1);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
