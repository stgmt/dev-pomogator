/**
 * @feature49 step definitions — feature-strength unit tests (SPECGEN004_373–388)
 *
 * Drives the REAL `placeholderScenarios` and `featureStrengthFindings` functions
 * from `tools/spec-graph/feature-strength.ts` in-process. Fixtures loaded from
 * `tests/fixtures/feature-strength/`. Covers the 8 placeholder-detection and 6
 * net-new-scoping behaviours from `feature-strength.test.ts`, plus the third
 * MCP-door gate test (`.md write → no strength finding`).
 *
 * NOT a duplicate of SPECGEN004_181 (feature49_autosurface.ts) which covers
 * the `validateSpecChange` door integration: stub refused / real accepted.
 * This file covers the UNIT-level `placeholderScenarios` / `featureStrengthFindings`.
 *
 * @see .specs/spec-generator-v4/spec-generator-v4.feature SPECGEN004_373–388
 * @see .specs/spec-generator-v4/FR.md FR-49
 * @see tools/spec-graph/feature-strength.ts
 */

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { V4World } from '../hooks/before-after.ts';
import {
  placeholderScenarios,
  featureStrengthFindings,
  type PlaceholderScenario,
  type StrengthFinding,
} from '../../tools/spec-graph/feature-strength.ts';
import { validateSpecChange } from '../../tools/spec-mcp-server/mutations.ts';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'feature-strength');

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES, `${name}.feature`), 'utf8');
}

interface FeatureStrengthWorld extends V4World {
  fsFixtureName?: string;
  fsFixtureText?: string;
  fsPlaceholderResult?: PlaceholderScenario[];
  fsCurrentName?: string | null;
  fsNextName?: string;
  fsNetNewResult?: StrengthFinding[];
  fsDoorResult?: import('../../tools/spec-mcp-server/mutations.ts').ValidateResult;
}

// ─── placeholder detection ─────────────────────────────────────────────────

Given(
  /^the feature-strength fixture named "([^"]+)"$/,
  function (this: FeatureStrengthWorld, fixtureName: string) {
    this.fsFixtureName = fixtureName;
    if (fixtureName === 'empty') {
      this.fsFixtureText = '';
    } else if (fixtureName === 'empty-feature') {
      this.fsFixtureText = 'Feature: empty\n';
    } else if (fixtureName === 'not-gherkin') {
      this.fsFixtureText = 'not gherkin at all {[(';
    } else {
      this.fsFixtureText = loadFixture(fixtureName);
    }
  },
);

When(
  /^placeholderScenarios is called on the feature-strength fixture$/,
  function (this: FeatureStrengthWorld) {
    this.fsPlaceholderResult = placeholderScenarios(this.fsFixtureText!);
  },
);

Then(
  /^the feature-strength placeholder count is (\d+)$/,
  function (this: FeatureStrengthWorld, expected: string) {
    assert.strictEqual(
      this.fsPlaceholderResult!.length,
      parseInt(expected, 10),
      `Expected ${expected} placeholder scenarios but got ${this.fsPlaceholderResult!.length}: ${JSON.stringify(this.fsPlaceholderResult)}`,
    );
  },
);

// ─── net-new scoping ───────────────────────────────────────────────────────

Given(
  /^the feature-strength net-new check with current "([^"]+)" and next "([^"]+)"$/,
  function (this: FeatureStrengthWorld, currentName: string, nextName: string) {
    this.fsCurrentName = currentName;
    this.fsNextName = nextName;
  },
);

When(
  /^featureStrengthFindings is called on the feature-strength current and next fixtures$/,
  function (this: FeatureStrengthWorld) {
    const loadOrNull = (name: string): string | null => {
      if (name === 'null') return null;
      if (name === 'empty') return '';
      if (name === 'empty-feature') return 'Feature: empty\n';
      return loadFixture(name);
    };
    const current = loadOrNull(this.fsCurrentName!);
    const next = loadFixture(this.fsNextName!);
    this.fsNetNewResult = featureStrengthFindings(current, next);
  },
);

Then(
  /^the feature-strength net-new finding count is at least (\d+)$/,
  function (this: FeatureStrengthWorld, minCount: string) {
    assert.ok(
      this.fsNetNewResult!.length >= parseInt(minCount, 10),
      `Expected at least ${minCount} findings but got ${this.fsNetNewResult!.length}: ${JSON.stringify(this.fsNetNewResult)}`,
    );
  },
);

Then(
  /^the feature-strength net-new finding count is (\d+)$/,
  function (this: FeatureStrengthWorld, expected: string) {
    assert.strictEqual(
      this.fsNetNewResult!.length,
      parseInt(expected, 10),
      `Expected exactly ${expected} findings but got ${this.fsNetNewResult!.length}: ${JSON.stringify(this.fsNetNewResult)}`,
    );
  },
);

Then(
  /^no feature-strength net-new findings contain "PLACEHOLDER"$/,
  function (this: FeatureStrengthWorld) {
    const phFindings = this.fsNetNewResult!.filter((f) => f.message.includes('PLACEHOLDER'));
    assert.deepStrictEqual(
      phFindings,
      [],
      `Expected no PLACEHOLDER findings but got: ${JSON.stringify(phFindings)}`,
    );
  },
);

Then(
  /^some feature-strength net-new findings contain "TBD"$/,
  function (this: FeatureStrengthWorld) {
    const tbdFindings = this.fsNetNewResult!.filter((f) => f.message.includes('TBD'));
    assert.ok(
      tbdFindings.length > 0,
      `Expected at least one TBD finding but got none. All findings: ${JSON.stringify(this.fsNetNewResult)}`,
    );
  },
);

Then(
  /^no feature-strength net-new findings contain "TBD"$/,
  function (this: FeatureStrengthWorld) {
    const tbdFindings = this.fsNetNewResult!.filter((f) => f.message.includes('TBD'));
    assert.deepStrictEqual(
      tbdFindings,
      [],
      `Expected no TBD findings but got: ${JSON.stringify(tbdFindings)}`,
    );
  },
);

// ─── MCP door .md-only gate ────────────────────────────────────────────────

Given(
  /^a temporary spec with a minimal FR\.md for the feature-strength door gate$/,
  function (this: FeatureStrengthWorld) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-md-door-'));
    const slug = 'strength-md-fixture';
    const dir = path.join(root, '.specs', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'FR.md'),
      '# FR\n\n## FR-1 Widget saves\n\nThe widget SHALL persist on save.\n',
    );
    // store root/slug for cleanup; reuse V4World tempDir as the cleanup anchor
    this.tempDir = root;
    (this as any).fsDoorMdRoot = root;
    (this as any).fsDoorMdSlug = slug;
  },
);

When(
  /^a feature-strength door write targets FR\.md with prose containing angle-bracket text$/,
  function (this: FeatureStrengthWorld) {
    const root = (this as any).fsDoorMdRoot as string;
    const slug = (this as any).fsDoorMdSlug as string;
    this.fsDoorResult = validateSpecChange(root, slug, 'FR.md', {
      content:
        '# FR\n\n## FR-1 Widget saves\n\nThe widget SHALL persist on save and `<placeholder with spaces>` stays prose.\n',
    });
  },
);

Then(
  /^the feature-strength door gate emits no strength-layer findings for the \.md write$/,
  function (this: FeatureStrengthWorld) {
    const strengthFindings = this.fsDoorResult!.findings.filter((f) => f.layer === 'strength');
    assert.deepStrictEqual(
      strengthFindings,
      [],
      `Expected no strength findings for .md write but got: ${JSON.stringify(strengthFindings)}`,
    );
  },
);
