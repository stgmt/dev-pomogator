import { classifyGuarantee, type HostCapabilities } from './agent-policy.ts';
import type { ControlMode } from './packet.ts';

export interface CapabilityMatrix {
  schemaVersion: 1;
  guaranteeTier: ReturnType<typeof classifyGuarantee>;
  host: HostCapabilities;
  controls: Record<string, { mode: ControlMode; evidence: string; verified: boolean }>;
  protectedHookEligible: boolean;
}

export function evaluateCapabilityMatrix(input: Partial<HostCapabilities> & { runtimeBundleLoads?: boolean }): CapabilityMatrix {
  const host: HostCapabilities = {
    nativeAgentPreSpawnBoundary: input.nativeAgentPreSpawnBoundary === true,
    directNativeAgentDenyBeforeSpawn: input.directNativeAgentDenyBeforeSpawn === true,
    nestedNativeAgentDenyBeforeSpawn: input.nestedNativeAgentDenyBeforeSpawn === true,
    workflowNativeAgentAllowed: input.workflowNativeAgentAllowed === true,
    protectedRouteFailClosed: input.protectedRouteFailClosed === true,
    boundedRuntimeAvailable: input.boundedRuntimeAvailable === true || input.runtimeBundleLoads === true,
  };
  const guaranteeTier = classifyGuarantee(host);
  const controls: CapabilityMatrix['controls'] = {
    packetAdmission: { mode: host.boundedRuntimeAvailable ? 'best-effort' : 'unavailable', evidence: 'runtime and workflow validators reject malformed packets, but trusted host origin is unavailable', verified: host.boundedRuntimeAvailable },
    rootWorktreePreflight: { mode: host.boundedRuntimeAvailable ? 'hard admission' : 'unavailable', evidence: 'git top-level/base/dirty preflight', verified: host.boundedRuntimeAvailable },
    nativeAgentDeny: { mode: guaranteeTier === 'ENFORCED' ? 'hard admission' : 'unavailable', evidence: 'requires real direct and Workflow-nested deny-before-spawn proof', verified: guaranteeTier === 'ENFORCED' },
    processTreeCancellation: { mode: 'best-effort', evidence: 'cross-platform process-tree signals exist; zero-descendant proof not yet host-verified', verified: false },
    tokenCeiling: { mode: 'monitored circuit', evidence: 'packet declares ceiling; host preemption unavailable until measured', verified: false },
    wallClock: { mode: host.boundedRuntimeAvailable ? 'hard cancellation' : 'unavailable', evidence: 'captured process timeout plus process-tree signal escalation', verified: host.boundedRuntimeAvailable },
  };
  return { schemaVersion: 1, guaranteeTier, host, controls, protectedHookEligible: guaranteeTier === 'ENFORCED' };
}
