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

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface DefinitionLocation {
  uri: string;
  range: LspRange;
}

export interface DefinitionResult {
  definitions: DefinitionLocation[];
}

interface LspResponse {
  id?: number;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface LspSession {
  request<T>(method: string, params: unknown, timeoutMs: number): Promise<T>;
  notify(method: string, params: unknown): void;
  close(): void;
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

function spawnLspSession(opts: {
  binaryPath: string;
  workspaceDir: string;
  timeoutMs: number;
}): Promise<{ session: LspSession; initialize: InitializeResult }> {
  const cwd = opts.workspaceDir;
  const env = { ...process.env, DEV_POMOGATOR_MARKSMAN_BIN: opts.binaryPath, CLAUDE_PROJECT_DIR: cwd };
  const child = spawn(process.execPath, [launcherPath(), 'server'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    cwd,
  });
  let stderr = '';
  let nextId = 1;
  let buf = Buffer.alloc(0);
  let closed = false;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let rejectSession!: (error: Error) => void;
  const sessionFailure = new Promise<never>((_, reject) => { rejectSession = reject; });
  const send = (msg: unknown): void => {
    const body = JSON.stringify(msg);
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    const error = new Error(`Marksman session closed; stderr: ${stderr.slice(0, 2000)}`);
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
    try { child.kill(); } catch { /* already gone */ }
  };
  child.stdout.on('data', (d: Buffer) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const headerEnd = buf.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = buf.slice(0, headerEnd).toString('utf8');
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) break;
      const len = Number(match[1]);
      const start = headerEnd + 4;
      if (buf.length < start + len) break;
      const json = JSON.parse(buf.slice(start, start + len).toString('utf8')) as LspResponse;
      buf = buf.slice(start + len);
      if (typeof json.id !== 'number') continue;
      const waiter = pending.get(json.id);
      if (!waiter) continue;
      pending.delete(json.id);
      if (json.error) waiter.reject(new Error(`LSP ${json.error.code ?? 'error'}: ${json.error.message ?? 'request failed'}`));
      else waiter.resolve(json.result);
    }
  });
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
  child.on('error', rejectSession);
  child.on('exit', (code) => rejectSession(new Error(`launcher exited (code ${code}); stderr: ${stderr.slice(0, 2000)}`)));
  const request = <T>(method: string, params: unknown, timeoutMs: number): Promise<T> => {
    const id = nextId++;
    const response = new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      send({ jsonrpc: '2.0', id, method, params });
    });
    return Promise.race([
      response,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${method} timed out after ${timeoutMs}ms; stderr: ${stderr.slice(0, 2000)}`)), timeoutMs)),
      sessionFailure,
    ]);
  };
  const session: LspSession = { request, notify: (method, params) => send({ jsonrpc: '2.0', method, params }), close };
  const rootUri = pathToFileURL(cwd).href;
  return session.request<InitializeResult>('initialize', {
    processId: process.pid,
    clientInfo: { name: 'lsp-probe', version: '0' },
    rootUri,
    capabilities: { workspace: { workspaceFolders: true } },
    workspaceFolders: [{ uri: rootUri, name: 'repo' }],
  }, opts.timeoutMs).then((result) => ({ session, initialize: { capabilities: result.capabilities ?? {} } }));
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
  return spawnLspSession({
    binaryPath: opts.binaryPath,
    workspaceDir: opts.workspaceDir,
    timeoutMs: opts.timeoutMs ?? 12000,
  }).then(({ session, initialize }) => {
    session.close();
    return initialize;
  });
}

export function probeDefinition(opts: {
  binaryPath: string;
  workspaceDir: string;
  documentPath: string;
  position: LspPosition;
  timeoutMs?: number;
}): Promise<DefinitionResult> {
  const timeoutMs = opts.timeoutMs ?? 12000;
  return spawnLspSession({ binaryPath: opts.binaryPath, workspaceDir: opts.workspaceDir, timeoutMs }).then(async ({ session }) => {
    try {
      const uri = pathToFileURL(opts.documentPath).href;
      const text = fs.readFileSync(opts.documentPath, 'utf8');
      session.notify('initialized', {});
      session.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: 'markdown', version: 1, text },
      });
      const raw = await session.request<unknown>('textDocument/definition', {
        textDocument: { uri },
        position: opts.position,
      }, timeoutMs);
      const locations = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return {
        definitions: locations.map((value) => {
          const location = value as { uri?: string; targetUri?: string; range?: LspRange; targetRange?: LspRange };
          return { uri: location.uri ?? location.targetUri ?? '', range: location.range ?? location.targetRange! };
        }),
      };
    } finally {
      session.close();
    }
  });
}
