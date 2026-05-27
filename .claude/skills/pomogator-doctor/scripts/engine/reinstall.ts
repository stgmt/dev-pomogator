import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { DoctorReport } from './types.js';

export type AskUserFn = (prompt: {
  question: string;
  options: string[];
}) => Promise<string>;

export async function defaultAskUser(prompt: {
  question: string;
  options: string[];
}): Promise<string> {
  const { select } = await import('@inquirer/prompts');
  return await select({
    message: prompt.question,
    choices: prompt.options.map((label) => ({ name: label, value: label })),
  });
}

export interface MaybeOfferOptions {
  askUser?: AskUserFn;
  spawnInstaller?: () => Promise<number>;
}

function defaultSpawn(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['dev-pomogator'], {
      stdio: 'inherit',
      shell: false,
    });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

export async function maybeOfferReinstall(
  report: DoctorReport,
  options: MaybeOfferOptions = {},
): Promise<{ offered: boolean; accepted: boolean; installerExitCode?: number }> {
  const reinstallable = report.reinstallableIssues;
  if (reinstallable.length === 0) {
    return { offered: false, accepted: false };
  }

  const ask = options.askUser ?? defaultAskUser;
  const doSpawn = options.spawnInstaller ?? defaultSpawn;

  const preview = reinstallable
    .slice(0, 3)
    .map((r) => r.name)
    .join(', ');
  const question = `Found ${reinstallable.length} problem(s) fixable by reinstall: ${preview}${
    reinstallable.length > 3 ? ', ...' : ''
  }. Run 'npx dev-pomogator' now?`;

  const answer = await ask({
    question,
    options: ['Reinstall now', 'Show details only'],
  });

  if (answer !== 'Reinstall now') {
    return { offered: true, accepted: false };
  }

  const exitCode = await doSpawn();
  return { offered: true, accepted: true, installerExitCode: exitCode };
}
