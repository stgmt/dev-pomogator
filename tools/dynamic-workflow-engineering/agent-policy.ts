import type { GuaranteeTier } from './packet.ts';

export const DIRECT_AGENT_DENY_CODE = 'DWE_DIRECT_AGENT_DENIED';

export interface HostCapabilities {
  nativeAgentPreSpawnBoundary: boolean;
  directNativeAgentDenyBeforeSpawn: boolean;
  nestedNativeAgentDenyBeforeSpawn: boolean;
  workflowNativeAgentAllowed: boolean;
  protectedRouteFailClosed: boolean;
  boundedRuntimeAvailable: boolean;
}

export interface NativeAgentDecision {
  decision: 'deny';
  reasonCode: typeof DIRECT_AGENT_DENY_CODE;
  guidance: string;
}

export function classifyGuarantee(capabilities: HostCapabilities): GuaranteeTier {
  if (!capabilities.boundedRuntimeAvailable) return 'UNAVAILABLE';
  if (
    capabilities.nativeAgentPreSpawnBoundary &&
    capabilities.directNativeAgentDenyBeforeSpawn &&
    capabilities.nestedNativeAgentDenyBeforeSpawn &&
    capabilities.workflowNativeAgentAllowed &&
    capabilities.protectedRouteFailClosed
  ) return 'ENFORCED';
  return 'STEERING_ONLY';
}

export function decideNativeAgent(capabilities: HostCapabilities): NativeAgentDecision | null {
  if (classifyGuarantee(capabilities) !== 'ENFORCED') return null;
  return {
    decision: 'deny',
    reasonCode: DIRECT_AGENT_DENY_CODE,
    guidance: 'Use the bundled dynamic-workflow-engineering skill and a finite Workflow packet.',
  };
}
