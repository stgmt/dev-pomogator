/**
 * Step definitions for CARL001 executable BDD red coverage.
 *
 * These steps intentionally drive the planned REAL CARL surfaces from
 * `.specs/carl-integration/FILE_CHANGES.md`: tools/carl/*.ts, plugin hook
 * registration, pomogator-doctor CARL check, and captured real CARL fixtures.
 * They do not use git because Docker BDD runs without `.git`.
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { V4World } from '../hooks/before-after.ts';
import type { CarlReviewReport } from '../../tools/carl/manifest.ts';

const REPO_ROOT = process.cwd();
const TSX_ESM_LOADER = pathToFileURL(
  path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'esm', 'index.mjs'),
).href;

const REQUIRED_WARNING = 'CARL did not run; tell the user CARL guidance/recall was unavailable.';

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
  missing?: string;
}

interface CarlWorld extends V4World {
  carlProjectDir?: string;
  carlLastRun?: CommandResult;
  carlHookResult?: CommandResult;
  carlFailureMode?: string;
  carlDiagnostic?: string;
  carlReportPath?: string;
  carlBenchmarkReport?: Record<string, unknown>;
  carlReviewReport?: CarlReviewReport;
  carlRussianEvalReport?: Record<string, unknown>;
  carlMutationReport?: Record<string, unknown>;
}

function appPath(...segments: string[]): string {
  return path.join(REPO_ROOT, ...segments);
}

function projectPath(world: CarlWorld, ...segments: string[]): string {
  assert.ok(world.carlProjectDir, 'CARL project fixture was not initialised');
  return path.join(world.carlProjectDir, ...segments);
}

function ensureProject(world: CarlWorld): void {
  const projectDir = path.join(world.tempDir, 'carl-project');
  world.carlProjectDir = projectDir;
  fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, '.claude', 'settings.json'),
    JSON.stringify(
      {
        statusLine: { type: 'command', command: 'existing-user-statusline' },
        hooks: { UserPromptSubmit: [] },
        userOwnedSetting: 'preserve-me',
      },
      null,
      2,
    ),
    'utf-8',
  );
}

function runTsTool(
  relPath: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {},
): CommandResult {
  const absPath = appPath(relPath);
  if (!fs.existsSync(absPath)) {
    return {
      status: 127,
      stdout: '',
      stderr: `Missing CARL implementation surface: ${relPath}`,
      missing: relPath,
    };
  }

  const result = spawnSync(process.execPath, ['--import', TSX_ESM_LOADER, absPath, ...args], {
    cwd: options.cwd ?? REPO_ROOT,
    env: { ...process.env, FORCE_COLOR: '0', ...(options.env ?? {}) },
    input: options.input ?? '',
    encoding: 'utf-8',
    timeout: 20_000,
  });

  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function readJson(filePath: string): unknown {
  assert.ok(fs.existsSync(filePath), `expected JSON file to exist: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
}

function stringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function assertRunSucceeded(run: CommandResult | undefined, purpose: string): asserts run is CommandResult {
  assert.ok(run, `${purpose} did not run`);
  assert.equal(
    run.status,
    0,
    `${purpose} must exit 0. status=${run.status}; missing=${run.missing ?? 'no'}; stderr=${run.stderr}; stdout=${run.stdout}`,
  );
}

function findPluginHookCommand(eventName: 'SessionStart' | 'UserPromptSubmit', commandPattern: RegExp): string | undefined {
  const hooksPath = appPath('.claude-plugin', 'hooks.json');
  if (!fs.existsSync(hooksPath)) return undefined;
  const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf-8')) as { hooks?: Record<string, unknown> };
  const stack: unknown[] = [hooks.hooks?.[eventName]];
  while (stack.length > 0) {
    const item = stack.pop();
    if (Array.isArray(item)) {
      stack.push(...item);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const command = record.command;
    if (typeof command === 'string' && commandPattern.test(command)) return command;
    stack.push(...Object.values(record));
  }
  return undefined;
}

function findCarlHookCommand(): string | undefined {
  return findPluginHookCommand('UserPromptSubmit', /tools\/carl\/runner\.ts|tools\\carl\\runner\.ts/u);
}

function findSessionStartDoctorCommand(): string | undefined {
  return findPluginHookCommand('SessionStart', /pomogator-doctor.*doctor-hook\.ts/u);
}

function runRegisteredCarlHook(world: CarlWorld, env: NodeJS.ProcessEnv = {}): CommandResult {
  const command = findCarlHookCommand();
  if (!command) {
    return {
      status: 127,
      stdout: '',
      stderr: 'Missing CARL hook registration in .claude-plugin/hooks.json',
      missing: '.claude-plugin/hooks.json CARL hook entry',
    };
  }

  return runHookCommand(command, world, {
    hookEventName: 'UserPromptSubmit',
    prompt: 'че за ошибка, исследуй до конца',
    env,
  });
}

function runHookCommand(
  command: string,
  world: CarlWorld,
  options: { hookEventName: 'SessionStart' | 'UserPromptSubmit'; prompt?: string; env?: NodeJS.ProcessEnv },
): CommandResult {
  const input = JSON.stringify({
    session_id: 'carl-bdd-session',
    transcript_path: path.join(world.tempDir, 'transcript.jsonl'),
    cwd: world.carlProjectDir ?? world.tempDir,
    hook_event_name: options.hookEventName,
    permission_mode: 'default',
    ...(options.prompt ? { prompt: options.prompt } : {}),
  });

  const result = spawnSync(command, {
    shell: true,
    cwd: world.carlProjectDir ?? REPO_ROOT,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: REPO_ROOT, FORCE_COLOR: '0', ...(options.env ?? {}) },
    input,
    encoding: 'utf-8',
    timeout: 20_000,
  });

  return {
    status: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function runSessionStartDoctorHook(world: CarlWorld): CommandResult {
  const command = findSessionStartDoctorCommand();
  if (!command) {
    return {
      status: 127,
      stdout: '',
      stderr: 'Missing pomogator-doctor SessionStart hook registration in .claude-plugin/hooks.json',
      missing: '.claude-plugin/hooks.json SessionStart doctor hook entry',
    };
  }

  return runHookCommand(command, world, { hookEventName: 'SessionStart' });
}

function writeManagedCarlManifest(world: CarlWorld, overrides: Record<string, unknown> = {}): void {
  fs.mkdirSync(projectPath(world, '.carl'), { recursive: true });
  fs.writeFileSync(
    projectPath(world, '.carl', 'carl.json'),
    JSON.stringify(
      {
        managedBy: 'dev-pomogator',
        version: '0.0.0-stale',
        runtime: { command: 'missing-carl-runtime' },
        platforms: { claudeCode: { status: 'unknown' } },
        languageStatus: { ru: { status: 'project-language-missing' } },
        ...overrides,
      },
      null,
      2,
    ),
    'utf-8',
  );
}

function readCarlManifest(world: CarlWorld): unknown {
  return readJson(projectPath(world, '.carl', 'carl.json'));
}

// ── Background-specific preconditions ────────────────────────────────────────
// "Given dev-pomogator is installed" is defined in feature_tui_test_runner.ts.
// "And specs-workflow extension is enabled" is defined in feature_onboard_repo_phase0.ts.

// ── CARL001_01 ───────────────────────────────────────────────────────────────
Given(/^a supported Claude Code project has no managed CARL artifacts$/, function (this: CarlWorld) {
  ensureProject(this);
  assert.ok(!fs.existsSync(projectPath(this, '.carl')), 'fixture must start without .carl');
});

When(/^the CARL integration installer runs for Claude Code$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool('tools/carl/install.ts', [
    '--project',
    this.carlProjectDir!,
    '--platform',
    'claude-code',
  ]);
});

Then(/^managed CARL artifacts are created with dev-pomogator owner and version markers$/, function (this: CarlWorld) {
  assertRunSucceeded(this.carlLastRun, 'CARL installer');
  const manifest = readCarlManifest(this);
  const text = stringify(manifest);
  assert.match(text, /dev-pomogator/, 'manifest must record dev-pomogator ownership');
  assert.match(text, /version|schemaVersion/, 'manifest must record a version or schemaVersion marker');
});

Then(/^project language coverage is recorded separately from global CARL runtime support$/, function (this: CarlWorld) {
  const text = stringify(readCarlManifest(this));
  assert.match(text, /languageStatus|languages/, 'project language coverage must be present');
  assert.match(text, /runtime|global/, 'global runtime support must be represented separately');
});

Then(/^Russian prompts without project Russian coverage are reported as degraded instead of healthy empty recall$/, function (this: CarlWorld) {
  const text = stringify(readCarlManifest(this));
  assert.match(text, /ru/, 'Russian language state must be explicit');
  assert.doesNotMatch(text, /"ru"\s*:\s*\{[^}]*"status"\s*:\s*"healthy"/s, 'missing Russian coverage must not be healthy');
  assert.match(text, /language-unsupported|project-language-missing|project-language-stale|degraded/, 'missing Russian coverage must be degraded');
});

Then(/^unrelated user configuration remains unchanged$/, function (this: CarlWorld) {
  const settings = stringify(readJson(projectPath(this, '.claude', 'settings.json')));
  assert.match(settings, /preserve-me/, 'installer must preserve unrelated user configuration');
});

function writeRussianCarlSources(world: CarlWorld): void {
  fs.mkdirSync(projectPath(world, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(
    projectPath(world, '.claude', 'rules', 'ru-root-cause.md'),
    '# Root cause rule\n\nЕсли пользователь пишет "че за ошибка", сначала воспроизведи и найди корень.\n',
    'utf-8',
  );
  fs.mkdirSync(projectPath(world, '.claude', 'skills', 'ru-debug'), { recursive: true });
  fs.writeFileSync(
    projectPath(world, '.claude', 'skills', 'ru-debug', 'SKILL.md'),
    '# ru-debug\n\nTrigger: исследуй ошибку до конца.\n',
    'utf-8',
  );
  fs.mkdirSync(projectPath(world, '.claude', 'skills', 'plain'), { recursive: true });
  fs.writeFileSync(
    projectPath(world, '.claude', 'skills', 'plain', 'SKILL.md'),
    '# Plain\n\nEnglish-only helper with no safe Russian trigger.\n',
    'utf-8',
  );
}

// ── CARL001_11 / CARL001_13 ──────────────────────────────────────────────────
Given(/^a project rule or skill is added after CARL was generated$/, function (this: CarlWorld) {
  ensureProject(this);
  const installRun = runTsTool('tools/carl/install.ts', [
    '--project',
    this.carlProjectDir!,
    '--platform',
    'claude-code',
  ]);
  assertRunSucceeded(installRun, 'CARL installer precondition');
  writeRussianCarlSources(this);
});

Given(/^a fresh Claude Code project contains Russian CARL rule and skill sources$/, function (this: CarlWorld) {
  ensureProject(this);
  writeRussianCarlSources(this);
});

When(/^the CARL adaptation script runs for the project$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool('tools/carl/adapt-rules.ts', ['--project', this.carlProjectDir!]);
});

When(/^the plugin SessionStart doctor hook runs for that project$/, function (this: CarlWorld) {
  this.carlLastRun = runSessionStartDoctorHook(this);
});

When(/^the CARL install mutation checks run$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool('tools/carl/verify-mutations.ts', ['--json']);
  assertRunSucceeded(this.carlLastRun, 'CARL install mutation verifier');
  this.carlMutationReport = JSON.parse(this.carlLastRun.stdout) as Record<string, unknown>;

  assert.equal(this.carlMutationReport.ok, true, 'mutation verifier must pass only when real install passes and mutant is killed');
  assert.equal((this.carlMutationReport.realInstall as { pass?: unknown }).pass, true, 'real installer must satisfy Russian adaptation acceptance before mutant comparison');
  assert.equal((this.carlMutationReport.missingAdaptation as { mutantKilled?: unknown }).mutantKilled, true, 'missing-adaptation mutant must be killed by the verifier');
});

Then(/^the project CARL manifest records the changed source hash$/, function (this: CarlWorld) {
  assertRunSucceeded(this.carlLastRun, 'CARL adaptation script');
  const text = stringify(readCarlManifest(this));
  assert.match(text, /ru-root-cause\.md|ru-debug\/SKILL\.md/, 'manifest must reference changed rule or skill source');
  assert.match(text, /hash|sha256|sourceHashes/, 'manifest must record source hashes');
  assert.match(text, /tools\/carl\/runner\.ts/, 'adaptation must preserve managed runtime metadata from installer manifest');
  assert.match(text, /platforms|devPomogatorCarl|managed/, 'adaptation must preserve managed install metadata instead of overwriting the manifest schema');
});

Then(/^Russian aliases are added when safe source text or curated overrides exist$/, function (this: CarlWorld) {
  const text = stringify(readCarlManifest(this));
  assert.match(text, /че за ошибка|исследуй|aliases|generatedAliases/, 'manifest must contain Russian aliases from safe source text');
});

Then(/^sources without safe Russian aliases are marked as needing aliases instead of being silently omitted$/, function (this: CarlWorld) {
  const text = stringify(readCarlManifest(this));
  assert.match(text, /ru:needs-alias|needsAlias|needs-alias/, 'unsafe/unresolved sources must be marked as needing aliases');
});

Then(/^the next CARL prompt hook runs guidance instead of project-missing fallback$/, function (this: CarlWorld) {
  const hookRun = runRegisteredCarlHook(this);
  assertRunSucceeded(hookRun, 'CARL UserPromptSubmit after SessionStart');
  const output = `${hookRun.stdout}\n${hookRun.stderr}`;
  assert.match(output, /CARL guidance ran for this prompt/, 'SessionStart-created project manifest must let the prompt hook run CARL guidance');
  assert.doesNotMatch(output, /project-missing/, 'prompt hook must not fall back to project-missing after SessionStart doctor repair');
  const manifest = readCarlManifest(this) as { runtime?: { status?: string } };
  assert.equal(manifest.runtime?.status, 'verified', 'prompt hook must mark runtime verified after SessionStart bootstrap');
});

Then(/^the mutation checks prove the BDD would fail without automatic Russian adaptation$/, function (this: CarlWorld) {
  assert.ok(this.carlMutationReport, 'mutation report must be produced');
  assert.equal(this.carlMutationReport.ok, true, `mutation verifier must pass; report=${stringify(this.carlMutationReport)}`);

  const realInstall = this.carlMutationReport.realInstall as { pass?: unknown; ruStatus?: unknown; aliases?: unknown; needsAliasSources?: unknown };
  assert.equal(realInstall.pass, true, 'real installer must satisfy Russian adaptation acceptance');
  assert.equal(realInstall.ruStatus, 'partial', 'real installer must produce honest partial Russian coverage');
  assert.ok(Array.isArray(realInstall.aliases) && realInstall.aliases.includes('че за ошибка'), 'real installer must include Russian aliases');
  assert.ok(Array.isArray(realInstall.needsAliasSources) && realInstall.needsAliasSources.includes('.claude/skills/plain/SKILL.md'), 'real installer must mark unresolved English-only source');

  const missingAdaptation = this.carlMutationReport.missingAdaptation as { mutantKilled?: unknown; ruStatus?: unknown; aliases?: unknown };
  assert.equal(missingAdaptation.mutantKilled, true, 'missing-adaptation mutant must be killed');
  assert.notEqual(missingAdaptation.ruStatus, 'partial', 'mutant without adaptProject must not satisfy Russian-ready/partial manifest status');
  assert.deepEqual(missingAdaptation.aliases, [], 'mutant without adaptProject must not generate Russian aliases');
});

// ── CARL001_02 ───────────────────────────────────────────────────────────────
Given(/^managed CARL files exist without a runnable CARL runtime consumer$/, function (this: CarlWorld) {
  ensureProject(this);
  writeManagedCarlManifest(this, { runtime: { command: 'definitely-missing-carl-runtime' } });
});

When(/^CARL integration health is evaluated$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool('tools/carl/manifest.ts', ['--project', this.carlProjectDir!, '--health']);
});

Then(/^the CARL status is degraded rather than healthy$/, function (this: CarlWorld) {
  assertRunSucceeded(this.carlLastRun, 'CARL health evaluator');
  const output = `${this.carlLastRun.stdout}\n${this.carlLastRun.stderr}`;
  assert.match(output, /degraded|missing-runtime|not healthy/, 'missing runtime must produce degraded health');
  assert.doesNotMatch(output, /healthy/i, 'missing runtime must not be reported as healthy');
});

Then(/^the diagnostic names the missing runtime consumer$/, function (this: CarlWorld) {
  const output = `${this.carlLastRun?.stdout ?? ''}\n${this.carlLastRun?.stderr ?? ''}`;
  assert.match(output, /runtime consumer|missing-runtime|runner/, 'diagnostic must name the missing runtime consumer');
});

// ── CARL001_03 / CARL001_04 ─────────────────────────────────────────────────
Given(/^the managed CARL hook is registered through the plugin hook launcher$/, function (this: CarlWorld) {
  ensureProject(this);
  const installRun = runTsTool('tools/carl/install.ts', [
    '--project',
    this.carlProjectDir!,
    '--platform',
    'claude-code',
  ]);
  assertRunSucceeded(installRun, 'CARL installer precondition for hook launcher');
});

When(/^the hook launcher executes the CARL hook event$/, function (this: CarlWorld) {
  this.carlHookResult = runRegisteredCarlHook(this);
});

Then(/^the managed CARL runner is invoked through the registered command path$/, function (this: CarlWorld) {
  assertRunSucceeded(this.carlHookResult, 'registered CARL hook');
  const output = `${this.carlHookResult.stdout}\n${this.carlHookResult.stderr}`;
  assert.match(output, /hookSpecificOutput|additionalContext|CARL/, 'hook must return agent-visible CARL output');
  assert.match(output, /CARL guidance ran for this prompt/, 'real manifest path must run CARL guidance instead of fail-open only');
});

Then(/^the runner records runtime consumer proof in the project manifest$/, function (this: CarlWorld) {
  const manifest = readCarlManifest(this) as { runtime?: { status?: string } };
  assert.equal(manifest.runtime?.status, 'verified', 'runner must mark the project runtime consumer verified after real hook execution');
});

Then(/^the scenario fails if only CARL files exist without a runtime consumer$/, function (this: CarlWorld) {
  const output = `${this.carlHookResult?.stdout ?? ''}\n${this.carlHookResult?.stderr ?? ''}`;
  assert.doesNotMatch(output, /files exist only|installed-only/i, 'runtime proof must not accept installed files alone');
});

Given(/^the managed CARL hook is configured with a (.+) failure$/, function (this: CarlWorld, failureMode: string) {
  ensureProject(this);
  this.carlFailureMode = failureMode;
  writeManagedCarlManifest(this, { testFailureMode: failureMode });
});

When(/^the CARL hook executes during an agent session$/, function (this: CarlWorld) {
  this.carlHookResult = runRegisteredCarlHook(this, {
    CARL_TEST_FAILURE_MODE: this.carlFailureMode ?? 'exception',
    CARL_PROJECT_DIR: this.carlProjectDir,
  });
});

Then(/^the hook result is fail-open$/, function (this: CarlWorld) {
  assert.ok(this.carlHookResult, 'CARL hook did not run');
  assert.equal(this.carlHookResult.status, 0, `fail-open hook must exit 0; stderr: ${this.carlHookResult.stderr}`);
});

Then(/^the CARL diagnostic code is ([a-z-]+)$/, function (this: CarlWorld, diagnosticCode: string) {
  this.carlDiagnostic = diagnosticCode;
  const output = `${this.carlHookResult?.stdout ?? ''}\n${this.carlHookResult?.stderr ?? ''}`;
  assert.match(output, new RegExp(diagnosticCode), `hook output must contain diagnostic code ${diagnosticCode}`);
});

Then(/^agent-visible context warns that CARL did not run$/, function (this: CarlWorld) {
  const output = `${this.carlHookResult?.stdout ?? ''}\n${this.carlHookResult?.stderr ?? ''}`;
  assert.match(output, /CARL did not run/, 'agent-visible context must warn that CARL did not run');
});

Then(/^the warning reminds the AI agent to tell the user CARL guidance was unavailable$/, function (this: CarlWorld) {
  const output = `${this.carlHookResult?.stdout ?? ''}\n${this.carlHookResult?.stderr ?? ''}`;
  assert.match(output, new RegExp(REQUIRED_WARNING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'warning must contain the required user-disclosure reminder');
});

// ── CARL001_05 / CARL001_06 ─────────────────────────────────────────────────
Given(/^a project has stale managed CARL version markers$/, function (this: CarlWorld) {
  ensureProject(this);
  writeManagedCarlManifest(this, { version: '0.0.0-stale', managedRegion: 'dev-pomogator' });
});

When(/^pomogator-doctor runs the CARL check with repair enabled$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool(
    '.claude/skills/pomogator-doctor/scripts/engine/checks/carl.ts',
    ['--project', this.carlProjectDir!, '--repair'],
  );
});

Then(/^doctor reports the stale CARL state$/, function (this: CarlWorld) {
  assertRunSucceeded(this.carlLastRun, 'pomogator-doctor CARL check');
  const output = `${this.carlLastRun.stdout}\n${this.carlLastRun.stderr}`;
  assert.match(output, /stale|outdated|version/, 'doctor must report stale CARL state');
});

Then(/^doctor refreshes only managed CARL artifacts$/, function (this: CarlWorld) {
  const manifest = stringify(readCarlManifest(this));
  assert.match(manifest, /dev-pomogator/, 'managed CARL manifest must remain owned by dev-pomogator');
  assert.doesNotMatch(manifest, /0\.0\.0-stale/, 'repair must refresh stale managed version markers');
});

Then(/^user-owned configuration remains unchanged$/, function (this: CarlWorld) {
  const settings = stringify(readJson(projectPath(this, '.claude', 'settings.json')));
  assert.match(settings, /preserve-me|user-carl-hook/, 'repair must preserve user-owned configuration');
});

Given(/^a project has a user-authored CARL hook entry outside the dev-pomogator managed region$/, function (this: CarlWorld) {
  ensureProject(this);
  const settingsPath = projectPath(this, '.claude', 'settings.json');
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [{ type: 'command', command: 'python user-carl-hook.py' }],
            },
          ],
        },
        userOwnedSetting: 'preserve-me',
      },
      null,
      2,
    ),
    'utf-8',
  );
  writeManagedCarlManifest(this);
});

When(/^CARL repair runs$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool('tools/carl/install.ts', ['--project', this.carlProjectDir!, '--repair']);
});

Then(/^the user-authored CARL hook entry is preserved$/, function (this: CarlWorld) {
  assertRunSucceeded(this.carlLastRun, 'CARL repair');
  const settings = stringify(readJson(projectPath(this, '.claude', 'settings.json')));
  assert.match(settings, /user-carl-hook\.py/, 'user-authored CARL hook must be preserved');
});

Then(/^managed CARL entries are written only inside managed markers or deterministic managed keys$/, function (this: CarlWorld) {
  const settings = stringify(readJson(projectPath(this, '.claude', 'settings.json')));
  assert.match(settings, /dev-pomogator|managed|carl/, 'managed CARL entries must be explicit and deterministic');
});

// ── CARL001_07 ───────────────────────────────────────────────────────────────
Given(/^the Codex context-menu launcher or Codex hook dispatcher prerequisite is unavailable$/, function (this: CarlWorld) {
  ensureProject(this);
  fs.mkdirSync(projectPath(this, '.codex'), { recursive: true });
  fs.writeFileSync(projectPath(this, '.codex', 'hooks.json'), '{"hooks": []}\n', 'utf-8');
});

When(/^CARL integration evaluates the Codex platform path$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool('tools/carl/manifest.ts', ['--project', this.carlProjectDir!, '--platform', 'codex', '--health']);
});

Then(/^Codex CARL is reported as unsupported or deferred$/, function (this: CarlWorld) {
  assertRunSucceeded(this.carlLastRun, 'Codex CARL platform health');
  const report = JSON.parse(this.carlLastRun!.stdout) as {
    diagnostic?: string;
    platforms?: { codex?: { status?: string; reason?: string } };
  };
  assert.match(report.diagnostic ?? '', /codex-deferred-prerequisite/i, 'Codex CARL must expose a prerequisite diagnostic');
  assert.match(report.platforms?.codex?.status ?? '', /unsupported|deferred/i, 'Codex CARL must remain disabled until prerequisites exist');
  assert.match(report.platforms?.codex?.reason ?? '', /launcher|dispatcher|prerequisite/i, 'Codex CARL reason must name the missing launcher/dispatcher prerequisites');
});

Then(/^Claude Code CARL status is evaluated independently$/, function (this: CarlWorld) {
  const report = JSON.parse(this.carlLastRun!.stdout) as {
    platforms?: { claudeCode?: { status?: string; reason?: string }; codex?: { status?: string; reason?: string } };
  };
  assert.ok(report.platforms?.claudeCode, 'Claude Code CARL status must be present independently from Codex');
  assert.notEqual(report.platforms?.claudeCode?.status, report.platforms?.codex?.status, 'Claude Code status must not be copied from the Codex prerequisite state');
});

// ── CARL001_08 / CARL001_12 ─────────────────────────────────────────────────
Given(/^CARL integration implementation evidence is collected$/, function (this: CarlWorld) {
  ensureProject(this);
  this.carlReportPath = projectPath(this, 'carl-review-report.json');
});

When(/^the CARL review report is generated$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool('tools/carl/manifest.ts', ['--project', this.carlProjectDir!, '--report', this.carlReportPath!]);
  assertRunSucceeded(this.carlLastRun, 'CARL review report');
  this.carlReviewReport = readJson(this.carlReportPath!) as CarlReviewReport;
});

Then(/^the report covers install, runtime consumer, warning injection, doctor repair, user preservation, Codex sequencing, and benchmark evidence$/, function (this: CarlWorld) {
  const report = this.carlReviewReport;
  assert.ok(report, 'CARL review report must be parsed from the real manifest CLI output');
  assert.equal(report.status, 'fake-green-blocked', 'review report must block fake-green when runtime consumer proof is missing');
  assert.equal(report.fakeGreenGate?.blocksDone, true, 'report must block done when files exist but runtime consumer was not exercised');
  assert.equal(report.fakeGreenGate?.runtimeConsumerExecuted, false, 'empty project fixture must not be treated as executed runtime proof');
  assert.equal(report.fakeGreenGate?.hookRegistered, true, 'report must prove the plugin hook registration points at CARL');
  assert.equal(report.fakeGreenGate?.runnerSourceExists, true, 'report must prove runner source exists');
  assert.equal(report.sections?.install?.marker, 'VERIFIED');
  assert.equal(report.sections?.runtime?.marker, 'UNVERIFIED');
  assert.equal(report.sections?.warning?.marker, 'VERIFIED');
  assert.equal(report.sections?.doctor?.marker, 'VERIFIED');
  assert.equal(report.sections?.user?.marker, 'VERIFIED');
  assert.equal(report.sections?.Codex?.marker, 'VERIFIED');
  assert.equal(report.sections?.benchmark?.marker, 'VERIFIED');
  assert.equal(report.sections?.warning?.requiredWarning, REQUIRED_WARNING, 'report must cite the fail-open warning text');
  assert.ok(report.sections.benchmark.evidence?.some((item) => item.path === 'tools/carl/bench.ts' && item.exists === true), 'benchmark evidence must cite tools/carl/bench.ts');
});

Then(/^each external CARL claim is marked VERIFIED, UNVERIFIED, or ASSUMED$/, function (this: CarlWorld) {
  const report = this.carlReviewReport;
  assert.ok(report, 'CARL review report must be parsed from the real manifest CLI output');
  assert.deepEqual(
    report.externalClaims.map((item) => item.marker),
    ['ASSUMED', 'UNVERIFIED', 'UNVERIFIED'],
    'external claims must remain honestly marked when Codex/runtime/Russian readiness are not proven',
  );
  assert.ok(report.externalClaims.some((item) => /Codex CARL runtime execution/i.test(item.claim) && item.marker === 'ASSUMED'));
  assert.ok(report.externalClaims.some((item) => /Russian CARL runtime readiness/i.test(item.claim) && item.marker === 'UNVERIFIED'));
  assert.ok(report.externalClaims.some((item) => /Runtime consumer proof/i.test(item.claim) && item.marker === 'UNVERIFIED'));
});

Given(/^Russian CARL prompt evaluation cases are defined with expected domains$/, function (this: CarlWorld) {
  ensureProject(this);
  this.carlReportPath = projectPath(this, 'russian-carl-eval.json');
  assert.ok(fs.existsSync(appPath('tests', 'fixtures', 'carl', 'bench.stdout.tsv')), 'real CARL benchmark fixture must exist');
  assert.ok(fs.existsSync(appPath('tests', 'fixtures', 'carl', 'real-output', 'README.md')), 'real CARL provenance ledger must exist');
});

When(/^the Russian CARL evaluator runs against fixture-backed or real CARL output$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool('tools/carl/evaluate-russian.ts', [
    '--fixture-root',
    appPath('tests', 'fixtures', 'carl'),
    '--out',
    this.carlReportPath!,
  ]);
  assertRunSucceeded(this.carlLastRun, 'Russian CARL evaluator');
  this.carlRussianEvalReport = readJson(this.carlReportPath!) as Record<string, unknown>;
});

Then(/^the report records expected and actual loaded domains for each prompt$/, function (this: CarlWorld) {
  const report = this.carlRussianEvalReport as {
    summary?: { totalCases?: unknown; casesWithGaps?: unknown };
    cases?: Array<{ id?: string; expectedDomains?: string[]; actualLoadedDomains?: string[]; evidenceKind?: string }>;
  };
  assert.equal(report.summary?.totalCases, 6, 'Russian evaluator must cover the curated six-prompt matrix');
  assert.equal(report.summary?.casesWithGaps, 1, 'only the missing dev-pomogator changed-rule/skill fixture should be a gap');
  const byId = new Map((report.cases ?? []).map((item) => [item.id, item]));
  assert.deepEqual(byId.get('neutral-continue')?.expectedDomains, ['GLOBAL']);
  assert.deepEqual(byId.get('neutral-continue')?.actualLoadedDomains, ['GLOBAL']);
  assert.deepEqual(byId.get('ru-debug-root-cause')?.expectedDomains, ['GLOBAL', 'CORE__DONT_BLAME_INFRA_BEFORE_TRACING', 'CORE__REPRODUCE_NOT_THEORIZE']);
  assert.deepEqual(byId.get('ru-debug-root-cause')?.actualLoadedDomains, ['GLOBAL', 'CORE__DONT_BLAME_INFRA_BEFORE_TRACING', 'CORE__REPRODUCE_NOT_THEORIZE']);
  assert.deepEqual(byId.get('specs-workflow')?.expectedDomains, ['GLOBAL', 'PROJECT__FEATURE_INDEX']);
  assert.deepEqual(byId.get('specs-workflow')?.actualLoadedDomains, ['GLOBAL', 'PROJECT__FEATURE_INDEX']);
  assert.deepEqual(byId.get('changed-rule-skill')?.expectedDomains, ['GLOBAL', 'PROJECT__FEATURE_INDEX']);
  assert.deepEqual(byId.get('changed-rule-skill')?.actualLoadedDomains, []);
  assert.equal(byId.get('changed-rule-skill')?.evidenceKind, 'missing-real-output');
  assert.deepEqual(byId.get('render-legibility')?.actualLoadedDomains, ['GLOBAL', 'REELS__LEGIBILITY_DESIGN_SYSTEM', 'REELS__REMOTION_REFERENCE']);
  assert.deepEqual(byId.get('deferred-codex-ru-debug')?.actualLoadedDomains, ['GLOBAL', 'CORE__REPRODUCE_NOT_THEORIZE']);
});

Then(/^false positives and false negatives are listed with optimization recommendations$/, function (this: CarlWorld) {
  const report = this.carlRussianEvalReport as {
    summary?: { falsePositiveCount?: unknown; falseNegativeCount?: unknown; missingRealOutputCount?: unknown };
    cases?: Array<{ id?: string; falsePositiveDomains?: string[]; falseNegativeDomains?: string[]; recommendations?: string[] }>;
    optimizationRecommendations?: Array<{ case?: string; recommendation?: string }>;
  };
  assert.equal(report.summary?.falsePositiveCount, 0, 'fixture-backed Russian eval should not invent false-positive domains');
  assert.equal(report.summary?.falseNegativeCount, 2, 'missing changed-rule/skill output must list both expected missing domains');
  assert.equal(report.summary?.missingRealOutputCount, 1, 'exactly one prompt lacks dev-pomogator-owned real output');
  const changedRuleSkill = (report.cases ?? []).find((item) => item.id === 'changed-rule-skill');
  assert.deepEqual(changedRuleSkill?.falsePositiveDomains, []);
  assert.deepEqual(changedRuleSkill?.falseNegativeDomains, ['GLOBAL', 'PROJECT__FEATURE_INDEX']);
  assert.ok(changedRuleSkill?.recommendations?.some((item) => /capture real dev-pomogator CARL output/i.test(item)), 'gap must recommend capturing real dev-pomogator output');
  assert.ok(changedRuleSkill?.recommendations?.some((item) => /русские алиасы|обнови правило|скилл/i.test(item)), 'gap must recommend Russian alias expansion for rule/skill prompts');
  assert.ok((report.optimizationRecommendations ?? []).some((item) => item.case === 'changed-rule-skill' && /Cyrillic normalization|alias coverage/i.test(item.recommendation ?? '')), 'optimization list must carry the observed coverage-gap recommendation');
});

Then(/^fixture-backed sibling output is not reported as dev-pomogator runtime readiness$/, function (this: CarlWorld) {
  const report = this.carlRussianEvalReport as {
    mode?: unknown;
    runtimeReadiness?: { devPomogator?: unknown; statement?: unknown };
    trustBoundary?: unknown;
    provenance?: { sourceRoot?: unknown; sourceHashes?: Record<string, string> };
  };
  assert.equal(report.mode, 'fixture-backed-sibling-real-output', 'report must label sibling fixture evidence');
  assert.equal(report.runtimeReadiness?.devPomogator, false, 'fixture evidence must not claim dev-pomogator runtime readiness');
  assert.match(String(report.runtimeReadiness?.statement ?? ''), /not dev-pomogator runtime readiness/i);
  assert.match(String(report.trustBoundary ?? ''), /Sibling fixture evidence/i);
  assert.equal(report.provenance?.sourceRoot, 'E:/repos/presentation-reels', 'report must cite sibling fixture provenance');
  assert.equal(Object.keys(report.provenance?.sourceHashes ?? {}).length, 7, 'report must carry captured source hashes');
});

// ── CARL001_09 / CARL001_10 ─────────────────────────────────────────────────
Given(/^CARL recall benchmark evidence has no real CARL artifact yet$/, function (this: CarlWorld) {
  ensureProject(this);
});

When(/^the CARL benchmark gate is evaluated$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool('tools/carl/bench.ts', ['--project', this.carlProjectDir!]);
  assertRunSucceeded(this.carlLastRun, 'CARL benchmark gate');
  this.carlBenchmarkReport = JSON.parse(this.carlLastRun.stdout) as Record<string, unknown>;
});

Then(/^the benchmark threshold remains draft or blocked$/, function (this: CarlWorld) {
  assert.equal(this.carlBenchmarkReport?.status, 'blocked', 'benchmark without real artifact must be blocked');
  assert.equal(this.carlBenchmarkReport?.thresholdState, 'draft-no-real-artifact', 'threshold must stay draft without real artifact');
  assert.equal((this.carlBenchmarkReport?.regressionGate as { enabled?: unknown } | undefined)?.enabled, false, 'regression gate must be disabled without real evidence');
});

Then(/^no numeric pass threshold is invented$/, function (this: CarlWorld) {
  const output = `${this.carlLastRun?.stdout ?? ''}\n${this.carlLastRun?.stderr ?? ''}`;
  assert.doesNotMatch(output, /passThreshold\s*[:=]\s*\d+|threshold\s*[:=]\s*\d+/, 'benchmark must not invent numeric pass thresholds');
  assert.equal(this.carlBenchmarkReport?.baseline, null, 'blocked benchmark must not create a fake numeric baseline');
});

Given(/^a real CARL recall artifact has been captured with provenance, source hashes, and producer ground truth$/, function (this: CarlWorld) {
  ensureProject(this);
  const fixtureRoot = appPath('tests', 'fixtures', 'carl');
  for (const rel of ['manifest.json', 'bench.stdout.tsv', 'real-output/README.md']) {
    assert.ok(fs.existsSync(path.join(fixtureRoot, rel)), `real CARL fixture missing: ${rel}`);
  }
});

When(/^the CARL benchmark runs against that artifact$/, function (this: CarlWorld) {
  this.carlLastRun = runTsTool('tools/carl/bench.ts', [
    '--fixture-root',
    appPath('tests', 'fixtures', 'carl'),
    '--project',
    this.carlProjectDir!,
  ]);
  assertRunSucceeded(this.carlLastRun, 'CARL benchmark with real fixture');
  this.carlBenchmarkReport = JSON.parse(this.carlLastRun.stdout) as Record<string, unknown>;
});

Then(/^the benchmark records a baseline for supported metrics$/, function (this: CarlWorld) {
  assert.equal(this.carlBenchmarkReport?.status, 'baseline-recorded', 'real artifact must record a baseline');
  assert.equal(this.carlBenchmarkReport?.mode, 'fixture-backed-real-artifact', 'baseline must name fixture-backed real artifact mode');
  const baseline = this.carlBenchmarkReport?.baseline as { metrics?: Array<Record<string, unknown>> } | undefined;
  assert.deepEqual(baseline?.metrics, [
    {
      case: 'neutral-continue',
      p50_ms: 409.7,
      p95_ms: 411,
      chars: 691,
      estimatedTokens: 173,
      sourceLimit: '<=2000',
      loadedDomains: '[GLOBAL] always_on (2 rules)',
    },
    {
      case: 'ru-debug-root-cause',
      p50_ms: 419.2,
      p95_ms: 439.8,
      chars: 20557,
      estimatedTokens: 5140,
      sourceLimit: '<=25000',
      loadedDomains: '[GLOBAL] always_on (2 rules) | [CORE__DONT_BLAME_INFRA_BEFORE_TRACING] matched: инфра (1 rules) | [CORE__REPRODUCE_NOT_THEORIZE] matched: че за ошибка, исследуй втф, до конца (1 rules)',
    },
    {
      case: 'render-legibility',
      p50_ms: 398.7,
      p95_ms: 398.8,
      chars: 44524,
      estimatedTokens: 11131,
      sourceLimit: '<=50000',
      loadedDomains: '[GLOBAL] always_on (2 rules) | [REELS__LEGIBILITY_DESIGN_SYSTEM] matched: текст не виден (1 rules) | [REELS__REMOTION_REFERENCE] matched: remotion (1 rules)',
    },
    {
      case: 'feature-index',
      p50_ms: 393.7,
      p95_ms: 407.7,
      chars: 17169,
      estimatedTokens: 4293,
      sourceLimit: '<=35000',
      loadedDomains: '[GLOBAL] always_on (2 rules) | [PROJECT__FEATURE_INDEX] matched: спеки, *feature-index (1 rules)',
    },
    {
      case: 'codex-ru-debug',
      p50_ms: 399.4,
      p95_ms: 409.6,
      chars: 9155,
      estimatedTokens: 2289,
      sourceLimit: '<=15000',
      loadedDomains: '[GLOBAL] always_on (2 rules) | [CORE__REPRODUCE_NOT_THEORIZE] matched: че за ошибка (1 rules)',
    },
  ], 'benchmark must preserve exact captured producer metrics');
  const provenance = this.carlBenchmarkReport?.provenance as { sourceHashes?: Record<string, string>; producerGroundTruth?: Record<string, unknown> } | undefined;
  assert.deepEqual(Object.keys(provenance?.sourceHashes ?? {}).sort(), [
    '.carl/carl.json',
    '.claude/hooks/carl-hook.py',
    '.claude/settings.json',
    '.codex/hooks.json',
    'scripts/carl/bench-carl-hooks.mjs',
    'scripts/carl/generate-carl-rules.mjs',
    'scripts/carl/smoke-carl-hooks.mjs',
  ].sort(), 'baseline must cite the exact captured source hash set');
  assert.equal(provenance?.producerGroundTruth?.benchStatus, 0, 'baseline must cite producer ground truth status');
  assert.equal(provenance?.producerGroundTruth?.oldBulkAutoloadChars, '683575', 'baseline must cite producer old bulk autoload ground truth');
  assert.equal(provenance?.producerGroundTruth?.iterations, '5', 'baseline must cite producer iteration count');
});

Then(/^future regression checks compare against that baseline$/, function (this: CarlWorld) {
  const regressionGate = this.carlBenchmarkReport?.regressionGate as { enabled?: unknown; comparison?: unknown; thresholdPolicy?: unknown } | undefined;
  assert.equal(regressionGate?.enabled, true, 'regression gate must be enabled for a real baseline');
  assert.match(String(regressionGate.comparison ?? ''), /p50_ms.*p95_ms.*chars.*estimatedTokens.*loadedDomains/i, 'regression comparison must name supported metrics');
  assert.match(String(regressionGate.thresholdPolicy ?? ''), /fixture evidence|approved/i, 'threshold policy must stay tied to real fixture evidence or approval');
});
