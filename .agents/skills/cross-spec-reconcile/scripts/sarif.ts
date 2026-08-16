// SARIF 2.1.0 emitter for cross-spec-reconcile (FR-17 --sarif flag).
//
// SARIF (Static Analysis Results Interchange Format) is the standard
// shape GitHub Code Scanning, Azure DevOps Security, and most IDEs read.
// Reusing it lets CI surface our findings in the same UI as ESLint,
// Semgrep, etc.

import fs from 'node:fs';
import path from 'node:path';
import type { Finding, ReconcileResult } from './reconcile.ts';

interface SarifLocation {
  physicalLocation?: {
    artifactLocation: { uri: string };
    region?: { startLine: number };
  };
  message?: { text: string };
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations?: SarifLocation[];
}

function sevToLevel(s: Finding['severity']): SarifResult['level'] {
  switch (s) {
    case 'CRITICAL': return 'error';
    case 'WARNING':  return 'warning';
    case 'INFO':     return 'note';
  }
}

function locationOf(f: Finding): SarifLocation[] | undefined {
  const refs = [f.referenced_in, f.spec_a, f.spec_b].filter(Boolean) as string[];
  if (refs.length === 0) return undefined;
  return refs.map((r) => {
    const m = r.match(/^(.+?):(\d+)/);
    if (m) {
      return {
        physicalLocation: {
          artifactLocation: { uri: m[1] },
          region: { startLine: parseInt(m[2], 10) },
        },
      };
    }
    return { physicalLocation: { artifactLocation: { uri: r } } };
  });
}

export interface SarifDoc {
  $schema: string;
  version: '2.1.0';
  runs: Array<{
    tool: { driver: { name: string; version: string; informationUri: string; rules?: Array<{ id: string; name: string; shortDescription: { text: string } }> } };
    results: SarifResult[];
  }>;
}

export function buildSarif(report: ReconcileResult): SarifDoc {
  const rules = new Map<string, { id: string; name: string; shortDescription: { text: string } }>();
  const results: SarifResult[] = report.findings.map((f) => {
    if (!rules.has(f.code)) {
      rules.set(f.code, {
        id: f.code,
        name: f.class,
        shortDescription: { text: `${f.class} — ${f.severity}` },
      });
    }
    const text = [
      f.suggested_fix ?? '',
      f.spec_a ? `\nSpec A: ${f.spec_a}` : '',
      f.spec_b ? `\nSpec B: ${f.spec_b}` : '',
      f.expected_path ? `\nExpected path: ${f.expected_path}` : '',
    ].join('').trim() || f.code;
    return {
      ruleId: f.code,
      level: sevToLevel(f.severity),
      message: { text },
      locations: locationOf(f),
    };
  });
  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'cross-spec-reconcile',
            version: '0.1.0',
            informationUri: 'https://github.com/stgmt/dev-pomogator',
            rules: [...rules.values()],
          },
        },
        results,
      },
    ],
  };
}

export function writeSarif(repoRoot: string, report: ReconcileResult): string {
  const target = path.join(repoRoot, '.specs', report.specSlug, 'consistency-report.sarif');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(buildSarif(report), null, 2) + '\n');
  fs.renameSync(tmp, target);
  return target;
}
