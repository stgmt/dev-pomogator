import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { V4World } from '../hooks/before-after.ts';
import { runManagedHook } from '../../tools/hook-service/client.mjs';
import { buildRegistry, renderHttpManifest, STOP_DISPATCH_ROUTE } from '../../tools/hook-service/registry.mjs';
import { aggregateHookOutputs, executeEvent, startServer } from '../../tools/hook-service/server.mjs';
import { decodeProjectRootHeader } from '../../tools/_shared/hook-project-root.mjs';
import { appendRawEntry } from '../../tools/spec-check-log/writer.ts';

interface ProjectStopWorld extends V4World {
  pluginRoot?: string;
  projects?: string[];
  service?: Awaited<ReturnType<typeof startServer>>;
  token?: string;
  responses?: Array<Record<string, any>>;
  manifest?: Record<string, any>;
  registry?: Record<string, any>;
  baseline?: Record<string, any>;
  aggregated?: Record<string, any>;
  sequenceLog?: string;
  stopLoopExecutions?: number;
  recoveryStarts?: number;
  recoveryResults?: Array<Awaited<ReturnType<typeof runManagedHook>>>;
  liveErrorFetches?: number;
  uncertainFetches?: number;
}

const writeJson = (file: string, value: object) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
};

Given(/^one installed plugin service receives interleaved Stop requests for two different projects$/, async function (this: ProjectStopWorld) {
  this.pluginRoot = path.join(this.tempDir, 'installed-plugin');
  this.projects = [path.join(this.tempDir, 'project-a'), path.join(this.tempDir, 'project-b')];
  this.projects.forEach(project => fs.mkdirSync(path.join(project, '.specs'), { recursive: true }));
  const serviceDir = path.join(this.pluginRoot, 'tools', 'hook-service');
  const adapterDir = path.join(serviceDir, 'worker-adapters');
  fs.mkdirSync(adapterDir, { recursive: true });
  fs.writeFileSync(path.join(this.pluginRoot, 'child.mjs'), `process.stdout.write(JSON.stringify({child:{cwd:process.cwd(),project:process.env.CLAUDE_PROJECT_DIR,plugin:process.env.CLAUDE_PLUGIN_ROOT}}));`);
  fs.writeFileSync(path.join(adapterDir, 'project-fixture.mjs'), `export async function handle(){return {worker:{cwd:process.cwd(),project:process.env.CLAUDE_PROJECT_DIR,plugin:process.env.CLAUDE_PLUGIN_ROOT}}}`);
  writeJson(path.join(serviceDir, 'registry.json'), {
    version: 2,
    routes: {
      'Stop/0/0': { target: 'child.mjs', event: 'Stop', timeout: 5, execution: 'child' },
      'Stop/1/0': { target: 'child.mjs', event: 'Stop', timeout: 5, execution: 'persistent', worker_target: 'tools/hook-service/worker-adapters/project-fixture.mjs', worker_protocol: 'handle' },
    },
    groups: { [STOP_DISPATCH_ROUTE]: ['Stop/0/0', 'Stop/1/0'] },
  });
  this.token = 'project-isolation-secret';
  this.service = await startServer({ pluginRoot: this.pluginRoot, token: this.token, port: 0, stateRoot: path.join(this.tempDir, 'service-state') });
});

When(/^logical routes children workers and conformance tools execute$/, async function (this: ProjectStopWorld) {
  const address = this.service!.address();
  this.responses = await Promise.all(this.projects!.map(async project => {
    const response = await fetch(`http://127.0.0.1:${address.port}/v1/dispatch/${encodeURIComponent(STOP_DISPATCH_ROUTE)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dev-pomogator-token': this.token! },
      body: JSON.stringify({ session_id: 'shared-session', cwd: project }),
    });
    appendRawEntry({ project }, { repoRoot: project, minFreeBytes: 0 });
    assert.equal(response.status, 200);
    return await response.json();
  }));
});

Then(/^each request uses only its own normalized project cwd environment flight and state$/, function (this: ProjectStopWorld) {
  this.responses!.forEach((response, index) => {
    const expected = fs.realpathSync.native(this.projects![index]);
    assert.equal(fs.realpathSync.native(response.child.cwd), expected);
    assert.equal(fs.realpathSync.native(response.child.project), expected);
    assert.equal(fs.realpathSync.native(response.worker.cwd), expected);
    assert.equal(fs.realpathSync.native(response.worker.project), expected);
    assert.equal(fs.existsSync(path.join(expected, '.dev-pomogator', '.spec-check-log')), true);
  });
});

Then(/^plugin cache and the other project receive no project owned writes$/, async function (this: ProjectStopWorld) {
  assert.equal(fs.existsSync(path.join(this.pluginRoot!, '.dev-pomogator')), false);
  assert.notEqual(this.responses![0].child.cwd, this.responses![1].child.cwd);
  await new Promise<void>(resolve => this.service!.close(() => resolve()));
});

Given(/^a black box baseline for legacy Stop approval blocking context failure order and loop cases$/, function (this: ProjectStopWorld) {
  const outputs = Array.from({ length: 13 }, () => ({} as Record<string, unknown>));
  outputs[0] = { decision: 'approve', systemMessage: 'first' };
  outputs[3] = { additionalContext: 'context-a' };
  outputs[6] = { continue: true, additionalContext: 'context-b' };
  outputs[9] = { decision: 'block', reason: 'evidence missing' };
  outputs[12] = { decision: 'block', reason: 'backlog pending', suppressOutput: true };
  this.baseline = {
    outputs,
    expected: {
      decision: 'block',
      systemMessage: 'first',
      additionalContext: 'context-a\ncontext-b',
      continue: true,
      reason: 'evidence missing\nbacklog pending',
      suppressOutput: true,
    },
  };
});

When(/^the generated manifest dispatches the same cases through one DevPomogator Stop command$/, async function (this: ProjectStopWorld) {
  this.manifest = await renderHttpManifest(process.cwd());
  this.registry = await buildRegistry(process.cwd());
  this.aggregated = aggregateHookOutputs(this.baseline!.outputs);

  const root = path.join(this.tempDir, 'sequential-child-fixture');
  const project = path.join(this.tempDir, 'sequential-project');
  fs.mkdirSync(project, { recursive: true });
  this.sequenceLog = path.join(root, 'sequence.log');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'route.mjs'), `import fs from 'node:fs'; const lock=${JSON.stringify(path.join(root, 'active.lock'))}; const log=${JSON.stringify(this.sequenceLog)}; const id=process.argv[2]; if(fs.existsSync(lock)) fs.appendFileSync(log,'overlap,'); fs.writeFileSync(lock,id); const end=Date.now()+25; while(Date.now()<end){} fs.appendFileSync(log,id+','); fs.unlinkSync(lock); process.stdout.write('{}');`);
  const fixture = { version: 2, routes: Object.fromEntries([0, 1, 2].map(index => [`Stop/${index}/0`, { target: 'route.mjs', args: [String(index)], event: 'Stop', timeout: 2, execution: 'child' }])) };
  await executeEvent(fixture, 'Stop', { cwd: project }, root, undefined, { projectRoot: project });

  const loopRoot = path.join(this.tempDir, 'stop-loop-fixture');
  const loopServiceDir = path.join(loopRoot, 'tools', 'hook-service');
  const loopCounter = path.join(loopRoot, 'counter.txt');
  fs.mkdirSync(loopServiceDir, { recursive: true });
  fs.writeFileSync(path.join(loopRoot, 'loop.mjs'), `import fs from 'node:fs'; const file=${JSON.stringify(loopCounter)}; const value=Number(fs.existsSync(file)?fs.readFileSync(file,'utf8'):0)+1; fs.writeFileSync(file,String(value)); process.stdout.write(JSON.stringify({decision:'block',reason:'loop-'+value}));`);
  writeJson(path.join(loopServiceDir, 'registry.json'), { version: 2, routes: { 'Stop/0/0': { target: 'loop.mjs', event: 'Stop', timeout: 2, execution: 'child' } }, groups: { [STOP_DISPATCH_ROUTE]: ['Stop/0/0'] } });
  const loopServer = await startServer({ pluginRoot: loopRoot, token: 'loop-secret', port: 0, stateRoot: path.join(this.tempDir, 'loop-state') });
  try {
    const address = loopServer.address();
    const dispatch = (stopHookActive: boolean) => fetch(`http://127.0.0.1:${address.port}/v1/dispatch/${encodeURIComponent(STOP_DISPATCH_ROUTE)}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-pomogator-token': 'loop-secret' }, body: JSON.stringify({ cwd: project, session_id: 'loop-session', stop_hook_active: stopHookActive }) });
    assert.equal((await dispatch(false)).status, 200);
    assert.equal((await dispatch(true)).status, 200);
    this.stopLoopExecutions = Number(fs.readFileSync(loopCounter, 'utf8'));
  } finally {
    await new Promise<void>(resolve => loopServer.close(() => resolve()));
  }
});

Then(/^logical routes execute in registry order and every host observable result matches the baseline$/, function (this: ProjectStopWorld) {
  assert.equal(this.registry!.groups[STOP_DISPATCH_ROUTE].length, 13);
  assert.deepEqual(this.aggregated, this.baseline!.expected);
  assert.equal(fs.readFileSync(this.sequenceLog!, 'utf8'), '0,1,2,');
  assert.equal(this.stopLoopExecutions, 2, 'a Stop re-entry must not reuse the completed first-flight result');
});

Then(/^legacy child fallback runs at most one child at a time with bounded input and output$/, function (this: ProjectStopWorld) {
  assert.equal(this.manifest!.hooks.Stop.length, 1);
  assert.equal(this.manifest!.hooks.Stop[0].hooks.length, 1);
  assert.match(this.manifest!.hooks.Stop[0].hooks[0].command, /Stop\/all/u);
  assert.doesNotMatch(fs.readFileSync(this.sequenceLog!, 'utf8'), /overlap/u);
});

Given(/^independent project requests share one service and the owned daemon dies during the session$/, function (this: ProjectStopWorld) {
  this.projects = [path.join(this.tempDir, 'fifo-a'), path.join(this.tempDir, 'fifo-b')];
  this.projects.forEach(project => fs.mkdirSync(project, { recursive: true }));
  this.recoveryStarts = 0;
  this.recoveryResults = [];
  this.liveErrorFetches = 0;
  this.uncertainFetches = 0;
});

When(/^the next Stop requests are interleaved through the builtins client$/, async function (this: ProjectStopWorld) {
  let dead = true;
  let recovery: Promise<Record<string, unknown>> | null = null;
  const ensureUpImpl = async () => {
    if (!dead) return { ready: true, token: 'self-heal', port: 42619 };
    if (!recovery) {
      this.recoveryStarts! += 1;
      recovery = Promise.resolve().then(() => {
        dead = false;
        return { ready: true, token: 'self-heal', port: 42619, restarted: true };
      });
    }
    return recovery;
  };
  const sequences = new Map<string, number>();
  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit) => {
    const encoded = (init?.headers as Record<string, string>)['x-dev-pomogator-project-root'];
    const project = decodeProjectRootHeader(encoded)!;
    const sequence = (sequences.get(project) || 0) + 1;
    sequences.set(project, sequence);
    return new Response(JSON.stringify({ project, sequence }), { status: 200 });
  };
  for (let round = 0; round < 2; round += 1) {
    const batch = await Promise.all(this.projects!.map(project => runManagedHook({
      route: STOP_DISPATCH_ROUTE,
      input: JSON.stringify({ session_id: 'shared', cwd: project }),
      pluginRoot: process.cwd(), ensureUpImpl, fetchImpl,
      diagnosticRoot: path.join(this.tempDir, 'client-state'),
    })));
    this.recoveryResults!.push(...batch);
  }

  await runManagedHook({
    route: STOP_DISPATCH_ROUTE, input: JSON.stringify({ cwd: this.projects![0] }), pluginRoot: process.cwd(),
    ensureUpImpl, diagnosticRoot: path.join(this.tempDir, 'client-state'),
    fetchImpl: async () => { this.liveErrorFetches! += 1; return new Response('{}', { status: 503 }); },
  });
  await runManagedHook({
    route: STOP_DISPATCH_ROUTE, input: JSON.stringify({ cwd: this.projects![0] }), pluginRoot: process.cwd(),
    ensureUpImpl, diagnosticRoot: path.join(this.tempDir, 'client-state'),
    fetchImpl: async () => { this.uncertainFetches! += 1; throw Object.assign(new Error('socket reset after write'), { code: 'ECONNRESET' }); },
  });
});

Then(/^the service is recovered once and each project retains independent FIFO results and state$/, function (this: ProjectStopWorld) {
  assert.equal(this.recoveryStarts, 1);
  const decoded = this.recoveryResults!.map(result => JSON.parse(result.body || '{}'));
  assert.deepEqual(decoded.map(item => item.sequence), [1, 1, 2, 2]);
  assert.deepEqual(new Set(decoded.map(item => item.project)), new Set(this.projects));
});

Then(/^live service errors and uncertain route work are not retried$/, function (this: ProjectStopWorld) {
  assert.equal(this.liveErrorFetches, 1);
  assert.equal(this.uncertainFetches, 1);
});
