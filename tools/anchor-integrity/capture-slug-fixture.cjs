#!/usr/bin/env node
/**
 * Capture the GROUND-TRUTH Marksman slug rule into a golden fixture (FR-34a).
 *
 * Drives the real Marksman binary via `textDocument/completion` at a `[](#…`
 * position — Marksman returns, per heading, the exact link it would insert
 * (`textEdit.newText` = `[x](#<slug>)`). That `<slug>` is Marksman's own slug,
 * captured independently of our `marksmanSlug()` implementation, so the golden
 * test is real (not circular). Re-run this MANUALLY when the pinned Marksman
 * version bumps (see Dockerfile.test) — it overwrites the fixture.
 *
 *   node tools/anchor-integrity/capture-slug-fixture.cjs
 *
 * Needs the binary (PATH / DEV_POMOGATOR_MARKSMAN_BIN / .dev-pomogator/bin); the
 * golden TEST itself does NOT (it reads the committed fixture).
 *
 * @see ./marksman-slug.ts                       (the impl this fixture pins)
 * @see ./__tests__/marksman-slug.golden.test.ts (the golden test)
 * @see .specs/spec-generator-v4/FR.md FR-34a
 */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Diverse heading shapes the specs actually use + edge cases the slug rule must nail.
const HEADINGS = [
  'FR-7',
  'FR-7: Phase 2 — Native LSP plugin (auto-installed, no fallback)',
  'FR-001: Login flow',
  'NFR-Performance-1',
  'NFR-Performance-1: SpecGraph cold start',
  'NFR-Reliability-9',
  'AC-1.1',
  'AC-27.1',
  'AC-3 (FR-1)',
  'AC-1.1 (FR-1)',
  'AC-29.1 (FR-29)',
  'UC-3',
  'UC-3: Developer migrates from vitest pseudo-BDD',
  'US-22',
  'Some Heading With Spaces!',
  'Mixed: punctuation, commas & ampersands (parens) v2.0',
  'Заголовок с пробелами и пунктуацией!',
  'FR-7: Фаза 2 — нативный LSP плагин',
];

function repoRoot() {
  return process.env.DEV_POMOGATOR_REPO_ROOT || process.cwd();
}
function resolveBin() {
  const env = process.env.DEV_POMOGATOR_MARKSMAN_BIN;
  if (env && fs.existsSync(env)) return env;
  const plat = process.platform === 'win32' ? 'marksman.exe' : 'marksman';
  const managed = path.join(repoRoot(), '.dev-pomogator', 'bin', plat);
  if (fs.existsSync(managed)) return managed;
  return null;
}

function main() {
  const bin = resolveBin();
  if (!bin) {
    process.stderr.write('[capture] no Marksman binary found — cannot regenerate fixture.\n');
    process.exit(1);
  }
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-capture-'));
  fs.writeFileSync(path.join(ws, '.marksman.toml'), '');
  const lines = ['# Doc Title', ''];
  for (const h of HEADINGS) lines.push('## ' + h, '');
  lines.push('seed [x](#');
  const cLine = lines.length - 1;
  const cChar = 'seed [x](#'.length;
  fs.writeFileSync(path.join(ws, 'doc.md'), lines.join('\n') + '\n');
  const uri = pathToFileURL(path.join(ws, 'doc.md')).href;
  const rootUri = pathToFileURL(ws).href;

  const launcher = path.join(repoRoot(), 'tools', 'marksman-installer', 'launch-marksman.cjs');
  const child = spawn(process.execPath, [launcher, 'server'], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, DEV_POMOGATOR_MARKSMAN_BIN: bin, CLAUDE_PROJECT_DIR: ws },
    cwd: ws,
  });
  let buf = Buffer.alloc(0);
  const pending = new Map();
  const send = (m) => { const b = JSON.stringify(m); child.stdin.write(`Content-Length: ${Buffer.byteLength(b)}\r\n\r\n${b}`); };
  const rq = (id, method, params) => new Promise((r) => { pending.set(id, r); send({ jsonrpc: '2.0', id, method, params }); });
  child.stdout.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const he = buf.indexOf('\r\n\r\n'); if (he === -1) break;
      const m = /Content-Length:\s*(\d+)/i.exec(buf.slice(0, he).toString()); if (!m) break;
      const len = Number(m[1]); const s = he + 4; if (buf.length < s + len) break;
      const msg = JSON.parse(buf.slice(s, s + len).toString()); buf = buf.slice(s + len);
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });

  (async () => {
    await rq(1, 'initialize', { processId: process.pid, rootUri, capabilities: { textDocument: { completion: { completionItem: {} } }, workspace: { workspaceFolders: true } }, workspaceFolders: [{ uri: rootUri, name: 'ws' }] });
    send({ jsonrpc: '2.0', method: 'initialized', params: {} });
    send({ jsonrpc: '2.0', method: 'textDocument/didOpen', params: { textDocument: { uri, languageId: 'markdown', version: 1, text: fs.readFileSync(path.join(ws, 'doc.md'), 'utf8') } } });
    await new Promise((r) => setTimeout(r, 1200));
    const r = await rq(2, 'textDocument/completion', { textDocument: { uri }, position: { line: cLine, character: cChar } });
    const items = (r.result && (r.result.items || r.result)) || [];
    const byLabel = new Map();
    for (const it of items) {
      const newText = it.textEdit && it.textEdit.newText;
      const m = newText && /#([^)]+)\)/.exec(newText);
      if (it.label && m) byLabel.set(it.label, m[1]);
    }
    const fixture = {};
    for (const h of HEADINGS) {
      if (!byLabel.has(h)) { process.stderr.write(`[capture] WARN: no completion for heading "${h}"\n`); continue; }
      fixture[h] = byLabel.get(h);
    }
    const out = {
      _source: 'captured from real Marksman binary via textDocument/completion (textEdit.newText)',
      _marksman_version: '2026-02-08',
      _regenerate: 'node tools/anchor-integrity/capture-slug-fixture.cjs',
      slugs: fixture,
    };
    const dest = path.join(repoRoot(), 'tests', 'fixtures', 'marksman', 'slug-rule.json');
    fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
    process.stdout.write(`[capture] wrote ${Object.keys(fixture).length} slugs → ${dest}\n`);
    child.kill();
    try { fs.rmSync(ws, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* best-effort */ }
    process.exit(0);
  })();
  setTimeout(() => { process.stderr.write('[capture] TIMEOUT\n'); child.kill(); process.exit(1); }, 15000);
}

main();
