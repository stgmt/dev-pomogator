#!/usr/bin/env npx tsx
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { detectRuntimeProbe } from './detect-runtime.ts';
import { buildInstallPlan, type RuntimeProbe } from './plan.ts';
import {
  DEFAULT_HEADROOM_PROFILE,
  buildClaudeSettingsPatch,
  defaultInstallPaths,
  readJsonObject,
  renderClaudeWrapperCmd,
  renderDockerComposeYaml,
  renderDockerfileHeadroom,
  renderRuntimeEnvExample,
  renderStartSub2apiHeadroomPs1,
  renderWindowsStartupCmd,
  writeJsonAtomic,
  writeTextAtomic,
  type HeadroomTopology,
  type RuntimeKind,
} from './profile.ts';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const CLAUDE_EXE_WRAPPER_PROJECT = path.join(MODULE_DIR, 'claude-exe-wrapper', 'ClaudeExeWrapper.csproj');

interface Args {
  enable: boolean;
  dryRun: boolean;
  topology?: HeadroomTopology;
  runtime: RuntimeKind | 'auto';
  home?: string;
  runtimeDir?: string;
}

function usage(): never {
  process.stderr.write(
    [
      'Usage: npx tsx tools/headroom-beta/install.ts --enable --topology codex-sub2api|anthropic-direct [options]',
      '',
      'Options:',
      '  --dry-run                 Print the install plan without writing files',
      '  --runtime auto|docker-host|docker-wsl|host-headless',
      '  --home <path>              Override home directory for tests/manual installs',
      '  --runtime-dir <path>       Override dev-pomogator-owned runtime directory',
      '',
      'The installer never writes ANTHROPIC_AUTH_TOKEN or provider secrets to Claude settings.',
    ].join('\n') + '\n',
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    enable: process.env.DEV_POMOGATOR_HEADROOM_BETA === '1',
    dryRun: false,
    runtime: 'auto',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--enable') args.enable = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--topology') {
      const value = argv[++i] as HeadroomTopology | undefined;
      if (value !== 'codex-sub2api' && value !== 'anthropic-direct') usage();
      args.topology = value;
    } else if (arg === '--runtime') {
      const value = argv[++i] as Args['runtime'] | undefined;
      if (value !== 'auto' && value !== 'docker-host' && value !== 'docker-wsl' && value !== 'host-headless') usage();
      args.runtime = value;
    } else if (arg === '--home') {
      args.home = argv[++i];
      if (!args.home) usage();
    } else if (arg === '--runtime-dir') {
      args.runtimeDir = argv[++i];
      if (!args.runtimeDir) usage();
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      usage();
    }
  }

  return args;
}

export async function installHeadroomBeta(args: Args, probe = detectRuntimeProbe()): Promise<Record<string, unknown>> {
  const paths = defaultInstallPaths(args.home);
  if (args.runtimeDir) paths.runtimeDir = path.resolve(args.runtimeDir);

  const plan = buildInstallPlan({
    enabled: args.enable,
    topology: args.topology,
    requestedRuntime: args.runtime,
    probe,
  });

  if (!plan.ok || !plan.profile) {
    return { ok: false, reason: plan.reason, actions: plan.actions };
  }

  const profile = {
    ...DEFAULT_HEADROOM_PROFILE,
    ...plan.profile,
  };

  const writePlan = {
    runtimeDir: paths.runtimeDir,
    claudeSettings: paths.claudeSettingsPath,
    wrapper: paths.wrapperPath,
    wrapperExe: paths.wrapperExePath,
    startup: paths.startupCmdPath,
    dockerCompose: path.join(paths.runtimeDir, 'docker-compose.yml'),
    dockerfile: path.join(paths.runtimeDir, 'Dockerfile.headroom'),
    envExample: path.join(paths.runtimeDir, '.env.example'),
  };

  if (args.dryRun) {
    return {
      ok: true,
      dryRun: true,
      profile,
      writes: writePlan,
      actions: plan.actions,
    };
  }

  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  const existingSettings = readJsonObject(paths.claudeSettingsPath);
  const patched = buildClaudeSettingsPatch(existingSettings, profile);
  backupIfExists(paths.claudeSettingsPath);
  writeJsonAtomic(paths.claudeSettingsPath, patched.settings);

  writeTextAtomic(path.join(paths.runtimeDir, 'docker-compose.yml'), renderDockerComposeYaml(profile));
  writeTextAtomic(path.join(paths.runtimeDir, 'Dockerfile.headroom'), renderDockerfileHeadroom());
  writeTextAtomic(path.join(paths.runtimeDir, '.env.example'), renderRuntimeEnvExample(profile));
  if (!fs.existsSync(path.join(paths.runtimeDir, '.env'))) {
    writeTextAtomic(path.join(paths.runtimeDir, '.env'), renderRuntimeEnvExample(profile));
  }
  writeTextAtomic(path.join(paths.runtimeDir, 'start-sub2api-headroom.ps1'), renderStartSub2apiHeadroomPs1(paths, profile));
  writeTextAtomic(paths.wrapperPath, renderClaudeWrapperCmd(profile, paths));
  publishClaudeExeWrapper(paths.wrapperExePath);
  writeTextAtomic(paths.startupCmdPath, renderWindowsStartupCmd(paths));

  return {
    ok: true,
    dryRun: false,
    profile,
    writes: writePlan,
    actions: plan.actions,
  };
}

function backupIfExists(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(filePath, `${filePath}.bak-headroom-${stamp}`);
}

function publishClaudeExeWrapper(targetPath: string): void {
  if (process.platform !== 'win32') return;

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-pomogator-claude-exe-'));
  try {
    const result = spawnSync(
      'dotnet',
      [
        'publish',
        CLAUDE_EXE_WRAPPER_PROJECT,
        '-c',
        'Release',
        '-r',
        'win-x64',
        '--self-contained',
        'false',
        '-p:PublishSingleFile=true',
        '-p:DebugType=None',
        '-p:DebugSymbols=false',
        '-o',
        outDir,
      ],
      { encoding: 'utf8', stdio: 'pipe', timeout: 120000 },
    );

    if (result.status !== 0) {
      throw new Error(`dotnet publish failed: ${(result.stderr || result.stdout).trim()}`);
    }

    const publishedExe = path.join(outDir, 'claude.exe');
    if (!fs.existsSync(publishedExe)) {
      throw new Error(`dotnet publish did not create ${publishedExe}`);
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(publishedExe, `${targetPath}.tmp-${process.pid}`);
    fs.renameSync(`${targetPath}.tmp-${process.pid}`, targetPath);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const result = await installHeadroomBeta(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exit(1);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  void main();
}
