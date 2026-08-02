import fs from 'node:fs';
import path from 'node:path';
import type { JournalEvent } from './journal.ts';
import { classifyProgress, type RunObservation } from './monitor.ts';
import { runDirectory } from './run-state.ts';

export interface RunObservability {
  runId: string;
  events: JournalEvent[];
  observations: RunObservation[];
  terminal: Record<string, unknown> | null;
  metrics: {
    logicalCalls: number;
    physicalAttempts: number;
    toolCalls: number;
    responseBytes: number;
    restarts: number;
    contextOverflows: number;
  };
}

export function readRunObservability(repoRoot: string, runId: string): RunObservability {
  const root = runDirectory(repoRoot, runId);
  const progress = path.join(root, 'progress.jsonl');
  const events = fs.existsSync(progress)
    ? fs.readFileSync(progress, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as JournalEvent)
    : [];
  const terminalPath = path.join(root, 'terminal.json');
  const terminal = fs.existsSync(terminalPath) ? JSON.parse(fs.readFileSync(terminalPath, 'utf8')) as Record<string, unknown> : null;
  const max = (key: string): number => Math.max(0, ...events.map((event) => event.counters?.[key] ?? 0));
  return {
    runId,
    events,
    observations: classifyProgress(events, runId),
    terminal,
    metrics: {
      logicalCalls: max('logicalCalls'),
      physicalAttempts: max('physicalAttempts'),
      toolCalls: max('toolCalls'),
      responseBytes: max('responseBytes'),
      restarts: max('restarts'),
      contextOverflows: max('contextOverflows'),
    },
  };
}
