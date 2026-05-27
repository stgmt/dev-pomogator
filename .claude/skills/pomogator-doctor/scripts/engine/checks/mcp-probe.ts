import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { DOCTOR_TIMEOUTS } from '../constants.js';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';
import { readMcpConfigs, type McpServerConfig } from './mcp-parse.js';

const PROBE_TIMEOUT_MS = DOCTOR_TIMEOUTS.PROBE_MS;

interface ProbeOutcome {
  ok: boolean;
  message: string;
  durationMs: number;
}

async function probeStdioServer(cfg: McpServerConfig): Promise<ProbeOutcome> {
  const started = Date.now();
  if (!cfg.command) return { ok: false, message: 'no command defined', durationMs: 0 };

  const child: ChildProcess = spawn(cfg.command, cfg.args ?? [], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...(cfg.env ?? {}) },
  });

  const killAndWait = async (reason: string): Promise<ProbeOutcome> => {
    try {
      if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
    } catch {
      // ignore
    }
    if (child.exitCode === null) {
      await Promise.race([
        once(child, 'exit'),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
    }
    return { ok: false, message: reason, durationMs: Date.now() - started };
  };

  const reader = new Promise<ProbeOutcome>((resolve) => {
    let buffer = '';
    let sawInit = false;
    let sawTools = false;
    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as { id?: number; result?: unknown };
          if (msg.id === 1) sawInit = true;
          if (msg.id === 2) sawTools = true;
          if (sawInit && sawTools) {
            resolve({
              ok: true,
              message: 'initialize + tools/list handshake complete',
              durationMs: Date.now() - started,
            });
          }
        } catch {
          continue;
        }
      }
    });
    child.on('error', (err) =>
      resolve({ ok: false, message: `spawn error: ${err.message}`, durationMs: Date.now() - started }),
    );
    child.on('exit', (code) => {
      if (!sawInit || !sawTools) {
        resolve({
          ok: false,
          message: `server exited (code=${code ?? 'null'}) before handshake complete`,
          durationMs: Date.now() - started,
        });
      }
    });
  });

  child.stdin?.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'pomogator-doctor', version: '1.0.0' },
      },
    }) + '\n',
  );
  child.stdin?.write(
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n',
  );

  const timeout = new Promise<ProbeOutcome>((resolve) => {
    setTimeout(() => resolve({ ok: false, message: 'timeout', durationMs: PROBE_TIMEOUT_MS }), PROBE_TIMEOUT_MS);
  });

  try {
    const outcome = await Promise.race([reader, timeout]);
    if (!outcome.ok) return await killAndWait(outcome.message);
    if (child.exitCode === null) {
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
    return outcome;
  } catch (error) {
    return await killAndWait(`exception: ${(error as Error).message}`);
  }
}

async function probeHttpServer(cfg: McpServerConfig): Promise<ProbeOutcome> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(cfg.url!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, message: `HTTP ${response.status}`, durationMs: Date.now() - started };
    }
    return { ok: true, message: `HTTP ${response.status}`, durationMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      message: (error as Error).name === 'AbortError' ? 'timeout' : (error as Error).message,
      durationMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const mcpProbeCheck: CheckDefinition = {
  id: 'C12',
  fr: 'FR-10',
  name: 'MCP Full probe',
  group: 'needs-external',
  reinstallable: false,
  pool: 'mcp',
  async run(ctx: CheckContext): Promise<CheckResult[]> {
    const configured = readMcpConfigs(ctx);
    if (configured.size === 0) {
      return [
        {
          id: 'C12',
          fr: 'FR-10',
          name: 'MCP Full probe',
          group: 'needs-external',
          severity: 'ok',
          reinstallable: false,
          message: 'no MCP servers configured to probe',
          durationMs: 0,
        },
      ];
    }
    const probes = Array.from(configured.values()).map(async (cfg) => {
      const outcome = cfg.url ? await probeHttpServer(cfg) : await probeStdioServer(cfg);
      return {
        id: `C12:${cfg.name}`,
        fr: 'FR-10',
        name: `MCP probe: ${cfg.name}`,
        group: 'needs-external',
        severity: outcome.ok ? 'ok' : 'critical',
        reinstallable: false,
        message: outcome.ok
          ? outcome.message
          : `probe failed: ${outcome.message} (${outcome.durationMs}ms)`,
        hint: outcome.ok ? undefined : 'Check MCP server logs or restart Claude Code',
        durationMs: outcome.durationMs,
      } as CheckResult;
    });
    return Promise.all(probes);
  },
};
