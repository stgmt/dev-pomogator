/**
 * Phase 0 Step 6: Text gate (FR-6, AC-6, NFR-U2).
 *
 * AI agent пишет 1-абзац резюме архитектуры репо (living language, non-technical).
 * User confirms, corrects, or aborts. Up to 3 iterations. If not confirmed — abort
 * с hint "--refresh-onboarding when ready".
 *
 * DI pattern via UserResponseProvider — production wires to chat input, tests pass
 * scripted responses.
 *
 * See .specs/onboard-repo-phase0/{FR.md#fr-6, AC.md#ac-6, NFR.md#usability}.
 */

import type {
  ArchetypeTriageResult,
  BaselineTestResult,
  OnboardingJson,
} from '../lib/types.ts';
import type { MergedRecon } from '../lib/subagent-merge.ts';


export type GateResponseClass = 'confirm' | 'abort' | 'correction' | 'ambiguous';


export interface TextGateContext {
  archetype: ArchetypeTriageResult;
  recon: MergedRecon;
  baseline: BaselineTestResult;
  project: Pick<OnboardingJson['project'], 'name'>;
}


export interface TextGateDeps {
  /** Prompt user with the summary. Returns user's response string. */
  askUser: (iteration: number, summary: string) => Promise<string>;
  /** Optional hook to update summary based on user's correction. */
  applyCorrection?: (previousSummary: string, correction: string) => string;
}


export interface TextGateResult {
  confirmed: boolean;
  aborted: boolean;
  abortReason?: string;
  iterations: number;
  finalSummary: string;
}


export const MAX_ITERATIONS = 3;


const CONFIRM_REGEX = /(?:^|\s|,|\.)(да|верно|правильно|точно|конечно|yes|yep|yeah|correct|right|confirm|ok|okay)(?:$|\s|,|\.|!|\?)/i;
const ABORT_REGEX = /(?:^|\s|,|\.)(прервать|отмена|отменить|выход|abort|cancel|stop|quit)(?:$|\s|,|\.|!|\?)/i;
const CORRECTION_REGEX = /(?:^|\s|,)(не\s+совсем|нет|not\s+quite|actually|на\s+самом\s+деле|неверно|wrong|but|но)(?:$|\s|,|\.|!|\?)/i;


export function classifyResponse(input: string): GateResponseClass {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 'ambiguous';

  const hasAbort = ABORT_REGEX.test(trimmed);
  if (hasAbort) return 'abort';

  const hasCorrection = CORRECTION_REGEX.test(trimmed);
  const hasConfirm = CONFIRM_REGEX.test(trimmed);

  if (hasCorrection) return 'correction';
  if (hasConfirm) return 'confirm';

  return 'ambiguous';
}


export function composeSummary(ctx: TextGateContext): string {
  const { archetype, recon, baseline, project } = ctx;
  const parts: string[] = [];

  const languageSummary = recon.languages.length > 0
    ? recon.languages.map((l) => l.name).slice(0, 2).join('/')
    : 'unknown stack';
  const frameworkSummary = recon.frameworks.length > 0
    ? recon.frameworks.slice(0, 2).map((f) => f.name).join(' + ')
    : '';

  const intro = frameworkSummary
    ? `Проект «${project.name}» — это ${archetype.archetype} на ${frameworkSummary} (${languageSummary}).`
    : `Проект «${project.name}» — это ${archetype.archetype} (${languageSummary}).`;
  parts.push(intro);

  if (recon.architecture_hint) {
    parts.push(`Архитектура: ${recon.architecture_hint}.`);
  }

  if (recon.test_framework) {
    const cmd = recon.test_commands[0] ?? recon.test_framework;
    parts.push(`Тесты через ${recon.test_framework}, запуск: \`${cmd}\`.`);
  } else {
    parts.push('Тестовый фреймворк не обнаружен — baseline не зафиксирован.');
  }

  if (baseline.framework && baseline.skipped_by_user === false) {
    parts.push(`Baseline: ${baseline.passed} passed${baseline.failed > 0 ? `, ${baseline.failed} failed` : ''} за ${baseline.duration_s}s.`);
  }

  if (recon.required_env_vars.length > 0) {
    const varNames = recon.required_env_vars.slice(0, 3).map((e) => e.var).join(', ');
    parts.push(`Env vars: ${varNames}${recon.required_env_vars.length > 3 ? ' и ещё' : ''}.`);
  }

  const risks: string[] = [];
  if (recon.failed_subagents.length > 0) {
    risks.push(`частичный recon (Subagent ${recon.failed_subagents.join(',')} упал)`);
  }
  if (baseline.failed > 0) {
    risks.push(`${baseline.failed} падающих теста в baseline`);
  }
  if (risks.length > 0) {
    parts.push(`Риски: ${risks.join(', ')}.`);
  }

  parts.push('Правильно я понял суть?');
  return parts.join(' ');
}


export function defaultApplyCorrection(previousSummary: string, correction: string): string {
  const trimmed = correction.trim();
  const marker = '\n\n_Уточнение от пользователя:_ ';
  return previousSummary.replace(' Правильно я понял суть?', '') + `${marker}${trimmed}\n\nС учётом этого — правильно я понял суть?`;
}


export async function runTextGate(
  ctx: TextGateContext,
  deps: TextGateDeps,
): Promise<TextGateResult> {
  const apply = deps.applyCorrection ?? defaultApplyCorrection;
  let summary = composeSummary(ctx);
  let iterations = 0;

  for (iterations = 1; iterations <= MAX_ITERATIONS; iterations += 1) {
    const response = await deps.askUser(iterations, summary);
    const classification = classifyResponse(response);

    if (classification === 'confirm') {
      return { confirmed: true, aborted: false, iterations, finalSummary: summary };
    }
    if (classification === 'abort') {
      return {
        confirmed: false,
        aborted: true,
        abortReason: 'user requested abort',
        iterations,
        finalSummary: summary,
      };
    }
    if (classification === 'correction') {
      summary = apply(summary, response);
      continue;
    }
    // ambiguous → re-ask with explicit yes/no prompt added to summary
    summary = `${summary}\n\n_Ответ не распознан. Пожалуйста — "да" для подтверждения или "нет" + уточнение._`;
  }

  return {
    confirmed: false,
    aborted: true,
    abortReason: `Gate not confirmed after ${MAX_ITERATIONS} iterations. Run --refresh-onboarding когда готов продолжить.`,
    iterations: MAX_ITERATIONS,
    finalSummary: summary,
  };
}
