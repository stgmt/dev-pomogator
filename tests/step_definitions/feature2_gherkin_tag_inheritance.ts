/**
 * @feature2 — SPECGEN004_185 (FR-2, gherkin-parser-impl). W0 walking-skeleton scenario:
 * proves the author→run→green→flip path end-to-end before the test-author machinery is built.
 *
 * Tests a REAL Done-When item of gherkin-parser-impl — "Tag inheritance Feature→Scenario→Pickle
 * preserved": a Feature-level tag must propagate onto a scenario node that has no tag of its own.
 * Calls the REAL parser (no mock, no inline copy) and asserts on its real output.
 *
 * @see tools/spec-graph/parsers/gherkin.ts parseGherkin (tags = [...featureTags, ...ruleTags, ...scenarioTags])
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_185
 */
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { V4World } from '../hooks/before-after.ts';
import { parseGherkin } from '../../tools/spec-graph/parsers/gherkin.ts';
import type { ParserOutput } from '../../tools/spec-graph/types.ts';

interface GherkinWorld extends V4World {
  gpSource?: string;
  gpOut?: ParserOutput;
}

Given('a .feature source whose Feature carries a tag and whose scenario has none of its own', function (this: GherkinWorld) {
  // A Feature-level tag + an untagged scenario — the exact inheritance shape under test.
  this.gpSource = [
    '@inherited-tag',
    'Feature: skeleton inheritance probe',
    '',
    '  Scenario: a scenario with no tag of its own',
    '    Given a precondition',
    '    When an action happens',
    '    Then an outcome holds',
    '',
  ].join('\n');
});

When('the gherkin parser parses that source', function (this: GherkinWorld) {
  // Slug-less path → bare ids; we assert on the node's tags, not on edges.
  this.gpOut = parseGherkin(this.gpSource!, 'tests/features/skeleton-probe.feature');
});

Then('the produced scenario node carries the inherited feature-level tag', function (this: GherkinWorld) {
  const out = this.gpOut!;
  assert.equal(out.nodes.length, 1, 'exactly one scenario node is produced');
  assert.ok(
    out.nodes[0].tags.includes('@inherited-tag'),
    `scenario node should inherit the Feature-level @inherited-tag; got ${JSON.stringify(out.nodes[0].tags)}`,
  );
});
