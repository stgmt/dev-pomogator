#!/usr/bin/env npx tsx
/**
 * Plan Gate — PreToolUse Hook
 *
 * Blocks ExitPlanMode if the current plan file fails validation.
 * Finds the most recently modified plan in ~/.claude/plans/ and runs validatePlanPhased().
 *
 * Phase 1 errors → structural issues only.
 * Phase 2 errors → requirements issues + last 5 user prompts from prompt-capture cache.
 *
 * Exit codes:
 *   0 — allow (pass-through)
 *   2 — deny (plan validation failed)
 *
 * Fail-open: any error → exit(0) (never block due to hook bugs)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { validatePlanPhased, type ValidationError } from './validate-plan';
import {
  PROMPT_FILE_PREFIX,
  getPromptsDir,
  getPromptFilePath,
  readPromptFile,
} from './prompt-store';

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
}

/**
 * Extract file paths from the ## File Changes markdown table.
 * Matches rows like: | `path/to/file.ts` | action | reason |
 */
export function extractFileChangePaths(content: string): string[] {
  const paths: string[] = [];
  const fileChangesMatch = content.indexOf('## File Changes');
  if (fileChangesMatch === -1) return paths;

  const tableSection = content.slice(fileChangesMatch);
  const lines = tableSection.split('\n');

  let pastHeader = false;
  for (const line of lines) {
    if (!line.includes('|')) continue;
    // Skip header row and separator
    if (/^\|\s*Path\s*\|/i.test(line.trim())) { pastHeader = false; continue; }
    if (/^\|[\s-|]+\|/.test(line.trim())) { pastHeader = true; continue; }
    if (!pastHeader) continue;
    // Stop at next section
    if (/^##\s/.test(line)) break;

    const columns = line.split('|').map((c) => c.trim()).filter(Boolean);
    if (columns.length >= 2) {
      const filePath = columns[0].replace(/`/g, '').trim();
      if (filePath && filePath !== 'Path' && !filePath.startsWith('-')) {
        paths.push(filePath);
      }
    }
  }

  return paths;
}

/**
 * Score how well a plan's content matches a project directory.
 * +10 for each File Changes path that exists in cwd.
 * +5 for project basename mention in content.
 */
export function scoreCandidate(content: string, cwd: string): number {
  let score = 0;

  // Check project basename mention
  const projectName = path.basename(cwd).toLowerCase();
  if (projectName && content.toLowerCase().includes(projectName)) {
    score += 5;
  }

  // Check File Changes paths existence in cwd
  const filePaths = extractFileChangePaths(content);
  for (const p of filePaths) {
    try {
      if (fs.existsSync(path.join(cwd, p))) {
        score += 10;
      }
    } catch { /* skip unreadable paths */ }
  }

  return score;
}

const MAX_CANDIDATES_TO_SCORE = 5;
const PLAN_READ_LIMIT = 16384; // 16KB — enough to reach ## File Changes at end of typical plans

/**
 * Find the most recently modified .md file in ~/.claude/plans/.
 * Only considers files modified within the last 60 minutes (likely current session).
 * When cwd is provided, scores candidates by content match to prefer project-relevant plans.
 */
function findLatestPlanFile(cwd?: string): string | null {
  const plansDir = path.join(os.homedir(), '.claude', 'plans');
  if (!fs.existsSync(plansDir)) return null;

  const entries = fs.readdirSync(plansDir);
  const sixtyMinutesAgo = Date.now() - 60 * 60 * 1000;
  const candidates: { path: string; mtimeMs: number }[] = [];

  for (const f of entries) {
    if (!f.endsWith('.md') || f.includes('-agent-')) continue;
    const fullPath = path.join(plansDir, f);
    const stat = fs.statSync(fullPath);
    if (stat.mtimeMs >= sixtyMinutesAgo) {
      candidates.push({ path: fullPath, mtimeMs: stat.mtimeMs });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by mtime descending
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  // Single candidate or no cwd — return most recent
  if (candidates.length === 1 || !cwd) {
    return candidates[0].path;
  }

  // Score top candidates by content match against cwd
  let bestMatch: { path: string; score: number; mtimeMs: number } | null = null;
  const buf = Buffer.alloc(PLAN_READ_LIMIT);

  for (const candidate of candidates.slice(0, MAX_CANDIDATES_TO_SCORE)) {
    let fd: number | undefined;
    try {
      fd = fs.openSync(candidate.path, 'r');
      const bytesRead = fs.readSync(fd, buf, 0, PLAN_READ_LIMIT, 0);
      const content = buf.toString('utf-8', 0, bytesRead);

      const score = scoreCandidate(content, cwd);
      if (score > 0 && (!bestMatch || score > bestMatch.score || (score === bestMatch.score && candidate.mtimeMs > bestMatch.mtimeMs))) {
        bestMatch = { path: candidate.path, score, mtimeMs: candidate.mtimeMs };
      }
    } catch { /* skip unreadable files, fail-open */ } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }

  // Return best content match, or fallback to most recent by mtime
  return bestMatch?.path ?? candidates[0].path;
}

const MAX_PROMPT_DISPLAY = 5;
const MAX_PROMPT_LENGTH = 200;

/**
 * Load user prompts from prompt-capture file.
 * Tries session-specific file first, falls back to most recent.
 */
function loadUserPrompts(sessionId?: string): string {
  try {
    const dir = getPromptsDir();

    // Try session-specific file first
    if (sessionId) {
      const result = formatPromptsFromFile(getPromptFilePath(sessionId));
      if (result) return result;
    }

    // Fallback: find most recent prompt file
    let mostRecent: { path: string; mtime: number } | null = null;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return '';
    }

    for (const f of entries) {
      if (!f.startsWith(PROMPT_FILE_PREFIX) || !f.endsWith('.json')) continue;
      const fullPath = path.join(dir, f);
      try {
        const mtime = fs.statSync(fullPath).mtimeMs;
        if (!mostRecent || mtime > mostRecent.mtime) {
          mostRecent = { path: fullPath, mtime };
        }
      } catch { /* skip unreadable files */ }
    }

    if (mostRecent) {
      const result = formatPromptsFromFile(mostRecent.path);
      if (result) return result;
    }
  } catch {
    // fail-open: prompt loading errors are not critical
  }
  return '';
}

function formatPromptsFromFile(filePath: string): string | null {
  const data = readPromptFile(filePath);
  if (!data?.prompts?.length) return null;

  const recent = data.prompts.slice(-MAX_PROMPT_DISPLAY);
  const formatted = recent.map((p, i) => {
    const text = p.text.length > MAX_PROMPT_LENGTH
      ? p.text.substring(0, MAX_PROMPT_LENGTH) + '...'
      : p.text;
    return `  ${i + 1}. «${text}»`;
  }).join('\n');

  return `\nПоследние сообщения пользователя:\n${formatted}\n`;
}

const TEMPLATE_MAX_CHARS = 8192;

/**
 * Read template.md content for inclusion in deny messages.
 * Returns formatted section or empty string on any error (fail-open).
 */
export function readTemplateContent(cwd?: string): string {
  if (!cwd) return '';
  try {
    const templatePath = path.join(cwd, '.dev-pomogator/tools/plan-pomogator/template.md');
    const content = fs.readFileSync(templatePath, 'utf-8');
    const trimmed = content.length > TEMPLATE_MAX_CHARS
      ? content.substring(0, TEMPLATE_MAX_CHARS) + '\n...(truncated)'
      : content;
    return `\nШаблон правильного формата:\n${trimmed}\n`;
  } catch {
    return '';
  }
}

/**
 * Deny ExitPlanMode with formatted error message and exit.
 */
function denyAndExit(planName: string, phaseLabel: string, errors: ValidationError[], extra: string = ''): never {
  const errorList = errors.map((e) => `  line ${e.line}: ${e.message}\n    💡 ${e.hint}`).join('\n');
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[plan-gate] План "${planName}" не прошёл валидацию ${phaseLabel} (${errors.length} ошибок):\n${errorList}\n${extra}\nИсправь план и попробуй снова.`,
    },
  };
  process.stdout.write(JSON.stringify(output));
  process.exit(2);
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

  let data: PreToolUseInput;
  try {
    data = JSON.parse(inputData);
  } catch {
    process.exit(0); // invalid JSON — fail-open
  }

  // Only gate ExitPlanMode
  if (data.tool_name !== 'ExitPlanMode') {
    process.exit(0);
  }

  // Find the most recently modified plan file (scoped to current project via cwd)
  const planFile = findLatestPlanFile(data.cwd);
  if (!planFile) {
    process.exit(0); // no plan file found, fail-open
  }

  // Validate the plan (phased)
  const result = validatePlanPhased(planFile);
  const planName = path.basename(planFile);

  if (result.phase1.length > 0) {
    denyAndExit(planName, 'Phase 1 — структура', result.phase1, readTemplateContent(data.cwd));
  }

  if (result.phase2.length > 0) {
    const promptsSection = loadUserPrompts(data.session_id);
    denyAndExit(planName, 'Phase 2 — требования', result.phase2, promptsSection + readTemplateContent(data.cwd));
  }

  // Both phases passed
  process.exit(0);
}

// Import guard: only run main() when executed directly (not when imported by tests)
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  // Fail-open wrapper: any error → allow
  main().catch((_e) => {
    process.stderr.write(`[plan-gate] Error: ${_e instanceof Error ? _e.stack : String(_e)}\n`);
    process.exit(0);
  });
}
