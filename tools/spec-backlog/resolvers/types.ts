// Resolver agent interface — every specialist resolver implements this.

import type { BacklogEntry } from '../types.ts';

export interface ResolverResult {
  /** 0..1 confidence the resolution is correct. */
  confidence: number;
  /** Files modified by the resolver (relative to repoRoot). */
  files_changed: string[];
  /** One-paragraph human-readable summary of what changed. */
  notes: string;
  /** Set when the resolver bailed out without applying changes. */
  bailed_out?: { reason: string };
}

export interface Resolver {
  /** Stable identifier — matches BacklogEntry.suggested_resolver. */
  name: string;
  /** Human-readable purpose for `spec-backlog list --resolvers`. */
  description: string;
  /**
   * Apply the resolver. MUST be idempotent — calling twice on the same
   * entry should not re-do work that's already done.
   */
  resolve(opts: { repoRoot: string; entry: BacklogEntry }): Promise<ResolverResult>;
}
