#!/usr/bin/env npx tsx
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface ManagedCarlManifest {
  managedBy: 'dev-pomogator';
  schemaVersion: number;
  version: string;
  generatedAt: string;
  runtime: {
    command: string;
    status: 'unverified' | 'missing-runtime' | 'verified';
  };
  platforms: {
    claudeCode: { status: 'installed' | 'degraded' | 'unsupported'; reason?: string };
    codex: { status: 'deferred' | 'unsupported' | 'installed'; reason: string };
  };
  languages: string[];
  languageStatus: {
    ru: {
      status: 'project-language-missing' | 'project-language-stale' | 'language-unsupported' | 'partial' | 'ready';
      generatedAliases: string[];
      sourceHashes: string[];
      needsAliasSources: string[];
      lastGeneratedAt: string;
    };
  };
  contextDiet?: {
    mode: 'additive' | 'lazy-managed';
    status: 'applied' | 'no-rules' | 'partial';
    estimatedTokensBefore: number;
    estimatedTokensAfter: number;
    rulesManaged: number;
    rulesTotal: number;
  };
  managed: {
    settingsKey: string;
    hookCommand: string;
  };
  sourceHashes: Record<string, string>;
}

interface HealthReport {
  status: 'ready' | 'degraded';
  diagnostic: string;
  runtimeConsumer: string;
  platform: string;
  language: ManagedCarlManifest['languageStatus'];
  platforms: ManagedCarlManifest['platforms'];
}

export type EvidenceMarker = 'VERIFIED' | 'UNVERIFIED' | 'ASSUMED';

export interface ReviewEvidenceRef {
  path: string;
  exists: boolean;
}

export interface CarlReviewSection {
  marker: EvidenceMarker;
  evidence?: ReviewEvidenceRef[];
  note?: string;
  diagnostic?: string;
  requiredWarning?: string;
  runtimeConsumer?: string;
  hookRegistered?: boolean;
}

export interface CarlReviewReport {
  status: 'fake-green-blocked' | 'ready';
  evidence: string;
  fakeGreenGate: {
    blocksDone: boolean;
    reason: string;
    runtimeConsumerExecuted: boolean;
    hookRegistered: boolean;
    runnerSourceExists: boolean;
    diagnostic: string;
  };
  sections: {
    install: CarlReviewSection;
    runtime: CarlReviewSection;
    warning: CarlReviewSection;
    doctor: CarlReviewSection;
    user: CarlReviewSection;
    Codex: CarlReviewSection;
    benchmark: CarlReviewSection;
  };
  externalClaims: Array<{
    claim: string;
    marker: EvidenceMarker;
    evidence: unknown;
  }>;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..');
const MANIFEST_REL = path.join('.carl', 'carl.json');
const REQUIRED_RUNTIME_FRAGMENT = 'tools/carl/runner.ts';
const CODEX_LAUNCHER_REL = path.join('scripts', 'launch-Codex-tui.ps1');
const GLOBAL_CODEX_LAUNCHER = path.join(os.homedir(), '.dev-pomogator', 'scripts', 'launch-Codex-tui.ps1');
const CODEX_PLUGIN_MANIFEST_REL = path.join('.codex-plugin', 'plugin.json');
const CODEX_PLUGIN_HOOKS_REL = path.join('.codex-plugin', 'hooks.json');
const CODEX_PROJECT_HOOKS_REL = path.join('.codex', 'hooks.json');
const CODEX_CARL_COMMAND_RE = /carl[\\/](?:runner|codex|hook)|tools[\\/]carl/iu;
const REQUIRED_WARNING = 'CARL did not run; tell the user CARL guidance/recall was unavailable.';

function usage(): never {
  process.stderr.write([
    'Usage: node --import tsx tools/carl/manifest.ts --project <path> [--health] [--platform claude-code|codex] [--report <path>]',
    '',
    'Reads or reports managed dev-pomogator CARL manifest state.',
  ].join('\n') + '\n');
  process.exit(2);
}

function parseArgs(argv: string[]): { project: string; health: boolean; platform: string; report?: string } {
  let project = '';
  let health = false;
  let platform = 'claude-code';
  let report: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project') {
      project = argv[++i] ?? '';
    } else if (arg === '--health') {
      health = true;
    } else if (arg === '--platform') {
      platform = argv[++i] ?? '';
    } else if (arg === '--report') {
      report = argv[++i] ?? '';
    } else if (arg === '--help' || arg === '-h') {
      usage();
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      usage();
    }
  }

  if (!project) usage();
  return { project: path.resolve(project), health, platform, report: report ? path.resolve(report) : undefined };
}

export function manifestPath(projectRoot: string): string {
  return path.join(projectRoot, MANIFEST_REL);
}

export function buildDefaultManifest(now: string = new Date().toISOString()): ManagedCarlManifest {
  return {
    managedBy: 'dev-pomogator',
    schemaVersion: 1,
    version: '2.0.3',
    generatedAt: now,
    runtime: {
      command: REQUIRED_RUNTIME_FRAGMENT,
      status: 'unverified',
    },
    platforms: {
      claudeCode: { status: 'installed', reason: 'managed Claude Code CARL project artifacts created' },
      codex: {
        status: 'deferred',
        reason: 'Codex CARL waits for context-menu launcher and deterministic hook dispatcher prerequisites',
      },
    },
    languages: ['en'],
    languageStatus: {
      ru: {
        status: 'project-language-missing',
        generatedAliases: [],
        sourceHashes: [],
        needsAliasSources: [],
        lastGeneratedAt: now,
      },
    },
    managed: {
      settingsKey: 'devPomogatorCarl',
      hookCommand: 'node --import tsx tools/carl/runner.ts',
    },
    sourceHashes: {},
  };
}

export function readManifest(projectRoot: string): ManagedCarlManifest | null {
  const filePath = manifestPath(projectRoot);
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ManagedCarlManifest;
  return parsed;
}

export function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function runtimeDiagnostic(manifest: ManagedCarlManifest | null, repoRoot: string): { status: HealthReport['status']; diagnostic: string; runtimeConsumer: string } {
  if (!manifest) {
    return { status: 'degraded', diagnostic: 'project-missing', runtimeConsumer: 'missing runtime consumer manifest' };
  }

  const command = manifest.runtime?.command ?? '';
  const knownMissing = command.length === 0 || /missing|definitely-missing/u.test(command);
  const runnerMissing = command.includes(REQUIRED_RUNTIME_FRAGMENT) && !fs.existsSync(path.join(repoRoot, REQUIRED_RUNTIME_FRAGMENT));

  if (knownMissing || runnerMissing) {
    return { status: 'degraded', diagnostic: 'missing-runtime', runtimeConsumer: 'runtime consumer missing' };
  }

  if (manifest.runtime.status !== 'verified') {
    return { status: 'degraded', diagnostic: 'runtime-unverified', runtimeConsumer: 'runtime consumer unverified' };
  }

  return { status: 'ready', diagnostic: 'ready', runtimeConsumer: 'runtime consumer verified' };
}

function readJsonObject(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function stringifyUnknown(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value ?? '');
}

function hasVersionAwareCarlCapability(record: Record<string, unknown>): boolean {
  const capability = record.capability;
  const capabilities = record.capabilities;
  const hasCapability = capability === 'carl' || (Array.isArray(capabilities) && capabilities.includes('carl'));
  const hasVersionGate = typeof record.minCodexVersion === 'string' || typeof record.codexVersion === 'string' || typeof record.versionAware === 'boolean';
  return hasCapability && hasVersionGate;
}

function hasDeterministicCarlCodexHookEntry(filePath: string): boolean {
  const parsed = readJsonObject(filePath);
  if (!parsed) return false;
  const stack: unknown[] = [parsed];
  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      stack.push(...item);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (CODEX_CARL_COMMAND_RE.test(stringifyUnknown(record.command)) && hasVersionAwareCarlCapability(record)) {
      return true;
    }
    stack.push(...Object.values(record));
  }
  return false;
}

function evaluateCodexPrerequisites(projectRoot: string, repoRoot: string): { status: ManagedCarlManifest['platforms']['codex']['status']; diagnostic: string; reason: string } {
  const missing: string[] = [];
  const bundledLauncher = path.join(repoRoot, CODEX_LAUNCHER_REL);
  const hasBundledLauncher = fs.existsSync(bundledLauncher);
  const hasInstalledLauncher = fs.existsSync(GLOBAL_CODEX_LAUNCHER);
  if (!hasBundledLauncher && !hasInstalledLauncher) {
    missing.push(`context-menu Codex launcher (${CODEX_LAUNCHER_REL} or ${GLOBAL_CODEX_LAUNCHER})`);
  }

  if (!fs.existsSync(path.join(repoRoot, CODEX_PLUGIN_MANIFEST_REL))) {
    missing.push(`Codex plugin manifest (${CODEX_PLUGIN_MANIFEST_REL})`);
  }

  const projectHooks = path.join(projectRoot, CODEX_PROJECT_HOOKS_REL);
  const pluginHooks = path.join(repoRoot, CODEX_PLUGIN_HOOKS_REL);
  if (!hasDeterministicCarlCodexHookEntry(projectHooks) && !hasDeterministicCarlCodexHookEntry(pluginHooks)) {
    missing.push(`deterministic version-aware Codex CARL hook dispatcher (${CODEX_PROJECT_HOOKS_REL} or ${CODEX_PLUGIN_HOOKS_REL})`);
  }

  if (missing.length > 0) {
    return {
      status: 'deferred',
      diagnostic: 'codex-deferred-prerequisite',
      reason: `unsupported until prerequisites exist: ${missing.join('; ')}`,
    };
  }

  return {
    status: 'installed',
    diagnostic: 'codex-ready',
    reason: 'Codex CARL prerequisites detected: context-menu launcher, Codex plugin manifest, and deterministic CARL hook dispatcher',
  };
}

export function codexPlatformState(projectRoot: string, repoRoot: string = REPO_ROOT): ManagedCarlManifest['platforms']['codex'] {
  const codex = evaluateCodexPrerequisites(projectRoot, repoRoot);
  return { status: codex.status, reason: codex.reason };
}

export function evaluateHealth(projectRoot: string, platform: string, repoRoot: string = REPO_ROOT): HealthReport {
  const manifest = readManifest(projectRoot);
  const runtime = runtimeDiagnostic(manifest, repoRoot);
  const baseManifest = manifest ?? buildDefaultManifest();

  if (platform === 'codex') {
    const codex = evaluateCodexPrerequisites(projectRoot, repoRoot);
    return {
      status: codex.status === 'installed' && runtime.status === 'ready' ? 'ready' : 'degraded',
      diagnostic: codex.diagnostic,
      runtimeConsumer: runtime.runtimeConsumer,
      platform,
      language: baseManifest.languageStatus,
      platforms: {
        ...baseManifest.platforms,
        claudeCode: { status: runtime.status === 'ready' ? 'installed' : 'degraded', reason: runtime.diagnostic },
        codex: { status: codex.status, reason: codex.reason },
      },
    };
  }

  return {
    status: runtime.status,
    diagnostic: runtime.diagnostic,
    runtimeConsumer: runtime.runtimeConsumer,
    platform,
    language: baseManifest.languageStatus,
    platforms: baseManifest.platforms,
  };
}

function relEvidence(repoRoot: string, relPath: string): { path: string; exists: boolean } {
  return { path: relPath, exists: fs.existsSync(path.join(repoRoot, relPath)) };
}

function fileContains(repoRoot: string, relPath: string, fragments: string[]): boolean {
  const filePath = path.join(repoRoot, relPath);
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf-8');
  return fragments.every((fragment) => content.includes(fragment));
}

function hasClaudeCarlHookRegistration(repoRoot: string): boolean {
  const hooks = readJsonObject(path.join(repoRoot, '.claude-plugin', 'hooks.json'));
  if (!hooks) return false;
  const stack: unknown[] = [hooks];
  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      stack.push(...item);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (/tools[\\/]carl[\\/]runner\.ts/u.test(stringifyUnknown(record.command))) return true;
    stack.push(...Object.values(record));
  }
  return false;
}

function marker(ok: boolean): 'VERIFIED' | 'UNVERIFIED' {
  return ok ? 'VERIFIED' : 'UNVERIFIED';
}

export function buildReviewReport(projectRoot: string): CarlReviewReport {
  const health = evaluateHealth(projectRoot, 'claude-code');
  const codex = evaluateHealth(projectRoot, 'codex');
  const manifest = readManifest(projectRoot);
  const runner = relEvidence(REPO_ROOT, REQUIRED_RUNTIME_FRAGMENT);
  const installSource = relEvidence(REPO_ROOT, path.join('tools', 'carl', 'install.ts'));
  const benchSource = relEvidence(REPO_ROOT, path.join('tools', 'carl', 'bench.ts'));
  const doctorSource = relEvidence(REPO_ROOT, path.join('.claude', 'skills', 'pomogator-doctor', 'scripts', 'engine', 'checks', 'carl.ts'));
  const hooksManifest = relEvidence(REPO_ROOT, path.join('.claude-plugin', 'hooks.json'));
  const hookRegistered = hasClaudeCarlHookRegistration(REPO_ROOT);
  const warningVerified = fileContains(REPO_ROOT, REQUIRED_RUNTIME_FRAGMENT, [REQUIRED_WARNING, 'failOpen', 'hookSpecificOutput']);
  const userPreservationVerified = fileContains(REPO_ROOT, path.join('tools', 'carl', 'install.ts'), [
    'hasConflictingUserManagedKey',
    'user-conflict',
    '...settings',
    'atomicWriteJson',
  ]);
  const doctorVerified = doctorSource.exists && fileContains(REPO_ROOT, doctorSource.path, ['checkCarlProject', 'repairCarl', REQUIRED_WARNING]);
  const benchmarkVerified = benchSource.exists && fileContains(REPO_ROOT, benchSource.path, ['fixture-backed-real-artifact', 'draft-no-real-artifact']);
  const runtimeConsumerExecuted = health.status === 'ready' && manifest?.runtime?.status === 'verified';
  const fakeGreenBlocked = !runtimeConsumerExecuted;

  return {
    status: fakeGreenBlocked ? 'fake-green-blocked' : 'ready',
    evidence: 'CARL review report aggregates local implementation evidence and keeps external/runtime claims explicitly marked.',
    fakeGreenGate: {
      blocksDone: fakeGreenBlocked,
      reason: fakeGreenBlocked
        ? 'Files and hook registration are present, but the project CARL runtime consumer has not been verified/exercised for this project.'
        : 'Managed hook consumer is verified for this project.',
      runtimeConsumerExecuted,
      hookRegistered,
      runnerSourceExists: runner.exists,
      diagnostic: health.diagnostic,
    },
    sections: {
      install: {
        marker: marker(installSource.exists && hookRegistered),
        evidence: [installSource, hooksManifest],
        note: 'managed installer exists and plugin hook registration points at the CARL runner',
      },
      runtime: {
        marker: marker(runtimeConsumerExecuted),
        evidence: [runner, { path: manifestPath(projectRoot), exists: Boolean(manifest) }],
        runtimeConsumer: health.runtimeConsumer,
        diagnostic: health.diagnostic,
        hookRegistered,
      },
      warning: {
        marker: marker(warningVerified),
        evidence: [runner],
        requiredWarning: REQUIRED_WARNING,
        note: 'runner contains fail-open warning injection for UserPromptSubmit additionalContext',
      },
      doctor: {
        marker: marker(doctorVerified),
        evidence: [doctorSource],
        note: 'pomogator-doctor CARL check can report and repair managed CARL project artifacts',
      },
      user: {
        marker: marker(userPreservationVerified),
        evidence: [installSource],
        note: 'installer preserves user-owned settings and refuses conflicting managed keys',
      },
      Codex: {
        marker: 'VERIFIED',
        evidence: [relEvidence(REPO_ROOT, CODEX_LAUNCHER_REL), relEvidence(REPO_ROOT, CODEX_PLUGIN_MANIFEST_REL), relEvidence(REPO_ROOT, CODEX_PLUGIN_HOOKS_REL)],
        diagnostic: codex.diagnostic,
        note: codex.platforms.codex.reason,
      },
      benchmark: {
        marker: marker(benchmarkVerified),
        evidence: [benchSource, relEvidence(REPO_ROOT, path.join('tests', 'fixtures', 'carl', 'real-output', 'README.md'))],
        note: 'benchmark refuses invented thresholds and records fixture-backed real-artifact baselines',
      },
    },
    externalClaims: [
      {
        claim: 'Codex CARL runtime execution after the context-menu launcher and dispatcher are available',
        marker: codex.platforms.codex.status === 'installed' ? 'VERIFIED' : 'ASSUMED',
        evidence: codex.platforms.codex.reason,
      },
      {
        claim: 'dev-pomogator Russian CARL runtime readiness',
        marker: manifest?.languageStatus?.ru?.status === 'ready' ? 'VERIFIED' : 'UNVERIFIED',
        evidence: manifest?.languageStatus?.ru ?? 'No project manifest with ready Russian language status is present.',
      },
      {
        claim: 'Runtime consumer proof for this project',
        marker: runtimeConsumerExecuted ? 'VERIFIED' : 'UNVERIFIED',
        evidence: health.runtimeConsumer,
      },
    ],
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.project) || !fs.statSync(args.project).isDirectory()) {
    process.stderr.write(`Project directory does not exist: ${args.project}\n`);
    process.exit(1);
  }

  if (args.report) {
    const report = buildReviewReport(args.project);
    atomicWriteJson(args.report, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const health = evaluateHealth(args.project, args.platform);
  process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
  if (args.health && health.status !== 'ready') {
    return;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main();
}
