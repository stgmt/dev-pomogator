/**
 * Full-report builder (FR-19). Assembles a single self-contained `ARCHITECTURE.html`
 * from the persisted per-axis `AXIS-*.model.json` (written by generate-axis), optional
 * cross-axis insights, and the `COMPLETENESS.md` ledger. Renders via `renderFullReport`
 * (the SAME renderers as per-axis pages) — NOT by scraping per-axis HTML — so the report
 * inherits the rich content (two lenses + scorecard + reality + economics) for free.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  renderFullReport,
  type AxisModel,
  type Insight,
  type CompletenessRow,
} from './html-renderer.ts';
import { collectCompletenessRows } from './audit.ts';
import { deriveSlug } from './synthesis.ts';

export interface FullReportResult {
  reportPath: string;
  axes_count: number;
  insights_count: number;
  completeness_count: number;
}

/** Axis models persisted alongside the per-axis artefacts, in stable filename order. */
export function collectAxisModels(specDir: string): AxisModel[] {
  if (!fs.existsSync(specDir)) return [];
  return fs
    .readdirSync(specDir)
    .filter((f) => /^AXIS-.*\.model\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(specDir, f), 'utf-8')) as AxisModel);
}

export function buildFullReport(
  specDir: string,
  insights: Insight[] = [],
  slug = deriveSlug(specDir),
): FullReportResult {
  const axes = collectAxisModels(specDir);
  const completeness: CompletenessRow[] = [...collectCompletenessRows(specDir).entries()].map(
    ([dimension, r]) => ({ dimension, status: r.status, pointer: r.pointer }),
  );
  const html = renderFullReport(slug, axes, { insights, completeness });
  const reportPath = path.join(specDir, 'ARCHITECTURE.html');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(reportPath, html, 'utf-8');
  return {
    reportPath,
    axes_count: axes.length,
    insights_count: insights.length,
    completeness_count: completeness.length,
  };
}
