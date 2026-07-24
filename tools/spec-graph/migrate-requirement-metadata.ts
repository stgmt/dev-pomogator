#!/usr/bin/env node
/** Deterministic metadata schema migration report (FR-66 / #171). */
import fs from 'node:fs';
import path from 'node:path';
import { parseMarkdownFile } from './parsers/md.ts';
import { renderRequirementMetadata } from './metadata-schema.ts';

export interface MetadataMigrationEntry {
  id: string;
  file: string;
  fromVersion: number | null;
  toVersion: 1;
  status: 'ready' | 'invalid' | 'not-declared';
  rendered?: string;
  issues?: string[];
}

export function metadataMigrationReport(repoRoot: string): MetadataMigrationEntry[] {
  const specs = path.join(repoRoot, '.specs');
  if (!fs.existsSync(specs)) return [];
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name === 'FR.md' || entry.name === 'NFR.md') files.push(target);
    }
  };
  visit(specs);
  const out: MetadataMigrationEntry[] = [];
  for (const file of files.sort()) for (const node of parseMarkdownFile(file, repoRoot).nodes) {
    if (node.type !== 'FR' && node.type !== 'NFR') continue;
    if (node.metadataIssues?.length) out.push({ id: node.id, file: node.file, fromVersion: null, toVersion: 1, status: 'invalid', issues: node.metadataIssues.map((issue) => `${issue.path}: ${issue.message}`) });
    else if (node.metadata) out.push({ id: node.id, file: node.file, fromVersion: node.metadata.schemaVersion, toVersion: 1, status: 'ready', rendered: renderRequirementMetadata(node.metadata) });
    else out.push({ id: node.id, file: node.file, fromVersion: null, toVersion: 1, status: 'not-declared' });
  }
  return out;
}

if (process.argv[1]?.endsWith('migrate-requirement-metadata.ts')) {
  const root = path.resolve(process.argv.find((arg) => arg.startsWith('--root='))?.slice(7) ?? process.cwd());
  const apply = process.argv.includes('--apply');
  const report = metadataMigrationReport(root);
  process.stdout.write(`${JSON.stringify({ mode: apply ? 'apply' : 'dry-run', entries: report }, null, 2)}\n`);
  if (apply) {
    process.stderr.write('Apply uses the MCP spec door; this CLI intentionally performs no raw writes.\n');
    process.exit(2);
  }
  process.exit(report.some((entry) => entry.status === 'invalid') ? 1 : 0);
}
