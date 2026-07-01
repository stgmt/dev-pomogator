// Fixture F-6 (BDD): FAKE-POSITIVE-RISK sample.
// A file-level mock of a PRODUCTION path (fileRisk) + a tautology assertion in the Then —
// classifyTestFile must flag the assertion-bearing step FAKE-POSITIVE-RISK.
import { Given, Then } from '@cucumber/cucumber';
import { vi } from 'vitest';
import assert from 'node:assert/strict';

vi.mock('../../src/critical-parser.ts'); // mocks production path — fake-positive risk

Given(/^a mocked production parser$/, function () {
  /* setup only */
});

Then(/^the tautology holds$/, function () {
  assert.ok(true); // tautology — always passes regardless of code under test
});
