#!/usr/bin/env npx tsx
/**
 * Plan Gate — PreToolUse Hook
 *
 * Blocks ExitPlanMode if the current plan file fails validation.
 * Uses tool_input.planFilePath from Claude Code (deterministic, parallel-session safe).
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
import { createHash } from 'crypto';
import { validatePlanPhased, type ValidationError } from './validate-plan.ts';
import {
  getPromptFilePath,
  isTaskNotification,
  readPromptFile,
} from './prompt-store.ts';
import { detectGuardFiles } from '../_shared/scope-gate-score-diff.ts';

interface PreToolUseInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
}

/**
 * Resolve plan file path from ExitPlanMode tool_input.
 *
 * Priority:
 *   1. tool_input.planFilePath — deterministic, injected by Claude Code
 *   2. null — fail-open (no guessing, no scoring)
 */
export function resolvePlanFile(toolInput?: Record<string, unknown>): string | null {
  const planFilePath = toolInput?.planFilePath;
  if (typeof planFilePath !== 'string' || !planFilePath) return null;

  try {
    fs.accessSync(planFilePath);
    return planFilePath;
  } catch {
    return null;
  }
}

const MAX_PROMPT_DISPLAY = 5;
const MAX_PROMPT_LENGTH = 200;

/**
 * Load user prompts from session-specific prompt-capture file.
 *
 * No fallback to most-recent file in shared home directory — that would
 * violate `.claude/rules/gotchas/hook-global-state-cwd-scoping.md` and leak
 * prompts across sessions/projects. Empty string is preferable to wrong context.
 */
export function loadUserPrompts(sessionId?: string): string {
  if (!sessionId) return '';
  try {
    return formatPromptsFromFile(getPromptFilePath(sessionId)) ?? '';
  } catch {
    return '';
  }
}

/**
 * Format user prompts from a single prompt file for inclusion in deny message.
 *
 * Defense-in-depth: filters out task-notification entries on read even if they
 * somehow ended up in the file (legacy default.json from pre-fix versions, or
 * a regression in capture-side filtering).
 */
export function formatPromptsFromFile(filePath: string): string | null {
  const data = readPromptFile(filePath);
  if (!data?.prompts?.length) return null;

  const real = data.prompts.filter((p) => !isTaskNotification(p.text));
  if (real.length === 0) return null;

  const recent = real.slice(-MAX_PROMPT_DISPLAY);
  const formatted = recent.map((p, i) => {
    const text = p.text.length > MAX_PROMPT_LENGTH
      ? p.text.substring(0, MAX_PROMPT_LENGTH) + '...'
      : p.text;
    return `  ${i + 1}. «${text}»`;
  }).join('\n');

  return `\nПоследние сообщения пользователя:\n${formatted}\n`;
}

/**
 * Check if plan content is a duplicate of another plan in ~/.claude/plans/.
 * Returns the duplicate filename or null.
 */
export function checkDuplicatePlan(planPath: string, planContent: string): string | null {
  const plansDir = path.dirname(planPath);
  const planName = path.basename(planPath);
  const planHash = createHash('sha256').update(planContent).digest('hex');

  let entries: string[];
  try {
    entries = fs.readdirSync(plansDir);
  } catch {
    return null;
  }

  const planSize = Buffer.byteLength(planContent, 'utf-8');

  for (const f of entries) {
    if (!f.endsWith('.md') || f === planName) continue;
    try {
      const otherPath = path.join(plansDir, f);
      // Short-circuit: different file sizes cannot be duplicates
      const stat = fs.statSync(otherPath);
      if (Math.abs(stat.size - planSize) > 10) continue;
      const otherContent = fs.readFileSync(otherPath, 'utf-8');
      const otherHash = createHash('sha256').update(otherContent).digest('hex');
      if (otherHash === planHash) return f;
    } catch { /* skip unreadable */ }
  }

  return null;
}

const TEMPLATE_MAX_CHARS = 8192;

/**
 * Read template.md content for inclusion in deny messages.
 * Returns formatted section or empty string on any error (fail-open).
 */
export function readTemplateContent(cwd?: string): string {
  if (!cwd) return '';
  // Canonical plugin v2 ships the template at tools/plan-pomogator/template.md;
  // fall back to the legacy installed location for backward compatibility.
  const candidates = [
    path.join(cwd, 'tools/plan-pomogator/template.md'),
    path.join(cwd, '.dev-pomogator/tools/plan-pomogator/template.md'),
  ];
  for (const templatePath of candidates) {
    try {
      const content = fs.readFileSync(templatePath, 'utf-8');
      const trimmed = content.length > TEMPLATE_MAX_CHARS
        ? content.substring(0, TEMPLATE_MAX_CHARS) + '\n...(truncated)'
        : content;
      return `\nШаблон правильного формата:\n${trimmed}\n`;
    } catch {
      // try next candidate
    }
  }
  return '';
}

const STOPWORDS = new Set([
  'about', 'after', 'before', 'between', 'would', 'could', 'should', 'which', 'where', 'there',
  'нужно', 'сделай', 'добавь', 'убери', 'потом', 'также', 'можно', 'нужна', 'блять',
  'файлы', 'claude',
]);

/**
 * Select the prompt window for relevance scoring. The naive "last 3" starves the signal
 * when recent turns are short clarifications ("да", "1 и 2", "поясни") that carry no task
 * vocabulary — every plan then scores 0 grounding and is falsely denied. Walk back from
 * the tail, accumulating prompts until we have enough distinct task vocabulary (MIN_SIGNAL)
 * or hit a cap (MAX_PROMPTS). Safe with the precision metric below: a wider corpus only
 * adds grounding opportunities (the denominator is the plan's terms, not prompt vocabulary),
 * so even a large pasted transcript helps rather than hurts.
 */
export function selectRelevanceWindow(prompts: string[]): string[] {
  const MIN_SIGNAL = 40; // distinct ≥5-letter words deemed enough to characterise the task
  const MAX_PROMPTS = 25; // bound cost on very long sessions
  const selected: string[] = [];
  const signal = new Set<string>();
  for (let i = prompts.length - 1; i >= 0 && selected.length < MAX_PROMPTS; i--) {
    selected.push(prompts[i]);
    for (const w of prompts[i].toLowerCase().match(/[a-zа-яё]{5,}/g) ?? []) signal.add(w);
    if (signal.size >= MIN_SIGNAL) break;
  }
  return selected.reverse();
}

/**
 * Score how well a plan's Extracted Requirements are GROUNDED in recent user prompts.
 *
 * Measures PRECISION (plan→prompt): "what fraction of the plan's own distinctive terms
 * appear in the request" — NOT recall ("what fraction of ALL recent words the plan
 * echoes", the previous metric). The direction flip is paste-immune by construction: the
 * denominator is the plan's term set, so a huge pasted context block (e.g. a 24KB
 * transcript) can no longer make the gate unreachable. It still catches the real target —
 * a plan copied from a DIFFERENT task (plan-freshness contamination): that plan's anchors
 * are absent from the current request → low precision.
 *
 * Salience weighting (poor-man's TF-IDF): generic filler is dropped via STOPWORDS, and
 * terms that FLOOD the prompt corpus (paste boilerplate, freq > FLOOD) are damped, so a
 * coincidental match on a common pasted word earns little grounding credit (anti-padding).
 * A true IDF needs a background corpus we don't have in a fast PreToolUse hook; this
 * approximates it cheaply and deterministically.
 *
 * Returns 0 (ok) / -10 (weak) / -20 (deny) by precision thresholds.
 */
export function scorePromptRelevance(planContent: string, promptTexts: string[]): number {
  if (promptTexts.length === 0) return 0;

  const reqMatch = planContent.match(/###\s+Extracted Requirements\s*\n([\s\S]*?)(?=\n##|\n###|$)/i);
  if (!reqMatch) return 0;
  const reqText = reqMatch[1].toLowerCase();

  // Plan's distinctive terms = the denominator (precision direction, NOT prompt vocabulary).
  const planTerms = [...new Set((reqText.match(/[a-zа-яё]{5,}/g) ?? []).filter((w) => !STOPWORDS.has(w)))];
  if (planTerms.length === 0) return 0; // nothing distinctive to judge → don't block

  // Prompt corpus + per-term frequency (drives flood-damping of paste boilerplate).
  const promptText = promptTexts.join(' ').toLowerCase();
  const promptFreq = new Map<string, number>();
  for (const w of promptText.match(/[a-zа-яё]{5,}/g) ?? []) {
    promptFreq.set(w, (promptFreq.get(w) ?? 0) + 1);
  }

  const FLOOD = 10; // freq above which a word is treated as paste-boilerplate, not signal
  const salience = (term: string): number => {
    const f = promptFreq.get(term) ?? 0;
    if (f <= FLOOD) return 1; // distinctive or normally-repeated → full weight
    return 1 / (1 + Math.log2(f / FLOOD)); // extreme flood → damped credit
  };

  let groundedWeight = 0;
  let totalWeight = 0;
  for (const term of planTerms) {
    const sal = salience(term);
    totalWeight += sal;
    if (promptText.includes(term)) groundedWeight += sal;
  }

  // Calibrated on real data: a legit plan grounded against substantive prompts scores
  // ~0.4 (distinctive technical anchors legitimately absent from a casual request drag it
  // down), while a plan copied from a different task scores ~0.0. Deny only on near-zero
  // grounding so technical-heavy-but-relevant plans are never falsely blocked.
  const precision = groundedWeight / totalWeight;
  if (precision < 0.15) return -20;
  if (precision < 0.3) return -10;
  return 0;
}

/**
 * Deny ExitPlanMode with formatted error message and exit.
 */
/**
 * FR-15: render a ValidationError[] readably (`line N: message` + hint), NOT the pre-fix
 * "line undefined: undefined" that a bare string[] produced. Exported so a BDD scenario can
 * bind to the ACTUAL deny formatting (the shipped fix), not just the Phase 2.5 trigger.
 */
export function formatDenyErrors(errors: ValidationError[]): string {
  return errors.map((e) => `  line ${e.line}: ${e.message}\n    💡 ${e.hint}`).join('\n');
}

/**
 * FR-15: the Phase 2.5 relevance-deny payload as a STRUCTURED ValidationError. The shipped bug
 * fix (b8a2bca) was passing this object instead of a bare string — a string rendered as
 * "line undefined: undefined" through formatDenyErrors. Exported for the @feature15 scenario.
 */
export function phase25RelevanceDenyError(): ValidationError {
  return {
    line: 0,
    message: 'План слабо заземлён в текущем запросе: его Extracted Requirements почти не пересекаются с тем, что ты просил в этой сессии. Похоже на план, скопированный из другой задачи.',
    hint: 'Перепиши ### Extracted Requirements так, чтобы они прямо отражали ТЕКУЩИЙ запрос (ключевые слова из твоих сообщений этой сессии), а не другую задачу.',
  };
}

function denyAndExit(planName: string, phaseLabel: string, errors: ValidationError[], extra: string = ''): never {
  const errorList = formatDenyErrors(errors);
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

  // Resolve plan file — deterministic via tool_input.planFilePath
  const planFile = resolvePlanFile(data.tool_input);
  if (!planFile) {
    process.exit(0); // no plan file path — fail-open
  }

  const planName = path.basename(planFile);
  const planContent = fs.readFileSync(planFile, 'utf-8');

  // Scope-gate advisory (non-blocking) — runs FIRST, before any deny-gates, so it
  // surfaces regardless of plan validity. Plans touching guard/policy files get a
  // stderr hint to run /verify-generic-scope-fix during implementation.
  // Motivation: reference_stocktaking-incident-products-20218 (structurally no-op fix).
  try {
    const fileChangesMatch = planContent.match(/##\s+[^\n]*File Changes[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
    if (fileChangesMatch) {
      const rows = fileChangesMatch[1].split(/\r?\n/);
      const paths = rows
        .map((r) => {
          const cols = r.split('|').map((c) => c.trim()).filter(Boolean);
          return cols[0]?.replace(/`/g, '');
        })
        .filter((p): p is string => Boolean(p) && p !== 'Path' && !/^-+$/.test(p));

      const guardHits = detectGuardFiles(paths);
      if (guardHits.length > 0) {
        const hits = guardHits.slice(0, 5).map((p) => `  • ${p}`).join('\n');
        const more = guardHits.length > 5 ? `\n  … +${guardHits.length - 5} more` : '';
        process.stderr.write(
          `[plan-gate] scope-gate advisory (non-blocking):\n` +
          `  Plan touches guard/policy files:\n${hits}${more}\n` +
          `  💡 During implementation run: /verify-generic-scope-fix before commit\n` +
          `     See: .claude/rules/scope-gate/when-to-verify.md\n`,
        );
      }
    }
  } catch { /* fail-open */ }

  // Phase 0: Duplicate Detection
  try {
    const duplicate = checkDuplicatePlan(planFile, planContent);
    if (duplicate) {
      denyAndExit(planName, 'Phase 0 — дубликат',
        [`План является копией "${duplicate}"`],
        '\nНЕ копируй содержимое из других планов. Создай план С НУЛЯ по шаблону.\n' + readTemplateContent(data.cwd));
    }
  } catch { /* fail-open */ }

  // Validate the plan (phased)
  const planLines = planContent.split(/\r?\n/);
  const result = validatePlanPhased(planLines);

  if (result.phase1.length > 0) {
    denyAndExit(planName, 'Phase 1 — структура', result.phase1,
      '\nНЕ копируй содержимое из других планов. Создай план С НУЛЯ по шаблону.\n' + readTemplateContent(data.cwd));
  }

  if (result.phase2.length > 0) {
    const promptsSection = loadUserPrompts(data.session_id);
    denyAndExit(planName, 'Phase 2 — требования', result.phase2, promptsSection + readTemplateContent(data.cwd));
  }

  // Phase 2.5: Prompt Relevance Check
  try {
    const promptTexts: string[] = [];
    if (data.session_id) {
      const promptData = readPromptFile(getPromptFilePath(data.session_id));
      if (promptData?.prompts?.length) {
        promptTexts.push(...selectRelevanceWindow(promptData.prompts.map((p) => p.text)));
      }
    }
    if (promptTexts.length > 0) {
      const relevanceScore = scorePromptRelevance(planContent, promptTexts);
      if (relevanceScore <= -20) {
        denyAndExit(planName, 'Phase 2.5 — релевантность',
          [phase25RelevanceDenyError()],
          '\nНЕ копируй содержимое из других планов. Создай план С НУЛЯ по шаблону.\n' + loadUserPrompts(data.session_id));
      }
    }
  } catch { /* fail-open */ }

  if (result.phase3.length > 0) {
    denyAndExit(planName, 'Phase 3 — кросс-ссылки (контаминация)', result.phase3);
  }

  // Phase 4: Actionability warnings (non-blocking)
  if (result.phase4.length > 0) {
    const warningList = result.phase4.map((e) => `  line ${e.line}: ${e.message}\n    💡 ${e.hint}`).join('\n');
    process.stderr.write(`[plan-gate] Phase 4 предупреждения (не блокируют):\n${warningList}\n`);
  }

  // All phases passed
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
