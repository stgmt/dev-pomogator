#!/usr/bin/env node

/**
 * Builds a standalone bundled version of check-update script.
 * This bundles all dependencies (fs-extra, semver, etc.) into a single file
 * that can be executed from ~/.dev-pomogator/scripts/ without node_modules.
 */

import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/updater/standalone.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',  // Use CommonJS to avoid "Dynamic require" errors with fs-extra
  outfile: 'dist/check-update.bundle.cjs',
  external: [],  // Bundle everything, no externals
  banner: {
    js: '#!/usr/bin/env node',
  },
  minify: false,  // Keep readable for debugging
  sourcemap: false,
});

console.log('Built dist/check-update.bundle.cjs');
