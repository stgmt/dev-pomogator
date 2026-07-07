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
  return `runtime=${runtimeState}; ru=${ruStatus}; managedBy=${manifest.managedBy ?? 'unknown'}; project=${projectRoot}`;
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
  const aliases = manifest.languageStatus?.ru?.generatedAliases ?? [];
  const aliasNote = aliases.length > 0 ? `Russian aliases: ${aliases.slice(0, 8).join(', ')}.` : 'Russian aliases: none.';
  return [
    `CARL guidance ran for this prompt in project ${projectRoot}.`,
    `Status: ${status}.`,
    aliasNote,
    prompt ? `Prompt observed: ${prompt.slice(0, 160)}.` : 'Prompt observed: empty.',
  ].join(' ');
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
