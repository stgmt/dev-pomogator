// Resolver registry — maps suggested_resolver string → Resolver instance.

import type { Resolver } from './types.ts';
import { acAuthor } from './ac-author.ts';
import { linkFixer } from './link-fixer.ts';
import { scenarioWriter } from './scenario-writer.ts';
import { frAuthor } from './fr-author.ts';
import { decisionArbiter } from './decision-arbiter.ts';
import { ownerPicker } from './owner-picker.ts';
import { crossRefLinker } from './cross-ref-linker.ts';
import { wrapDeprecatedRef } from './wrap-deprecated-ref.ts';

const RESOLVERS: Resolver[] = [
  acAuthor,
  linkFixer,
  scenarioWriter,
  frAuthor,
  decisionArbiter,
  ownerPicker,
  crossRefLinker,
  wrapDeprecatedRef,
];

export function findResolver(name: string): Resolver | undefined {
  return RESOLVERS.find((r) => r.name === name);
}

export function listResolvers(): Resolver[] {
  return [...RESOLVERS];
}
