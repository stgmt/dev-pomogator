import { sha256, stableJson } from './packet.ts';
import { assertTypedSummary } from './captured-process.ts';

export interface CollectionEvidence<T> {
  source: string;
  scope: string[];
  digest: string;
  count: number;
  items: T[];
  ordering: string[];
  collectedAt: string;
}

export function collectFinite<T>(options: {
  source: string;
  scope: string[];
  items: T[];
  id: (item: T) => string;
  filter?: (item: T) => boolean;
  limit: number;
  collectedAt?: string;
}): CollectionEvidence<T> {
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0) throw new Error('finite collection limit is required');
  const filtered = options.filter ? options.items.filter(options.filter) : [...options.items];
  const sorted = filtered.sort((left, right) => options.id(left).localeCompare(options.id(right)));
  if (sorted.length > options.limit) throw new Error(`DWE_COLLECTION_LIMIT_EXCEEDED:${sorted.length}:${options.limit}`);
  const ordering = sorted.map(options.id);
  if (new Set(ordering).size !== ordering.length) throw new Error('DWE_COLLECTION_DUPLICATE_ID');
  const evidence = {
    source: options.source,
    scope: [...options.scope].sort(),
    digest: sha256(stableJson({ source: options.source, scope: [...options.scope].sort(), ordering })),
    count: sorted.length,
    items: sorted,
    ordering,
    collectedAt: options.collectedAt ?? new Date().toISOString(),
  };
  assertTypedSummary(evidence);
  return evidence;
}

export function paginateFinite<T>(items: T[], cursor: number, limit: number): { total: number; returned: number; results: T[]; nextCursor: number | null } {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit <= 0) throw new Error('invalid finite pagination');
  const results = items.slice(cursor, cursor + limit);
  return { total: items.length, returned: results.length, results, nextCursor: cursor + results.length < items.length ? cursor + results.length : null };
}
