#!/usr/bin/env node
// Smoke test for chrome-devtools-mcp-mux JSON-RPC handshake.
//
// Spawns the mux binary (default: `npx -y chrome-devtools-mcp-mux@<pinned>`)
// or a test stub (via CDMM_SMOKE_BIN / CDMM_SMOKE_BIN_ARGS env), sends
// `initialize` and `tools/list` requests over stdio, validates responses, and
// exits 0 on success. Used by FR-8 / AC-8 + pomogator-doctor CDMM-3.
//
// IMPORTANT: do not import from anything outside the host node — this script
// runs from the user's installed `.dev-pomogator/tools/...` location and must
// be self-contained.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const PINNED_VERSION = '0.2.2';
const TOTAL_BUDGET_MS = Number(process.env.CDMM_SMOKE_TIMEOUT_MS ?? 30_000);
const PER_STEP_TIMEOUT_MS = 10_000;

const EXPECTED_TOOLS = ['navigate_page', 'take_screenshot', 'list_pages', 'select_page'];

function resolveCommand() {
  const binOverride = process.env.CDMM_SMOKE_BIN;
  if (binOverride) {
    const argsOverride = process.env.CDMM_SMOKE_BIN_ARGS ?? '';
    const args = argsOverride.split(/\s+/).filter(Boolean);
    return { command: binOverride, args };
  }
  return { command: 'npx', args: ['-y', `chrome-devtools-mcp-mux@${PINNED_VERSION}`] };
}

function fail(stepName, detail) {
  console.error(`[smoke-test] FAIL @ ${stepName}: ${detail}`);
  process.exit(1);
}

async function main() {
  const { command, args } = resolveCommand();
  const child = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });

  let stderrBuffer = '';
  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString();
  });
  child.on('error', (err) => {
    fail('spawn', `${err.message}\nstderr: ${stderrBuffer}`);
  });

  // Track child lifecycle so premature exits (binary not found, immediate
  // crash, etc.) reject pending requests instead of waiting for timeout.
  let childAlive = true;
  let childExitCode = null;
  child.on('exit', (code) => {
    childAlive = false;
    childExitCode = code;
    for (const [id, resolver] of pendingResponses) {
      pendingResponses.delete(id);
      resolver({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: `child exited with code ${code} before responding\nstderr: ${stderrBuffer}`,
        },
      });
    }
  });

  const totalDeadline = Date.now() + TOTAL_BUDGET_MS;
  const totalTimer = setTimeout(() => {
    child.kill('SIGKILL');
    fail('total-timeout', `exceeded ${TOTAL_BUDGET_MS}ms\nstderr: ${stderrBuffer}`);
  }, TOTAL_BUDGET_MS);
  totalTimer.unref();

  const stdoutLines = createInterface({ input: child.stdout, terminal: false });
  const pendingResponses = new Map();
  stdoutLines.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object' || parsed.jsonrpc !== '2.0' || parsed.id == null) {
      return;
    }
    const resolver = pendingResponses.get(parsed.id);
    if (resolver) {
      pendingResponses.delete(parsed.id);
      resolver(parsed);
    }
  });

  function send(request) {
    return new Promise((resolve, reject) => {
      if (!childAlive) {
        reject(new Error(`child not alive (exit code ${childExitCode}); stderr: ${stderrBuffer}`));
        return;
      }
      const remaining = totalDeadline - Date.now();
      const stepBudget = Math.max(1, Math.min(PER_STEP_TIMEOUT_MS, remaining));
      const timer = setTimeout(() => {
        pendingResponses.delete(request.id);
        reject(new Error(`per-step timeout ${stepBudget}ms for method=${request.method}`));
      }, stepBudget);
      timer.unref();

      pendingResponses.set(request.id, (response) => {
        clearTimeout(timer);
        if (response.error) {
          reject(new Error(`JSON-RPC error: ${response.error.code} ${response.error.message}`));
        } else {
          resolve(response.result);
        }
      });
      try {
        child.stdin.write(JSON.stringify(request) + '\n');
      } catch (err) {
        clearTimeout(timer);
        pendingResponses.delete(request.id);
        reject(new Error(`stdin write failed: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
  }

  let initResult;
  try {
    initResult = await send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'dev-pomogator-smoke-test', version: '1.0' },
      },
    });
  } catch (err) {
    clearTimeout(totalTimer);
    child.kill('SIGTERM');
    fail('initialize', `${err.message}\nstderr: ${stderrBuffer}`);
    return;
  }

  if (!initResult || typeof initResult.protocolVersion !== 'string') {
    clearTimeout(totalTimer);
    child.kill('SIGTERM');
    fail('initialize-response', `missing protocolVersion: ${JSON.stringify(initResult)}`);
    return;
  }

  let toolsResult;
  try {
    toolsResult = await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  } catch (err) {
    clearTimeout(totalTimer);
    child.kill('SIGTERM');
    fail('tools/list', `${err.message}\nstderr: ${stderrBuffer}`);
    return;
  }

  const toolNames = Array.isArray(toolsResult?.tools)
    ? toolsResult.tools.map((t) => t?.name).filter((n) => typeof n === 'string')
    : [];
  const matched = toolNames.some((n) => EXPECTED_TOOLS.includes(n));
  clearTimeout(totalTimer);
  child.kill('SIGTERM');

  if (!matched) {
    fail('tools/list-response', `expected one of ${EXPECTED_TOOLS.join(',')} got ${toolNames.join(',') || '(none)'}\nstderr: ${stderrBuffer}`);
    return;
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    protocolVersion: initResult.protocolVersion,
    matchedTools: toolNames.filter((n) => EXPECTED_TOOLS.includes(n)),
  }) + '\n');
  process.exit(0);
}

main().catch((err) => {
  fail('main', err instanceof Error ? err.message : String(err));
});
