#!/usr/bin/env npx tsx
/**
 * Extract a VALID minimal subset of a Cucumber Messages NDJSON stream — for the
 * `real-fixtures` skill (step 4). Keeps the global envelopes plus the full
 * `pickle → testCase → testCaseStarted → testStepFinished → testCaseFinished`
 * chain for the chosen scenarios, and trims the `gherkinDocument` AST to just
 * those scenarios. Result is a real, parseable fixture — not hand-built.
 *
 * Usage:
 *   npx tsx extract-ndjson-subset.ts <source.ndjson> <output.ndjson> <name-prefix>...
 * Example (one passed / pending / undefined scenario):
 *   npx tsx extract-ndjson-subset.ts .dev-pomogator/.last-test-run.ndjson \
 *     tests/fixtures/ndjson/real-cucumber-sample.ndjson SPECGEN004_03 SPECGEN004_10 SPECGEN004_29
 *
 * Pure node builtins — no project imports — so it ships with the plugin.
 */
import fs from 'node:fs';
import path from 'node:path';

const [src, out, ...prefixes] = process.argv.slice(2);
if (!src || !out || prefixes.length === 0) {
  console.error('usage: extract-ndjson-subset.ts <source.ndjson> <output.ndjson> <scenario-name-prefix>...');
  process.exit(2);
}
const isTarget = (name: string): boolean => prefixes.some((p) => name === p || name.startsWith(p + ' '));

const lines = fs.readFileSync(src, 'utf8').split(/\r?\n/).filter(Boolean);
const pickleIds = new Set<string>();
const testCaseIds = new Set<string>();
const startedIds = new Set<string>();
const kept: string[] = [];

for (const line of lines) {
  let e: Record<string, any>;
  try { e = JSON.parse(line); } catch { continue; }

  if (e.gherkinDocument) {
    const g = structuredClone(e);
    const children = g.gherkinDocument?.feature?.children ?? [];
    g.gherkinDocument.feature.children = children.filter(
      (c: any) => c.scenario && typeof c.scenario.name === 'string' && isTarget(c.scenario.name),
    );
    kept.push(JSON.stringify(g));
    continue;
  }
  if (e.pickle) {
    if (isTarget(e.pickle.name ?? '')) { pickleIds.add(e.pickle.id); kept.push(line); }
    continue;
  }
  if (e.testCase) {
    if (pickleIds.has(e.testCase.pickleId)) { testCaseIds.add(e.testCase.id); kept.push(line); }
    continue;
  }
  if (e.testCaseStarted) {
    if (testCaseIds.has(e.testCaseStarted.testCaseId)) { startedIds.add(e.testCaseStarted.id); kept.push(line); }
    continue;
  }
  if (e.testStepFinished) {
    if (startedIds.has(e.testStepFinished.testCaseStartedId)) kept.push(line);
    continue;
  }
  if (e.testCaseFinished) {
    if (startedIds.has(e.testCaseFinished.testCaseStartedId)) kept.push(line);
    continue;
  }
  // Global envelopes a valid stream needs.
  if (e.meta || e.source || e.stepDefinition || e.hook || e.parameterType || e.undefinedParameterType || e.testRunStarted || e.testRunFinished) {
    kept.push(line);
  }
}

if (pickleIds.size === 0) {
  console.error(`no scenarios matched prefixes: ${prefixes.join(', ')}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, kept.join('\n') + '\n');
console.log(`wrote ${out} — ${kept.length} envelopes, ${pickleIds.size} scenarios, ${fs.statSync(out).size} bytes`);
console.log('NEXT: parse the fixture and assert the ground truth (skill step 6); write a README with provenance (step 5).');
