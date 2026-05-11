// Fixture F-5: STRONG assertions sample
// Sub-agent test quality audit should classify all it() blocks as STRONG
// because assertions are value-level + cover edge cases.

import { describe, it, expect } from 'vitest';

function parse(input: string): { key: string; value: string } {
  const [k = '', v = ''] = input.split('=');
  return { key: k, value: v };
}

describe('strong assertions sample', () => {
  it('returns full structure', () => {
    expect(parse('a=1')).toEqual({ key: 'a', value: '1' });
  });

  it('handles edge cases', () => {
    expect(parse('')).toEqual({ key: '', value: '' });
    expect(parse('a=')).toEqual({ key: 'a', value: '' });
  });
});
