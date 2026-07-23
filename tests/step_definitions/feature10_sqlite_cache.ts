import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openDatabase, openDatabaseWithRecovery, SCHEMA_VERSION, type RecoveryResult } from '../../tools/spec-mcp-server/sqlite/wrapper.ts';
import { startLifecycle, type LifecycleHandle } from '../../tools/spec-mcp-server/lifecycle.ts';
import { V4World } from '../hooks/before-after.ts';

interface SqliteCacheWorld extends V4World {
  recovery?: RecoveryResult;
  firstLifecycle?: LifecycleHandle;
  secondLifecycle?: LifecycleHandle;
  persistedNodeId?: string;
}

Given('an opt-in SQLite graph cache stamped with an obsolete schema version', async function (this: SqliteCacheWorld) {
  fs.writeFileSync(path.join(this.tempDir, '.spec-config.json'), JSON.stringify({ storage: { sqlite_enabled: true } }));
  const handle = await openDatabase({ repoRoot: this.tempDir });
  assert.equal(handle.backend.available, true, 'real Docker BDD must load better-sqlite3');
  handle.backend.prepare('UPDATE meta SET value=? WHERE key=?').run(String(SCHEMA_VERSION - 1), 'schema_version');
  handle.backend.prepare('INSERT INTO nodes(id,type,file,line,json) VALUES(?,?,?,?,?)').run('stale:FR-1', 'FR', 'FR.md', 1, '{}');
  handle.backend.close();
});

When('the MCP lifecycle opens the SQLite cache with recovery', async function (this: SqliteCacheWorld) {
  this.recovery = await openDatabaseWithRecovery({ repoRoot: this.tempDir, now: new Date('2026-07-23T20:00:00Z') });
});

Then('the stale cache is quarantined with reason schema_mismatch', function (this: SqliteCacheWorld) {
  assert.ok(this.recovery, 'recovery result must exist');
  assert.equal(this.recovery.recovered, true);
  assert.equal(this.recovery.reason, 'schema_mismatch');
  assert.equal(path.basename(this.recovery.quarantinedTo!), '.spec-index.sqlite.corrupt-2026-07-23T20-00-00-000Z');
  assert.equal(fs.existsSync(this.recovery.quarantinedTo!), true);
});

Then('a fresh cache uses the current schema and contains no stale nodes', function (this: SqliteCacheWorld) {
  assert.ok(this.recovery, 'recovery result must exist');
  assert.equal(this.recovery.handle.schemaVersion(), 2);
  assert.equal(SCHEMA_VERSION, 2, 'BDD pins the current schema contract');
  const row = this.recovery.handle.backend.prepare('SELECT id FROM nodes WHERE id=?').get('stale:FR-1');
  assert.equal(row, undefined);
  this.recovery?.handle.backend.close();
});

Given('an opt-in SQLite lifecycle builds and persists a spec graph', async function (this: SqliteCacheWorld) {
  fs.writeFileSync(path.join(this.tempDir, '.spec-config.json'), JSON.stringify({ storage: { sqlite_enabled: true } }));
  const specDir = path.join(this.tempDir, '.specs', 'warm-demo');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, 'FR.md'), '# FR-1: Warm cache\n');
  this.firstLifecycle = await startLifecycle({ repoRoot: this.tempDir, lockMode: 'throw' });
  this.persistedNodeId = [...this.firstLifecycle.graph.nodes.keys()].find((id) => id.endsWith(':FR-1'));
  assert.ok(this.persistedNodeId, 'cold lifecycle must build the real graph');
  assert.equal(this.firstLifecycle.cache?.warm, false);
  await this.firstLifecycle.shutdown();
  this.firstLifecycle = undefined;
});

When('a second MCP lifecycle starts over the unchanged repository', async function (this: SqliteCacheWorld) {
  this.secondLifecycle = await startLifecycle({ repoRoot: this.tempDir, lockMode: 'throw' });
});

Then('the second lifecycle reports a warm cache and serves the persisted nodes', async function (this: SqliteCacheWorld) {
  assert.equal(this.secondLifecycle?.cache?.warm, true);
  assert.ok(this.secondLifecycle?.graph.nodes.has(this.persistedNodeId!));
  await this.secondLifecycle?.shutdown();
  this.secondLifecycle = undefined;
});
