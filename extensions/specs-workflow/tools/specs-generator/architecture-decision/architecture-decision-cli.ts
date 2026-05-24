#!/usr/bin/env npx tsx
/**
 * CLI dispatcher для architecture-decision-builder helpers (FR-4/6/7).
 * Mirror variant-matrix-cli.ts: argv[2] = command, JSON to stdout, errors to stderr.
 * Exit codes: 0 ok / 1 generic error / 2 usage / 3 PRD missing.
 *
 * Commands:
 *   detect-axes  <prd-path>                  → { axes_detected, axes, skipped_reason? }
 *   generate-axis <axis-model.json> <outDir> → { axis_id, mdPath, htmlPath, wordBudgetOk }
 *   open-browser <html-path>                 → { launched, fallback? }
 */

import * as fs from 'node:fs';
import { detectAxes } from './axis-detector.ts';
import { generateAxisArtefact } from './artefact-generator.ts';
import { openInBrowser } from './open-in-browser.ts';
import { compileIndex } from './index-compiler.ts';
import { checkArchitectureCoverage, checkCompletenessCoverage } from './audit.ts';
import type { AxisModel } from './html-renderer.ts';

function fail(code: number, msg: string): never {
  process.stderr.write(`architecture-decision-cli error: ${msg}\n`);
  process.exit(code);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (!cmd) {
    fail(2, 'Usage: architecture-decision-cli.ts <detect-axes|generate-axis|open-browser> <args>');
  }

  switch (cmd) {
    case 'detect-axes': {
      const prdPath = process.argv[3];
      if (!prdPath) fail(2, 'detect-axes requires <prd-path>');
      if (!fs.existsSync(prdPath)) fail(3, `PRD not found: ${prdPath}`);
      const content = fs.readFileSync(prdPath, 'utf-8');
      process.stdout.write(JSON.stringify(detectAxes(content)));
      break;
    }
    case 'generate-axis': {
      const modelPath = process.argv[3];
      const outDir = process.argv[4];
      if (!modelPath || !outDir) fail(2, 'generate-axis requires <axis-model.json> <outDir>');
      if (!fs.existsSync(modelPath)) fail(3, `axis-model not found: ${modelPath}`);
      const axis = JSON.parse(fs.readFileSync(modelPath, 'utf-8')) as AxisModel;
      process.stdout.write(JSON.stringify(generateAxisArtefact(axis, outDir)));
      break;
    }
    case 'open-browser': {
      const htmlPath = process.argv[3];
      if (!htmlPath) fail(2, 'open-browser requires <html-path>');
      const result = await openInBrowser(htmlPath);
      process.stdout.write(JSON.stringify(result));
      break;
    }
    case 'compile-index': {
      const specDir = process.argv[3];
      if (!specDir) fail(2, 'compile-index requires <spec-dir>');
      if (!fs.existsSync(specDir)) fail(3, `spec-dir not found: ${specDir}`);
      const r = compileIndex(specDir);
      process.stdout.write(
        JSON.stringify({ axes_total: r.axes_total, axes_pending: r.axes_pending, rows: r.rows }),
      );
      break;
    }
    case 'audit': {
      const specDir = process.argv[3];
      if (!specDir) fail(2, 'audit requires <spec-dir>');
      if (!fs.existsSync(specDir)) fail(3, `spec-dir not found: ${specDir}`);
      // ARCHITECTURE_COVERAGE only (FR-9). Completeness is a separate category/command
      // so architecture audit output stays unmixed (9th vs 10th create-spec audit category).
      process.stdout.write(JSON.stringify({ findings: checkArchitectureCoverage(specDir) }));
      break;
    }
    case 'audit-completeness': {
      const specDir = process.argv[3];
      if (!specDir) fail(2, 'audit-completeness requires <spec-dir>');
      if (!fs.existsSync(specDir)) fail(3, `spec-dir not found: ${specDir}`);
      process.stdout.write(JSON.stringify({ findings: checkCompletenessCoverage(specDir) }));
      break;
    }
    default:
      fail(2, `Unknown command: ${cmd}`);
  }
  process.exit(0);
}

main().catch((err) => fail(1, (err as Error).message));
