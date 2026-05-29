/**
 * Tests for the LLM-as-judge orchestrator (Phase 3, FR-8 + FR-26).
 *
 * The subprocess is fully injectable — these tests cover the decision tree
 * deterministically:
 *
 *   • opt-out short-circuits without scanning OR spawning
 *   • cache hit returns the prior verdict
 *   • deny-list intercepts secrets BEFORE spawn (FR-26)
 *   • happy path: spawn → parse JSON → write cache → return verdict
 *   • subprocess failure paths surface as `SUBPROCESS_FAILED`
 *   • buildPrompt + cacheKey are deterministic
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { runJudge, buildPrompt } from '../index.ts';
import { checkDenyList, listPatterns } from '../deny-list.ts';
import { cacheKey, readEntry, writeEntry } from '../cache.ts';

describe('checkDenyList — FR-26 patterns', () => {
  it('flags `API_KEY = …`', () => {
    expect(checkDenyList('API_KEY=sk-test123').denied).toBe(true);
  });
  it('flags `Authorization: Bearer …`', () => {
    expect(checkDenyList('Authorization: Bearer eyJabc.def.ghi').denied).toBe(true);
  });
  it('flags `.env` path', () => {
    expect(checkDenyList('see config/.env for the values').denied).toBe(true);
  });
  it('flags `.pem` filename', () => {
    expect(checkDenyList('cert at /etc/ssl/server.pem').denied).toBe(true);
  });
  it('flags AWS-key-shape strings', () => {
    expect(checkDenyList('AKIAIOSFODNN7EXAMPLE used').denied).toBe(true);
  });
  it('flags PEM private-key block markers', () => {
    expect(checkDenyList('-----BEGIN RSA PRIVATE KEY-----').denied).toBe(true);
  });
  it('passes safe spec text', () => {
    const safe = 'FR-1: Login flow. Scenario: user enters email and password (treated as data, not credential).';
    expect(checkDenyList(safe).denied).toBe(false);
  });
  it('exposes its full pattern list for documentation', () => {
    expect(listPatterns().length).toBeGreaterThan(0);
  });
});

describe('cacheKey — deterministic', () => {
  it('returns the same hash for identical inputs', () => {
    expect(cacheKey('a', 'b')).toBe(cacheKey('a', 'b'));
  });
  it('returns a different hash when inputs differ', () => {
    expect(cacheKey('a', 'b')).not.toBe(cacheKey('a', 'c'));
  });
  it('is order-sensitive (FR vs Scenario)', () => {
    expect(cacheKey('a', 'b')).not.toBe(cacheKey('b', 'a'));
  });
});

describe('runJudge — decision tree', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `llm-judge-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const SAFE_FR = 'FR-1: User can log in with email and password.';
  const SAFE_SCEN = 'Scenario: Login OK\n  Given a registered user\n  When they submit credentials\n  Then they reach /home';

  it('opt-out short-circuits — never spawns, never writes', async () => {
    let spawnCalled = false;
    const r = await runJudge({
      repoRoot: root,
      frId: 'FR-1',
      frText: SAFE_FR,
      scenarioId: 'SCEN-login-ok',
      scenarioText: SAFE_SCEN,
      spec_llm_judge_deny: true,
      spawn: async () => {
        spawnCalled = true;
        return '{}';
      },
    });
    expect(r.result).toBe('SKIPPED_OPT_OUT');
    expect(spawnCalled).toBe(false);
  });

  it('deny-list intercepts before spawn — FR-26', async () => {
    let spawnCalled = false;
    const r = await runJudge({
      repoRoot: root,
      frId: 'FR-2',
      frText: 'FR-2: System uses API_KEY=sk-test123 for authentication.',
      scenarioId: 'SCEN-2',
      scenarioText: SAFE_SCEN,
      spawn: async () => {
        spawnCalled = true;
        return '{"result":"NO_DRIFT_DETECTED"}';
      },
    });
    expect(r.result).toBe('SKIPPED_DENY_LIST');
    expect(r.deny_pattern).toBeDefined();
    expect(spawnCalled).toBe(false);
  });

  it('happy path: spawn → JSON parse → cache write → return verdict', async () => {
    let spawnCallCount = 0;
    const r = await runJudge({
      repoRoot: root,
      frId: 'FR-1',
      frText: SAFE_FR,
      scenarioId: 'SCEN-login-ok',
      scenarioText: SAFE_SCEN,
      spawn: async () => {
        spawnCallCount++;
        return '{"result":"NO_DRIFT_DETECTED"}';
      },
    });
    expect(r.result).toBe('NO_DRIFT_DETECTED');
    expect(r.from_cache).toBe(false);
    expect(spawnCallCount).toBe(1);
    // Cache entry was written.
    expect(readEntry(root, r.cache_key)).toBeDefined();
  });

  it('cache hit on second call — no second spawn', async () => {
    let spawnCallCount = 0;
    const args = {
      repoRoot: root,
      frId: 'FR-1',
      frText: SAFE_FR,
      scenarioId: 'SCEN-1',
      scenarioText: SAFE_SCEN,
      spawn: async () => {
        spawnCallCount++;
        return '{"result":"NO_DRIFT_DETECTED"}';
      },
    };
    await runJudge(args);
    const r2 = await runJudge(args);
    expect(spawnCallCount).toBe(1);
    expect(r2.from_cache).toBe(true);
    expect(r2.result).toBe('CACHE_HIT');
  });

  it('DRIFT verdict survives the cache round-trip', async () => {
    const args = {
      repoRoot: root,
      frId: 'FR-9',
      frText: 'FR-9: Logout clears every session token.',
      scenarioId: 'SCEN-9',
      scenarioText: 'Scenario: Login\n  Given a user',
      spawn: async () => '{"result":"DRIFT","explanation":"Scenario tests Login but FR is about Logout.","severity":"warning"}',
    };
    const r1 = await runJudge(args);
    expect(r1.result).toBe('DRIFT');
    expect(r1.explanation).toContain('Logout');
    expect(r1.severity).toBe('warning');
    const r2 = await runJudge(args);
    expect(r2.result).toBe('DRIFT');
    expect(r2.from_cache).toBe(true);
  });

  it('SUBPROCESS_FAILED on unparseable JSON', async () => {
    const r = await runJudge({
      repoRoot: root,
      frId: 'FR-1',
      frText: SAFE_FR,
      scenarioId: 'SCEN-1',
      scenarioText: SAFE_SCEN,
      spawn: async () => 'not-json-at-all',
    });
    expect(r.result).toBe('SUBPROCESS_FAILED');
    expect(r.error).toContain('unparseable');
  });

  it('SUBPROCESS_FAILED when spawn throws', async () => {
    const r = await runJudge({
      repoRoot: root,
      frId: 'FR-1',
      frText: SAFE_FR,
      scenarioId: 'SCEN-1',
      scenarioText: SAFE_SCEN,
      spawn: async () => { throw new Error('claude binary not on PATH'); },
    });
    expect(r.result).toBe('SUBPROCESS_FAILED');
    expect(r.error).toMatch(/binary/);
  });
});

describe('buildPrompt', () => {
  it('includes both FR and Scenario text under clear delimiters', () => {
    const p = buildPrompt('FR-1: X', 'Scenario: Y');
    expect(p).toContain('--- FR ---');
    expect(p).toContain('--- Scenario ---');
    expect(p).toContain('FR-1: X');
    expect(p).toContain('Scenario: Y');
  });

  it('asks for JSON without prose / markdown fences', () => {
    expect(buildPrompt('a', 'b')).toMatch(/single JSON object/);
  });
});

describe('cache lower-level — direct read/write', () => {
  let root: string;
  beforeEach(() => {
    root = path.join(os.tmpdir(), `llm-cache-${randomUUID()}`);
    fs.mkdirSync(root, { recursive: true });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('write then read returns the same entry', () => {
    const k = cacheKey('fr', 'sc');
    writeEntry(root, k, {
      fr_id: 'FR-1',
      scenario_id: 'SCEN-1',
      verdict: { result: 'NO_DRIFT_DETECTED' },
      generated_at: new Date('2026-05-29T00:00:00Z').toISOString(),
    });
    const back = readEntry(root, k);
    expect(back?.fr_id).toBe('FR-1');
    expect(back?.verdict.result).toBe('NO_DRIFT_DETECTED');
  });
});
