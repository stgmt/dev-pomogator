import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Given, When, Then } from '@cucumber/cucumber';
import type { CommandRequest, CommandResult, CommandRunner, ReportInput, ReportResult } from '../../tools/report-issue/types.ts';
import { reportIssue } from '../../tools/report-issue/reporter.ts';
import { V4World } from '../hooks/before-after.ts';

const SECRET = 'ghp_abcdefghijklmnopqrstuvwxyz1234567890';
const REMOTE = 'https://github.com/acme/incident-tracker.git';

type ReportWorld = V4World & {
  input?: ReportInput;
  result?: ReportResult;
  calls: CommandRequest[];
  runner?: CommandRunner;
  draftDirectory?: string;
  openedUrls: string[];
};

function reportWorld(world: V4World): ReportWorld {
  const state = world as ReportWorld;
  state.calls ??= [];
  state.openedUrls ??= [];
  return state;
}

function response(code: number | null, stdout = '', error?: CommandResult['error']): CommandResult {
  return { code, stdout, stderr: '', ...(error ? { error } : {}) };
}

function runnerFor(world: ReportWorld, outcomes: readonly CommandResult[]): CommandRunner {
  let index = 0;
  return async (request) => {
    world.calls.push(request);
    const outcome = outcomes[index++];
    assert.ok(outcome, `unexpected command ${request.file} ${request.args.join(' ')}`);
    return outcome;
  };
}

function issueDescription(): string {
  return `# Cannot publish\nThe token is ${SECRET} and the failing path is /home/alice/private-project.`;
}

Given(/^an issue description containing a credential-shaped value$/, function (this: V4World) {
  const world = reportWorld(this);
  world.input = { description: issueDescription() };
  world.runner = runnerFor(world, [
    response(0, `${REMOTE}\n`),
    response(0),
    response(0, '[]'),
  ]);
});

Given(/^a prepared issue report is displayed$/, async function (this: V4World) {
  const world = reportWorld(this);
  world.input = { description: issueDescription() };
  world.runner = runnerFor(world, [
    response(0, `${REMOTE}\n`),
    response(0),
    response(0, '[]'),
  ]);
  world.result = await reportIssue(world.input, { repoRoot: world.tempDir, runCommand: world.runner });
  assert.equal(world.result.status, 'needs_approval');
});

Given(/^GitHub CLI is authenticated for the resolved repository$/, function (this: V4World) {
  const world = reportWorld(this);
  world.input = { description: issueDescription() };
  world.runner = runnerFor(world, [
    response(0, `${REMOTE}\n`),
    response(0),
    response(0, JSON.stringify([{ number: 17, title: 'Cannot publish', url: 'https://github.com/stgmt/dev-pomogator/issues/17' }])),
  ]);
});

Given(/^the user explicitly approves the prepared report$/, async function (this: V4World) {
  const world = reportWorld(this);
  const preview = await reportIssue({ description: issueDescription() }, {
    repoRoot: world.tempDir,
    runCommand: runnerFor(world, [
      response(0, `${REMOTE}\n`),
      response(0),
      response(0, '[]'),
    ]),
  });
  assert.equal(preview.status, 'needs_approval');
  assert.ok(preview.draft.digest, 'the real reporter must produce an approval digest');
  world.input = { description: issueDescription(), approvedDigest: preview.draft.digest };
});

When(/^the user does not explicitly approve the report$/, async function (this: V4World) {
  const world = reportWorld(this);
  assert.ok(world.input, 'preview must be configured');
  world.calls = [];
  world.runner = runnerFor(world, [
    response(0, `${REMOTE}\n`),
    response(0),
    response(0, '[]'),
  ]);
  world.result = await reportIssue(world.input, {
    repoRoot: world.tempDir,
    runCommand: world.runner,
  });
});

Given(/^a materially similar open issue exists$/, function (this: V4World) {
  assert.ok(reportWorld(this).runner, 'authenticated command runner must be configured');
});

Given(/^GitHub CLI is installed but unauthenticated$/, async function (this: V4World) {
  const world = reportWorld(this);
  const preview = await reportIssue({ description: issueDescription() }, {
    repoRoot: world.tempDir,
    runCommand: runnerFor(world, [
      response(0, `${REMOTE}\n`),
      response(0),
      response(0, '[]'),
    ]),
  });
  assert.equal(preview.status, 'needs_approval');
  world.calls = [];
  world.input = { description: issueDescription(), approvedDigest: preview.draft.digest };
  world.draftDirectory = path.join(world.tempDir, 'saved-drafts');
  world.runner = runnerFor(world, [response(0, `${REMOTE}\n`), response(1)]);
});

Given(/^repository metadata and a GitHub remote are unavailable$/, function (this: V4World) {
  const world = reportWorld(this);
  world.input = { description: 'Metadata cannot be resolved' };
  world.runner = runnerFor(world, [
    response(null, '', 'missing'),
    response(0),
    response(0, '[]'),
  ]);
  fs.rmSync(path.join(world.tempDir, '.claude-plugin'), { recursive: true, force: true });
});

Given(/^the user requests the fallback URL to open$/, function (this: V4World) {
  reportWorld(this).input!.openBrowser = true;
});

When(/^the user invokes report-issue$/, async function (this: V4World) {
  const world = reportWorld(this);
  assert.ok(world.input && world.runner, 'scenario must configure report input and command runner');
  world.result = await reportIssue(world.input, {
    repoRoot: world.tempDir,
    runCommand: world.runner,
    draftDirectory: world.draftDirectory,
    openUrl: async (url) => {
      world.openedUrls.push(url);
      return true;
    },
    now: () => new Date('2026-07-13T00:00:00.000Z'),
  });
});

Then(/^the injected browser opener receives the sanitized GitHub new-issue URL exactly once$/, function (this: V4World) {
  const world = reportWorld(this);
  const result = world.result!;
  assert.equal(result.status, 'fallback');
  assert.deepEqual(world.openedUrls, [result.url]);
  assert.match(world.openedUrls[0]!, /^https:\/\/github\.com\/stgmt\/dev-pomogator\/issues\/new\?/);
  assert.doesNotMatch(world.openedUrls[0]!, new RegExp(SECRET));
  assert.doesNotMatch(world.openedUrls[0]!, /\/home\/alice/);
});

Then(/^the result records that the browser opened the fallback URL$/, function (this: V4World) {
  assert.equal(reportWorld(this).result!.browserOpened, true);
});

Then(/^the user sees a sanitized title and Markdown body$/, function (this: V4World) {
  const result = reportWorld(this).result!;
  assert.equal(result.draft.title, 'Cannot publish');
  assert.match(result.draft.body, /^## Report\n\n# Cannot publish/m);
  assert.match(result.draft.body, /\[REDACTED\]/);
  assert.doesNotMatch(result.draft.body, new RegExp(SECRET));
  assert.doesNotMatch(result.draft.body, /\/home\/alice/);
});

Then(/^the user sees the resolved repository and a GitHub new-issue URL$/, function (this: V4World) {
  const result = reportWorld(this).result!;
  assert.equal(result.repository, 'stgmt/dev-pomogator');
  assert.match(result.url, /^https:\/\/github\.com\/stgmt\/dev-pomogator\/issues\/new\?/);
  assert.match(result.url, /title=Cannot\+publish/);
  assert.doesNotMatch(result.url, new RegExp(SECRET));
});

Then(/^no GitHub issue has been created$/, function (this: V4World) {
  const world = reportWorld(this);
  assert.equal(world.result!.status, 'needs_approval');
  assert.equal(world.calls.filter((call) => call.args[0] === 'issue' && call.args[1] === 'create').length, 0);
  assert.equal(world.calls.filter((call) => call.file === 'gh').length, 2, 'only read-only authentication and duplicate checks may precede approval');
});

Then(/^no GitHub issue creation command is executed$/, function (this: V4World) {
  const world = reportWorld(this);
  assert.equal(world.result!.status, 'needs_approval');
  assert.equal(world.calls.filter((call) => call.args[0] === 'issue' && call.args[1] === 'create').length, 0);
  assert.equal(world.calls.length, 3, 'only repository, authentication, and duplicate read checks may run before approval');
});

Then(/^the matching issue URL is displayed$/, function (this: V4World) {
  const result = reportWorld(this).result!;
  assert.equal(result.status, 'duplicate');
  assert.equal(result.duplicate?.url, 'https://github.com/stgmt/dev-pomogator/issues/17');
});

Then(/^creating a new issue requires explicit confirmation$/, function (this: V4World) {
  const world = reportWorld(this);
  assert.equal(world.calls.filter((call) => call.args[0] === 'issue' && call.args[1] === 'create').length, 0);
  assert.match(world.result!.guidance, /no issue was created/i);
});

Then(/^the user is told to run gh auth login$/, function (this: V4World) {
  const result = reportWorld(this).result!;
  assert.equal(result.status, 'fallback');
  assert.match(result.guidance, /gh auth login/);
});

Then(/^the sanitized report and filled GitHub new-issue URL remain available$/, function (this: V4World) {
  const world = reportWorld(this);
  const result = world.result!;
  assert.ok(result.draftPath && fs.existsSync(result.draftPath), 'fallback must save a real draft');
  const saved = fs.readFileSync(result.draftPath!, 'utf8');
  assert.match(saved, /\[REDACTED\]/);
  assert.doesNotMatch(saved, new RegExp(SECRET));
  assert.match(result.url, /^https:\/\/github\.com\/stgmt\/dev-pomogator\/issues\/new\?/);
});

Then(/^the result does not claim an issue was created$/, function (this: V4World) {
  const result = reportWorld(this).result!;
  assert.notEqual(result.status, 'created');
  assert.doesNotMatch(result.guidance, /^GitHub issue created\.$/);
});

Then(/^stgmt\/dev-pomogator is displayed as the repository target$/, function (this: V4World) {
  const result = reportWorld(this).result!;
  assert.equal(result.repository, 'stgmt/dev-pomogator');
});

Then(/^that target is used in the displayed GitHub new-issue URL$/, function (this: V4World) {
  const result = reportWorld(this).result!;
  assert.match(result.url, /^https:\/\/github\.com\/stgmt\/dev-pomogator\/issues\/new\?/);
});
