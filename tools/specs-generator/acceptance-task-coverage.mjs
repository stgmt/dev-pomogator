#!/usr/bin/env node
/** Deterministic acceptance-claim → delivery-task coverage (FR-65). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANE_DEFINITIONS = Object.freeze({
  source_mapping: /\b(dto|config|source[ -]of[ -]truth|registry|implementation mapping)\b/i,
  contract_regression: /\b(contract regression|contract test|response[ -]shape regression)\b/i,
  semantic_readback: /\bstatus\b[\s\S]{0,80}\bcontent[ -]?type\b[\s\S]{0,80}\bbody\b|status\/content-type\/body/i,
  version_compatibility: /\bproducer\b[\s\S]{0,80}\bconsumer\b|\bcompatibility\b|\barchitecture decision\b/i,
  input_schema: /\b(renderable[ -])?input[ -]schema\b|\bno[ -]schema ux\b/i,
  redaction: /\ballowlist\b|\bredaction\b/i,
  route_prefix: /\broot\b[\s\S]{0,80}\/api[\s\S]{0,80}(prefix|\/go\/api)|\broute prefix\b/i,
  unauthenticated: /\bunauthenticated\b|\b401\b/i,
  insufficient_balance: /\binsufficient[ -]balance\b|\b402\b/i,
  funded_success: /\bfunded[ -](success|execution|dispatch)\b/i,
  settlement_idempotency: /\bsettlement\b[\s\S]{0,80}\bidempot|\bidempotent settlement\b/i,
  artifact_readback: /\b(result|artifact)\b[\s\S]{0,80}\breadback\b/i,
  controlled_spend: /\bcontrolled[ -]spend\b|\btest account\b[\s\S]{0,80}\b(spend guardrail|budget)\b/i,
});

const CLAIM_CLASSIFIERS = Object.freeze([
  {
    kind: 'public_contract',
    trigger: /\b(public|external(?:ly)? observable)\b[\s\S]{0,140}\b(api|catalog|policy|dto|response|field|contract)\b/i,
    lanes: ['source_mapping', 'contract_regression', 'semantic_readback'],
  },
  { kind: 'version', trigger: /\b(contractversion|contract version|versioned contract|producer\/consumer)\b/i, lanes: ['version_compatibility'] },
  { kind: 'ui_input', trigger: /\b(ui input|input schema|renderable schema|no[ -]schema ux)\b/i, lanes: ['input_schema'] },
  { kind: 'redaction', trigger: /\b(redaction|allowlist|internal (runtime|detail)|public\/internal)\b/i, lanes: ['redaction'] },
  {
    kind: 'paid_auth',
    trigger: /\b(paid|billing|balance|reservation|settlement|funded|insufficient[ -]balance|401|402|authenticated|authentication|unauthenticated|(?:result|artifact)[ -]delivery)\b|\bauth\b[\s\S]{0,40}\b(admission|flow|boundary|api)\b|\b(admission|flow|boundary|api)\b[\s\S]{0,40}\bauth\b/i,
    lanes: ['unauthenticated', 'insufficient_balance', 'funded_success', 'settlement_idempotency', 'artifact_readback'],
  },
  {
    kind: 'deployment',
    trigger: /\b(deploy(?:ed|ment)?|production|live)\b[\s\S]{0,160}\b(api|response|route|readback)\b/i,
    lanes: ['semantic_readback'],
  },
]);

export function parseAcceptanceSections(content) {
  const starts = [...content.matchAll(/^#{1,6}\s+(AC-\d+(?:\.\d+)?)\b[^\n]*(?:\r?\n|$)/gim)];
  return starts.map((start, index) => ({
    acId: start[1].toUpperCase(),
    text: content.slice((start.index ?? 0) + start[0].length, starts[index + 1]?.index ?? content.length).trim(),
  }));
}

function parseTaskBlocks(content) {
  const starts = [...content.matchAll(/^(?:###\s+.+|-\s*\[[ xX]\]\s+.+)/gm)];
  return starts.map((start, index) => ({
    text: content.slice(start.index, starts[index + 1]?.index ?? content.length).trim(),
  }));
}

function taskAcceptanceIds(text) {
  return new Set(
    [...text.matchAll(/(?:^|[^A-Z0-9.-])(AC-\d+(?:\.\d+)?)(?![\d.])/gim)]
      .map((match) => match[1].toUpperCase()),
  );
}

function classifyClaim(text) {
  const kinds = [];
  const lanes = new Set();
  for (const classifier of CLAIM_CLASSIFIERS) {
    if (!classifier.trigger.test(text)) continue;
    kinds.push(classifier.kind);
    for (const lane of classifier.lanes) lanes.add(lane);
  }
  if (kinds.includes('deployment') && /\b(api|route|prefix)\b/i.test(text)) lanes.add('route_prefix');
  if (/\b(costly|expensive|spend|production paid)\b/i.test(text) && kinds.includes('paid_auth')) lanes.add('controlled_spend');
  return { kinds, requiredLanes: [...lanes] };
}

export function analyzeAcceptanceTaskCoverage({ acceptanceContent, tasksContent }) {
  const tasks = parseTaskBlocks(tasksContent);
  const claims = [];
  const findings = [];

  for (const section of parseAcceptanceSections(acceptanceContent)) {
    const classification = classifyClaim(section.text);
    if (classification.requiredLanes.length === 0) continue;
    const mappedTasks = tasks.filter((task) => taskAcceptanceIds(task.text).has(section.acId));
    const combined = mappedTasks.map((task) => task.text).join('\n');
    const blockedInvestigation = mappedTasks.length > 0
      && mappedTasks.every((task) => /\bStatus:\s*BLOCKED\b/i.test(task.text) && /\b(investigat|research|unknown|analysis)\w*/i.test(task.text));
    const missingLanes = classification.requiredLanes.filter((lane) => !LANE_DEFINITIONS[lane].test(combined));
    const claim = { ...section, ...classification, mappedTaskCount: mappedTasks.length, missingLanes, blockedInvestigation };
    claims.push(claim);

    if (mappedTasks.length === 0) {
      findings.push({ acId: section.acId, code: 'MISSING_AC_TASK_MAPPING', missingLanes: classification.requiredLanes, blockingInvestigation: true });
    } else if (blockedInvestigation) {
      findings.push({ acId: section.acId, code: 'UNRESOLVED_ACCEPTANCE_INVESTIGATION', missingLanes, blockingInvestigation: true });
    } else if (missingLanes.length > 0) {
      findings.push({ acId: section.acId, code: 'MISSING_ACCEPTANCE_DELIVERY_LANES', missingLanes, blockingInvestigation: false });
    }
  }

  return { ok: findings.length === 0, claims, findings };
}

function parseCli(argv) {
  const result = { format: 'json' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--spec') result.spec = argv[++i];
    else if (argv[i] === '--acceptance') result.acceptance = argv[++i];
    else if (argv[i] === '--tasks') result.tasks = argv[++i];
    else if (argv[i] === '--format') result.format = argv[++i];
  }
  if (result.spec) {
    result.acceptance = path.join(result.spec, 'ACCEPTANCE_CRITERIA.md');
    result.tasks = path.join(result.spec, 'TASKS.md');
  }
  if (!result.acceptance || !result.tasks) throw new Error('Use --spec <dir> or --acceptance <file> --tasks <file>');
  return result;
}

function renderText(report) {
  if (report.ok) return `ACCEPTANCE_DELIVERY_COVERAGE: PASS (${report.claims.length} high-risk claim(s))`;
  return report.findings.map((finding) => `${finding.acId} ${finding.code}: ${finding.missingLanes.join(', ')}`).join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = parseCli(process.argv.slice(2));
    const report = analyzeAcceptanceTaskCoverage({
      acceptanceContent: fs.readFileSync(path.resolve(options.acceptance), 'utf8'),
      tasksContent: fs.readFileSync(path.resolve(options.tasks), 'utf8'),
    });
    process.stdout.write(options.format === 'text' ? `${renderText(report)}\n` : `${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  }
}
