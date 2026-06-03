// Tests for the Marksman LSP bridge (FR-7a / SPECGEN004_15).
//
// The mock LSP server replays the REAL captured Marksman initialize result
// (fixtures/initialize-result.json — captured from marksman 2026-02-08) and
// deliberately emits it as a SPLIT + CONCATENATED + MULTIBYTE stream, so the
// byte-level frame reader is exercised on the messy cases (not just the easy
// single-chunk one). A separate host smoke (`startBridge` vs the real binary)
// proves the handshake end-to-end; this pins the framing + lifecycle logic.

import { describe, it, expect } from 'vitest';
import { PassThrough, Writable } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBridge, type SpawnLike, type BridgeChild } from '../bridge.ts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const realInitResult = JSON.parse(
  fs.readFileSync(path.join(dir, 'fixtures/initialize-result.json'), 'utf8'),
) as { capabilities: Record<string, unknown> };

function frame(msg: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(msg), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${json.length}\r\n\r\n`, 'ascii'), json]);
}

/** Incremental byte-level reader (mirror of the bridge's) — lets the mock parse requests. */
function frameReader(onMsg: (m: { id?: number; method?: string }) => void): (c: Buffer) => void {
  let buf = Buffer.alloc(0);
  return (chunk: Buffer): void => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const he = buf.indexOf('\r\n\r\n');
      if (he === -1) return;
      const m = /content-length:\s*(\d+)/i.exec(buf.subarray(0, he).toString('ascii'));
      if (!m) {
        buf = buf.subarray(he + 4);
        continue;
      }
      const len = parseInt(m[1], 10);
      const s = he + 4;
      if (buf.length < s + len) return;
      const body = buf.subarray(s, s + len).toString('utf8');
      buf = buf.subarray(s + len);
      onMsg(JSON.parse(body));
    }
  };
}

interface Mock {
  spawnFn: SpawnLike;
  sent: Array<{ id?: number; method?: string }>;
  killed: () => boolean;
}

function makeMock(respond: (req: { id?: number; method?: string }, push: (b: Buffer) => void) => void): Mock {
  const sent: Array<{ id?: number; method?: string }> = [];
  let killedFlag = false;
  const spawnFn: SpawnLike = () => {
    const stdout = new PassThrough();
    const push = (b: Buffer): void => {
      stdout.push(b);
    };
    const parse = frameReader((req) => {
      sent.push(req);
      respond(req, push);
    });
    const stdin = new Writable({
      write(chunk, _enc, cb): void {
        parse(Buffer.from(chunk));
        cb();
      },
    });
    const child: BridgeChild = {
      stdin,
      stdout,
      kill: () => {
        killedFlag = true;
        return true;
      },
    };
    return child;
  };
  return { spawnFn, sent, killed: () => killedFlag };
}

describe('startBridge — handshake', () => {
  it('parses the real captured capabilities from a split/concatenated/multibyte stream', async () => {
    const mock = makeMock((req, push) => {
      if (req.method === 'initialize') {
        const resp = frame({
          jsonrpc: '2.0',
          id: req.id,
          // Real captured result + a multibyte serverInfo to exercise UTF-8 byte counting.
          result: { ...realInitResult, serverInfo: { name: 'Marksman ✓', version: '2026-02-08' } },
        });
        const noti = frame({ jsonrpc: '2.0', method: 'window/logMessage', params: { type: 3, message: 'indexing…' } });
        // A notification THEN the response, concatenated — and split mid-response across ticks.
        const combined = Buffer.concat([noti, resp]);
        const cut = noti.length + 17;
        push(combined.subarray(0, cut));
        setImmediate(() => push(combined.subarray(cut)));
      }
    });

    const h = await startBridge({ binaryPath: '/fake/marksman', spawnFn: mock.spawnFn });

    expect(h.capabilities.referencesProvider).toBe(true);
    expect(h.capabilities.definitionProvider).toBe(true);
    expect(h.capabilities.hoverProvider).toBe(true);
    expect(h.serverInfo?.name).toBe('Marksman ✓'); // multibyte survived byte-accurate framing
    // The handshake sequence: initialize request + initialized notification.
    expect(mock.sent.map((m) => m.method ?? `id:${m.id}`)).toEqual(['initialize', 'initialized']);
  });

  it('stop() sends shutdown then exit and kills the child', async () => {
    const mock = makeMock((req, push) => {
      if (req.method === 'initialize') {
        push(frame({ jsonrpc: '2.0', id: req.id, result: realInitResult }));
      } else if (req.method === 'shutdown') {
        push(frame({ jsonrpc: '2.0', id: req.id, result: null }));
      }
    });

    const h = await startBridge({ binaryPath: '/fake/marksman', spawnFn: mock.spawnFn });
    await h.stop();

    const methods = mock.sent.map((m) => m.method).filter(Boolean);
    expect(methods).toEqual(['initialize', 'initialized', 'shutdown', 'exit']);
    expect(mock.killed()).toBe(true);
  });

  it('rejects and kills the child when initialize times out', async () => {
    const mock = makeMock(() => {
      /* never respond to initialize → force the timeout branch */
    });

    await expect(
      startBridge({ binaryPath: '/fake/marksman', spawnFn: mock.spawnFn, initializeTimeoutMs: 60 }),
    ).rejects.toThrow(/initialize.*timed out/);
    expect(mock.killed()).toBe(true);
  });
});
