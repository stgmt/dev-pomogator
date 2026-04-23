#!/usr/bin/env npx tsx
/**
 * risk-assessment-guard — PreToolUse hook.
 *
 * Blocks Write/Edit of RESEARCH.md in v3 specs when `## Risk Assessment`
 * heading exists but the table under it has fewer than 2 non-placeholder
 * rows (each with Likelihood, Impact, Mitigation populated).
 *
 * RESEARCH.md without `## Risk Assessment` heading passes — risks section
 * is added by `discovery-forms` skill in Phase 1 once it has content.
 *
 * @see .specs/spec-generator-v3/FR.md FR-8, FR-9, FR-10, FR-12
 */

import { isV3Spec } from './phase-constants.ts';
import { parseRiskRows, extractSpecInfo, extractWriteContent } from './spec-form-parsers.ts';
import { logEvent } from './audit-logger.ts';

const HOOK_NAME = 'risk-assessment-guard';
const TARGET_FILE = 'RESEARCH.md';
const MIN_ROWS = 2;

interface PreToolUseInput {
  tool_name?: string;
  tool_input?: { file_path?: string; content?: string; new_string?: string };
}

async function readStdin(): Promise<string> {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk.toString();
  return buf;
}

function deny(reason: string, filepath: string): never {
  logEvent(HOOK_NAME, 'DENY', filepath, reason);
  process.stderr.write(`[${HOOK_NAME}] ${reason}\n`);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[${HOOK_NAME}] ${reason}`,
    },
  }));
  process.exit(2);
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) process.exit(0);
  const raw = await readStdin();
  if (!raw.trim()) process.exit(0);

  const data = JSON.parse(raw) as PreToolUseInput;
  if (data.tool_name !== 'Write' && data.tool_name !== 'Edit') process.exit(0);

  const filePath = data.tool_input?.file_path;
  if (!filePath || !filePath.endsWith(TARGET_FILE)) process.exit(0);

  const specInfo = extractSpecInfo(filePath);
  if (!specInfo) process.exit(0);

  if (!isV3Spec(specInfo.specDir)) {
    logEvent(HOOK_NAME, 'ALLOW_AFTER_MIGRATION', filePath);
    process.exit(0);
  }

  const content = extractWriteContent(data.tool_input as Record<string, unknown>);
  if (!content.trim()) process.exit(0);

  const assessment = parseRiskRows(content);
  if (assessment.headingLineNumber === null) {
    // No Risk Assessment section — optional before Phase 1 complete
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath, 'no Risk Assessment heading');
    process.exit(0);
  }

  if (assessment.validRowCount >= MIN_ROWS) {
    logEvent(HOOK_NAME, 'ALLOW_VALID', filePath);
    process.exit(0);
  }

  const details = assessment.rows.length === 0
    ? 'table is empty'
    : `only ${assessment.validRowCount} valid row(s) out of ${assessment.rows.length} (need ≥${MIN_ROWS})`;
  const msg =
    `Risk Assessment in ${specInfo.filename} has insufficient populated rows: ${details}.\n` +
    `Required: ≥${MIN_ROWS} rows with Risk + Likelihood (Low|Medium|High) + Impact (Low|Medium|High) + Mitigation (non-placeholder).\n` +
    `Fix: call Skill("discovery-forms") — it populates Risk Assessment from USE_CASES edge cases and architectural constraints.`;
  deny(msg, filePath);
}

main().catch((e) => {
  try {
    logEvent(HOOK_NAME, 'PARSER_CRASH', process.env.PWD || '', String(e?.message || e));
  } catch {
    // ignore
  }
  process.stderr.write(`[${HOOK_NAME}] fail-open: ${e}\n`);
  process.exit(0);
});
