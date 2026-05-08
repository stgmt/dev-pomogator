import chalk from 'chalk';
import type { CheckResult, DoctorReport, HookOutput } from './types.js';

const GROUP_ORDER = ['self-sufficient', 'needs-env', 'needs-external'] as const;
const GROUP_EMOJI: Record<string, string> = {
  'self-sufficient': '🟢',
  'needs-env': '🟡',
  'needs-external': '🔴',
};
const GROUP_LABEL: Record<string, string> = {
  'self-sufficient': 'Self-sufficient',
  'needs-env': 'Needs env vars',
  'needs-external': 'Needs external deps',
};

const SEVERITY_GLYPH: Record<CheckResult['severity'], string> = {
  ok: '✓',
  warning: '⚠',
  critical: '✗',
};

function colorize(text: string, severity: CheckResult['severity']): string {
  if (severity === 'ok') return chalk.green(text);
  if (severity === 'warning') return chalk.yellow(text);
  return chalk.red(text);
}

export function formatChalk(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold(`pomogator-doctor — ${report.installedExtensions.length} extension(s) installed`));
  lines.push('');

  const byGroup = new Map<string, CheckResult[]>();
  for (const group of GROUP_ORDER) byGroup.set(group, []);
  for (const result of report.results) {
    const list = byGroup.get(result.group) ?? [];
    list.push(result);
    byGroup.set(result.group, list);
  }

  for (const group of GROUP_ORDER) {
    const list = byGroup.get(group) ?? [];
    if (list.length === 0) continue;
    lines.push(chalk.bold(`${GROUP_EMOJI[group]} ${GROUP_LABEL[group]}`));
    for (const result of list) {
      const glyph = colorize(SEVERITY_GLYPH[result.severity], result.severity);
      const name = result.extension ? `${result.name} (${result.extension})` : result.name;
      lines.push(`  ${glyph} ${chalk.bold(result.id.padEnd(12))} ${name}`);
      lines.push(`      ${chalk.gray(result.message)}`);
      if (result.hint) lines.push(`      ${chalk.cyan('hint:')} ${result.hint}`);
      if (result.reinstallable && result.severity !== 'ok' && result.reinstallHint) {
        lines.push(`      ${chalk.magenta('reinstall:')} ${result.reinstallHint}`);
      }
    }
    lines.push('');
  }

  if (report.gatedOut.length > 0) {
    lines.push(chalk.dim(`Skipped ${report.gatedOut.length} check(s) (extensions not installed)`));
    lines.push('');
  }

  const { ok, warnings, critical, total, relevantOf } = report.summary;
  const summary = `${ok} ok, ${warnings} warnings, ${critical} critical (of ${total}/${relevantOf} relevant)`;
  const summaryColored =
    critical > 0 ? chalk.red.bold(summary) : warnings > 0 ? chalk.yellow.bold(summary) : chalk.green.bold(summary);
  lines.push(`Summary: ${summaryColored}`);
  lines.push(`Duration: ${report.durationMs}ms`);

  return lines.join('\n');
}

function redactForJson(result: CheckResult): Record<string, unknown> {
  const { details, ...rest } = result;
  const out: Record<string, unknown> = { ...rest };
  if (details && Object.keys(details).length > 0) out.details = details;
  if (result.envStatus) {
    out.envStatus = { name: result.envStatus.name, status: result.envStatus.status };
  }
  return out;
}

export function formatJson(report: DoctorReport): string {
  const serialized = {
    schemaVersion: report.schemaVersion,
    durationMs: report.durationMs,
    installedExtensions: report.installedExtensions,
    summary: report.summary,
    gatedOut: report.gatedOut,
    results: report.results.map(redactForJson),
    reinstallableIssues: report.reinstallableIssues.map(redactForJson),
    manualIssues: report.manualIssues.map(redactForJson),
  };
  return JSON.stringify(serialized, null, 2);
}

export function buildHookOutput(report: DoctorReport): HookOutput {
  const { critical, warnings } = report.summary;
  if (critical === 0 && warnings === 0) {
    return { continue: true, suppressOutput: true };
  }
  const reinstallableCount = report.reinstallableIssues.length;
  const parts: string[] = [];
  if (critical > 0) parts.push(`${critical} critical`);
  if (warnings > 0) parts.push(`${warnings} warning`);
  if (reinstallableCount > 0) parts.push(`${reinstallableCount} reinstallable`);
  const head = `⚠ pomogator-doctor: ${parts.join(', ')}`;
  const tail = ', run /pomogator-doctor';
  const max = 100;
  const banner = (head + tail).length > max ? head.slice(0, max - tail.length - 1) + '…' + tail : head + tail;
  return { continue: true, additionalContext: banner };
}

export function exitCodeFor(report: DoctorReport): number {
  if (report.summary.critical > 0) return 2;
  if (report.summary.warnings > 0) return 1;
  return 0;
}
