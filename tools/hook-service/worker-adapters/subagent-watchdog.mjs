import { runHook } from '../../subagent-watchdog/subagent_watchdog.ts';

/**
 * Persistent adapter for the re-entrant watchdog API. The legacy CLI remains
 * unchanged; this boundary owns no stdin, argv, or process-exit behavior.
 */
export async function handle(input, request) {
  const event = request.event || input?.hook_event_name || 'UserPromptSubmit';
  return runHook(JSON.stringify(input ?? {}), ['--event', event]);
}
