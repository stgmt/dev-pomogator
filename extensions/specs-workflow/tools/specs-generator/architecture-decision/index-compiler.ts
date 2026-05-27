/**
 * INDEX compiler (FR-5). Globs AXIS-*.md, parses frontmatter (axis_id/status/chosen),
 * regenerates INDEX.md (between AUTOGEN markers — idempotent, user content outside
 * preserved) + INDEX.html. Regex-based frontmatter parse, no AST (mirror parsers.ts).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { renderIndexHtml, type IndexAxisRow } from './html-renderer.ts';

const AUTOGEN_START = '<!-- AUTOGEN:ARCH-INDEX START -->';
const AUTOGEN_END = '<!-- AUTOGEN:ARCH-INDEX END -->';

export interface CompileResult {
  indexMd: string;
  indexHtml: string;
  axes_total: number;
  axes_pending: number;
  rows: IndexAxisRow[];
}

function parseFrontmatter(md: string): Record<string, string> {
  // CRLF-tolerant: files written on Windows (or by Python write_text) use \r\n.
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

function firstHeading(md: string): string | null {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

export function collectRows(specDir: string): IndexAxisRow[] {
  if (!fs.existsSync(specDir)) return [];
  const files = fs
    .readdirSync(specDir)
    .filter((f) => /^AXIS-.*\.md$/.test(f))
    .sort();
  const rows: IndexAxisRow[] = [];
  for (const f of files) {
    const md = fs.readFileSync(path.join(specDir, f), 'utf-8');
    const fm = parseFrontmatter(md);
    const chosen = fm.chosen && fm.chosen !== 'null' ? fm.chosen : null;
    rows.push({
      axis_id: fm.axis_id ?? f.replace(/^AXIS-|\.md$/g, ''),
      axis_name: firstHeading(md) ?? fm.axis_id ?? f,
      status: fm.status ?? 'pending',
      chosen,
    });
  }
  return rows;
}

function buildIndexMd(slug: string, rows: IndexAxisRow[]): string {
  const tableRows = rows
    .map((r) => `| ${r.axis_name} | ${r.status} | ${r.chosen ?? '—'} |`)
    .join('\n');
  const block = [
    AUTOGEN_START,
    `# Architecture decisions — ${slug}`,
    '',
    '| Axis | Status | Chosen |',
    '|------|--------|--------|',
    tableRows,
    AUTOGEN_END,
  ].join('\n');
  return block;
}

/** Splice the AUTOGEN block into existing INDEX.md, preserving content outside markers. */
function spliceIndexMd(existing: string | null, block: string): string {
  if (!existing) return block + '\n';
  if (existing.includes(AUTOGEN_START) && existing.includes(AUTOGEN_END)) {
    return existing.replace(
      new RegExp(`${AUTOGEN_START}[\\s\\S]*?${AUTOGEN_END}`),
      block,
    );
  }
  return existing.trimEnd() + '\n\n' + block + '\n';
}

export function compileIndex(specDir: string, slug = path.basename(specDir)): CompileResult {
  const rows = collectRows(specDir);
  const indexMdPath = path.join(specDir, 'INDEX.md');
  const indexHtmlPath = path.join(specDir, 'INDEX.html');

  const existing = fs.existsSync(indexMdPath)
    ? fs.readFileSync(indexMdPath, 'utf-8')
    : null;
  const block = buildIndexMd(slug, rows);
  const indexMd = spliceIndexMd(existing, block);
  const indexHtml = renderIndexHtml(slug, rows);

  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(indexMdPath, indexMd, 'utf-8');
  fs.writeFileSync(indexHtmlPath, indexHtml, 'utf-8');

  return {
    indexMd,
    indexHtml,
    axes_total: rows.length,
    axes_pending: rows.filter((r) => r.status === 'pending').length,
    rows,
  };
}
