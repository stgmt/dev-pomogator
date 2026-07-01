// Fixture F-5 (BDD): STRONG assertions sample.
// The Then steps assert value-level structure (assert.deepEqual) AND cover edge cases —
// classifyTestFile must grade every assertion-bearing step STRONG.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

function parse(input: string): { key: string; value: string } {
  const [k = '', v = ''] = input.split('=');
  return { key: k, value: v };
}

Given(/^the input "([^"]*)"$/, function () {
  /* setup only */
});

When(/^it is parsed$/, function () {
  /* setup only */
});

Then(/^the full structure matches$/, function () {
  assert.deepEqual(parse('a=1'), { key: 'a', value: '1' }); // STRONG — value-level
});

Then(/^the parser handles edge cases$/, function () {
  assert.deepEqual(parse(''), { key: '', value: '' });
  assert.deepEqual(parse('a='), { key: 'a', value: '' });
});
