#!/usr/bin/env node
/**
 * W5 — PostToolUse hook: judge BDD-test quality on edit (plan iridescent-giggling-lemur).
 *
 * Fires after Edit/Write of a `.feature` file or a `tests/step_definitions/*.ts` step-def. Gathers
 * the proper CONTEXT (the edit + its step-def + the code-under-test the step-def drives) and asks the
 * Haiku judge (judge.ts) to score it against the strong-tests §6.5 rubric. If WEAK → prints an
 * ADVISORY warning to the agent (never blocks). Fail-open: no token / unreachable / non-BDD edit →
 * silent exit 0. Dep-safe: node builtins + the judge module (which is builtins-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { judgeBddQuality, type BddJudgeInput } from './judge.ts';

interface PostToolUseInput {
  tool_name?: string;
  tool_input?: { file_path?: string; content?: string; new_string?: string; [k: string]: unknown };
  cwd?: string;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

function isBddFile(fp: string): 'feature' | 'step-def' | null {
  if (/\.feature$/.test(fp)) return 'feature';
  if (/(?:^|[/\\])tests[/\\]step_definitions[/\\].*\.ts$/.test(fp)) return 'step-def';
  return null;
}

/** Best-effort: read the first relative production import a step-def drives (the code-under-test). */
function readCodeUnderTest(stepDefText: string, repoRoot: string): string | undefined {
  const m = stepDefText.match(/from\s+['"]((?:\.\.?\/)[^'"]*?(?:tools|src|\.claude\/skills)[^'"]*?)['"]/);
  if (!m) return undefined;
  let rel = m[1];
  if (!/\.(ts|mjs|cjs|js)$/.test(rel)) rel += '.ts';
  // step-defs live under tests/step_definitions/ → resolve relative to that
  const guesses = [
    path.resolve(repoRoot, 'tests', 'step_definitions', rel),
    path.resolve(repoRoot, rel.replace(/^(\.\.\/)+/, '')),
  ];
  for (const g of guesses) {
    try {
      if (fs.existsSync(g)) return fs.readFileSync(g, 'utf-8');
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/** Best-effort: find a step-def file for an edited .feature by its spec slug. */
function findStepDefForFeature(featurePath: string, repoRoot: string): string | undefined {
  const slug = path.basename(featurePath).replace(/\.feature$/, '');
  const dir = path.resolve(repoRoot, 'tests', 'step_definitions');
  try {
    const norm = slug.replace(/-/g, '_');
    const hit = fs.readdirSync(dir).find((f) => f.includes(norm) || f.includes(slug));
    if (hit) return fs.readFileSync(path.join(dir, hit), 'utf-8');
  } catch {
    /* ignore */
  }
  return undefined;
}

async function main(): Promise<void> {
  let data: PostToolUseInput;
  try {
    data = JSON.parse(await readStdin()) as PostToolUseInput;
  } catch {
    process.exit(0); // not a JSON payload → nothing to judge
  }
  if (data.tool_name !== 'Edit' && data.tool_name !== 'Write') process.exit(0);
  const fp = data.tool_input?.file_path ?? '';
  const kind = isBddFile(fp);
  if (!kind) process.exit(0);

  const repoRoot = data.cwd || process.cwd();
  const edited = data.tool_input?.content ?? data.tool_input?.new_string ?? '';
  if (!edited.trim()) process.exit(0);

  const input: BddJudgeInput = { edited, kind };
  if (kind === 'step-def') {
    input.stepDef = edited;
    input.codeUnderTest = readCodeUnderTest(edited, repoRoot);
  } else {
    input.stepDef = findStepDefForFeature(fp, repoRoot);
    if (input.stepDef) input.codeUnderTest = readCodeUnderTest(input.stepDef, repoRoot);
  }

  const verdict = await judgeBddQuality(input);
  if (verdict?.weak) {
    const msg = `⚠️ BDD-quality (Haiku, advisory): этот ${kind === 'feature' ? 'сценарий' : 'step-def'} слаб — ${verdict.reason}\n  Рубрик: strong-tests §6.5 (drives-real-code · тугие ассерты · покрытие ветки · не fake-green).`;
    // PostToolUse advisory: surface to the agent via additionalContext, and to the user via stderr.
    try {
      process.stdout.write(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: msg } }) + '\n',
      );
    } catch {
      /* ignore */
    }
    try {
      process.stderr.write(msg + '\n');
    } catch {
      /* ignore */
    }
  }
  process.exit(0); // advisory only — never block
}

main().catch(() => process.exit(0)); // fail-open: a plugin hook must never crash
