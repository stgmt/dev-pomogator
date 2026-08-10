import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { isWithinRoot, startServer } from '../tools/hook-service/server.mjs';
import { renderHttpManifest } from '../tools/hook-service/registry.mjs';
import { HookMigrationCollisionError, migrateManagedHooks, recoverManagedHooks } from '../tools/hook-service/migrate-managed-hooks.mjs';
import { acquireStartupLease, authenticatedListenerPid, ensureUp, listenerPidsFromNetstat, processExists } from '../tools/hook-service/ensure-up.mjs';
import { spawnSync } from 'node:child_process';
import { runManagedHook } from '../tools/hook-service/client.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hook-service-'));
  await mkdir(join(root, 'tools', 'hook-service'), { recursive: true });
  await writeFile(join(root, 'allow.mjs'), 'process.stdout.write(JSON.stringify({additionalContext:"allow"}));');
  await writeFile(join(root, 'plain.mjs'), 'process.stdout.write("context");');
  await writeFile(join(root, 'deny.mjs'), 'process.stdout.write("blocked"); process.exit(2);');
  await writeFile(join(root, 'stop-a.mjs'), 'process.stdout.write(JSON.stringify({additionalContext:"stop-a"}));');
  await writeFile(join(root, 'stop-b.mjs'), 'process.stdout.write(JSON.stringify({additionalContext:"stop-b"}));');
  await writeFile(join(root, 'tools', 'hook-service', 'registry.json'), JSON.stringify({ version: 1, routes: {
    'SessionStart/0/0': { target: 'plain.mjs', event: 'SessionStart', timeout: 1 },
    'PreToolUse/0/0': { target: 'deny.mjs', event: 'PreToolUse', timeout: 1 },
    'UserPromptSubmit/0/0': { target: 'allow.mjs', event: 'UserPromptSubmit', timeout: 1 },
    'Stop/0/0': { target: 'stop-a.mjs', event: 'Stop', timeout: 1 },
    'Stop/1/0': { target: 'stop-b.mjs', event: 'Stop', timeout: 1 },
  }}));
  return root;
}

async function withService(run) {
  const root = await fixture();
  const server = await startServer({ pluginRoot: root, token: 'secret', port: 0 });
  const port = server.address().port;
  try { await run(`http://127.0.0.1:${port}`); } finally { await new Promise(resolveClose => server.close(resolveClose)); await rm(root, { recursive: true, force: true }); }
}

const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('HS_01: health and registration require the token', async () => {
  await withService(async base => {
    const rejectedHealth = await fetch(`${base}/health`);
    assert.equal(rejectedHealth.status, 401);
    const health = await fetch(`${base}/health`, { headers: { 'x-dev-pomogator-token': 'secret' } });
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.service, 'dev-pomogator-hook-service');
    assert.equal(body.version, '1.0.0');
    assert.equal(body.pid, process.pid);
    assert.equal(body.tokenFingerprint, '2bb80d537b1d');
    assert.match(body.rootFingerprint, /^[a-f0-9]{12}$/);
    assert.match(body.registryDigest, /^[a-f0-9]{64}$/);
    assert.match(body.runtimeDigest, /^[a-f0-9]{64}$/);
    const unauthorized = await post(`${base}/v1/register`, { session_id: 's1' });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: 'unauthorized' });
  });
});

test('HS_02: every dispatch authenticates independently without session state', async () => {
  await withService(async base => {
    const rejected = await post(`${base}/v1/dispatch/UserPromptSubmit%2F0%2F0`, { session_id: 's1' });
    assert.equal(rejected.status, 401);
    assert.deepEqual(await rejected.json(), { error: 'unauthorized' });
    const dispatched = await post(`${base}/v1/dispatch/UserPromptSubmit%2F0%2F0`, { session_id: 's1' }, { 'x-dev-pomogator-token': 'secret' });
    assert.equal(dispatched.status, 200);
    assert.deepEqual(await dispatched.json(), { additionalContext: 'allow' });
  });
});

test('HS_03: hook output maps plaintext and exit 2 to event-valid JSON', async () => {
  await withService(async base => {
    const sessionStart = await post(`${base}/v1/dispatch/SessionStart%2F0%2F0`, { session_id: 's1' }, { 'x-dev-pomogator-token': 'secret' });
    assert.equal(sessionStart.status, 200);
    assert.deepEqual(await sessionStart.json(), { additionalContext: 'context' });
    const denied = await post(`${base}/v1/dispatch/PreToolUse%2F0%2F0`, { session_id: 's1' }, { 'x-dev-pomogator-token': 'secret' });
    assert.equal(denied.status, 200);
    assert.deepEqual(await denied.json(), { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'blocked' } });
  });
});

test('HS_04: target validation rejects traversal and Windows sibling-prefix escapes', () => {
  assert.equal(isWithinRoot('/repo/plugin', 'tools/hook.mjs'), true);
  assert.equal(isWithinRoot('/repo/plugin', '../outside.mjs'), false);
  assert.equal(isWithinRoot(String.raw`C:\repo\plugin`, String.raw`tools\hook.mjs`), true);
  assert.equal(isWithinRoot(String.raw`C:\repo\plugin`, String.raw`C:\repo\plugin-evil\hook.mjs`), false);
});

test('HS_05: generated manifest keeps one bootstrap and supervises every remaining route', async () => {
  const root = resolve(import.meta.dirname, '..');
  const manifest = await renderHttpManifest(root);
  const sessionHooks = manifest.hooks.SessionStart.flatMap(group => group.hooks);
  const otherHooks = Object.entries(manifest.hooks).filter(([event]) => event !== 'SessionStart').flatMap(([, groups]) => groups.flatMap(group => group.hooks));
  assert.equal(sessionHooks.length, 16);
  assert.equal(otherHooks.length, 27);
  assert.equal(manifest.hooks.Stop.length, 1);
  assert.equal(manifest.hooks.Stop[0].hooks.length, 1);
  assert.equal(manifest.hooks.Stop[0].hooks[0].command.includes('Stop/all'), true);
  assert.equal(otherHooks.every(hook => hook.type === 'command' && hook.command.includes('/tools/hook-service/client.mjs') && !hook.command.includes('127.0.0.1:42619')), true);
  const generated = JSON.parse(await readFile(join(root, '.claude-plugin', 'hooks.json'), 'utf8'));
  assert.equal(generated.hooks.SessionStart.flatMap(group => group.hooks).length, 1);
  assert.equal(generated.hooks.SessionStart[0].hooks[0].command.includes('session-bootstrap.mjs'), true);
  await access(join(root, 'tools', 'hook-service', 'client.mjs'));
});


async function migrationFixture(settings = { hooks: { PreToolUse: [{ hooks: [{ command: 'user-hook' }, { command: 'tools/hook-service/session-bootstrap.mjs' }] }] } }) {
  const root = await mkdtemp(join(tmpdir(), 'hook-migration-'));
  const settingsPath = join(root, '.claude', 'settings.local.json');
  await mkdir(dirname(settingsPath), { recursive: true });
  await mkdir(join(root, 'tools', 'hook-service'), { recursive: true });
  await writeFile(join(root, 'tools', 'hook-service', 'registry.json'), JSON.stringify({ version: 1, routes: {} }));
  await writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  return { root, settingsPath };
}

test('HS_06: migration preserves user hooks and leaves no journal after a successful byte-CAS update', async () => {
  const { root, settingsPath } = await migrationFixture();
  try {
    const result = await migrateManagedHooks({ root, settingsPath, healthCheck: async () => {}, generatedHooks: {} });
    assert.equal(result.changed, true);
    const migrated = JSON.parse(await readFile(settingsPath, 'utf8'));
    assert.deepEqual(migrated.hooks.PreToolUse, [{ hooks: [{ command: 'user-hook' }] }]);
    await assert.rejects(access(result.journalPath));
    await assert.rejects(access(result.snapshotPath));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HS_07: migration detects a settings collision without overwriting newer user bytes', async () => {
  const { root, settingsPath } = await migrationFixture();
  try {
    await assert.rejects(
      migrateManagedHooks({
        root, settingsPath, healthCheck: async () => {}, generatedHooks: {},
        atomicWriter: async (path, content) => {
          if (path.endsWith('.dev-pomogator-hook-journal.json')) await writeFile(settingsPath, '{"hooks":{"PreToolUse":[{"hooks":[{"command":"new-user-hook"}]}]}}\n');
          await writeFile(path, content);
        },
      }),
      HookMigrationCollisionError,
    );
    assert.equal((await readFile(settingsPath, 'utf8')).includes('new-user-hook'), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HS_08: --fix recovery rolls back only an interrupted dev-pomogator journal with exact hashes', async () => {
  const { root, settingsPath } = await migrationFixture();
  try {
    let failSettingsWrite = true;
    await assert.rejects(migrateManagedHooks({
      root, settingsPath, healthCheck: async () => {}, generatedHooks: {},
      atomicWriter: async (path, content) => {
        if (path === settingsPath && failSettingsWrite) { failSettingsWrite = false; await writeFile(path, content); throw new Error('interrupted'); }
        await writeFile(path, content);
      },
    }));
    const pending = await recoverManagedHooks({ settingsPath });
    assert.equal(pending.fixRequired, true);
    const fixed = await recoverManagedHooks({ settingsPath, fix: true });
    assert.equal(fixed.recovered, true);
    assert.equal((await readFile(settingsPath, 'utf8')).includes('tools/hook-service/session-bootstrap.mjs'), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HS_10: concurrent startup lease elects one owner and waiters observe readiness', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hook-service-lease-'));
  const lockPath = join(root, 'startup.lock');
  let ready = false;
  let ownerCount = 0;
  let first;
  try {
    const contenders = Array.from({ length: 8 }, async () => {
      const lease = await acquireStartupLease({ lockPath, isReady: async () => ready, waitMs: 1_000, pollMs: 10 });
      if (lease.acquired) {
        first = lease;
        ownerCount += 1;
        await new Promise(resolveWait => setTimeout(resolveWait, 80));
        ready = true;
        await lease.release();
      }
      return lease;
    });
    const results = await Promise.all(contenders);
    assert.equal(results.filter(result => result.acquired).length, 1);
    assert.equal(ownerCount, 1);
    assert.equal(results.filter(result => result.ready).length, 7);
    await assert.rejects(access(lockPath));
  } finally {
    await first?.release();
    await rm(root, { recursive: true, force: true });
  }
});

test('HS_11: startup lease reclaims a lock whose owner process is dead', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hook-service-dead-lease-'));
  const lockPath = join(root, 'startup.lock');
  try {
    await writeFile(lockPath, JSON.stringify({ schema: 1, ownerId: 'dead-owner', pid: 999_999_999 }));
    const lease = await acquireStartupLease({ lockPath, isReady: async () => false, waitMs: 500, pollMs: 10 });
    assert.equal(lease.acquired, true);
    assert.equal(lease.reclaimed, true);
    await lease.release();
    await assert.rejects(access(lockPath));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('HS_09: recovery refuses a journal whose settings were changed after interruption', async () => {
  const { root, settingsPath } = await migrationFixture();
  try {
    let failSettingsWrite = true;
    await assert.rejects(migrateManagedHooks({
      root, settingsPath, healthCheck: async () => {}, generatedHooks: {},
      atomicWriter: async (path, content) => {
        if (path === settingsPath && failSettingsWrite) { failSettingsWrite = false; await writeFile(path, content); throw new Error('interrupted'); }
        await writeFile(path, content);
      },
    }));
    await writeFile(settingsPath, '{"hooks":{"PreToolUse":[{"hooks":[{"command":"post-interruption-user"}]}]}}\n');
    await assert.rejects(recoverManagedHooks({ settingsPath, fix: true }), HookMigrationCollisionError);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('HS_12: authenticated orphan recovery requires stable health and listener PID proof', async () => {
  const pids = [8820, 8820];
  let probes = 0;
  const recovered = await authenticatedListenerPid({
    observed: { owned: true, current: false },
    probe: async () => { probes += 1; return { owned: true, current: false }; },
    resolveListenerPid: async () => pids.shift() ?? null,
  });
  assert.equal(recovered, 8820);
  assert.equal(probes, 1);

  assert.equal(await authenticatedListenerPid({
    observed: { owned: false, current: false },
    probe: async () => ({ owned: true, current: false }),
    resolveListenerPid: async () => 8820,
  }), null);
  assert.equal(await authenticatedListenerPid({
    observed: { owned: true, current: false },
    probe: async () => ({ owned: true, current: false }),
    resolveListenerPid: (() => { const changed = [8820, 9900]; return async () => changed.shift() ?? null; })(),
  }), null);
  assert.equal(await authenticatedListenerPid({
    observed: { owned: true, current: false, pid: 7000 },
    probe: async () => ({ owned: true, current: false, pid: 7000 }),
    resolveListenerPid: async () => 8820,
  }), null);
});

test('HS_13: Windows netstat parser returns only the unique configured loopback owner', () => {
  const output = [
    '  TCP    127.0.0.1:42619      0.0.0.0:0      LISTENING       8820',
    '  TCP    127.0.0.1:42619      127.0.0.1:53122 ESTABLISHED     8820',
    '  TCP    127.0.0.1:53122      127.0.0.1:42619 ESTABLISHED     7777',
    '  TCP    127.0.0.1:42620      0.0.0.0:0      LISTENING       9900',
  ].join('\r\n');
  assert.deepEqual(listenerPidsFromNetstat(output, '127.0.0.1', 42619), [8820]);
  assert.deepEqual(listenerPidsFromNetstat(`${output}\r\n  TCP 127.0.0.1:42619 0.0.0.0:0 LISTENING 9900`, '127.0.0.1', 42619), [8820, 9900]);
});

test('HS_14: an EPERM ownership probe means the PID is alive, not absent', () => {
  assert.equal(processExists(8820, () => { const error = new Error('denied'); error.code = 'EPERM'; throw error; }), true);
  assert.equal(processExists(8820, () => { const error = new Error('missing'); error.code = 'ESRCH'; throw error; }), false);
});

test('HS_15: startup publishes and reuses an OS-assigned loopback port through service state', async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), 'hook-service-dynamic-state-'));
  const previousStateRoot = process.env.DEV_POMOGATOR_STATE_DIR;
  let state;
  try {
    process.env.DEV_POMOGATOR_STATE_DIR = stateRoot;
    await writeFile(join(stateRoot, 'service.json'), '{malformed');
    const pluginRoot = resolve(import.meta.dirname, '..');
    const first = await ensureUp(pluginRoot);
    assert.equal(first.ready, true);
    assert.equal(Number.isInteger(first.port) && first.port > 0, true);
    state = JSON.parse(await readFile(join(stateRoot, 'service.json'), 'utf8'));
    assert.equal(state.port, first.port);
    const second = await ensureUp(pluginRoot);
    assert.deepEqual({ ready: second.ready, port: second.port, restarted: second.restarted }, { ready: true, port: first.port, restarted: false });
  } finally {
    if (state?.pid) {
      try { process.kill(state.pid, 'SIGTERM'); } catch { /* already gone */ }
      for (let index = 0; index < 50 && processExists(state.pid); index += 1) await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
    if (previousStateRoot === undefined) delete process.env.DEV_POMOGATOR_STATE_DIR;
    else process.env.DEV_POMOGATOR_STATE_DIR = previousStateRoot;
    await rm(stateRoot, { recursive: true, force: true });
  }
});
