import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fsExtra from 'fs-extra';
import type { OnboardingJson, Archetype } from '../../../extensions/onboard-repo/tools/onboard-repo/lib/types.ts';


const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURES_DIR = path.join(REPO_ROOT, 'tests', 'fixtures', 'onboard-repo-fake-repos');


export interface SetupOptions {
  initGit?: boolean;
  commitInitial?: boolean;
}


export async function setupFakeRepo(fixtureName: string, options: SetupOptions = {}): Promise<string> {
  const { initGit = true, commitInitial = true } = options;

  const src = path.join(FIXTURES_DIR, fixtureName);
  if (!fsExtra.existsSync(src)) {
    throw new Error(`Fixture '${fixtureName}' not found at ${src}`);
  }

  const tmpdir = path.join(os.tmpdir(), `onboard-phase0-${crypto.randomBytes(6).toString('hex')}`);
  await fsExtra.ensureDir(tmpdir);
  await fsExtra.copy(src, tmpdir);

  if (initGit) {
    runGit(tmpdir, ['init', '-b', 'main']);
    runGit(tmpdir, ['config', 'user.email', 'test@example.com']);
    runGit(tmpdir, ['config', 'user.name', 'Test Runner']);
    if (commitInitial) {
      runGit(tmpdir, ['add', '.']);
      runGit(tmpdir, ['commit', '-m', 'initial fixture commit']);
    }
  }

  return tmpdir;
}


export async function teardownFakeRepo(tmpdir: string): Promise<void> {
  if (!tmpdir || !tmpdir.includes('onboard-phase0-')) {
    throw new Error(`Refusing to teardown suspicious dir: ${tmpdir}`);
  }
  await fsExtra.remove(tmpdir);
}


export function runGit(cwd: string, args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', shell: false });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${result.stderr}`);
  }
  return result;
}


export function getHeadSha(cwd: string): string {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) return '';
  return result.stdout.trim();
}


export async function seedOnboardingJson(
  tmpdir: string,
  fixtureFile: string,
  opts: { matchHeadSha?: boolean } = {},
): Promise<void> {
  const src = path.join(REPO_ROOT, 'tests', 'fixtures', 'onboarding-artifacts', fixtureFile);
  const content = (await fsExtra.readJson(src)) as OnboardingJson;

  if (opts.matchHeadSha) {
    const head = getHeadSha(tmpdir);
    if (head) content.last_indexed_sha = head;
  }

  const destDir = path.join(tmpdir, '.specs');
  await fsExtra.ensureDir(destDir);
  await fsExtra.writeJson(path.join(destDir, '.onboarding.json'), content, { spaces: 2 });
}


export async function loadSubagentOutput(fixtureName: string): Promise<unknown> {
  const src = path.join(REPO_ROOT, 'tests', 'fixtures', 'subagent-outputs', fixtureName);
  return await fsExtra.readJson(src);
}


export async function assertNoSecretsInFile(filePath: string): Promise<void> {
  const content = await fsExtra.readFile(filePath, 'utf-8');
  const secretPatterns = [
    /sk-[A-Za-z0-9]{20,}/,
    /ghp_[A-Za-z0-9]{20,}/,
    /xoxb-[A-Za-z0-9\-]{20,}/,
    /AKIA[A-Z0-9]{16}/,
    /eyJ[A-Za-z0-9_\-]{20,}\./,
  ];
  for (const pattern of secretPatterns) {
    const match = content.match(pattern);
    if (match) {
      throw new Error(`Secret pattern ${pattern} leaked into ${filePath}: ${match[0].slice(0, 20)}...`);
    }
  }
}


export interface RegistrySnapshot {
  path: string;
  content: string | null;
}


export function snapshotRegistry(): RegistrySnapshot {
  const registryPath = path.join(os.homedir(), '.dev-pomogator', 'config.json');
  let content: string | null = null;
  try {
    content = fsExtra.readFileSync(registryPath, 'utf-8');
  } catch {
    content = null;
  }
  return { path: registryPath, content };
}


export async function restoreRegistry(snapshot: RegistrySnapshot): Promise<void> {
  if (snapshot.content === null) {
    await fsExtra.remove(snapshot.path).catch(() => undefined);
    return;
  }
  await fsExtra.ensureFile(snapshot.path);
  await fsExtra.writeFile(snapshot.path, snapshot.content, 'utf-8');
}


export function createFakeRepoForArchetype(archetype: Archetype): string {
  const mapping: Partial<Record<Archetype, string>> = {
    'python-api': 'fake-python-api',
    'nodejs-frontend': 'fake-nextjs-frontend',
    'fullstack-monorepo': 'fake-fullstack-monorepo',
    'library': 'fake-empty',
  };
  const fixture = mapping[archetype];
  if (!fixture) {
    throw new Error(`No fixture mapped for archetype '${archetype}'`);
  }
  return fixture;
}
