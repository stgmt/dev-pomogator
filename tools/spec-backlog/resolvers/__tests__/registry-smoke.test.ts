// Registry smoke test — verifies all 7 resolvers load + expose the
// Resolver interface. Per-resolver behavior tests live alongside.

import { describe, it, expect } from 'vitest';
import { findResolver, listResolvers } from '../registry.ts';

const EXPECTED_RESOLVERS = [
  'ac-author',
  'link-fixer',
  'scenario-writer',
  'fr-author',
  'decision-arbiter',
  'owner-picker',
  'cross-ref-linker',
];

describe('spec-backlog resolver registry — smoke', () => {
  it('exposes all 7 resolvers from listResolvers()', () => {
    const names = listResolvers().map((r) => r.name).sort();
    expect(names).toEqual([...EXPECTED_RESOLVERS].sort());
  });

  it('findResolver(<name>) returns the matching instance for each name', () => {
    for (const name of EXPECTED_RESOLVERS) {
      const r = findResolver(name);
      expect(r, `findResolver("${name}") returned undefined`).toBeDefined();
      expect(r!.name).toBe(name);
    }
  });

  it('findResolver(unknown) returns undefined', () => {
    expect(findResolver('does-not-exist')).toBeUndefined();
  });

  it('every resolver exposes Resolver interface — name, description, resolve()', () => {
    for (const r of listResolvers()) {
      expect(typeof r.name).toBe('string');
      expect(r.name.length).toBeGreaterThan(0);
      expect(typeof r.description).toBe('string');
      expect(r.description.length).toBeGreaterThan(10);
      expect(typeof r.resolve).toBe('function');
    }
  });
});
