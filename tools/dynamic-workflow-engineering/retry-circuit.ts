import { sha256, stableJson } from './packet.ts';

export type FailureClass = 'recoverable' | 'infrastructure' | 'context-exhausted' | 'invalid-request' | 'schema-invalid' | 'budget-exhausted' | 'unchanged';
export type CircuitState = 'CLOSED' | 'OPEN' | 'HARNESS_REPAIR';

export interface RetryRecord {
  logicalCallKey: string;
  physicalAttempt: number;
  strategyFingerprint: string;
  failureSignature: string;
  failureClass: FailureClass;
}

export interface RetryDecision {
  action: 'retry' | 'circuit-open' | 'harness-repair';
  circuitState: CircuitState;
  reasonCode: string;
}

const NON_RETRYABLE = new Set<FailureClass>(['context-exhausted', 'invalid-request', 'schema-invalid', 'budget-exhausted', 'unchanged']);

export function fingerprintStrategy(strategy: unknown): string {
  return sha256(stableJson(strategy));
}

export function decideRetry(history: RetryRecord[], next: Omit<RetryRecord, 'physicalAttempt'>): RetryDecision {
  const sameCall = history.filter((entry) => entry.logicalCallKey === next.logicalCallKey);
  const repeatedInfrastructure = sameCall.filter((entry) => entry.failureClass === 'infrastructure' && entry.failureSignature === next.failureSignature).length + (next.failureClass === 'infrastructure' ? 1 : 0);
  if (repeatedInfrastructure >= 2) return { action: 'harness-repair', circuitState: 'HARNESS_REPAIR', reasonCode: 'DWE_REPEATED_INFRASTRUCTURE_FAILURE' };
  if (NON_RETRYABLE.has(next.failureClass)) return { action: 'circuit-open', circuitState: 'OPEN', reasonCode: `DWE_NON_RETRYABLE:${next.failureClass}` };
  if (sameCall.length >= 1) {
    const prior = sameCall.at(-1)!;
    if (prior.strategyFingerprint === next.strategyFingerprint) return { action: 'circuit-open', circuitState: 'OPEN', reasonCode: 'DWE_UNCHANGED_RETRY' };
    if (sameCall.length >= 2) return { action: 'circuit-open', circuitState: 'OPEN', reasonCode: 'DWE_RETRY_BUDGET_EXHAUSTED' };
  }
  return { action: 'retry', circuitState: 'CLOSED', reasonCode: 'DWE_CHANGED_STRATEGY_RETRY' };
}
