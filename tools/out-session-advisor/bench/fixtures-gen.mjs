/**
 * Deterministic synthetic fixture generators for the advisor bench suite.
 * Seeded (mulberry32) — same seed ⇒ same corpus ⇒ comparable runs.
 */
import fs from 'node:fs';
import path from 'node:path';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  'session', 'transcript', 'worker', 'advisor', 'tool_use', 'file_path',
  'refactor', 'benchmark', 'offset', 'subagent', 'thinking', 'result',
  'claim', 'evidence', 'lock', 'staged', 'conflict', 'owner', 'pid', 'alive',
];

const FILES = ['src/foo.py', 'src/bar.py', 'src/baz.ts', 'docs/readme.md', 'config.json', 'index.mjs'];

export function fillerText(rnd, approxBytes) {
  let s = '';
  while (s.length < approxBytes) {
    const n = 1 + Math.floor(rnd() * 8);
    s += WORDS[Math.floor(rnd() * WORDS.length)];
    if (rnd() < 0.15) s += ' ' + FILES[Math.floor(rnd() * FILES.length)];
    s += ' ';
    for (let i = 0; i < n; i++) s += ' ';
  }
  return s;
}

/** Одна реалистичная строка транскрипта Claude Code. */
export function eventLine(rnd, { withFilePath = false, huge = false } = {}) {
  const type = withFilePath && rnd() < 0.2 ? 'tool_use' : ['user', 'assistant', 'tool_result'][Math.floor(rnd() * 3)];
  if (type === 'tool_use') {
    const fp = FILES[Math.floor(rnd() * FILES.length)];
    const payload = huge ? fillerText(rnd, 1024 * 1024) : fillerText(rnd, 120);
    return JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: rnd() < 0.5 ? 'Edit' : 'Write', input: { file_path: fp, old_string: 'x', new_string: payload } },
        ],
      },
      sessionId: `ses-${Math.floor(rnd() * 1e6)}`,
    });
  }
  return JSON.stringify({
    type,
    message: { role: type === 'user' ? 'user' : 'assistant', content: huge ? fillerText(rnd, 1024 * 1024) : fillerText(rnd, 120) },
    sessionId: `ses-${Math.floor(rnd() * 1e6)}`,
  });
}

/** Транскрипт до ~sizeMb МБ. Возвращает фактический размер. */
export function genTranscript(file, { sizeMb, seed = 1, withFilePath = false, malformed = null }) {
  const rnd = mulberry32(seed);
  const target = sizeMb * 1024 * 1024;
  let written = 0;
  const lines = [];
  while (written < target) {
    const line = eventLine(rnd, { withFilePath }) + '\n';
    lines.push(line);
    written += Buffer.byteLength(line);
    if (lines.length >= 500) { fs.appendFileSync(file, lines.join('')); lines.length = 0; }
  }
  if (lines.length) fs.appendFileSync(file, lines.join(''));
  if (malformed === 'truncated-last') {
    fs.appendFileSync(file, '{"type":"user","message":');
  } else if (malformed === 'bom') {
    const c = fs.readFileSync(file);
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), c]));
  } else if (malformed === 'giant-line') {
    fs.appendFileSync(file, fillerText(rnd, 5 * 1024 * 1024) + '\n');
  } else if (malformed === 'binary') {
    fs.appendFileSync(file, Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x80, 0x80, 0xc3, 0x28]));
  }
  return fs.statSync(file).size;
}

/** Дерево ~/.claude/projects: sessions сессий по sizeMbEach МБ. */
export function genProjectsTree(root, { sessions, sizeMbEach, seed = 7, withFilePath = true, prefix = 'E--repo' }) {
  fs.mkdirSync(root, { recursive: true });
  const sizes = [];
  for (let i = 0; i < sessions; i++) {
    const dir = path.join(root, `${prefix}-${String(i).padStart(3, '0')}`);
    fs.mkdirSync(dir, { recursive: true });
    sizes.push(genTranscript(path.join(dir, `session-${i}.jsonl`), { sizeMb: sizeMbEach, seed: seed + i, withFilePath }));
  }
  return sizes;
}

/** Лок с заданным владельцем. */
export function writeLock(dir, name, ownerPid, ownerCmd, pathVal = 'src/foo.py') {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify({ owner_pid: ownerPid, owner_cmd: ownerCmd, path: pathVal, created: new Date().toISOString() }));
  return file;
}
