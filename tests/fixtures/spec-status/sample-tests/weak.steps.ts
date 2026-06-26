// Fixture F-4 (BDD): WEAK assertions sample.
// A cucumber step-def whose only assertion-bearing step (the Then) asserts presence
// only — classifyTestFile must grade it WEAK (no value-level assert). The Given/When
// setup steps carry no assertion and are skipped (not quality signals).
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

function getValue(): unknown {
  return { foo: 'bar' };
}

Given(/^a value is produced$/, function () {
  /* setup only — no assertion */
});

When(/^the step-def reads it$/, function () {
  /* setup only — no assertion */
});

Then(/^the value is present$/, function () {
  assert.ok(getValue()); // WEAK — presence-only, no value-level check
});
