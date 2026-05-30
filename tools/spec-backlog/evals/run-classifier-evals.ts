// Run classifier evals from classifier-cases.json. Pass-fail tally per
// case. Exit non-zero if any case fails (CI-friendly).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from '../classifier.ts';

interface Case {
  id: string;
  input: {
    code: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    referenced_in?: string;
    expected_path?: string;
    spec_a?: string;
    spec_b?: string;
  };
  expected: {
    verdict: 'AUTO_FIX' | 'BACKLOG' | 'NOISE';
    category: string | null;
    resolver: string | null;
  };
}

const CASES_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'classifier-cases.json',
);

function main(): number {
  const raw = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8')) as {
    cases: Case[];
  };
  let pass = 0;
  let fail = 0;
  const failures: string[] = [];

  for (const c of raw.cases) {
    const got = classify('test-slug', c.input);
    const gotCategory = got.entry?.category ?? null;
    const gotResolver = got.entry?.suggested_resolver ?? null;

    const ok =
      got.verdict === c.expected.verdict &&
      gotCategory === c.expected.category &&
      gotResolver === c.expected.resolver;

    if (ok) {
      pass++;
    } else {
      fail++;
      failures.push(
        `  ✗ ${c.id}\n` +
          `    expected: ${c.expected.verdict} | ${c.expected.category ?? '—'} | ${c.expected.resolver ?? '—'}\n` +
          `    got:      ${got.verdict} | ${gotCategory ?? '—'} | ${gotResolver ?? '—'}`,
      );
    }
  }

  console.log(`Classifier evals: ${pass}/${raw.cases.length} pass, ${fail} fail`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(f);
    return 1;
  }
  console.log('All cases passed ✓');
  return 0;
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  process.exit(main());
}

export { main };
