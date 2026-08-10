#!/usr/bin/env node
/**
 * Executable installed-versus-integrated guard.
 *
 * A changed installer/binary/dependency is not integrated merely because a
 * manifest claims a consumer. The guard checks the consumer source, then runs
 * the declared real-artifact verification command and returns machine-readable
 * ALLOW/DENY output. It is intentionally domain-neutral so installers and
 * downloaded runtimes use the same fail-closed contract.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const TRIGGER = /(?:installer|postinstall|resolve-binary|marksman|\.lsp\.json|hooks\.json|plugin\.json|package(?:-lock)?\.json|(?:^|[/\\])bin(?:[/\\]|$))/i;

export interface ConsumerClaim {
  path: string;
  requiredTokens: string[];
}

export interface VerificationCommand {
  command: string;
  args: string[];
  expectedOutput?: string;
}

export interface DeadIntegrationInput {
  repoRoot: string;
  changedPaths: string[];
  consumer?: ConsumerClaim;
  verification?: VerificationCommand;
  timeoutMs?: number;
}

export interface GuardFinding {
  code: 'NO_CONSUMER' | 'CONSUMER_MISSING' | 'CONSUMER_NOT_TRUTHFUL' | 'NO_REAL_ARTIFACT_PROOF' | 'REAL_ARTIFACT_PROOF_FAILED';
  message: string;
  path?: string;
  remediation: string;
}

export interface DeadIntegrationResult {
  status: 'ALLOW' | 'DENY';
  triggered: boolean;
  changedPaths: string[];
  findings: GuardFinding[];
  verification?: { status: 'PASSED' | 'FAILED'; exitCode: number | null; stdout: string; stderr: string };
}

function absolute(root: string, candidate: string): string {
  return path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
}

function isTriggered(changedPaths: string[]): boolean {
  return changedPaths.some((candidate) => TRIGGER.test(candidate));
}

function checkConsumer(root: string, claim: ConsumerClaim | undefined, findings: GuardFinding[]): void {
  if (!claim) {
    findings.push({
      code: 'NO_CONSUMER',
      message: 'An installed/runtime artifact changed, but no runtime consumer was supplied.',
      remediation: 'Add the real launcher or runtime consumer and wire an end-to-end verification command.',
    });
    return;
  }
  const file = absolute(root, claim.path);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    findings.push({
      code: 'CONSUMER_MISSING',
      message: `Declared runtime consumer does not exist: ${claim.path}`,
      path: claim.path,
      remediation: 'Point the guard at the shipped consumer, not a planned or declaration-only path.',
    });
    return;
  }
  const source = fs.readFileSync(file, 'utf8');
  const missing = claim.requiredTokens.filter((token) => !source.includes(token));
  if (missing.length) {
    findings.push({
      code: 'CONSUMER_NOT_TRUTHFUL',
      message: `Consumer ${claim.path} does not use the claimed runtime path; missing: ${missing.join(', ')}`,
      path: claim.path,
      remediation: 'Make the runtime consumer call the installed artifact, then rerun the real-artifact proof.',
    });
  }
}

function checkVerification(root: string, verification: VerificationCommand | undefined, findings: GuardFinding[]): DeadIntegrationResult['verification'] {
  if (!verification) {
    findings.push({
      code: 'NO_REAL_ARTIFACT_PROOF',
      message: 'No executable real-artifact verification command was supplied.',
      remediation: 'Add an unfiltered command that launches the shipped consumer against the real installed artifact.',
    });
    return undefined;
  }
  const run = spawnSync(verification.command, verification.args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  const stdout = run.stdout ?? '';
  const stderr = run.stderr ?? '';
  const outputMatches = !verification.expectedOutput || stdout.includes(verification.expectedOutput);
  const passed = run.status === 0 && !run.error && outputMatches;
  if (!passed) {
    const reason = run.error?.message ?? (run.status === null ? 'process did not exit cleanly' : `exit code ${run.status}`);
    findings.push({
      code: 'REAL_ARTIFACT_PROOF_FAILED',
      message: `Real-artifact verification failed (${reason})${outputMatches ? '' : `; expected output: ${verification.expectedOutput}`}.`,
      remediation: 'Run the real launcher/consumer in the target environment and preserve its passing evidence.',
    });
  }
  return { status: passed ? 'PASSED' : 'FAILED', exitCode: run.status, stdout, stderr };
}

export function evaluateDeadIntegration(input: DeadIntegrationInput): DeadIntegrationResult {
  const changedPaths = input.changedPaths.map((candidate) => candidate.replace(/\\/g, '/'));
  if (!isTriggered(changedPaths)) {
    return { status: 'ALLOW', triggered: false, changedPaths, findings: [] };
  }
  const findings: GuardFinding[] = [];
  checkConsumer(input.repoRoot, input.consumer, findings);
  const verification = checkVerification(input.repoRoot, input.verification, findings);
  return {
    status: findings.length === 0 ? 'ALLOW' : 'DENY',
    triggered: true,
    changedPaths,
    findings,
    ...(verification ? { verification } : {}),
  };
}

function main(): void {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('usage: dead-integration-guard/check.ts <input.json>');
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as DeadIntegrationInput;
  const result = evaluateDeadIntegration(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'DENY') process.exitCode = 2;
}

if (process.argv[1] && path.basename(process.argv[1]).replace(/\\/g, '/') === 'check.ts') main();
