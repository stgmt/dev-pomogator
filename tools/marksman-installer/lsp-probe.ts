/**
 * Hop-1 e2e probe: drive the native-LSP launcher shim against the REAL Marksman
 * binary and confirm it answers an LSP `initialize` with nav capabilities.
 *
 * This is the automated real-artifact regression guard for FR-7 (replaces the
 * retired bridge e2e). It exercises the full hop-1 chain — `launch-marksman.cjs`
 * resolves the binary (env override → PATH → managed) and execs `marksman
 * server`, then we speak LSP over its stdio. Hop-2 (Claude Code's `LSP` tool
 * surfacing markdown to the agent) needs an authed headless session and lives in
 * AC-7.3 as a documented proof, not the unit suite.
 *
 * The skip-policy semantic of the deleted `skip-policy.ts` is preserved in
 * `decideE2e`: a binary present ⇒ MUST run; absent INSIDE Docker ⇒ hard FAIL
 * (silent-skip would be fake-green per dead-integration-guard); absent on a dev
 * host ⇒ honest skip.
 *
 * @see ./launch-marksman.cjs (the shim under test)
 * @see ./resolve-binary.ts   (binary resolution policy)
 * @see .specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md AC-7.1 / AC-7.3
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type E2eDecision = 'run' | 'skip' | 'fail';

/** True when running inside the Docker test image (entrypoint sets this). */
export function isInDocker(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEV_POMOGATOR_TEST_IN_DOCKER === '1';
}

/**
 * skip-policy semantic (preserved from the retired skip-policy.ts):
 *  - binaryPath present            → 'run'  (always exercise the real binary)
 *  - absent AND inside Docker      → 'fail' (silent-skip = fake-green, forbidden)
 *  - absent on a dev host          → 'skip' (honest — no binary to test)
 */
export function decideE2e(opts: { binaryPath: string | null; inDocker: boolean }): E2eDecision {
  if (opts.binaryPath) return 'run';
  return opts.inDocker ? 'fail' : 'skip';
}

/** Absolute path to the launcher shim spawned by `.lsp.json`. */
export function launcherPath(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'launch-marksman.cjs');
}

export interface InitializeResult {
  capabilities: Record<string, unknown>;
}

/**
 * Create a MINIMAL, isolated Marksman workspace (a temp dir with a `.marksman.toml`
 * marker + one trivial `.md`) and return its path. The probe MUST NOT point
 * Marksman at the real repo — Marksman eagerly indexes the workspace, and the repo
 * (node_modules, worktrees, thousands of `.md`) crashes the Linux build before it
 * answers `initialize`. A tiny workspace is the correct, deterministic fixture.
 * Caller removes it (best-effort) when done.
 */
export function createMarksmanWorkspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'marksman-probe-'));
  fs.writeFileSync(path.join(dir, '.marksman.toml'), '');
  fs.writeFileSync(path.join(dir, 'probe.md'), '# Probe\n\nSee [[Probe]].\n');
  return dir;
}

/**
 * Remove a probe workspace, tolerating the Windows EBUSY race where the just-
 * killed Marksman still holds a handle on the dir. Retries briefly, then gives
 * up silently (it's under os.tmpdir(); the OS reclaims it) — cleanup must never
 * fail the test it follows.
 */
export function removeMarksmanWorkspace(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
    /* best-effort — temp dir, OS will reclaim */
  }
}

/**
 * Spawn `node launch-marksman.cjs server` (the shim resolves + execs the real
 * binary), send an LSP `initialize`, and resolve with the server capabilities.
 * Rejects on spawn error / launcher exit / timeout.
 *
 * `binaryPath` is passed to the shim via `DEV_POMOGATOR_MARKSMAN_BIN` so it
 * resolves the real binary REGARDLESS of `workspaceDir` (separating "which binary"
 * from "which workspace"). `workspaceDir` is the small fixture Marksman indexes.
 */
export function probeInitialize(opts: {
  binaryPath: string;
  workspaceDir: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<InitializeResult> {
  const baseEnv = opts.env ?? process.env;
  const cwd = opts.workspaceDir;
  const env = { ...baseEnv, DEV_POMOGATOR_MARKSMAN_BIN: opts.binaryPath, CLAUDE_PROJECT_DIR: cwd };
  const timeoutMs = opts.timeoutMs ?? 12000;

  return new Promise<InitializeResult>((resolve, reject) => {
    const child = spawn(process.execPath, [launcherPath(), 'server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      cwd,
    });

    let settled = false;
    let stderr = '';
    const done = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      fn();
    };

    const timer = setTimeout(
      () => done(() => reject(new Error(`initialize timed out after ${timeoutMs}ms; stderr: ${stderr.slice(0, 2000)}`))),
      timeoutMs,
    );

    const send = (msg: unknown): void => {
      const body = JSON.stringify(msg);
      child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    };

    let buf = Buffer.alloc(0);
    child.stdout.on('data', (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const headerEnd = buf.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const header = buf.slice(0, headerEnd).toString('utf8');
        const m = /Content-Length:\s*(\d+)/i.exec(header);
        if (!m) break;
        const len = Number(m[1]);
        const start = headerEnd + 4;
        if (buf.length < start + len) break;
        const json = JSON.parse(buf.slice(start, start + len).toString('utf8')) as {
          id?: number;
          result?: { capabilities?: Record<string, unknown> };
        };
        buf = buf.slice(start + len);
        if (json.id === 1 && json.result) {
          done(() => resolve({ capabilities: json.result!.capabilities ?? {} }));
          return;
        }
      }
    });

    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (err) => done(() => reject(err)));
    child.on('exit', (code) =>
      done(() => reject(new Error(`launcher exited (code ${code}) before initialize; stderr: ${stderr.slice(0, 2000)}`))),
    );

    // Use pathToFileURL — NOT string concat. On POSIX, cwd starts with `/`, so
    // `'file:///' + cwd` yields `file:////tmp/...` (malformed, 4 slashes) and
    // Marksman fatal-errors; pathToFileURL produces a correct URI on every OS.
    const rootUri = pathToFileURL(cwd).href;
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        processId: process.pid,
        clientInfo: { name: 'lsp-probe', version: '0' },
        rootUri,
        capabilities: { workspace: { workspaceFolders: true } },
        workspaceFolders: [{ uri: rootUri, name: 'repo' }],
      },
    });
  });
}
