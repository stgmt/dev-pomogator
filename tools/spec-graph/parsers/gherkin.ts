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
import { specOf } from '../coverage.ts';

const SPEC_TAG_RE = /^@((?:FR|NFR|AC)[A-Za-z0-9._-]+)$/;
/** FR-36c: `@featureN` ↔ `FR-N` same-spec convention → a REAL tested-by edge. */
const FEATURE_TAG_RE = /^@feature(\d+)$/i;

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
  // A `Rule:` groups its own scenarios under `rule.children` — they must be
  // flattened or Rule-wrapped scenarios are silently dropped (no node → no coverage).
  rule?: {
    tags?: Array<{ name: string }>;
    children: GherkinFeatureChild[];
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

  // FR-36a: nodes/edges inside `.specs/<slug>/` carry the spec-qualified
  // composite key DIRECTLY from the parser (the parser knows the file path —
  // no builder-side rewrite needed). Files outside `.specs/` stay bare.
  const slug = specOf(relativePath);
  const qualify = (id: string): string => (slug ? `${slug}:${id}` : id);

  const nodes: ScenarioNode[] = [];
  const edges: Edge[] = [];
  const edgeSeen = new Set<string>();
  const pushEdge = (e: Edge): void => {
    const key = `${e.from}|${e.to}|${e.type}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push(e);
  };
  const anchors: ParserOutput['anchors'] = [];
  const seenIds = new Map<string, number>();

  // Flatten top-level scenarios AND scenarios nested under a `Rule:`. A Rule-wrapped
  // scenario inherits feature + rule + scenario tags. Without this the whole Rule block
  // is invisible to the graph (no node) and to coverage (no result) — a silent honesty hole.
  const entries: Array<{ scenario: NonNullable<GherkinFeatureChild['scenario']>; ruleTags: string[] }> = [];
  for (const child of doc.feature.children) {
    if (child.scenario) {
      entries.push({ scenario: child.scenario, ruleTags: [] });
    } else if (child.rule?.children) {
      const ruleTags = (child.rule.tags ?? []).map((t) => t.name);
      for (const rc of child.rule.children) {
        if (rc.scenario) entries.push({ scenario: rc.scenario, ruleTags });
      }
    }
  }
  for (const { scenario, ruleTags } of entries) {
    const scenarioTags: string[] = (scenario.tags ?? []).map((t) => t.name);
    const tags = [...featureTags, ...ruleTags, ...scenarioTags];

    let baseId = `SCEN-${slugifyName(scenario.name)}`;
    const seen = seenIds.get(baseId) ?? 0;
    seenIds.set(baseId, seen + 1);
    const bareScenarioId = seen === 0 ? baseId : `${baseId}-${seen + 1}`;
    const scenarioId = qualify(bareScenarioId);

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
    if (slug) node.spec = slug;
    nodes.push(node);
    // FR-36b: anchor aliases stay BARE + file-local — markdown links and
    // Marksman resolve within a file, never via the composite key.
    anchors.push({
      alias: bareScenarioId,
      canonicalId: bareScenarioId,
      location: { file: relativePath, line },
    });

    for (const tag of tags) {
      const m = tag.match(SPEC_TAG_RE);
      if (m) {
        // Same-spec convention: a bare `@FR-N` tag points at THIS spec's FR.
        // Slug-less files keep the bare endpoint — the builder resolves it
        // when exactly one spec defines the local id (unambiguous).
        pushEdge({ from: qualify(m[1]), to: scenarioId, type: 'tested-by' });
        continue;
      }
      // FR-36c: `@featureN` ↔ `FR-N` is the repo-wide convention the coverage
      // layer already maps by hand — build the REAL tested-by edge so
      // get_trace works via edges, not a tag-scan. Same-spec ONLY: a slug-less
      // `@featureN` has no resolvable target spec (skip is honest).
      const f = tag.match(FEATURE_TAG_RE);
      if (f && slug) {
        pushEdge({ from: `${slug}:FR-${f[1]}`, to: scenarioId, type: 'tested-by' });
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
