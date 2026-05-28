/**
 * CORE024 — worktree-setup plugin e2e/integration tests.
 *
 * Integration-first (rule integration-tests-first): every test calls real
 * production code — imports the actual skill scripts or spawns the actual CLIs
 * (orchestrate.ts, worktree-doctor.cjs, tsx-runner.js, post-create.sh). No inline
 * copies of production logic (rule extension-test-quality). Names map 1:1 to
 * worktree-setup.feature scenarios (CORE024_NN). Scenarios that require Docker,
 * gh auth, or a fully-installed dev-pomogator main are it.skip with a reason.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { appPath } from './helpers';
import {
  makeTempGitRepo,
  makeTempDir,
  isolateHome,
  cleanupTempPaths,
  gitAvailable,
  makeMockBin,
  writeMockInstaller,
} from './worktree-helpers';
import { syncEnvFiles, nextDevcontainerPorts } from '../../.claude/skills/worktree-setup/scripts/env-sync';
import { parseRemoteUrl, ensureEnvFile, resolveRepo } from '../../.claude/skills/worktree-setup/scripts/env-resolver';
import { composeProjectName, bringUpDevcontainer } from '../../.claude/skills/worktree-setup/scripts/devcontainer';

const SKILL_SCRIPTS = appPath('.claude', 'skills', 'worktree-setup', 'scripts');
const ORCHESTRATE = path.join(SKILL_SCRIPTS, 'orchestrate.ts');
const DOCTOR = appPath('tools', 'worktree-setup', 'worktree-doctor.cjs');
const TSX_RUNNER = appPath('tools', '_shared', 'tsx-runner.js');
const POST_CREATE = appPath(
  'tools', 'devcontainer', 'templates', 'scripts', 'post-create.sh',
);

afterEach(() => cleanupTempPaths());

// ---------------------------------------------------------------------------
describe('CORE024: worktree-setup plugin', () => {
  // ----- packaging / scaffold -----
  it('CORE024_M1: v2 canonical artifacts present (skill + tool + command)', async () => {
    // v2: no per-extension extension.json — verify the canonical artifacts directly.
    expect(await fs.pathExists(appPath('.claude', 'skills', 'worktree-setup', 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(appPath('tools', 'worktree-setup', 'worktree-doctor.cjs'))).toBe(true);
    expect(await fs.pathExists(appPath('.claude', 'commands', 'worktree.md'))).toBe(true);
  });

  it('CORE024_M2: SKILL.md has frontmatter name + allowed-tools, command exists', async () => {
    const skill = await fs.readFile(appPath('.claude', 'skills', 'worktree-setup', 'SKILL.md'), 'utf-8');
    expect(skill).toMatch(/^---[\s\S]*?name: worktree-setup/);
    expect(skill).toMatch(/allowed-tools:.*AskUserQuestion/);
    expect(await fs.pathExists(appPath('.claude', 'commands', 'worktree.md'))).toBe(true);
  });

  // ----- @feature1 / FR-1: slug + dir collision (orchestrate CLI) -----
  it('CORE024_02: invalid slug is rejected with exit code 2', () => {
    const r = spawnSync('npx', ['tsx', ORCHESTRATE, 'Invalid_Slug'], { encoding: 'utf-8', cwd: appPath() });
    expect(r.status).toBe(2);
    expect(r.stderr + r.stdout).toMatch(/Invalid slug/);
  });

  it('CORE024_28: existing non-worktree target dir is refused (exit 2)', () => {
    if (!gitAvailable()) return;
    // Use a real temp git repo as "main" (the Docker harness strips .git from /app).
    const main = makeTempGitRepo({}, '');
    const sibling = path.join(path.dirname(main), `${path.basename(main)}-occupied`);
    fs.mkdirSync(sibling);
    try {
      const r = spawnSync('npx', ['tsx', ORCHESTRATE, 'occupied'], { encoding: 'utf-8', cwd: main });
      expect(r.status).toBe(2);
      expect(r.stderr + r.stdout).toMatch(/already exists and is not a worktree/);
    } finally {
      fs.removeSync(sibling);
    }
  });

  // ----- @feature9/@feature10 / FR-10: env-sync (real temp git repos) -----
  it('CORE024_19: gitignored root .env.test is copied byte-identical', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    try {
      const main = makeTempGitRepo({ '.env.test': 'KEY=value123\n', '.env.example': 'KEY=\n' }, '.env\n.env.*\n');
      const wt = makeTempDir();
      const report = syncEnvFiles(main, wt);
      expect(fs.readFileSync(path.join(wt, '.env.test'), 'utf-8')).toBe('KEY=value123\n');
      expect(report.results.find((r) => r.file === '.env.test')?.action).toBe('copied');
      // .env.example (committed template) must NOT be copied
      expect(fs.existsSync(path.join(wt, '.env.example'))).toBe(false);
    } finally {
      home.restore();
    }
  });

  it('CORE024_20: .devcontainer/.env is regenerated with a different port, not copied', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    try {
      const main = makeTempGitRepo(
        { '.devcontainer/.env': 'HOST_NOVNC_PORT=6080\nHOST_VNC_PORT=5900\n' },
        '.env\n.env.*\n.devcontainer/.env\n',
      );
      const wt = makeTempDir();
      syncEnvFiles(main, wt);
      const generated = fs.readFileSync(path.join(wt, '.devcontainer', '.env'), 'utf-8');
      expect(generated).toMatch(/HOST_NOVNC_PORT=\d+/);
      expect(generated).not.toContain('HOST_NOVNC_PORT=6080'); // unique, not main's
    } finally {
      home.restore();
    }
  });

  it('CORE024_21: a secret-bearing env file triggers exactly one stderr-style warning', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    try {
      const main = makeTempGitRepo({ '.env.local': 'OPENROUTER_API_KEY=sk-or-secret\n' }, '.env\n.env.*\n');
      const wt = makeTempDir();
      const report = syncEnvFiles(main, wt);
      const warns = report.warnings.filter((w) => w.includes('.env.local'));
      expect(warns).toHaveLength(1);
      expect(warns[0]).not.toContain('sk-or-secret'); // value not leaked
      expect(report.results.find((r) => r.file === '.env.local')?.secretDetected).toBe(true);
    } finally {
      home.restore();
    }
  });

  it('CORE024_22: existing target env file is skipped, not overwritten', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    try {
      const main = makeTempGitRepo({ '.env.test': 'FROM_MAIN=1\n' }, '.env\n.env.*\n');
      const wt = makeTempDir();
      fs.writeFileSync(path.join(wt, '.env.test'), 'HAND_EDITED=1\n');
      const report = syncEnvFiles(main, wt);
      expect(fs.readFileSync(path.join(wt, '.env.test'), 'utf-8')).toBe('HAND_EDITED=1\n'); // unchanged
      expect(report.results.find((r) => r.file === '.env.test')?.action).toBe('skipped');
    } finally {
      home.restore();
    }
  });

  it('CORE024_23: candidate selection is dynamic — works on a custom-named env file', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    try {
      const main = makeTempGitRepo({ '.env.staging': 'X=1\n' }, '.env\n.env.*\n');
      const wt = makeTempDir();
      syncEnvFiles(main, wt);
      expect(fs.existsSync(path.join(wt, '.env.staging'))).toBe(true); // no hardcoded .env.test literal
    } finally {
      home.restore();
    }
  });

  it('CORE024_INV: env-sync conserves cardinality — N gitignored env in → N results, unique, excludes excluded', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    try {
      const main = makeTempGitRepo(
        {
          '.env': 'A=1\n',
          '.env.test': 'B=2\n',
          '.env.example': 'A=\n', // excluded (committed template)
          '.devcontainer/.env': 'HOST_NOVNC_PORT=6080\n', // regenerated, not copied
        },
        '.env\n.env.*\n.devcontainer/.env\n',
      );
      const wt = makeTempDir();
      const report = syncEnvFiles(main, wt);
      const files = report.results.map((r) => r.file);
      // 2 copied (.env, .env.test) + 1 regenerated (.devcontainer/.env) = 3, no dupes, no .env.example
      expect(new Set(files).size).toBe(files.length); // uniqueness
      expect(files.sort()).toEqual(['.devcontainer/.env', '.env', '.env.test']);
      expect(files).not.toContain('.env.example');
    } finally {
      home.restore();
    }
  });

  it('CORE024_PORTS: nextDevcontainerPorts returns the base+1 pair on a fresh repo', () => {
    if (!gitAvailable()) return;
    const main = makeTempGitRepo({}, '');
    const ports = nextDevcontainerPorts(main);
    expect(ports.noVnc).toBe(6081);
    expect(ports.vnc).toBe(5901);
  });

  // ----- @feature4 / FR-4: env-resolver (no external gh needed for these) -----
  it('CORE024_RES1: parseRemoteUrl handles https and ssh GitHub URLs', () => {
    expect(parseRemoteUrl('https://github.com/acme/widget.git')).toEqual({ owner: 'acme', repo: 'widget' });
    expect(parseRemoteUrl('git@github.com:acme-corp/my-repo.git')).toEqual({ owner: 'acme-corp', repo: 'my-repo' });
    expect(parseRemoteUrl('https://gitlab.com/x/y.git')).toBeNull();
  });

  it('CORE024_09: Layer 0 creates the env stub file when absent', () => {
    const home = isolateHome();
    try {
      const p = ensureEnvFile();
      expect(fs.existsSync(p)).toBe(true);
      const content = fs.readFileSync(p, 'utf-8');
      expect(content).toMatch(/WT_GH_OWNER=/);
      expect(content).toMatch(/WT_GH_REPO=/);
    } finally {
      home.restore();
    }
  });

  // ----- @feature11 / FR-12: devcontainer project name -----
  it('CORE024_30: composeProjectName sanitizes the worktree dir to [a-z0-9]', () => {
    expect(composeProjectName('/repos/Dev-Pomogator-My_Feature.1')).toBe('devpomogatormyfeature1');
  });

  // ----- @feature6 / FR-6: doctor exit codes (spawn real .cjs) -----
  it('CORE024_DOC1: doctor exits 3 NOT_APPLICABLE outside a dev-pomogator repo', () => {
    if (!gitAvailable()) return;
    const dir = makeTempGitRepo({ 'package.json': JSON.stringify({ name: 'other' }) }, '');
    const r = spawnSync('node', [DOCTOR], { cwd: dir, encoding: 'utf-8' });
    expect(r.status).toBe(3);
    expect(r.stdout).toMatch(/status=NOT_APPLICABLE/);
  });

  it('CORE024_14: doctor reports TOOLS_MISSING (exit 1) when .dev-pomogator/tools absent', () => {
    if (!gitAvailable()) return;
    const dir = makeTempGitRepo({ 'package.json': JSON.stringify({ name: 'dev-pomogator' }) }, '');
    const r = spawnSync('node', [DOCTOR], { cwd: dir, encoding: 'utf-8' });
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/status=(TOOLS_MISSING|NOT_REGISTERED)/);
  });

  it('CORE024_15: doctor --quick emits tools_present and a status line', () => {
    if (!gitAvailable()) return;
    const dir = makeTempGitRepo(
      { 'package.json': JSON.stringify({ name: 'dev-pomogator' }), '.dev-pomogator/tools/.keep': '' },
      '',
    );
    const r = spawnSync('node', [DOCTOR, '--quick'], { cwd: dir, encoding: 'utf-8' });
    expect(r.stdout).toMatch(/tools_present=true/);
    expect(r.stdout).toMatch(/status=OK/);
    expect(r.status).toBe(0);
  });

  // ----- @feature3 / FR-3: tsx-runner self-heal (spawn via require context) -----
  function runTsxRunner(target: string, home: string, cwd: string, sessionId = 'test-sess') {
    const code = `process.argv=[process.argv[0],'tsx-runner',${JSON.stringify(target)}];require(${JSON.stringify(TSX_RUNNER)})`;
    return spawnSync('node', ['-e', code], {
      cwd,
      encoding: 'utf-8',
      env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_SESSION_ID: sessionId },
    });
  }

  it('CORE024_06: missing .dev-pomogator target appends a JSONL orphan line and exits 0', () => {
    const home = isolateHome();
    const wt = makeTempDir('wt-orphan-');
    try {
      const r = runTsxRunner('.dev-pomogator/tools/auto-commit/auto_commit_stop.ts', home.home, wt);
      expect(r.status).toBe(0);
      const log = path.join(home.home, '.dev-pomogator', 'orphan-worktrees.jsonl');
      expect(fs.existsSync(log)).toBe(true);
      const lines = fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      const entry = JSON.parse(lines[0]);
      expect(entry.missing_script).toBe('.dev-pomogator/tools/auto-commit/auto_commit_stop.ts');
      expect(entry.worktree_path).toBe(wt);
      expect(r.stderr).toMatch(/Orphan worktree/);
    } finally {
      home.restore();
    }
  });

  it('CORE024_07: stderr hint is emitted once per (worktree, session) but JSONL keeps appending', () => {
    const home = isolateHome();
    const wt = makeTempDir('wt-orphan-');
    try {
      const first = runTsxRunner('.dev-pomogator/tools/x/a.ts', home.home, wt);
      const second = runTsxRunner('.dev-pomogator/tools/x/b.ts', home.home, wt);
      expect(first.stderr).toMatch(/Orphan worktree/);
      expect(second.stderr).not.toMatch(/Orphan worktree/); // deduped
      const log = path.join(home.home, '.dev-pomogator', 'orphan-worktrees.jsonl');
      expect(fs.readFileSync(log, 'utf-8').split('\n').filter(Boolean)).toHaveLength(2); // audit still appends
    } finally {
      home.restore();
    }
  });

  it('CORE024_08: no-living-main fallback hint omits any hardcoded package identifier', () => {
    const home = isolateHome();
    const wt = makeTempDir('wt-orphan-');
    try {
      const r = runTsxRunner('.dev-pomogator/tools/x/a.ts', home.home, wt);
      expect(r.stderr).toMatch(/No living dev-pomogator main install found/);
      expect(r.stderr).not.toMatch(/stgmt\/dev-pomogator|github:/);
    } finally {
      home.restore();
    }
  });

  it('CORE024_HP: tsx-runner happy path — existing non-.dev-pomogator target runs normally', () => {
    const home = isolateHome();
    try {
      // orchestrate.ts exists and starts with .claude/ → self-heal must NOT fire; orchestrate runs and rejects empty slug (exit 2)
      const code = `process.argv=[process.argv[0],'tsx-runner',${JSON.stringify('.claude/skills/worktree-setup/scripts/orchestrate.ts')}];require(${JSON.stringify(TSX_RUNNER)})`;
      const r = spawnSync('node', ['-e', code], {
        cwd: appPath(),
        encoding: 'utf-8',
        env: { ...process.env, HOME: home.home, USERPROFILE: home.home },
      });
      expect(r.stdout + r.stderr).toMatch(/Invalid slug/);
    } finally {
      home.restore();
    }
  });

  // ----- @feature11 / FR-12b: post-create.sh installs + builds (shimmed externals) -----
  it('CORE024_33: post-create.sh runs npm install + build idempotently', () => {
    if (process.platform === 'win32') return; // bash script; runs in Linux CI
    const home = isolateHome();
    const work = makeTempDir('wt-pc-');
    const bin = makeTempDir('wt-bin-');
    const npmLog = path.join(work, 'npm-calls.log');
    const claudeDir = path.join(home.home, '.claude');
    try {
      // Shim externals so the full script runs cleanly under `set -e` and records npm calls.
      for (const tool of ['npm', 'python3', 'git', 'claude', 'gh', 'docker', 'jq', 'curl', 'zsh', 'chsh']) {
        const shim =
          tool === 'npm'
            ? `#!/bin/sh\necho "$@" >> "${npmLog}"\nexit 0\n`
            : `#!/bin/sh\nexit 0\n`;
        const f = path.join(bin, tool);
        fs.writeFileSync(f, shim);
        fs.chmodSync(f, 0o755);
      }
      fs.writeFileSync(path.join(work, 'package.json'), JSON.stringify({ name: 'x', scripts: { build: 'tsc' } }));
      // Substitute {{WORKSPACE_FOLDER}}/{{PROJECT_NAME}} exactly as postinstall.ts does at install time.
      const script = fs
        .readFileSync(POST_CREATE, 'utf-8')
        .replace(/\{\{WORKSPACE_FOLDER\}\}/g, work)
        .replace(/\{\{PROJECT_NAME\}\}/g, 'testwt');
      const scriptPath = path.join(work, 'post-create.sh');
      fs.writeFileSync(scriptPath, script);
      // CLAUDE_CONFIG_DIR → temp so the bypassPermissions mkdir (set -e) does not hit /home/vscode.
      const env = {
        ...process.env,
        HOME: home.home,
        CLAUDE_CONFIG_DIR: claudeDir,
        PATH: `${bin}:${process.env.PATH}`,
      };

      // First run: no node_modules → install + build.
      const r1 = spawnSync('bash', [scriptPath], { cwd: work, encoding: 'utf-8', env });
      let calls = fs.existsSync(npmLog) ? fs.readFileSync(npmLog, 'utf-8') : '';
      expect(calls, `post-create stdout/stderr:\n${r1.stdout}\n${r1.stderr}`).toMatch(/install/);
      expect(calls).toMatch(/run build/);

      // Second run: node_modules present → install skipped.
      fs.ensureDirSync(path.join(work, 'node_modules'));
      fs.removeSync(npmLog);
      spawnSync('bash', [scriptPath], { cwd: work, encoding: 'utf-8', env });
      calls = fs.existsSync(npmLog) ? fs.readFileSync(npmLog, 'utf-8') : '';
      expect(calls).not.toMatch(/(^|\n)install/);
    } finally {
      home.restore();
    }
  });

  // ----- @feature2 / FR-2: bootstrap + ancestor-guard (mock installer bin/cli.js) -----
  const siblingPath = (main: string, slug: string) =>
    path.join(path.dirname(main), `${path.basename(main)}-${slug}`);
  function runOrchestrate(main: string, args: string[], home: string) {
    return spawnSync('npx', ['tsx', ORCHESTRATE, ...args], {
      cwd: main,
      encoding: 'utf-8',
      env: { ...process.env, HOME: home, USERPROFILE: home },
    });
  }
  function cleanupWorktree(main: string, sib: string) {
    spawnSync('git', ['-C', main, 'worktree', 'remove', '--force', sib]);
    try { fs.removeSync(sib); } catch { /* best-effort */ }
  }

  it('CORE024_04: bootstrap registers the new worktree projectPath in global config', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    const main = makeTempGitRepo({}, '');
    writeMockInstaller(main, 'register');
    const sib = siblingPath(main, 'wtfour');
    try {
      const r = runOrchestrate(main, ['wtfour', '--skip-build'], home.home);
      expect(r.stdout + r.stderr).toMatch(/✓ bootstrapped/);
      const cfg = JSON.parse(fs.readFileSync(path.join(home.home, '.dev-pomogator', 'config.json'), 'utf-8'));
      const paths = cfg.installedExtensions.flatMap((e: { projectPaths: string[] }) => e.projectPaths);
      expect(paths.map((p: string) => path.resolve(p))).toContain(path.resolve(sib));
    } finally {
      cleanupWorktree(main, sib);
      home.restore();
    }
  });

  it('CORE024_05: missing projectPath registration surfaces a retry hint', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    const main = makeTempGitRepo({}, '');
    writeMockInstaller(main, 'none');
    const sib = siblingPath(main, 'wtfive');
    try {
      const r = runOrchestrate(main, ['wtfive', '--skip-build'], home.home);
      expect(r.stdout).toMatch(/✗ bootstrapped/);
      expect(r.stdout).toMatch(/projectPath not registered\. Retry:/);
    } finally {
      cleanupWorktree(main, sib);
      home.restore();
    }
  });

  it('CORE024_29: ancestor-guard refuses a bootstrap that resolved to an ancestor repo', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    const main = makeTempGitRepo({}, '');
    writeMockInstaller(main, 'ancestor');
    const sib = siblingPath(main, 'wtanc');
    try {
      const r = runOrchestrate(main, ['wtanc', '--skip-build'], home.home);
      expect(r.stdout).toMatch(/✗ bootstrapped/);
      expect(r.stdout).toMatch(/ancestor repo, not/);
    } finally {
      cleanupWorktree(main, sib);
      home.restore();
    }
  });

  // ----- @feature5 / FR-5: gh auth pre-flight (mock gh) -----
  it('CORE024_13: gh auth failure refuses (exit 3) before any git op', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    const main = makeTempGitRepo({}, '');
    const gh = makeMockBin({ gh: 'if [ "$1" = "auth" ]; then exit 1; fi\nexit 0' });
    try {
      const r = spawnSync('npx', ['tsx', ORCHESTRATE, 'wtauth', '--pr=draft'], {
        cwd: main,
        encoding: 'utf-8',
        env: { ...process.env, HOME: home.home, USERPROFILE: home.home, PATH: gh.path },
      });
      expect(r.status).toBe(3);
      expect(r.stdout + r.stderr).toMatch(/gh auth login/);
      expect(fs.existsSync(siblingPath(main, 'wtauth'))).toBe(false);
    } finally {
      home.restore();
    }
  });

  // ----- @feature4 / FR-4: env-resolver Layer 2 (git remote → gh repo view, mocked) -----
  it('CORE024_11: resolveRepo derives owner/repo from git remote and validates via gh', () => {
    if (!gitAvailable()) return;
    const home = isolateHome();
    const main = makeTempGitRepo({}, '');
    spawnSync('git', ['-C', main, 'remote', 'add', 'origin', 'https://github.com/acme/widget.git']);
    const gh = makeMockBin({ gh: 'exit 0' }); // gh repo view → success
    const prevPath = process.env.PATH;
    process.env.PATH = gh.path;
    try {
      const res = resolveRepo(main);
      expect(res.needsInput).toBe(false);
      expect(res.owner).toBe('acme');
      expect(res.repo).toBe('widget');
      expect(res.source).toBe('git-remote');
    } finally {
      process.env.PATH = prevPath;
      home.restore();
    }
  });

  // ----- @feature7 / FR-7: doctor --quick contract surface for session-pilot -----
  it('CORE024_16: doctor --quick exposes tools_present (session-pilot contract)', () => {
    if (!gitAvailable()) return;
    const repo = makeTempGitRepo(
      { 'package.json': JSON.stringify({ name: 'dev-pomogator' }), '.dev-pomogator/tools/.keep': '' },
      '',
    );
    const r = spawnSync('node', [DOCTOR, '--quick'], { cwd: repo, encoding: 'utf-8' });
    expect(r.stdout).toMatch(/^tools_present=(true|false)$/m);
    expect([0, 1]).toContain(r.status);
  });

  // ----- @feature11 / FR-12a: devcontainer bring-up (mock docker) -----
  it('CORE024_31: docker failure is best-effort — manual hint, no abort', () => {
    const wt = makeTempDir('wt-dc-');
    fs.ensureDirSync(path.join(wt, '.devcontainer'));
    fs.writeFileSync(path.join(wt, '.devcontainer', 'docker-compose.yml'), 'services: {}\n');
    const docker = makeMockBin({ docker: 'if [ "$1" = "--version" ]; then exit 0; fi\nexit 1' });
    const prevPath = process.env.PATH;
    process.env.PATH = docker.path;
    try {
      const res = bringUpDevcontainer(wt);
      expect(res.ran).toBe(true);
      expect(res.ok).toBe(false);
      expect(res.message).toMatch(/docker compose up -d --build/);
    } finally {
      process.env.PATH = prevPath;
    }
  });

  it('CORE024_32: no compose file → bring-up is a no-op, no docker invoked', () => {
    const wt = makeTempDir('wt-dc2-');
    const res = bringUpDevcontainer(wt);
    expect(res.ran).toBe(false);
    expect(res.message).toMatch(/skipped devcontainer/);
  });
});
