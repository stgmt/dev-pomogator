// Marksman LSP bridge — FR-7a (spec-generator-v4).
//
// Spawns the downloaded Marksman binary as an LSP server (`marksman server`),
// performs the JSON-RPC/stdio `initialize`/`initialized` handshake, and exposes
// the server's real capabilities. `stop()` sends `shutdown`/`exit` and kills the
// child. This is the missing runtime CONSUMER of the installed binary (until now
// Marksman was downloaded but never run — see FR-7).
//
// Framing is hand-rolled (zero-dep, per DESIGN «Marksman LSP bridge»): LSP frames
// each message as `Content-Length: N\r\n\r\n<utf8-json>`. The reader is byte-level
// and incremental — `N` is a byte count, messages split across `data` events, and
// several messages can arrive in one chunk. Verified against real Marksman
// 2026-02-08 (capture → tools/marksman-lsp/__tests__/fixtures/initialize-result.json).
//
// Scope: handshake only. `definition`/`references` are FR-7b (P2/P3) and are
// built from a real Linux capture there — NOT from assumptions here.

import { spawn as nodeSpawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

/** Minimal child surface the bridge needs — keeps the spawn injectable for tests. */
export interface BridgeChild {
  stdin: Writable;
  stdout: Readable;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type SpawnLike = (binaryPath: string, args: string[]) => BridgeChild;

export interface StartBridgeOptions {
  /** Absolute path to the marksman binary (from install-log `binary_path`). */
  binaryPath: string;
  /** Workspace root as a `file://` URI; when set, sent as rootUri + workspaceFolders. */
  rootUri?: string;
  /** Timeout for the `initialize` round-trip. Default 5000ms (NFR-Performance ≤2s typical). */
  initializeTimeoutMs?: number;
  /** Injectable spawn (tests). Defaults to `marksman server` over piped stdio. */
  spawnFn?: SpawnLike;
}

export interface Position {
  line: number;
  character: number;
}
export interface Range {
  start: Position;
  end: Position;
}
/** An LSP `Location` — a file URI + a range within it. */
export interface Location {
  uri: string;
  range: Range;
}

export interface BridgeHandle {
  /** The server's advertised capabilities (e.g. `referencesProvider`, `definitionProvider`). */
  capabilities: Record<string, unknown>;
  /** Optional `serverInfo` (name/version) when the server reports it. */
  serverInfo?: { name?: string; version?: string };
  /** Tell the server a document is open (helps indexing). `languageId` defaults to `markdown`. */
  didOpen(doc: { uri: string; text: string; languageId?: string }): void;
  /** `textDocument/definition` — resolves a wiki-link / ref to its target. Array results collapse to the first. */
  definition(at: { uri: string; position: Position }): Promise<Location | null>;
  /** `textDocument/references` — all locations referencing the symbol at `position`. */
  references(at: { uri: string; position: Position; includeDeclaration?: boolean }): Promise<Location[]>;
  /** Send `shutdown` + `exit` and terminate the child. Idempotent-safe. */
  stop(): Promise<void>;
}

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Byte-level incremental LSP frame reader. Returns a `data` handler that buffers
 * across chunks, reads each `Content-Length` (bytes, UTF-8 aware), and emits one
 * parsed message per complete frame — handling split frames AND multiple frames
 * per chunk.
 */
function createFrameReader(onMessage: (msg: JsonRpcMessage) => void): (chunk: Buffer) => void {
  let buf = Buffer.alloc(0);
  return (chunk: Buffer): void => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const headerEnd = buf.indexOf('\r\n\r\n');
      if (headerEnd === -1) return; // headers incomplete — wait for more bytes
      const header = buf.subarray(0, headerEnd).toString('ascii');
      const m = /content-length:\s*(\d+)/i.exec(header);
      if (!m) {
        buf = buf.subarray(headerEnd + 4); // malformed header block — skip it
        continue;
      }
      const len = parseInt(m[1], 10);
      const bodyStart = headerEnd + 4;
      if (buf.length < bodyStart + len) return; // body incomplete — wait for more bytes
      const body = buf.subarray(bodyStart, bodyStart + len).toString('utf8');
      buf = buf.subarray(bodyStart + len);
      try {
        onMessage(JSON.parse(body) as JsonRpcMessage);
      } catch {
        /* ignore non-JSON / partial — defensive */
      }
    }
  };
}

/** Request/response correlation + framed writer over one child's stdio. */
class LspConnection {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();

  constructor(private readonly stdin: Writable, stdout: Readable) {
    stdout.on('data', createFrameReader((msg) => this.onMessage(msg)));
  }

  private onMessage(msg: JsonRpcMessage): void {
    if (typeof msg.id !== 'number') return; // server→client request/notification — ignored in handshake
    const p = this.pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    if (msg.error) p.reject(new Error(`LSP error ${msg.error.code}: ${msg.error.message}`));
    else p.resolve(msg.result);
  }

  request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: '2.0', method, params });
  }

  private write(msg: JsonRpcMessage): void {
    const json = Buffer.from(JSON.stringify(msg), 'utf8');
    this.stdin.write(`Content-Length: ${json.length}\r\n\r\n`);
    this.stdin.write(json);
  }
}

const defaultSpawn: SpawnLike = (binaryPath, args) => {
  const child = nodeSpawn(binaryPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  return { stdin: child.stdin, stdout: child.stdout, kill: (s) => child.kill(s) };
};

interface InitializeResult {
  capabilities?: Record<string, unknown>;
  serverInfo?: { name?: string; version?: string };
}

/**
 * Spawn Marksman and complete the LSP handshake. Resolves with the server's real
 * capabilities. Rejects (and kills the child) if `initialize` times out or errors.
 */
export async function startBridge(opts: StartBridgeOptions): Promise<BridgeHandle> {
  const spawnFn = opts.spawnFn ?? defaultSpawn;
  const timeout = opts.initializeTimeoutMs ?? 5000;
  const child = spawnFn(opts.binaryPath, ['server']);
  const conn = new LspConnection(child.stdin, child.stdout);

  let initResult: InitializeResult;
  try {
    initResult = (await conn.request(
      'initialize',
      {
        processId: process.pid,
        rootUri: opts.rootUri ?? null,
        // Declaring workspace.workspaceFolders is REQUIRED — without it Marksman
        // rejects the folder («Workspace folder is bogus») and references/definition
        // resolve to empty. Verified via capture on both Linux and Windows.
        capabilities: {
          workspace: { workspaceFolders: true, configuration: true },
          textDocument: { definition: { linkSupport: false }, references: {} },
        },
        ...(opts.rootUri ? { workspaceFolders: [{ uri: opts.rootUri, name: 'dev-pomogator' }] } : {}),
      },
      timeout,
    )) as InitializeResult;
  } catch (err) {
    child.kill();
    throw err;
  }
  conn.notify('initialized', {});

  return {
    capabilities: initResult.capabilities ?? {},
    serverInfo: initResult.serverInfo,
    didOpen({ uri, text, languageId }): void {
      conn.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: languageId ?? 'markdown', version: 1, text },
      });
    },
    async definition({ uri, position }): Promise<Location | null> {
      const res = await conn.request('textDocument/definition', { textDocument: { uri }, position }, timeout);
      if (!res) return null;
      return Array.isArray(res) ? ((res[0] as Location) ?? null) : (res as Location);
    },
    async references({ uri, position, includeDeclaration = true }): Promise<Location[]> {
      const res = await conn.request(
        'textDocument/references',
        { textDocument: { uri }, position, context: { includeDeclaration } },
        timeout,
      );
      return Array.isArray(res) ? (res as Location[]) : [];
    },
    async stop(): Promise<void> {
      try {
        await conn.request('shutdown', null, 2000);
      } catch {
        /* server may already be gone — exit + kill regardless */
      }
      conn.notify('exit', null);
      child.kill();
    },
  };
}
