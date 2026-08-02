export interface PhaseExecutionResult {
  phase: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runSerialPhases(phases: readonly string[], execute: (phase: string) => Promise<PhaseExecutionResult>): Promise<PhaseExecutionResult[]> {
  const results: PhaseExecutionResult[] = [];
  for (const phase of phases) {
    const result = await execute(phase);
    results.push(result);
    if (result.exitCode !== 0) {
      const error = new Error(`phase ${phase} exited ${result.exitCode}: ${result.stderr.trim() || 'no stderr'}`) as Error & { phase?: string; exitCode?: number; result?: PhaseExecutionResult };
      error.phase = phase;
      error.exitCode = result.exitCode;
      error.result = result;
      throw error;
    }
  }
  return results;
}
