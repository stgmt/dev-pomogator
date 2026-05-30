import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 300000, // 5 minutes for git clone
    hookTimeout: 300000,
    include: [
      'tests/**/*.test.ts',
      'tools/**/__tests__/*.test.ts',
      '.claude/skills/**/__tests__/*.test.ts',
    ],
    exclude: [
      'tests/fixtures/**',
      // statusline-config management (resolveClaudeStatusLine / isManagedStatusLineCommand
      // etc.) was an installer-era concern removed together with src/ in plugin v2.
      // This file (26 references to the deleted utils) needs a focused rewrite; tracked.
      'tests/e2e/tui-statusline.test.ts',
    ],
    setupFiles: ['tests/setup/ensure-docker.ts'],
    // Run test files sequentially to avoid race conditions
    // (claude-mem-runtime requires installer to run first)
    fileParallelism: false,
    // Note: globalSetup removed - docker compose is started by npm run test:e2e
    // hook.ts is kept for documentation/reference
    reporters: ['verbose'],
  },
});
