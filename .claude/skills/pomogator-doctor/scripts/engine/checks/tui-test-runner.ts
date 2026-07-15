import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';

const TUI_TEST_RUNNER_DIR = 'tools/tui-test-runner';

/**
 * The TUI runner is explicitly opt-in. A missing/false flag must not make the
 * diagnostic visible, since its Python/TUI dependencies are intentionally absent
 * from normal installations.
 */
export const tuiTestRunnerCheck: CheckDefinition = {
  id: 'C-TTR',
  fr: 'FR-14',
  name: 'TUI test runner',
  group: 'self-sufficient',
  gate: () => ({ relevant: true }),
  run: async (ctx: CheckContext): Promise<CheckResult> => {
    const base = {
      id: 'C-TTR',
      fr: 'FR-14',
      name: 'TUI test runner',
      group: 'self-sufficient' as const,
      durationMs: 0,
    };

    // Default-disabled: omit the optional diagnostic entirely, rather than
    // showing a skipped check in the report.
    if (process.env.TEST_STATUSLINE_ENABLED !== 'true') {
      return [];
    }

    const invocationProject = path.resolve(ctx.projectRoot);
    const sessionProject = process.env.TEST_STATUSLINE_PROJECT;
    if (sessionProject && path.resolve(sessionProject) !== invocationProject) {
      return {
        ...base,
        severity: 'warning',
        message: `TUI test runner session project ${sessionProject} differs from invocation project ${invocationProject}`,
        hint: 'Start a new Claude session in this worktree so TEST_STATUSLINE_PROJECT matches the invocation CWD.',
      };
    }

    const runnerDir = path.join(invocationProject, TUI_TEST_RUNNER_DIR);
    const wrapper = path.join(runnerDir, 'test_runner_wrapper.ts');
    const sessionStart = path.join(runnerDir, 'tui_session_start.ts');
    const missing = [wrapper, sessionStart].filter((file) => !fs.existsSync(file));

    if (missing.length > 0) {
      return {
        ...base,
        severity: 'warning',
        message: `TEST_STATUSLINE_ENABLED=true but the TUI test runner is incomplete under ${runnerDir}`,
        hint: 'Restore tools/tui-test-runner from the dev-pomogator plugin, or set TEST_STATUSLINE_ENABLED=false.',
      };
    }

    return {
      ...base,
      severity: 'ok',
      message: `TUI test runner is available for ${ctx.projectRoot}`,
    };
  },
};
