#!/usr/bin/env npx tsx
/**
 * Plan Gate — PreToolUse Hook
 *
 * Blocks ExitPlanMode if the current plan file fails validation.
 * Finds the most recently modified plan in ~/.claude/plans/ and runs validatePlan().
 *
 * Exit codes:
 *   0 — allow (pass-through)
 *   2 — deny (plan validation failed)
 *
 * Fail-open: any error → exit(0) (never block due to hook bugs)
 *
 * Pattern: extensions/specs-workflow/tools/specs-validator/phase-gate.ts
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { validatePlan } from './validate-plan';

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
}

/**
 * Find the most recently modified .md file in ~/.claude/plans/.
 * Only considers files modified within the last 60 minutes (likely current session).
 */
function findLatestPlanFile(): string | null {
  const plansDir = path.join(os.homedir(), '.claude', 'plans');
  if (!fs.existsSync(plansDir)) return null;

  const entries = fs.readdirSync(plansDir);
  const mdFiles = entries
    .filter((f) => f.endsWith('.md') && !f.includes('-agent-'))
    .map((f) => {
      const fullPath = path.join(plansDir, f);
      const stat = fs.statSync(fullPath);
      return { path: fullPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (mdFiles.length === 0) return null;

  // Only consider files modified in the last 60 minutes
  const sixtyMinutesAgo = Date.now() - 60 * 60 * 1000;
  if (mdFiles[0].mtimeMs < sixtyMinutesAgo) return null;

  return mdFiles[0].path;
}

async function main(): Promise<void> {
  let inputData = '';

  if (process.stdin.isTTY) {
    process.exit(0);
  }

  for await (const chunk of process.stdin) {
    inputData += chunk.toString();
  }

  if (!inputData.trim()) {
    process.exit(0);
  }

  const data: PreToolUseInput = JSON.parse(inputData);

  // Only gate ExitPlanMode
  if (data.tool_name !== 'ExitPlanMode') {
    process.exit(0);
  }

  // Find the most recently modified plan file
  const planFile = findLatestPlanFile();
  if (!planFile) {
    process.exit(0); // no plan file found, fail-open
  }

  // Validate the plan
  const errors = validatePlan(planFile);
  if (errors.length === 0) {
    process.exit(0); // valid plan, allow
  }

  // DENY — plan validation failed
  const errorList = errors.map((e) => `  line ${e.line}: ${e.message}`).join('\n');
  const planName = path.basename(planFile);
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[plan-gate] План "${planName}" не прошёл валидацию (${errors.length} ошибок):\n${errorList}\n\nИсправь план и попробуй снова.`,
    },
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

// Fail-open wrapper: any error → allow
main().catch((_e) => {
  process.stderr.write(`[plan-gate] Error: ${_e instanceof Error ? _e.stack : String(_e)}\n`);
  process.exit(0);
});
