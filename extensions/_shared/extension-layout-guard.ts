#!/usr/bin/env npx tsx
/**
 * Extension layout guard — PreToolUse hook.
 *
 * Blocks Write/Edit operations that would create rule/skill files in the wrong
 * location (`extensions/<name>/rules/` or `extensions/<name>/skills/` instead of
 * `.claude/rules/<name>/` / `.claude/skills/<name>/`).
 *
 * Only active when cwd is a dev-pomogator source repo (detected by presence of
 * `extensions/` dir + `src/installer/` dir). Fail-open elsewhere.
 *
 * See: .claude/rules/extension-layout.md
 *
 * Exit codes:
 *   0 — allow
 *   2 — deny (wrong path)
 *
 * Fail-open: parse errors, missing fields, etc. → exit 0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

const WRONG_RULE_PATH = /[\/\\]extensions[\/\\][^\/\\]+[\/\\]rules[\/\\][^\/\\]+\.md$/i;
const WRONG_SKILL_PATH = /[\/\\]extensions[\/\\][^\/\\]+[\/\\]skills[\/\\]/i;

function isDevPomogatorRepo(cwd: string): boolean {
  try {
    return fs.existsSync(path.join(cwd, 'extensions')) &&
      fs.existsSync(path.join(cwd, 'src', 'installer'));
  } catch {
    return false;
  }
}

function denyAndExit(filePath: string, rule: 'rules' | 'skills'): never {
  const m = filePath.match(/extensions[\/\\]([^\/\\]+)[\/\\]/);
  const extName = m?.[1] ?? '<ext>';
  const fileName = path.basename(filePath);
  const correctPath = rule === 'rules'
    ? `.claude/rules/${extName}/${fileName}`
    : `.claude/skills/<skill-name>/${fileName}`;

  const reason = [
    `[extension-layout-guard] BLOCKED: writing ${rule === 'rules' ? 'rule' : 'skill'} file to wrong location`,
    '',
    `  File:   ${filePath}`,
    `  Issue:  extensions/${extName}/${rule}/ is not installer-visible.`,
    `          Installer resolves source paths from dev-pomogator package root,`,
    `          looking at .claude/${rule}/<name>/ — your file won't be copied to`,
    `          target projects.`,
    '',
    `  Fix:    Write to ${correctPath} instead.`,
    `          Reference it from extension.json ${rule === 'rules' ? 'ruleFiles.claude' : 'skills + skillFiles'} as the same path.`,
    '',
    `  Docs:   .claude/rules/extension-layout.md`,
    '',
    `  Validator: npx tsx extensions/_shared/extension-layout-validate.ts`,
  ].join('\n');

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(2);
}

async function main(): Promise<void> {
  let inputData = '';

  if (process.stdin.isTTY) process.exit(0);
  for await (const chunk of process.stdin) inputData += chunk.toString();
  if (!inputData.trim()) process.exit(0);

  let data: PreToolUseInput;
  try {
    data = JSON.parse(inputData);
  } catch {
    process.exit(0); // fail-open
  }

  // Only Write / Edit / MultiEdit tools can create wrong-location files
  if (!['Write', 'Edit', 'MultiEdit'].includes(data.tool_name ?? '')) {
    process.exit(0);
  }

  const cwd = data.cwd || process.cwd();

  // Only active in dev-pomogator source repo
  if (!isDevPomogatorRepo(cwd)) process.exit(0);

  // Extract target file path from tool_input
  const filePath = typeof data.tool_input?.file_path === 'string'
    ? data.tool_input.file_path
    : typeof data.tool_input?.path === 'string'
      ? data.tool_input.path
      : null;
  if (!filePath) process.exit(0);

  const normalized = path.resolve(filePath);

  if (WRONG_RULE_PATH.test(normalized)) {
    denyAndExit(normalized, 'rules');
  }

  if (WRONG_SKILL_PATH.test(normalized)) {
    denyAndExit(normalized, 'skills');
  }

  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  main().catch((err) => {
    process.stderr.write(`[extension-layout-guard] Error: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(0); // fail-open
  });
}
