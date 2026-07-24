/** Canonical namespace/localId identity helpers (FR-36f..h, GitHub #172). */

export interface Identity {
  namespace?: string;
  localId: string;
}

export type IdentityCollisionKind = 'EXACT' | 'CASE_NORMALIZED' | 'UNICODE_NORMALIZED';

function assertPart(value: string, name: 'namespace' | 'localId'): void {
  if (!value) throw new Error(`INVALID_IDENTITY: ${name} must be non-empty`);
  if (name === 'localId' && value.includes(':')) {
    throw new Error('INVALID_IDENTITY: localId must not contain ":"');
  }
}

/** Format without normalizing: exact spelling is the canonical persisted identity. */
export function formatIdentity(identity: Identity): string {
  assertPart(identity.localId, 'localId');
  if (identity.namespace === undefined) return identity.localId;
  assertPart(identity.namespace, 'namespace');
  return `${identity.namespace}:${identity.localId}`;
}

/** Split on the final colon so path-like or colon-delimited namespaces stay opaque. */
export function parseIdentity(canonicalId: string): Identity {
  if (!canonicalId) throw new Error('INVALID_IDENTITY: id must be non-empty');
  const separator = canonicalId.lastIndexOf(':');
  if (separator < 0) return { localId: canonicalId };
  const namespace = canonicalId.slice(0, separator);
  const localId = canonicalId.slice(separator + 1);
  assertPart(namespace, 'namespace');
  assertPart(localId, 'localId');
  return { namespace, localId };
}

export function localIdOf(identity: string | { id: string }): string {
  return parseIdentity(typeof identity === 'string' ? identity : identity.id).localId;
}

function caseFold(value: string): string {
  return value.toLowerCase();
}

function unicodeFold(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export function identityCollisionKey(identity: Identity): string {
  return `${unicodeFold(identity.namespace ?? '')}:${unicodeFold(identity.localId)}`;
}

/** Classify only within one normalized namespace; cross-namespace reuse is legal. */
export function classifyIdentityCollision(firstId: string, secondId: string): IdentityCollisionKind | null {
  const first = parseIdentity(firstId);
  const second = parseIdentity(secondId);
  if (unicodeFold(first.namespace ?? '') !== unicodeFold(second.namespace ?? '')) return null;
  if (first.localId === second.localId && first.namespace === second.namespace) return 'EXACT';
  if (caseFold(first.localId) === caseFold(second.localId)) return 'CASE_NORMALIZED';
  if (unicodeFold(first.localId) === unicodeFold(second.localId)) return 'UNICODE_NORMALIZED';
  return null;
}
