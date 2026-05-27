#!/usr/bin/env node
// Reconstruct .specs/{spec-generator-v4,spec-variant-matrix,dev-pomogator-canonical-plugin}/
// from Claude Code session transcripts (JSONL).
//
// For each file_path that matches one of the lost specs:
//   - find every Write tool call that wrote to it across all transcripts
//   - keep the LATEST one (by timestamp) as the canonical content
//   - apply any Edit tool calls that came AFTER the last Write (string replacement)
//   - write to disk under .recovered/{slug}/

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const TRANSCRIPTS_DIR = 'C:/Users/stigm/.claude/projects/D--repos-dev-pomogator';
const OUT_BASE = path.resolve('.recovered');
const TARGET_SLUGS = ['spec-generator-v4', 'spec-variant-matrix', 'dev-pomogator-canonical-plugin'];

const candidateTranscripts = fs
  .readdirSync(TRANSCRIPTS_DIR)
  .filter((n) => n.endsWith('.jsonl'))
  .map((n) => path.join(TRANSCRIPTS_DIR, n));

// Map<absoluteOrRelativeFilePath, Array<{timestamp, op:'write'|'edit', content?, old_string?, new_string?, replace_all?}>>
const ops = new Map();

function isTargetPath(p) {
  if (!p || typeof p !== 'string') return false;
  // Normalize separators
  const norm = p.replace(/\\/g, '/');
  return TARGET_SLUGS.some((slug) => norm.includes(`.specs/${slug}/`) || norm.endsWith(`.specs/${slug}`));
}

function recordOp(filePath, entry) {
  const key = filePath.replace(/\\/g, '/');
  if (!ops.has(key)) ops.set(key, []);
  ops.get(key).push(entry);
}

async function scanTranscript(transcriptPath) {
  const rl = readline.createInterface({
    input: fs.createReadStream(transcriptPath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const ts = rec.timestamp || rec.created_at || '';
    const msg = rec.message;
    if (!msg || !msg.content) continue;
    const content = Array.isArray(msg.content) ? msg.content : [msg.content];
    for (const block of content) {
      if (block.type !== 'tool_use') continue;
      const name = block.name;
      const input = block.input || {};
      if (name === 'Write' && isTargetPath(input.file_path)) {
        recordOp(input.file_path, { timestamp: ts, op: 'write', content: input.content });
      } else if (name === 'Edit' && isTargetPath(input.file_path)) {
        recordOp(input.file_path, {
          timestamp: ts,
          op: 'edit',
          old_string: input.old_string,
          new_string: input.new_string,
          replace_all: !!input.replace_all,
        });
      }
    }
  }
}

(async () => {
  for (const tp of candidateTranscripts) {
    process.stderr.write(`scanning ${path.basename(tp)}... `);
    await scanTranscript(tp);
    process.stderr.write(`done\n`);
  }

  console.error(`\nFound ${ops.size} target files across transcripts.`);

  // For each file: sort ops by timestamp, replay
  const summary = { written: 0, files: [] };
  for (const [filePath, opList] of ops) {
    opList.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    // Find the LAST write, then replay edits after it
    let lastWriteIdx = -1;
    for (let i = opList.length - 1; i >= 0; i--) {
      if (opList[i].op === 'write') { lastWriteIdx = i; break; }
    }
    if (lastWriteIdx === -1) {
      console.error(`SKIP (no write found): ${filePath}`);
      continue;
    }
    let content = opList[lastWriteIdx].content;
    if (typeof content !== 'string') content = String(content ?? '');
    // Apply subsequent edits
    for (let i = lastWriteIdx + 1; i < opList.length; i++) {
      const e = opList[i];
      if (e.op !== 'edit') continue;
      if (e.replace_all) {
        content = content.split(e.old_string).join(e.new_string);
      } else {
        const idx = content.indexOf(e.old_string);
        if (idx === -1) {
          console.error(`WARN: edit old_string not found in ${filePath} (skipping that edit)`);
          continue;
        }
        content = content.slice(0, idx) + e.new_string + content.slice(idx + e.old_string.length);
      }
    }

    // Determine output path: extract path relative to .specs/{slug}/
    // filePath may be absolute (Windows) or relative; normalize
    const norm = filePath.replace(/\\/g, '/');
    let relUnderSpecs = null;
    for (const slug of TARGET_SLUGS) {
      const marker = `.specs/${slug}/`;
      const i = norm.indexOf(marker);
      if (i !== -1) { relUnderSpecs = norm.slice(i + '.specs/'.length); break; }
    }
    if (!relUnderSpecs) { console.error(`SKIP (cannot derive rel path): ${filePath}`); continue; }

    const outPath = path.join(OUT_BASE, relUnderSpecs);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, content, 'utf-8');
    summary.written++;
    summary.files.push(outPath);
  }

  console.error(`\nRecovered ${summary.written} files into ${OUT_BASE}`);
  // Bucket by slug
  const bySlug = { 'spec-generator-v4': 0, 'spec-variant-matrix': 0, 'dev-pomogator-canonical-plugin': 0 };
  for (const f of summary.files) {
    for (const slug of TARGET_SLUGS) {
      if (f.includes(`\\${slug}\\`) || f.includes(`/${slug}/`)) { bySlug[slug]++; break; }
    }
  }
  console.error(`\nBy spec:`);
  for (const [slug, n] of Object.entries(bySlug)) console.error(`  ${slug}: ${n} files`);
})();
