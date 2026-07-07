/**
 * orchestrate — worktree-setup top-level workflow (FR-1, FR-2, FR-5, FR-6, FR-8,
 * FR-10, FR-11, FR-12 + run-log/summary NFR-R7/U6).
 *
 * Non-interactive steps run here; interactive decisions are signalled to the AI
 * via `NEEDS_INPUT: <kind>` lines + a distinct exit code (the script never guesses
 * a sibling-continue choice or a GitHub identifier).
 *
 * Usage:
 *   npx tsx orchestrate.ts <slug> [--pr=draft] [--skip-build] [--devcontainer]
 *                                 [--from-main] [--pr-repo=<owner>/<repo>]
 *
 * Exit codes: 0 ok | 2 invalid slug / dir collision | 3 gh auth required
 *             10 NEEDS_INPUT sibling | 11 NEEDS_INPUT pr-repo
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { syncEnvFiles } from './env-sync.ts';
import { resolveRepo, ensureEnvFile, acceptProvided } from './env-resolver.ts';
import { createDraftPr } from './pr-creator.ts';
import { bringUpDevcontainer } from './devcontainer.ts';

const SLUG_RE = /^[a-z][a-z0-9-]*[a-z0-9]$/;

type StepStatus = 'done' | 'skipped' | 'failed';
interface Step {
  key: string;
  status: StepStatus;
  note?: string;
}

const steps: Step[] = [];
const warnings: string[] = [];
function mark(key: string, status: StepStatus, note?: string): void {
  steps.push({ key, status, note });
}
function glyph(s: StepStatus): string {
  return s === 'done' ? '✓' : s === 'skipped' ? '⚠' : '✗';
}

interface Args {
  slug: string;
  pr: boolean;
  skipBuild: boolean;
  devcontainer: boolean;
  fromMain: boolean;
  prRepo?: string;
}

function parseArgs(argv: string[]): Args {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flags = argv.filter((a) => a.startsWith('--'));
  const prRepoFlag = flags.find((f) => f.startsWith('--pr-repo='));
  return {
    slug: positional[0] || '',
    pr: flags.includes('--pr=draft') || flags.includes('--pr'),
    skipBuild: flags.includes('--skip-build'),
    devcontainer: flags.includes('--devcontainer'),
    fromMain: flags.includes('--from-main'),
    prRepo: prRepoFlag ? prRepoFlag.split('=')[1] : undefined,
  };
}

function detectMain(): string | null {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf-8' });
  if (r.status !== 0) return null;
  for (const line of (r.stdout || '').split('\n')) {
    const m = line.match(/^worktree (.+)$/);
    if (m) return path.resolve(m[1].trim());
  }
  return null;
}

function worktreePaths(mainPath: string): string[] {
  const r = spawnSync('git', ['-C', mainPath, 'worktree', 'list', '--porcelain'], {
    encoding: 'utf-8',
  });
  const out: string[] = [];
  for (const line of (r.stdout || '').split('\n')) {
    const m = line.match(/^worktree (.+)$/);
    if (m) out.push(path.resolve(m[1].trim()));
  }
  return out;
}

function newestMtime(dir: string): number {
  let newest = 0;
  const walk = (d: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git') continue;
        walk(full);
      } else {
        try {
          newest = Math.max(newest, fs.statSync(full).mtimeMs);
        } catch {
          /* skip */
        }
      }
    }
  };
  walk(dir);
  return newest;
}

function run(cmd: string, args: string[], cwd: string): { ok: boolean; out: string } {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf-8' });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

function appendRunLog(entry: Record<string, unknown>): void {
  try {
    const logDir = path.join(os.homedir(), '.dev-pomogator', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'worktree-setup.jsonl'),
      JSON.stringify(entry) + '\n',
    );
  } catch {
    /* non-fatal */
  }
}

function fail(msg: string, code: number): never {
  console.error(msg);
  process.exit(code);
}

function main(): void {
  const started = Date.now();
  const args = parseArgs(process.argv.slice(2));

  if (!SLUG_RE.test(args.slug)) {
    fail(
      `Invalid slug: must match ^[a-z][a-z0-9-]*[a-z0-9]$ (kebab-case, 1–50 chars, no leading/trailing dash). Got: "${args.slug}"`,
      2,
    );
  }

  const mainPath = detectMain();
  if (!mainPath) fail('Not inside a git repository (git worktree list failed).', 2);

  // FR-5: gh auth pre-flight BEFORE any git op, only for PR flow.
  if (args.pr) {
    const auth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf-8' });
    if (auth.status !== 0) {
      fail('Run `gh auth login` first. Skill will not create worktree until gh is authenticated.', 3);
    }
  }

  // FR-8: invocation from a sibling worktree → ask the AI to confirm.
  if (path.resolve(process.cwd()) !== mainPath && !args.fromMain) {
    console.log(`NEEDS_INPUT: sibling — invoked from ${process.cwd()}, main is ${mainPath}.`);
    console.log('Re-run with --from-main to root all operations at main, or abort.');
    process.exit(10);
  }

  const branch = `feat/${args.slug}`;
  const worktreePath = path.join(
    path.dirname(mainPath),
    `${path.basename(mainPath)}-${args.slug}`,
  );

  // FR-1: directory pre-flight — existing non-worktree dir is a hard stop.
  const existingWts = worktreePaths(mainPath);
  if (fs.existsSync(worktreePath) && !existingWts.includes(path.resolve(worktreePath))) {
    fail(
      `Target path ${worktreePath} already exists and is not a worktree — remove it or choose a different slug.`,
      2,
    );
  }

  // FR-1: branch pre-flight + atomic create.
  const branchExists =
    spawnSync('git', ['-C', mainPath, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
      .status === 0;
  if (existingWts.includes(path.resolve(worktreePath))) {
    mark('created', 'skipped', 'worktree already exists (reuse)');
  } else {
    const addArgs = branchExists
      ? ['-C', mainPath, 'worktree', 'add', worktreePath, branch]
      : ['-C', mainPath, 'worktree', 'add', '-b', branch, worktreePath];
    const add = run('git', addArgs, mainPath);
    if (!add.ok) fail(`git worktree add failed:\n${add.out}`, 2);
    mark('created', 'done', worktreePath);
  }

  // FR-2: bootstrap + ancestor-guard.
  const cli = path.join(mainPath, 'bin', 'cli.js');
  if (fs.existsSync(cli)) {
    const boot = run('node', [cli, '--claude', '--all'], worktreePath);
    if (boot.ok) {
      const configPath = path.join(os.homedir(), '.dev-pomogator', 'config.json');
      let registered = false;
      let ancestorMismatch = false;
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const allPaths: string[] = (cfg.installedExtensions || []).flatMap(
          (e: { projectPaths?: string[] }) => e.projectPaths || [],
        );
        const resolved = allPaths.map((p) => path.resolve(p));
        registered = resolved.includes(path.resolve(worktreePath));
        // ancestor-guard: a registered path that is a strict parent of the worktree
        ancestorMismatch =
          !registered &&
          resolved.some((p) => path.resolve(worktreePath).startsWith(p + path.sep));
      } catch {
        /* config unreadable */
      }
      if (ancestorMismatch) {
        mark(
          'bootstrapped',
          'failed',
          `installer resolved to an ancestor repo, not ${worktreePath} — worktree is nested under another git repo; create it as a sibling of main`,
        );
      } else if (registered) {
        mark('bootstrapped', 'done');
      } else {
        mark(
          'bootstrapped',
          'failed',
          `projectPath not registered. Retry: cd ${worktreePath} && node ${cli} --claude --all`,
        );
      }
    } else {
      mark('bootstrapped', 'failed', `installer exit non-zero. Retry: cd ${worktreePath} && node ${cli} --claude --all`);
    }
  } else {
    mark('bootstrapped', 'skipped', 'no bin/cli.js in main (not a dev-pomogator repo)');
  }

  // FR-10: env-sync.
  try {
    const report = syncEnvFiles(mainPath, worktreePath);
    warnings.push(...report.warnings);
    mark('env-synced', 'done', `${report.results.length} file(s)`);
  } catch (err) {
    mark('env-synced', 'failed', (err as Error).message);
  }

  // FR-11: build/deps-sync.
  if (args.skipBuild) {
    mark('built', 'skipped', `--skip-build. Run later: cd ${worktreePath} && npm install && npm run build`);
  } else if (!fs.existsSync(path.join(worktreePath, 'package.json'))) {
    mark('built', 'skipped', 'no root package.json');
  } else {
    let buildOk = true;
    let note = '';
    if (!fs.existsSync(path.join(worktreePath, 'node_modules'))) {
      const ins = run('npm', ['install'], worktreePath);
      if (!ins.ok) {
        buildOk = false;
        note = 'npm install failed';
      }
    }
    if (buildOk) {
      const distDir = path.join(worktreePath, 'dist');
      const srcDir = path.join(worktreePath, 'src');
      const distStale =
        !fs.existsSync(distDir) ||
        (fs.existsSync(srcDir) && newestMtime(srcDir) > newestMtime(distDir));
      if (distStale) {
        const b = run('npm', ['run', 'build'], worktreePath);
        if (!b.ok) {
          buildOk = false;
          note = 'npm run build failed';
        }
      }
    }
    if (buildOk) mark('built', 'done');
    else
      mark('built', 'failed', `${note}. Retry: cd ${worktreePath} && npm install && npm run build`);
  }

  // FR-12a: devcontainer bring-up (opt-in, best-effort).
  if (args.devcontainer) {
    try {
      const dc = bringUpDevcontainer(worktreePath);
      if (!dc.ran) mark('devcontainer', 'skipped', dc.message);
      else if (dc.ok) mark('devcontainer', 'done', dc.message);
      else {
        mark('devcontainer', 'failed', dc.message);
        warnings.push(`[worktree-setup] ${dc.message}`);
      }
    } catch (err) {
      mark('devcontainer', 'failed', (err as Error).message);
    }
  } else {
    mark('devcontainer', 'skipped', 'no --devcontainer flag');
  }

  // FR-6: doctor (best-effort).
  const doctorGlobal = path.join(os.homedir(), '.dev-pomogator', 'scripts', 'worktree-doctor.cjs');
  const doctorLocal = path.join(worktreePath, '.dev-pomogator', 'tools', 'worktree-setup', 'worktree-doctor.cjs');
  const doctorPath = fs.existsSync(doctorGlobal) ? doctorGlobal : doctorLocal;
  if (fs.existsSync(doctorPath)) {
    const doc = spawnSync('node', [doctorPath], { cwd: worktreePath, encoding: 'utf-8' });
    const statusLine = (doc.stdout || '')
      .split('\n')
      .reverse()
      .find((l) => l.startsWith('status='));
    mark(doc.status === 0 ? 'doctor' : 'doctor', doc.status === 0 ? 'done' : 'failed', statusLine || `exit ${doc.status}`);
  } else {
    mark('doctor', 'skipped', 'worktree-doctor.cjs not installed');
  }

  // FR-4: PR flow (opt-in).
  let prUrl: string | undefined;
  if (args.pr) {
    ensureEnvFile();
    let resolution = args.prRepo ? acceptProvided(args.prRepo) : resolveRepo(mainPath);
    if (resolution.needsInput) {
      console.log(`NEEDS_INPUT: pr-repo — could not resolve owner/repo. Suggested: ${resolution.suggestedDefault}`);
      console.log('Re-run with --pr-repo=<owner>/<repo> after confirming with the user.');
      // emit partial summary before exiting so the user sees what already happened
      printSummary(worktreePath, started, prUrl, 'partial');
      process.exit(11);
    }
    const pr = createDraftPr(worktreePath, args.slug, resolution.owner!, resolution.repo!);
    if (pr.ok) {
      prUrl = pr.url;
      mark('pr', 'done', pr.message);
    } else {
      mark('pr', 'failed', pr.message);
      warnings.push(`[worktree-setup] ${pr.message}`);
    }
  } else {
    mark('pr', 'skipped', 'no --pr flag');
  }

  printSummary(worktreePath, started, prUrl, computeOutcome());
}

function computeOutcome(): 'success' | 'partial' | 'failed' {
  if (steps.find((s) => s.key === 'created' && s.status === 'failed')) return 'failed';
  if (steps.some((s) => s.status === 'failed')) return 'partial';
  return 'success';
}

function printSummary(
  worktreePath: string,
  started: number,
  prUrl: string | undefined,
  outcome: string,
): void {
  for (const w of warnings) console.error(w);
  console.log('\n=== worktree-setup summary ===');
  for (const s of steps) {
    console.log(`  ${glyph(s.status)} ${s.key}${s.note ? ` — ${s.note}` : ''}`);
  }
  console.log(`  outcome: ${outcome}`);
  if (prUrl) console.log(`  PR: ${prUrl}`);
  console.log(`  worktree: ${worktreePath}`);
  console.log(`  open: wt -d "${worktreePath}" claude`);

  appendRunLog({
    ts: new Date().toISOString(),
    worktree_path: worktreePath,
    steps: Object.fromEntries(steps.map((s) => [s.key, s.status])),
    outcome,
    duration_ms: Date.now() - started,
  });
}

main();
