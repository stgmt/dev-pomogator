#!/usr/bin/env npx tsx
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { install } from './install.ts';

interface ContextDietSlice {
  mode?: string;
  status?: string;
  rulesTotal?: number;
  rulesManaged?: number;
  estimatedTokensBefore?: number;
  estimatedTokensAfter?: number;
  entries?: Array<{
    sourcePath?: string;
    action?: string;
    sourceHash?: string;
  }>;
}

interface RussianManifestSlice {
  languageStatus?: {
    ru?: {
      status?: string;
      generatedAliases?: string[];
      needsAliasSources?: string[];
    };
  };
  contextDiet?: ContextDietSlice;
}

interface ContextDietAcceptance {
  pass: boolean;
  contextMode?: string;
  sourceIsStub: boolean;
  libraryPreservesBody: boolean;
  reportIsExact: boolean;
  runtimeLoadsSnippet: boolean;
}

interface MutationCheckResult {
  ok: boolean;
  realInstall: {
    pass: boolean;
    ruStatus?: string;
    aliases: string[];
    needsAliasSources: string[];
    contextDiet: ContextDietAcceptance;
  };
  missingAdaptation: {
    mutantKilled: boolean;
    ruStatus?: string;
    aliases: string[];
    needsAliasSources: string[];
  };
  missingContextDiet: {
    mutantKilled: boolean;
    contextDiet: ContextDietAcceptance;
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

function readTextIfExists(filePath: string): string {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function estimateTokens(value: string): number {
  return Math.ceil(value.length / 4);
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

function runCarlHook(projectRoot: string): string {
  const input = JSON.stringify({ cwd: projectRoot, hook_event_name: 'UserPromptSubmit', prompt: 'че за ошибка, исследуй до конца' });
  const run = spawnSync(process.execPath, [TSX_CLI, path.join(TOOL_DIR, 'runner.ts')], {
    cwd: REPO_ROOT,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO_ROOT, FORCE_COLOR: '0' },
    input,
    encoding: 'utf-8',
    timeout: 20_000,
  });
  if ((run.status ?? -1) !== 0) {
    throw new Error(`CARL runner failed: status=${run.status}; stderr=${run.stderr}; stdout=${run.stdout}`);
  }
  return `${run.stdout}\n${run.stderr}`;
}

function evaluateContextDiet(projectRoot: string): ContextDietAcceptance {
  const manifest = readManifest(projectRoot);
  const sourcePath = path.join(projectRoot, '.claude', 'rules', 'ru-root-cause.md');
  const libraryPath = path.join(projectRoot, '.carl', 'rules', 'ru-root-cause.md');
  const reportPath = path.join(projectRoot, '.carl', 'context-diet.json');
  const source = readTextIfExists(sourcePath);
  const library = readTextIfExists(libraryPath);
  const runtimeOutput = fs.existsSync(path.join(projectRoot, '.carl', 'carl.json')) ? runCarlHook(projectRoot) : '';
  const sourceIsStub = /dev-pomogator-carl-context-diet:managed-stub/u.test(source)
    && !source.includes('сначала воспроизведи и найди корень')
    && source.includes(`sha256=${sha256(library)}`);
  const libraryPreservesBody = library.includes('сначала воспроизведи и найди корень');
  const diskReport = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as ContextDietSlice
    : null;
  const report = manifest.contextDiet;
  const reportIsExact = report?.mode === 'lazy-managed'
    && report.status === 'applied'
    && report.rulesTotal === 1
    && report.rulesManaged === 1
    && report.estimatedTokensBefore === estimateTokens(library)
    && report.estimatedTokensAfter === estimateTokens(source)
    && diskReport?.estimatedTokensBefore === report.estimatedTokensBefore
    && diskReport?.estimatedTokensAfter === report.estimatedTokensAfter
    && diskReport?.entries?.[0]?.action === 'created-stub'
    && diskReport?.entries?.[0]?.sourcePath === '.claude/rules/ru-root-cause.md'
    && diskReport?.entries?.[0]?.sourceHash === sha256(library);
  const runtimeLoadsSnippet = /context=lazy-managed/u.test(runtimeOutput)
    && /CARL loaded rule \.claude\/rules\/ru-root-cause\.md/u.test(runtimeOutput)
    && runtimeOutput.includes('сначала воспроизведи и найди корень');
  return {
    pass: Boolean(sourceIsStub && libraryPreservesBody && reportIsExact && runtimeLoadsSnippet),
    contextMode: report?.mode,
    sourceIsStub,
    libraryPreservesBody,
    reportIsExact: Boolean(reportIsExact),
    runtimeLoadsSnippet,
  };
}

async function runInstallMutant(
  workDir: string,
  mutantName: string,
  mutate: (source: string) => string,
): Promise<string> {
  const sourcePath = path.join(TOOL_DIR, 'install.ts');
  const source = fs.readFileSync(sourcePath, 'utf-8');
  const mutantSource = mutate(source)
    .replace("from './adapt-rules.ts'", `from '${pathToFileURL(path.join(TOOL_DIR, 'adapt-rules.ts')).href}'`)
    .replace("from './context-diet.ts'", `from '${pathToFileURL(path.join(TOOL_DIR, 'context-diet.ts')).href}'`)
    .replace("from './manifest.ts'", `from '${pathToFileURL(path.join(TOOL_DIR, 'manifest.ts')).href}'`);

  const mutantPath = path.join(workDir, `${mutantName}.ts`);
  fs.writeFileSync(mutantPath, mutantSource, 'utf-8');
  return mutantPath;
}

function executeInstaller(scriptPath: string, projectRoot: string): void {
  const run = spawnSync(
    process.execPath,
    [
      TSX_CLI,
      scriptPath,
      '--project',
      projectRoot,
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
    throw new Error(`Installer execution failed: status=${run.status}; stderr=${run.stderr}; stdout=${run.stdout}`);
  }
}

async function runMissingAdaptationMutant(workDir: string): Promise<MutationCheckResult['missingAdaptation']> {
  const source = fs.readFileSync(path.join(TOOL_DIR, 'install.ts'), 'utf-8');
  if (!source.includes('adaptation = adaptProject({ project: args.project });')) {
    throw new Error('Mutation target not found: install.ts no longer calls adaptProject in the expected form');
  }

  const mutantPath = await runInstallMutant(workDir, 'install-no-adaptation-mutant', sourceText =>
    sourceText.replace('adaptation = adaptProject({ project: args.project });', 'adaptation = null;'),
  );

  const mutantProject = path.join(workDir, 'mutant-project');
  writeRussianCarlSources(mutantProject);
  executeInstaller(mutantPath, mutantProject);

  const manifest = readManifest(mutantProject);
  const mutantPasses = passesRussianAcceptance(manifest);
  return {
    mutantKilled: !mutantPasses,
    ruStatus: manifest.languageStatus?.ru?.status,
    aliases: aliases(manifest),
    needsAliasSources: needsAliasSources(manifest),
  };
}

async function runMissingContextDietMutant(workDir: string): Promise<MutationCheckResult['missingContextDiet']> {
  const source = fs.readFileSync(path.join(TOOL_DIR, 'install.ts'), 'utf-8');
  if (!source.includes('contextDiet = applyContextDiet(args.project);')) {
    throw new Error('Mutation target not found: install.ts no longer calls applyContextDiet in the expected form');
  }

  const mutantPath = await runInstallMutant(workDir, 'install-no-context-diet-mutant', sourceText =>
    sourceText.replace('contextDiet = applyContextDiet(args.project);', 'contextDiet = null;'),
  );

  const mutantProject = path.join(workDir, 'context-diet-mutant-project');
  writeRussianCarlSources(mutantProject);
  executeInstaller(mutantPath, mutantProject);
  const contextDiet = evaluateContextDiet(mutantProject);
  return {
    mutantKilled: !contextDiet.pass,
    contextDiet,
  };
}

export async function verifyCarlInstallMutations(): Promise<MutationCheckResult> {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carl-install-mutation-'));
  const realProject = path.join(workDir, 'real-project');
  writeRussianCarlSources(realProject);
  install({ project: realProject, platform: 'claude-code', repair: false });

  const realManifest = readManifest(realProject);
  const realPass = passesRussianAcceptance(realManifest);
  const realContextDiet = evaluateContextDiet(realProject);
  const missingAdaptation = await runMissingAdaptationMutant(workDir);
  const missingContextDiet = await runMissingContextDietMutant(workDir);

  return {
    ok: realPass && realContextDiet.pass && missingAdaptation.mutantKilled && missingContextDiet.mutantKilled,
    realInstall: {
      pass: realPass,
      ruStatus: realManifest.languageStatus?.ru?.status,
      aliases: aliases(realManifest),
      needsAliasSources: needsAliasSources(realManifest),
      contextDiet: realContextDiet,
    },
    missingAdaptation,
    missingContextDiet,
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
// Не запускать CLI, когда модуль инлайнен в бандл: там import.meta.url
// схлопывается в URL бандла и guard сработал бы при любом его запуске.
// Имя файла НЕ проверяем — мутационные копии запускаются под другими именами.
if (import.meta.url === invokedPath && !import.meta.url.endsWith('.bundle.mjs')) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
