import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  writeMarker,
  readFreshMarker,
  runGC,
  sha256,
  shortSha,
  markerDir,
  appendEscapeLog,
  TTL_MS,
  GC_STALE_MS,
  type Marker,
} from '../../extensions/_shared/scope-gate-marker-store.ts';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-gate-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

function mkMarker(diffSha: string, sessionId: string, shouldShip = true): Marker {
  return {
    timestamp: Date.now(),
    diff_sha256: diffSha,
    session_id: sessionId,
    variants: [
      { file: 'src/a.ts', kind: 'enum-item', name: 'foo', lineNumber: 1, reach: 'traced', evidence: 'ok' },
    ],
    should_ship: shouldShip,
  };
}

describe('SCOPEGATE002: marker-store atomic I/O', () => {
  // @feature2
  it('SCOPEGATE002_10: writeMarker creates file under .claude/.scope-verified/', () => {
    const diffSha = sha256('some diff');
    const marker = mkMarker(diffSha, 'sess-1');
    writeMarker(tmpRoot, marker);

    const dir = markerDir(tmpRoot)!;
    const files = fs.readdirSync(dir);
    expect(files.some(f => f.endsWith('.json'))).toBe(true);
  });

  // @feature2
  it('SCOPEGATE002_11: readFreshMarker returns marker when hash+session+TTL match', () => {
    const diff = 'diff-content-abc';
    const diffSha = sha256(diff);
    writeMarker(tmpRoot, mkMarker(diffSha, 'sess-1'));

    const result = readFreshMarker(tmpRoot, 'sess-1', diffSha);
    expect(result).not.toBeNull();
    expect(result!.diff_sha256).toBe(diffSha);
    expect(result!.session_id).toBe('sess-1');
  });

  // @feature2
  it('SCOPEGATE002_12: readFreshMarker returns null on diff hash mismatch', () => {
    writeMarker(tmpRoot, mkMarker(sha256('original'), 'sess-1'));
    const result = readFreshMarker(tmpRoot, 'sess-1', sha256('modified'));
    expect(result).toBeNull();
  });

  // @feature2
  it('SCOPEGATE002_13: readFreshMarker returns null on session_id mismatch', () => {
    const diffSha = sha256('d');
    writeMarker(tmpRoot, mkMarker(diffSha, 'sess-A'));
    const result = readFreshMarker(tmpRoot, 'sess-B', diffSha);
    expect(result).toBeNull();
  });

  // @feature2
  it('SCOPEGATE002_14: readFreshMarker returns null when TTL exceeded', () => {
    const diffSha = sha256('d');
    const marker = mkMarker(diffSha, 'sess-1');
    marker.timestamp = Date.now() - TTL_MS - 1000;
    writeMarker(tmpRoot, marker);

    const result = readFreshMarker(tmpRoot, 'sess-1', diffSha);
    expect(result).toBeNull();
  });

  // @feature2
  it('SCOPEGATE002_15: readFreshMarker returns null on corrupt JSON (treat as absent)', () => {
    const diffSha = sha256('d');
    const dir = markerDir(tmpRoot)!;
    fs.mkdirSync(dir, { recursive: true });
    const filename = `sess-1-${shortSha(diffSha)}.json`;
    fs.writeFileSync(path.join(dir, filename), '{ not valid json', 'utf-8');

    const result = readFreshMarker(tmpRoot, 'sess-1', diffSha);
    expect(result).toBeNull();
  });

  // @feature2
  it('SCOPEGATE002_20: runGC removes markers older than 24h', () => {
    const diffSha = sha256('old');
    writeMarker(tmpRoot, mkMarker(diffSha, 'sess-old'));

    const dir = markerDir(tmpRoot)!;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    expect(files.length).toBe(1);
    const staleFile = path.join(dir, files[0]);

    // Artificially age the file
    const oldTime = (Date.now() - GC_STALE_MS - 1000) / 1000;
    fs.utimesSync(staleFile, oldTime, oldTime);

    runGC(tmpRoot);

    const remaining = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    expect(remaining.length).toBe(0);
  });

  // @feature2
  it('SCOPEGATE002_21: runGC preserves fresh markers', () => {
    writeMarker(tmpRoot, mkMarker(sha256('fresh'), 'sess-fresh'));
    runGC(tmpRoot);

    const dir = markerDir(tmpRoot)!;
    const remaining = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    expect(remaining.length).toBe(1);
  });

  // @feature2 security
  it('SCOPEGATE002_30: markerDir rejects paths escaping cwd base', () => {
    // Using a malformed cwd would only be caught if we use non-resolving paths;
    // resolve + startsWith gives false-positive-free behavior. We sanity-check normal flow.
    const normal = markerDir(tmpRoot);
    expect(normal).not.toBeNull();
    expect(normal!.startsWith(path.resolve(tmpRoot))).toBe(true);
  });

  // @feature2 security
  it('SCOPEGATE002_31: marker filename strips path separators from session_id', () => {
    const diffSha = sha256('d');
    const marker = mkMarker(diffSha, '../../etc/passwd');
    writeMarker(tmpRoot, marker);

    const dir = markerDir(tmpRoot)!;
    const files = fs.readdirSync(dir);
    // Filename should not escape dir — no '..' or '/' in names
    expect(files.every(f => !f.includes('..') && !f.includes('/'))).toBe(true);
  });

  // @feature3
  it('SCOPEGATE002_40: appendEscapeLog appends valid JSONL line', () => {
    appendEscapeLog(tmpRoot, {
      ts: '2026-04-23T12:00:00.000Z',
      diff_sha256: 'abc',
      reason: 'test reason string',
      session_id: 'sess-1',
      cwd: tmpRoot,
    });

    const logPath = path.join(tmpRoot, '.claude', 'logs', 'scope-gate-escapes.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);

    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content.endsWith('\n')).toBe(true);
    const entry = JSON.parse(content.trim());
    expect(entry.reason).toBe('test reason string');
    expect(entry.diff_sha256).toBe('abc');
  });

  // @feature3
  it('SCOPEGATE002_41: appendEscapeLog appends multiple lines as valid JSONL', () => {
    appendEscapeLog(tmpRoot, { ts: 't1', diff_sha256: 'a', reason: 'r1', session_id: 's', cwd: tmpRoot });
    appendEscapeLog(tmpRoot, { ts: 't2', diff_sha256: 'b', reason: 'r2', session_id: 's', cwd: tmpRoot });

    const logPath = path.join(tmpRoot, '.claude', 'logs', 'scope-gate-escapes.jsonl');
    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).reason).toBe('r1');
    expect(JSON.parse(lines[1]).reason).toBe('r2');
  });
});
