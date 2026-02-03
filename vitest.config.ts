import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 300000, // 5 minutes for git clone
    hookTimeout: 300000,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup/ensure-docker.ts'],
    // Run test files sequentially to avoid race conditions
    // (claude-mem-runtime requires installer to run first)
    fileParallelism: false,
    // Note: globalSetup removed - docker compose is started by npm run test:e2e
    // hook.ts is kept for documentation/reference
    reporters: ['verbose'],
  },
});
