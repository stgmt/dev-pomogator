import type { HeadroomTopology } from './profile.ts';

export interface HeadroomFlagOptions {
  topology: HeadroomTopology;
  helpText: string;
  port?: number;
}

export function hasFlag(helpText: string, flag: string): boolean {
  return new RegExp(`(^|\\s)${escapeRegExp(flag)}(\\s|,|$)`, 'm').test(helpText);
}

export function buildSupportedHeadroomArgs(options: HeadroomFlagOptions): string[] {
  const args: string[] = [];
  const port = options.port ?? 8787;

  appendPair(args, options.helpText, '--host', '0.0.0.0');
  appendPair(args, options.helpText, '--port', String(port));
  appendPair(args, options.helpText, '--mode', 'token');
  appendFlag(args, options.helpText, '--intercept-tool-results');
  appendFlag(args, options.helpText, '--no-ccr-proactive-expansion');

  if (options.topology === 'codex-sub2api') {
    appendPair(args, options.helpText, '--anthropic-api-url', 'http://sub2api:8080');
    appendFlag(args, options.helpText, '--no-subscription-tracking');
  }

  appendPair(args, options.helpText, '--request-timeout-seconds', '900');
  appendPair(args, options.helpText, '--anthropic-pre-upstream-concurrency', '8');
  appendPair(args, options.helpText, '--compression-max-workers', '2');
  appendPair(args, options.helpText, '--log-file', '/root/.headroom/logs/proxy-requests.jsonl');

  return args;
}

function appendFlag(args: string[], helpText: string, flag: string): void {
  if (hasFlag(helpText, flag)) args.push(flag);
}

function appendPair(args: string[], helpText: string, flag: string, value: string): void {
  if (hasFlag(helpText, flag)) args.push(flag, value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
