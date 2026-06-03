// E2E skip policy for the Marksman real-binary round-trip (FR-7 / _15, _16).
//
// The whole point of the real e2e is that a green result MEANS the bridge spoke
// to a real Marksman. So a SILENT skip inside Docker (where the binary is
// guaranteed by Dockerfile.test) would be a fake-green — the exact failure mode
// FR-7 is fixing. This policy makes that case a hard FAIL instead:
//
//   - binary present              → 'run'   (do the real round-trip)
//   - absent on host / dev box    → 'skip'  (honest skip-with-reason — no binary)
//   - absent but inside Docker    → 'fail'  (the guard fires: Docker MUST have it)

export type E2eDecision = 'run' | 'skip' | 'fail';

export interface E2eEnv {
  /** Is the binary actually present + runnable? */
  haveBinary: boolean;
  /** Are we in the Docker test image (where the binary is guaranteed)? */
  inDocker: boolean;
}

export function decideE2e(env: E2eEnv): E2eDecision {
  if (env.haveBinary) return 'run';
  return env.inDocker ? 'fail' : 'skip';
}

/** Read the policy inputs from the environment (binary path + Docker marker). */
export function e2eEnvFromProcess(
  binaryExists: (p: string) => boolean,
  env: NodeJS.ProcessEnv = process.env,
): E2eEnv {
  const bin = env.DEV_POMOGATOR_MARKSMAN_BIN;
  return {
    haveBinary: !!bin && binaryExists(bin),
    inDocker: env.DEV_POMOGATOR_TEST_IN_DOCKER === '1',
  };
}
