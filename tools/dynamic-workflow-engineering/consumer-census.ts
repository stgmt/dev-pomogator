#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { basename } from 'node:path';

export type ConsumerSubject = 'native-Agent' | 'workflow-native-agent';

export interface ConsumerRecord {
  id: string;
  subject: ConsumerSubject;
  file: string;
  line: number;
  contract: string | null;
  migrationReason: string;
  disposition: 'migrated' | 'blocked' | 'out-of-scope';
}

const IGNORED = new Set(['dynamic-workflow-engineering']);
const SCAN_ROOTS = [
  ['.claude', 'skills'],
  ['.claude', 'agents'],
  ['.claude', 'commands'],
  ['tools'],
] as const;

function walk(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(target));
    else if (/\.(?:md|ts|tsx|js|jsx|mjs|cjs|json|jsonc)$/.test(entry.name)) out.push(target);
  }
  return out;
}

export function enumerateConsumers(repoRoot: string): ConsumerRecord[] {
  const records: ConsumerRecord[] = [];
  const files = SCAN_ROOTS.flatMap((parts) => walk(path.join(repoRoot, ...parts)));
  for (const file of files) {
    const relativeFile = path.relative(repoRoot, file).replace(/\\/g, '/');
    if (relativeFile.startsWith('tools/dynamic-workflow-engineering/')) continue;
    const id = relativeFile.startsWith('.claude/skills/') ? relativeFile.split('/')[2] : path.basename(file, path.extname(file));
    if (IGNORED.has(id)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      const native = /\bAgent\s*\(|Agent\(subagent_type|Call\s+`?Agent|Invoke Agent|Use Agent|через Agent\(\)|`Agent` tool|свежим под-агентом|functions\.Agent/.test(line);
      const workflow = /Workflow-native\s+`?agent\(\)|\bagent\(.*phase/i.test(line);
      if (!native && !workflow) return;
      records.push({
        id,
        subject: workflow ? 'workflow-native-agent' : 'native-Agent',
        file: path.relative(repoRoot, file).replace(/\\/g, '/'),
        line: index + 1,
        contract: null,
        migrationReason: 'Exact consumer decomposition, packet ceilings, workflow script contract, and executable real-path proof remain required before migration.',
        disposition: 'blocked',
      });
    });
  }
  return records.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

export function verifyCensus(records: ConsumerRecord[], repoRoot?: string): { ok: boolean; missingArchitectureDecisionBuilder: boolean; duplicateLocations: string[]; unsupportedSurfaces: string[]; uncontractedConsumers: string[] } {
  const keys = records.map((record) => `${record.file}:${record.line}`);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  const missingArchitectureDecisionBuilder = !records.some((record) => record.id === 'architecture-decision-builder');
  const unsupportedSurfaces: string[] = [];
  if (repoRoot) {
    for (const parts of SCAN_ROOTS) if (!fs.existsSync(path.join(repoRoot, ...parts))) unsupportedSurfaces.push(parts.join('/'));
  }
  const uncontractedConsumers = [...new Set(records.filter((record) => record.disposition === 'migrated' && !record.contract).map((record) => record.id))];
  return { ok: duplicates.length === 0 && !missingArchitectureDecisionBuilder && unsupportedSurfaces.length === 0 && uncontractedConsumers.length === 0, missingArchitectureDecisionBuilder, duplicateLocations: [...new Set(duplicates)], unsupportedSurfaces, uncontractedConsumers };
}

async function main(): Promise<void> {
  const root = path.resolve(process.argv[2] || process.cwd());
  const records = enumerateConsumers(root);
  const verification = verifyCensus(records, root);
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, records, verification }, null, 2)}\n`);
  if (!verification.ok) process.exitCode = 2;
}

if (process.argv[1] && basename(process.argv[1]).replace(/\\/g, '/') === 'consumer-census.ts') main();
