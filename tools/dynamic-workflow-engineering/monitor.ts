export type ObservationKind = 'FACT' | 'INFERENCE' | 'UNKNOWN' | 'ACTION';

export interface RunObservation {
  kind: ObservationKind;
  message: string;
  evidenceRef?: string;
}

export interface ProgressEvent {
  runId: string;
  seq: number;
  status: string;
  logicalCalls?: number;
  physicalAttempts?: number;
  toolCalls?: number;
  responseBytes?: number;
  failureSignature?: string;
}

export function selectCurrentEvents(events: ProgressEvent[], runId: string): ProgressEvent[] {
  const current = events.filter((event) => event.runId === runId).sort((left, right) => left.seq - right.seq);
  const accepted: ProgressEvent[] = [];
  let last = 0;
  for (const event of current) {
    if (!Number.isSafeInteger(event.seq) || event.seq <= last) continue;
    accepted.push(event);
    last = event.seq;
  }
  return accepted;
}

export function classifyProgress(events: ProgressEvent[], runId: string): RunObservation[] {
  const selected = selectCurrentEvents(events, runId);
  if (!selected.length) return [{ kind: 'UNKNOWN', message: 'No monotonic journal event exists for the selected run.' }, { kind: 'ACTION', message: 'Inspect the selected run directory and terminal evidence.' }];
  const latest = selected.at(-1)!;
  const observations: RunObservation[] = [
    { kind: 'FACT', message: `Run ${runId} has ${selected.length} accepted events; latest seq=${latest.seq} status=${latest.status}.` },
  ];
  if (latest.failureSignature) observations.push({ kind: 'INFERENCE', message: `Latest failure signature is ${latest.failureSignature}; retry policy must classify it.` });
  if (!['success', 'failure', 'blocked', 'terminal'].includes(latest.status)) observations.push({ kind: 'UNKNOWN', message: 'Terminal outcome is not yet proven.' });
  observations.push({ kind: 'ACTION', message: latest.status === 'terminal' ? 'Verify owner/descendant/writer counts.' : 'Continue only within the declared packet ceilings.' });
  return observations;
}
