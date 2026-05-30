// Resolver registry — maps suggested_resolver string → Resolver instance.

import type { Resolver } from './types.ts';
import { acAuthor } from './ac-author.ts';

const RESOLVERS: Resolver[] = [acAuthor];

export function findResolver(name: string): Resolver | undefined {
  return RESOLVERS.find((r) => r.name === name);
}

export function listResolvers(): Resolver[] {
  return [...RESOLVERS];
}
