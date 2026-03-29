/**
 * Framework → test command dispatch table
 * FR-14: Extensible mapping — add new framework = 1 line
 */

import type { TestFramework } from './adapters/types.js';

/** Base test commands per framework (without filter) */
const DISPATCH: Record<TestFramework, string> = {
  vitest: 'npx vitest run',
  jest: 'npx jest',
  pytest: 'python -m pytest',
  dotnet: 'dotnet test',
  rust: 'cargo test',
  go: 'go test ./...',
  unknown: '',
};

/** Filter argument format per framework */
const FILTER_FORMAT: Record<TestFramework, (filter: string) => string> = {
  vitest: (f) => `--grep "${f}"`,
  jest: (f) => `--testNamePattern "${f}"`,
  pytest: (f) => `-k "${f}"`,
  dotnet: (f) => `--filter "${f}"`,
  rust: (f) => `-- ${f}`,
  go: (f) => `-run "${f}"`,
  unknown: () => '',
};

/** Wrapper lives in test-statusline and delegates to the canonical TS writer. */
const WRAPPER_PATH = '.dev-pomogator/tools/test-statusline/test_runner_wrapper.cjs';

export interface TestCommand {
  /** Full command string to execute */
  command: string;
  /** Framework that was detected/selected */
  framework: TestFramework;
  /** Whether wrapped with test_runner_wrapper.cjs */
  wrapped: boolean;
  /** COMPOSE_PROJECT_NAME used for Docker isolation (if docker mode) */
  dockerProjectName?: string;
}

/** Generate unique project name for Docker Compose isolation */
function generateProjectName(sessionPrefix?: string): string {
  const prefix = sessionPrefix || process.env.TEST_STATUSLINE_SESSION;
  if (prefix) {
    return `devpom-test-${prefix}`;
  }
  return `devpom-test-${process.pid}-${Math.random().toString(36).substring(2, 6)}`;
}

/**
 * Build a test command from framework, filter, and extra args.
 * Wraps with test_runner_wrapper.cjs for YAML status tracking.
 */
export function buildTestCommand(opts: {
  framework: TestFramework;
  filter?: string;
  extraArgs?: string;
  docker?: boolean;
  wrapperPath?: string;
}): TestCommand {
  const { framework, filter, extraArgs, docker } = opts;
  const wrapper = opts.wrapperPath || WRAPPER_PATH;
  const wrapperPrefix = `node ${wrapper} --framework ${framework} --`;

  if (framework === 'unknown') {
    return {
      command: '',
      framework,
      wrapped: false,
    };
  }

  // Build inner test command
  let testCmd = DISPATCH[framework];

  if (filter) {
    const filterArg = FILTER_FORMAT[framework](filter);
    testCmd = `${testCmd} ${filterArg}`;
  }

  if (extraArgs) {
    testCmd = `${testCmd} ${extraArgs}`;
  }

  // Docker mode: wrap with docker compose + session isolation
  if (docker) {
    const projectName = generateProjectName();
    return {
      command: `${wrapperPrefix} COMPOSE_PROJECT_NAME=${projectName} docker compose -f docker-compose.test.yml run --rm test ${testCmd}`,
      framework,
      wrapped: true,
      dockerProjectName: projectName,
    };
  }

  return {
    command: `${wrapperPrefix} ${testCmd}`,
    framework,
    wrapped: true,
  };
}

/** Get human-readable framework info for display */
export function getFrameworkInfo(framework: TestFramework): string {
  const info: Record<TestFramework, string> = {
    vitest: 'Vitest (vitest.config.ts)',
    jest: 'Jest (jest.config.js)',
    pytest: 'pytest (pytest.ini / conftest.py)',
    dotnet: 'dotnet test (*.csproj)',
    rust: 'Cargo test (Cargo.toml)',
    go: 'Go test (go.mod)',
    unknown: 'Unknown (no config detected)',
  };
  return info[framework];
}
