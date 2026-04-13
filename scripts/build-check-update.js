#!/usr/bin/env node

/**
 * Builds a standalone bundled version of check-update script.
 * This bundles all dependencies (fs-extra, semver, etc.) into a single file
 * that can be executed from ~/.dev-pomogator/scripts/ without node_modules.
 *
 * Resilient: if esbuild is not available (e.g., devDependencies not installed
 * during npx github: installation), skips bundling when dist/ files already
 * exist from git (force-tracked despite .gitignore).
 */

import { existsSync, copyFileSync } from 'fs';

// --- check-update.bundle.cjs ---
const bundleTarget = 'dist/check-update.bundle.cjs';

try {
  const esbuild = await import('esbuild');
  await esbuild.build({
    entryPoints: ['src/updater/standalone.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',  // Use CommonJS to avoid "Dynamic require" errors with fs-extra
    outfile: bundleTarget,
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
} catch (err) {
  if (existsSync(bundleTarget)) {
    console.log('esbuild not available — using existing dist/check-update.bundle.cjs');
  } else {
    console.error('⚠ esbuild not available and dist/check-update.bundle.cjs not found.');
    console.error('  Run: npm install (to get devDependencies)');
  }
}

function copyToDist(src, dest) {
  try {
    copyFileSync(src, dest);
    console.log(`Copied ${dest}`);
  } catch {
    if (existsSync(dest)) {
      console.log(`Source copy failed — using existing ${dest}`);
    } else {
      console.error(`⚠ Cannot copy ${dest} and no existing file found.`);
    }
  }
}

copyToDist('src/scripts/tsx-runner.js', 'dist/tsx-runner.js');
copyToDist('src/scripts/tsx-runner-bootstrap.cjs', 'dist/tsx-runner-bootstrap.cjs');
copyToDist('scripts/launch-claude-tui.ps1', 'dist/launch-claude-tui.ps1');

// Legacy statusline render removed in v2.0.0 — no longer copied to dist/
