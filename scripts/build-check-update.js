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
  define: {
    // Polyfill import.meta.url for CJS bundle — modules that use
    // fileURLToPath(import.meta.url) need a valid file URL at runtime.
    'import.meta.url': 'importMetaUrl',
  },
  banner: {
    js: [
      '#!/usr/bin/env node',
      'var importMetaUrl = require("url").pathToFileURL(__filename).href;',
    ].join('\n'),
  },
  minify: false,  // Keep readable for debugging
  sourcemap: false,
});

console.log('Built dist/check-update.bundle.cjs');

// Copy tsx-runner.js to dist/ (plain JS, no bundling needed)
import { copyFileSync } from 'fs';
copyFileSync('src/scripts/tsx-runner.js', 'dist/tsx-runner.js');
console.log('Copied dist/tsx-runner.js');

// Copy statusline scripts to dist/ (plain CJS/JS, no bundling needed)
copyFileSync('extensions/test-statusline/tools/test-statusline/statusline_render.cjs', 'dist/statusline_render.cjs');
console.log('Copied dist/statusline_render.cjs');
copyFileSync('extensions/test-statusline/tools/test-statusline/statusline_wrapper.js', 'dist/statusline_wrapper.js');
console.log('Copied dist/statusline_wrapper.js');
