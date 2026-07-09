#!/usr/bin/env npx tsx
/**
 * Managed CARL UserPromptSubmit runner.
 *
 * This is the runtime consumer proof for the CARL integration: Claude Code runs
 * this script through the plugin hook launcher, the script reads the hook input
 * cwd, resolves project-local `.carl/carl.json`, and emits agent-visible
 * additionalContext. It is builtins-only and fail-open: any failure exits 0 and
 * injects the required disclosure warning instead of blocking the user prompt.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { libraryPathForRule } from './context-diet.ts';
import { atomicWriteJson, manifestPath, readManifest, type ManagedCarlManifest } from './manifest.ts';

const REQUIRED_WARNING = 'CARL did not run; tell the user CARL guidance/recall was unavailable.';

interface UserPromptSubmitInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  permission_mode?: string;
  prompt?: string;
}

interface HookOutput {
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit';
    additionalContext: string;
  };
}

interface ManifestDomain {
  sourcePath?: string;
  title?: string;
  rules?: Array<{
    sourcePath?: string;
    aliases?: string[];
    tags?: string[];
  }>;
}

interface ContextDietReport {
  mode?: string;
  status?: string;
  estimatedTokensBefore?: number;
  estimatedTokensAfter?: number;
  rulesManaged?: number;
  rulesTotal?: number;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

function writeContext(additionalContext: string): void {
  const payload: HookOutput = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function diagnosticForFailureMode(value: string | undefined): string | undefined {
  const mode = (value ?? '').trim().toLowerCase();
  if (!mode) return undefined;
  if (mode.includes('missing')) return 'missing-runtime';
  if (mode.includes('timeout')) return 'timeout';
  if (mode.includes('malformed')) return 'malformed-output';
  if (mode.includes('unsupported')) return 'unsupported';
  if (mode.includes('exception')) return 'exception';
  return 'exception';
}

function failOpen(diagnostic: string, detail: string): void {
  writeContext([
    `CARL did not run (${diagnostic}).`,
    REQUIRED_WARNING,
    `Diagnostic: ${diagnostic}.`,
    `Detail: ${detail}`,
  ].join(' '));
}

function projectRootFrom(input: UserPromptSubmitInput): string {
  return path.resolve(process.env.CARL_PROJECT_DIR || input.cwd || process.cwd());
}

function verifyRuntimeConsumer(manifest: ManagedCarlManifest, projectRoot: string): 'verified' | 'unverified' | 'runtime-command-external-or-unverified' | 'missing-runtime' {
  const runtimeCommand = manifest.runtime?.command ?? '';
  if (!runtimeCommand || /missing|definitely-missing/u.test(runtimeCommand)) return 'missing-runtime';

  const pluginRoot = path.resolve(process.env.CLAUDE_PLUGIN_ROOT || process.cwd());
  const runnerPath = path.join(pluginRoot, runtimeCommand);
  if (!fs.existsSync(runnerPath)) return 'runtime-command-external-or-unverified';

  if (manifest.runtime.status !== 'verified') {
    atomicWriteJson(manifestPath(projectRoot), {
      ...manifest,
      runtime: {
        ...manifest.runtime,
        status: 'verified',
      },
    });
  }

  return 'verified';
}

function statusFromManifest(manifest: ManagedCarlManifest | null, projectRoot: string): string {
  if (!manifest) return 'project-missing';
  const runtimeState = verifyRuntimeConsumer(manifest, projectRoot);
  const ruStatus = manifest.languageStatus?.ru?.status ?? 'project-language-missing';
  const diet = readContextDiet(projectRoot);
  const contextMode = diet?.mode === 'lazy-managed' ? 'lazy-managed' : 'additive';
  const reduction = diet?.estimatedTokensBefore && diet?.estimatedTokensAfter
    ? `${diet.estimatedTokensBefore}->${diet.estimatedTokensAfter}`
    : 'unverified';
  return `runtime=${runtimeState}; ru=${ruStatus}; context=${contextMode}; reduction=${reduction}; managedBy=${manifest.managedBy ?? 'unknown'}; project=${projectRoot}`;
}

function readContextDiet(projectRoot: string): ContextDietReport | null {
  const filePath = path.join(projectRoot, '.carl', 'context-diet.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ContextDietReport : null;
  } catch {
    return null;
  }
}

function tokenize(value: string): string[] {
  return [...value.toLowerCase().matchAll(/[\p{L}\p{N}][\p{L}\p{N}_-]{2,}/gu)].map(match => match[0]);
}

function scoreDomain(domain: ManifestDomain, prompt: string): number {
  const promptTokens = new Set(tokenize(prompt));
  if (promptTokens.size === 0) return 0;
  const haystack = [
    domain.title ?? '',
    domain.sourcePath ?? '',
    ...(domain.rules ?? []).flatMap(rule => [rule.sourcePath ?? '', ...(rule.aliases ?? []), ...(rule.tags ?? [])]),
  ].join(' ').toLowerCase();
  let score = 0;
  for (const token of promptTokens) {
    if (haystack.includes(token)) score += token.length >= 6 ? 2 : 1;
  }
  return score;
}

function excerptMarkdown(content: string, maxChars = 900): string {
  const lines = content
    .split(/\r?\n/u)
    .filter(line => !line.trim().startsWith('```'))
    .filter(line => line.trim().length > 0);
  const out: string[] = [];
  let size = 0;
  for (const line of lines) {
    const next = line.length + 1;
    if (size + next > maxChars) break;
    out.push(line);
    size += next;
  }
  return out.join('\n');
}

function relevantRuleContext(manifest: ManagedCarlManifest, projectRoot: string, prompt: string): string[] {
  const domains = ((manifest as unknown as { domains?: ManifestDomain[] }).domains ?? [])
    .map(domain => ({ domain, score: scoreDomain(domain, prompt) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const snippets: string[] = [];
  for (const item of domains) {
    const sourcePath = item.domain.sourcePath ?? item.domain.rules?.[0]?.sourcePath;
    if (!sourcePath || !sourcePath.startsWith('.claude/rules/')) continue;
    const libraryPath = libraryPathForRule(projectRoot, sourcePath);
    if (!fs.existsSync(libraryPath)) continue;
    const content = fs.readFileSync(libraryPath, 'utf-8');
    snippets.push(`CARL loaded rule ${sourcePath} (score ${item.score}):\n${excerptMarkdown(content)}`);
  }
  return snippets;
}

function buildCarlContext(input: UserPromptSubmitInput, projectRoot: string): string {
  const manifest = readManifest(projectRoot);
  const prompt = (input.prompt ?? '').trim();

  if (!manifest) {
    return [
      'CARL did not run (project-missing).',
      REQUIRED_WARNING,
      'Diagnostic: project-missing.',
      `Detail: ${path.join(projectRoot, '.carl', 'carl.json')} was not found.`,
      prompt ? `Prompt observed: ${prompt.slice(0, 160)}.` : 'Prompt observed: empty.',
    ].join(' ');
  }

  const runtimeCommand = manifest.runtime?.command ?? '';
  if (!runtimeCommand || /missing|definitely-missing/u.test(runtimeCommand)) {
    return [
      'CARL did not run (missing-runtime).',
      REQUIRED_WARNING,
      'Diagnostic: missing-runtime.',
      `Detail: runtime command is ${runtimeCommand || 'empty'}.`,
      prompt ? `Prompt observed: ${prompt.slice(0, 160)}.` : 'Prompt observed: empty.',
    ].join(' ');
  }

  const status = statusFromManifest(manifest, projectRoot);
  const snippets = relevantRuleContext(manifest, projectRoot, prompt);
  return [
    `CARL guidance ran for this prompt in project ${projectRoot}.`,
    `Status: ${status}.`,
    snippets.length > 0
      ? `Loaded ${snippets.length} lazy rule snippet(s):\n${snippets.join('\n\n')}`
      : 'Loaded 0 lazy rule snippets; use baseline instructions only.',
    prompt ? `Prompt observed: ${prompt.slice(0, 160)}.` : 'Prompt observed: empty.',
  ].join('\n');
}

async function main(): Promise<void> {
  let input: UserPromptSubmitInput = {};
  try {
    const raw = await readStdin();
    if (raw.trim()) input = JSON.parse(raw) as UserPromptSubmitInput;
  } catch (error) {
    failOpen('malformed-output', error instanceof Error ? error.message : String(error));
    return;
  }

  const forcedDiagnostic = diagnosticForFailureMode(process.env.CARL_TEST_FAILURE_MODE);
  if (forcedDiagnostic) {
    failOpen(forcedDiagnostic, `forced test failure mode: ${process.env.CARL_TEST_FAILURE_MODE}`);
    return;
  }

  try {
    const projectRoot = projectRootFrom(input);
    writeContext(buildCarlContext(input, projectRoot));
  } catch (error) {
    failOpen('exception', error instanceof Error ? error.message : String(error));
  }
}

main()
  .catch((error) => {
    failOpen('exception', error instanceof Error ? error.message : String(error));
  })
  .finally(() => {
    process.exit(0);
  });
