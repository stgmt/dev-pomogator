import http from 'node:http';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../../.claude/skills/pomogator-doctor/scripts/engine/index.ts';
import { killAllChildren } from '../fixtures/pomogator-doctor/child-registry.ts';
import { buildTempHome } from '../fixtures/pomogator-doctor/temp-home-builder.ts';

const savedProcessEnv = { ...process.env };

function findC17(results: { id: string }[]) {
  return results.find((r) => r.id === 'C17');
}

describe('POMOGATORDOCTOR001 — Meridian proxy health (FR-49)', () => {
  afterEach(async () => {
    process.env = { ...savedProcessEnv };
    await killAllChildren();
  });

  afterAll(async () => {
    await killAllChildren();
  });

  it('POMOGATORDOCTOR001_40: gated out only when judge explicitly disabled + proxy not wired', async () => {
    process.env.CLAIM_GATE_JUDGE = 'false'; // judge off AND temp projectDir has no proxy infra + no .env
    delete process.env.MERIDIAN_URL;
    const home = buildTempHome();
    try {
      const report = await runDoctor({ homeDir: home.homeDir, projectRoot: home.projectDir });
      expect(report.gatedOut.some((g) => g.id === 'C17')).toBe(true);
      expect(report.results.some((r) => r.id === 'C17')).toBe(false);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_43: relevant by default (judge on, parity) — proxy down → warning', async () => {
    delete process.env.CLAIM_GATE_JUDGE; // unset → judge ON by default → Meridian expected → check relevant
    process.env.MERIDIAN_URL = 'http://127.0.0.1:59599'; // nothing listening
    const home = buildTempHome();
    try {
      const report = await runDoctor({ homeDir: home.homeDir, projectRoot: home.projectDir });
      expect(report.gatedOut.some((g) => g.id === 'C17')).toBe(false);
      const c17 = findC17(report.results);
      expect(c17?.severity).toBe('warning');
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_41: opted in + proxy down → warning, never critical (fail-open)', async () => {
    process.env.CLAIM_GATE_JUDGE = 'true';
    process.env.MERIDIAN_URL = 'http://127.0.0.1:59599'; // nothing listening
    const home = buildTempHome();
    try {
      const report = await runDoctor({ homeDir: home.homeDir, projectRoot: home.projectDir });
      const c17 = findC17(report.results);
      expect(c17).toBeDefined();
      expect(c17?.severity).toBe('warning'); // optional infra — must not be critical
      expect(c17?.message).toMatch(/not running|no response|timeout/);
      expect(c17?.hint).toMatch(/proxy-up|claude-subscription-proxy/);
    } finally {
      home.cleanup();
    }
  });

  it('POMOGATORDOCTOR001_42: opted in + proxy up → ok', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ mode: 'passthrough', auth: { loggedIn: true } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    process.env.CLAIM_GATE_JUDGE = 'true';
    process.env.MERIDIAN_URL = `http://127.0.0.1:${port}`;
    const home = buildTempHome();
    try {
      const report = await runDoctor({ homeDir: home.homeDir, projectRoot: home.projectDir });
      const c17 = findC17(report.results);
      expect(c17).toBeDefined();
      expect(c17?.severity).toBe('ok');
      expect(c17?.message).toMatch(/up on .*passthrough/);
    } finally {
      home.cleanup();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
