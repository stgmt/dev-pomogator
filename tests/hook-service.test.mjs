import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { isWithinRoot, startServer } from '../tools/hook-service/server.mjs';
import { renderHttpManifest } from '../tools/hook-service/registry.mjs';
import { HookMigrationCollisionError, migrateManagedHooks, recoverManagedHooks } from '../tools/hook-service/migrate-managed-hooks.mjs';
import { spawnSync } from 'node:child_process';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hook-service-'));
  await mkdir(join(root, 'tools', 'hook-service'), { recursive: true });
  await writeFile(join(root, 'allow.mjs'), 'process.stdout.write(JSON.stringify({additionalContext:"allow"}));');
  await writeFile(join(root, 'plain.mjs'), 'process.stdout.write("context");');
  await writeFile(join(root, 'deny.mjs'), 'process.stdout.write("blocked"); process.exit(2);');
  await writeFile(join(root, 'tools', 'hook-service', 'registry.json'), JSON.stringify({ version: 1, routes: {
    'SessionStart/0/0': { target: 'plain.mjs', event: 'SessionStart', timeout: 1 },
    'PreToolUse/0/0': { target: 'deny.mjs', event: 'PreToolUse', timeout: 1 },
    'UserPromptSubmit/0/0': { target: 'allow.mjs', event: 'UserPromptSubmit', timeout: 1 },
  }}));
  return root;
}

async function withService(run) {
  const root = await fixture();
  const server = await startServer({ pluginRoot: root, port: 0 });
  const port = server.address().port;
  try { await run(`http://127.0.0.1:${port}`); } finally { await new Promise(resolveClose => server.close(resolveClose)); await rm(root, { recursive: true, force: true }); }
}

const post = (url, body, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('HS_01: loopback health and registration require no bearer credential', async () => {
  await withService(async base => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    const body = await health.json();
    assert.equal(body.service, 'dev-pomogator-hook-service');
    assert.equal(body.version, '1.0.0');
    assert.match(body.serviceId, /^1\.0\.0-[a-f0-9]{16}-[a-f0-9]{16}$/);
    assert.match(body.rootDigest, /^[a-f0-9]{16}$/);
    assert.match(body.registryDigest, /^[a-f0-9]{16}$/);
    const registered = await post(`${base}/v1/register`, { session_id: 's1' });
    assert.equal(registered.status, 200);
    assert.deepEqual(await registered.json(), { registered: true });
  });
});

test('HS_02: approved loopback dispatch requires no session credential', async () => {
  await withService(async base => {
    const dispatched = await post(`${base}/v1/dispatch/UserPromptSubmit%2F0%2F0`, { session_id: 's1' });
    assert.equal(dispatched.status, 200);
    assert.deepEqual(await dispatched.json(), { additionalContext: 'allow' });
  });
});

test('HS_03: hook output maps plaintext and exit 2 to event-valid JSON', async () => {
  await withService(async base => {
    const sessionStart = await post(`${base}/v1/dispatch/SessionStart%2F0%2F0`, { session_id: 's1' });
    assert.equal(sessionStart.status, 200);
    assert.deepEqual(await sessionStart.json(), { additionalContext: 'context' });
    const denied = await post(`${base}/v1/dispatch/PreToolUse%2F0%2F0`, { session_id: 's1' });
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

test('HS_05: generated manifest keeps one bootstrap and exposes every remaining route over HTTP', async () => {
  const root = resolve(import.meta.dirname, '..');
  const manifest = await renderHttpManifest(root);
  const sessionHooks = manifest.hooks.SessionStart.flatMap(group => group.hooks);
  const otherHooks = Object.entries(manifest.hooks).filter(([event]) => event !== 'SessionStart').flatMap(([, groups]) => groups.flatMap(group => group.hooks));
  assert.equal(sessionHooks.length, 14);
  assert.equal(otherHooks.length, 39);
  assert.equal(otherHooks.every(hook => hook.type === 'http' && hook.url.startsWith('http://127.0.0.1:42619/v1/dispatch/') && hook.headers === undefined && hook.allowedEnvVars === undefined), true);
  const generated = JSON.parse(await readFile(join(root, '.claude-plugin', 'hooks.json'), 'utf8'));
  assert.equal(generated.hooks.SessionStart.flatMap(group => group.hooks).length, 1);
  assert.equal(generated.hooks.SessionStart[0].hooks[0].command.includes('session-bootstrap.mjs'), true);
  await assert.rejects(access(join(root, 'tools', 'hook-service', 'client.mjs')));
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
