/**
 * Gherkin parser slice for the SpecGraph builder.
 *
 * Parses a `.feature` file via `@cucumber/gherkin` and emits one
 * `ScenarioNode` per Scenario / Scenario Outline plus a `tested-by` edge
 * for every recognised `@FR-N` / `@NFR-X-N` / `@AC-N(.M)` tag (feature-level
 * tags propagate to each scenario per Gherkin convention). Step text is
 * preserved verbatim so Phase 2 conformance checks can pattern-match.
 *
 * Parse failures (malformed Gherkin) return an empty slice rather than
 * throwing — Phase 0 already documented that the repo has 531 .feature
 * files written as vitest pseudo-BDD; the builder must keep scanning
 * after hitting any one of them.
 *
 * @see .specs/spec-generator-v4/FR.md FR-2 (graph builder)
 * @see .specs/spec-generator-v4/spec-generator-v4_SCHEMA.md Entity 1
 * @see ../types.ts (Node / Edge / ParserOutput)
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  Parser,
  AstBuilder,
  GherkinClassicTokenMatcher,
} from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import type {
  ParserOutput,
  ScenarioNode,
  ScenarioStep,
  Edge,
} from '../types.ts';

const SPEC_TAG_RE = /^@((?:FR|NFR|AC)[A-Za-z0-9._-]+)$/;

/** Lower-case ASCII slug, used in derived Scenario ids. */
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unnamed';
}

interface GherkinFeatureChild {
  scenario?: {
    name: string;
    location: { line: number };
    tags?: Array<{ name: string }>;
    steps?: Array<{ keyword: string; text: string }>;
    examples?: unknown[];
  };
}

interface GherkinFeature {
  tags?: Array<{ name: string }>;
  children: GherkinFeatureChild[];
}

interface GherkinDocument {
  feature?: GherkinFeature;
}

/**
 * Parse a `.feature` source string and emit a SpecGraph slice.
 *
 * @param source       raw Gherkin text
 * @param relativePath repository-relative POSIX path to record on each node
 */
export function parseGherkin(source: string, relativePath: string): ParserOutput {
  const idGen = IdGenerator.incrementing();
  const builder = new AstBuilder(idGen);
  const matcher = new GherkinClassicTokenMatcher();
  const parser = new Parser(builder, matcher);

  let doc: GherkinDocument;
  try {
    doc = parser.parse(source) as GherkinDocument;
  } catch {
    return { nodes: [], edges: [], anchors: [] };
  }
  if (!doc.feature) {
    return { nodes: [], edges: [], anchors: [] };
  }

  const featureTags: string[] = (doc.feature.tags ?? []).map((t) => t.name);

  const nodes: ScenarioNode[] = [];
  const edges: Edge[] = [];
  const anchors: ParserOutput['anchors'] = [];
  const seenIds = new Map<string, number>();

  for (const child of doc.feature.children) {
    const scenario = child.scenario;
    if (!scenario) continue;

    const scenarioTags: string[] = (scenario.tags ?? []).map((t) => t.name);
    const tags = [...featureTags, ...scenarioTags];

    let baseId = `SCEN-${slugifyName(scenario.name)}`;
    const seen = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, seen + 1);
    const scenarioId = seen === 0 ? baseId : `${baseId}-${seen + 1}`;

    const line = scenario.location.line;
    const steps: ScenarioStep[] = (scenario.steps ?? []).map((s) => ({
      keyword: s.keyword.trim() as ScenarioStep['keyword'],
      text: s.text,
    }));

    const node: ScenarioNode = {
      id: scenarioId,
      type: 'Scenario',
      file: relativePath,
      line,
      tags,
      steps,
    };
    nodes.push(node);
    anchors.push({
      alias: scenarioId,
      canonicalId: scenarioId,
      location: { file: relativePath, line },
    });

    for (const tag of tags) {
      const m = tag.match(SPEC_TAG_RE);
      if (m) {
        edges.push({ from: m[1], to: scenarioId, type: 'tested-by' });
      }
    }
  }

  return { nodes, edges, anchors };
}

/** Convenience: read a `.feature` file from disk and parse it. */
export function parseGherkinFile(absPath: string, repoRoot: string): ParserOutput {
  const source = fs.readFileSync(absPath, 'utf-8');
  const relative = path.relative(repoRoot, absPath).split(path.sep).join('/');
  return parseGherkin(source, relative);
}
