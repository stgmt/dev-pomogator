#!/usr/bin/env node
/**
 * Atomically replace only dev-pomogator-owned hook entries in Claude settings.
 * A journal retains byte hashes so an interrupted migration can be recovered
 * without overwriting a settings file changed by somebody else.
 */
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { renderHttpManifest } from './registry.mjs';

const marker = /(?:tools\/(?:hook-service\/session-bootstrap|_shared\/bootstrap|_shared\/hook-runtime)|hook-runtime\.sh)/i;
const journalVersion = 2;

const hash = content => createHash('sha256').update(content).digest('hex');
const sameBytes = (left, right) => Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right);
const isManaged = hook =>
  (typeof hook?.command === 'string' && marker.test(hook.command)) ||
  (hook?.type === 'http' && typeof hook.url === 'string' && /^http:\/\/127\.0\.0\.1:42619\/v1\/dispatch\//.test(hook.url));

export class HookMigrationCollisionError extends Error {
  constructor(path) {
    super(`settings changed while hook migration was in progress: ${path}`);
    this.name = 'HookMigrationCollisionError';
  }
}

async function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  let handle;
  let completed = false;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, path);
    completed = true;
  } finally {
    await handle?.close().catch(() => {});
    if (!completed) await rm(temporary, { force: true });
  }
}

async function writeCas(path, expected, content, atomicWriter) {
  const actual = await readFile(path);
  if (!sameBytes(actual, expected)) throw new HookMigrationCollisionError(path);
  await atomicWriter(path, content);
}

async function defaultHealthCheck(root) {
  const { ensureUp } = await import('./ensure-up.mjs');
  const service = await ensureUp(root);
  if (!service.ready) throw new Error(`hook service unhealthy: ${service.reason || 'not ready'}`);
  return service;
}

function migrateHooks(existing = {}, generated = {}) {
  const events = new Set([...Object.keys(existing), ...Object.keys(generated)]);
  const result = {};
  for (const event of events) {
    const preserved = (existing[event] ?? []).map(group => ({
      ...group,
      hooks: (group.hooks ?? []).filter(hook => !isManaged(hook)),
    })).filter(group => group.hooks.length > 0);
    const managed = generated[event] ?? [];
    result[event] = [...preserved, ...managed];
  }
  return result;
}

function pathsFor(settingsPath) {
  const resolvedSettings = resolve(settingsPath);
  return {
    settingsPath: resolvedSettings,
    snapshotPath: `${resolvedSettings}.dev-pomogator-hook-snapshot`,
    journalPath: `${resolvedSettings}.dev-pomogator-hook-journal.json`,
  };
}

function parseJournal(content, paths) {
  const journal = JSON.parse(content.toString('utf8'));
  if (journal.version !== journalVersion || journal.owner !== 'dev-pomogator' ||
      journal.settingsPath !== paths.settingsPath || journal.snapshotPath !== paths.snapshotPath ||
      !/^[a-f0-9]{64}$/.test(journal.beforeHash) || !/^[a-f0-9]{64}$/.test(journal.afterHash)) {
    throw new Error(`invalid dev-pomogator hook migration journal: ${paths.journalPath}`);
  }
  return journal;
}

async function cleanup(paths) {
  await rm(paths.journalPath, { force: true });
  await rm(paths.snapshotPath, { force: true });
}

/** Roll back an interrupted migration, but only when exact hashes still match. */
export async function recoverManagedHooks({ settingsPath, fix = false, atomicWriter = atomicWrite } = {}) {
  if (!settingsPath) throw new Error('settingsPath is required');
  const paths = pathsFor(settingsPath);
  let rawJournal;
  try {
    rawJournal = await readFile(paths.journalPath);
  } catch (error) {
    if (error.code === 'ENOENT') return { ...paths, recovered: false, reason: 'no-journal' };
    throw error;
  }
  const journal = parseJournal(rawJournal, paths);
  const snapshot = await readFile(paths.snapshotPath);
  if (hash(snapshot) !== journal.beforeHash) throw new Error(`snapshot hash mismatch: ${paths.snapshotPath}`);
  const current = await readFile(paths.settingsPath);
  const currentHash = hash(current);

  if (currentHash === journal.beforeHash) {
    if (fix) await cleanup(paths);
    return { ...paths, recovered: false, reason: 'already-original' };
  }
  if (currentHash !== journal.afterHash) throw new HookMigrationCollisionError(paths.settingsPath);
  if (!fix) return { ...paths, recovered: false, reason: 'interrupted', fixRequired: true };

  await writeCas(paths.settingsPath, current, snapshot, atomicWriter);
  await cleanup(paths);
  return { ...paths, recovered: true, reason: 'rolled-back' };
}

export async function migrateManagedHooks({
  root = process.cwd(),
  settingsPath = join(root, '.claude', 'settings.local.json'),
  healthCheck = defaultHealthCheck,
  generatedHooks,
  atomicWriter = atomicWrite,
  now = () => new Date().toISOString(),
} = {}) {
  const resolvedRoot = resolve(root);
  const paths = pathsFor(settingsPath);
  // Parse before health checks, snapshots, journals, directories or temporary
  // files. Malformed input is therefore strictly no-write.
  const original = await readFile(paths.settingsPath);
  const settings = JSON.parse(original.toString('utf8'));
  const rendered = generatedHooks ?? (await renderHttpManifest(resolvedRoot)).hooks;
  const generated = generatedHooks ?? {
    ...rendered,
    SessionStart: [{ hooks: [{
      type: 'command',
      command: 'node "${CLAUDE_PLUGIN_ROOT:-${CLAUDE_PROJECT_DIR:-.}}/tools/hook-service/session-bootstrap.mjs"',
      timeout: 120,
    }] }],
  };
  const next = { ...settings, hooks: migrateHooks(settings.hooks, generated) };
  const content = Buffer.from(`${JSON.stringify(next, null, 2)}\n`);
  if (sameBytes(content, original)) return { ...paths, changed: false };

  await healthCheck(resolvedRoot);
  await mkdir(dirname(paths.settingsPath), { recursive: true });
  const lockPath = `${paths.settingsPath}.dev-pomogator-hook-migration.lock`;
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new HookMigrationCollisionError(paths.settingsPath);
    throw error;
  }
  try {
  // The snapshot is written from the bytes already parsed, never copyFile(), so
  // it cannot capture a different revision after the initial read.
  await atomicWriter(paths.snapshotPath, original);
  const journal = Buffer.from(`${JSON.stringify({
    version: journalVersion,
    owner: 'dev-pomogator',
    settingsPath: paths.settingsPath,
    snapshotPath: paths.snapshotPath,
    beforeHash: hash(original),
    afterHash: hash(content),
    at: now(),
  })}\n`);
  await atomicWriter(paths.journalPath, journal);
  // A failed CAS leaves the journal intact for explicitly verified --fix recovery.
    await writeCas(paths.settingsPath, original, content, atomicWriter);
    await cleanup(paths);
    return { ...paths, changed: true };
  } finally {
    await lock.close().catch(() => {});
    await rm(lockPath, { force: true });
  }
}

function cliOptions(argv) {
  const flags = new Set(argv.filter(value => value.startsWith('--')));
  const values = argv.filter(value => !value.startsWith('--'));
  if ([...flags].some(flag => !['--fix', '--dogfood', '--user'].includes(flag))) throw new Error('usage: migrate-managed-hooks.mjs [root] [settingsPath] [--fix] [--dogfood|--user]');
  if (flags.has('--dogfood') && flags.has('--user')) throw new Error('--dogfood and --user cannot be combined');
  const root = resolve(values[0] || process.cwd());
  const settingsPath = flags.has('--user') ? join(homedir(), '.claude', 'settings.json')
    : flags.has('--dogfood') ? join(root, '.claude', 'settings.json')
      : values[1] || join(root, '.claude', 'settings.local.json');
  return { root, settingsPath, fix: flags.has('--fix') };
}

if (import.meta.main) {
  try {
    const options = cliOptions(process.argv.slice(2));
    const result = options.fix
      ? await recoverManagedHooks(options)
      : await migrateManagedHooks(options);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`hook migration failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
