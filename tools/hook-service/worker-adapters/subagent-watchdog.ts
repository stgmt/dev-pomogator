import { runHook } from '../../subagent-watchdog/subagent_watchdog.ts';

type WorkerRequest = {
  event?: string;
};

/**
 * Persistent adapter source. The published .mjs file is generated with esbuild
 * and therefore has no runtime dependency on tsx or the TypeScript source tree.
 */
export async function handle(input: unknown, request: WorkerRequest): Promise<Record<string, unknown>> {
  const event = request.event || (input as { hook_event_name?: string } | null)?.hook_event_name || 'UserPromptSubmit';
  return runHook(JSON.stringify(input ?? {}), ['--event', event]);
}
