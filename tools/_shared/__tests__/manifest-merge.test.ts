/**
 * Tests for the additive hooks-manifest merger (FR-25 regression guard).
 *
 * Two invariants pinned:
 *   1. No v3 entry is ever removed by the merge — same hook tuple after.
 *   2. Idempotent: merging the same v4 manifest twice yields the same result
 *      as one merge (i.e. duplicates are dedup'd by (event, matcher, command)).
 */

import { describe, it, expect } from 'vitest';
import { additiveMergeHooks, countHookEntries, type HooksManifest } from '../manifest-merge.ts';

const v3Manifest: HooksManifest = {
  PreToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [
        { type: 'command', command: 'tools/v3-form-guard-a.ts' },
        { type: 'command', command: 'tools/v3-form-guard-b.ts' },
      ],
    },
    {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'tools/v3-bash-guard.ts' }],
    },
  ],
  PostToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [
        { type: 'command', command: 'tools/v3-audit-logger.ts' },
        { type: 'command', command: 'tools/v3-meta-guard.ts' },
      ],
    },
  ],
};

const v4Additions: HooksManifest = {
  PreToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [{ type: 'command', command: 'tools/spec-conformance-guard/spec-conformance-guard.ts' }],
    },
  ],
  PostToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [{ type: 'command', command: 'tools/spec-conformance-push/spec-conformance-push.ts' }],
    },
    {
      matcher: 'Bash',
      hooks: [{ type: 'command', command: 'tools/bash-post-test-ingest/bash-post-test-ingest.ts' }],
    },
  ],
};

describe('additiveMergeHooks — FR-25 invariant', () => {
  it('preserves every v3 hook entry after merge', () => {
    const merged = additiveMergeHooks(v3Manifest, v4Additions);
    const commandsAfter = JSON.stringify(merged);
    expect(commandsAfter).toContain('v3-form-guard-a.ts');
    expect(commandsAfter).toContain('v3-form-guard-b.ts');
    expect(commandsAfter).toContain('v3-bash-guard.ts');
    expect(commandsAfter).toContain('v3-audit-logger.ts');
    expect(commandsAfter).toContain('v3-meta-guard.ts');
  });

  it('adds v4 entries to the right matcher group (no new duplicate matcher)', () => {
    const merged = additiveMergeHooks(v3Manifest, v4Additions);
    const preWriteEdit = merged.PreToolUse!.find((g) => g.matcher === 'Write|Edit')!;
    expect(preWriteEdit.hooks.map((h) => h.command)).toEqual([
      'tools/v3-form-guard-a.ts',
      'tools/v3-form-guard-b.ts',
      'tools/spec-conformance-guard/spec-conformance-guard.ts',
    ]);
  });

  it('idempotent — merging the v4 additions twice equals merging once', () => {
    const once = additiveMergeHooks(v3Manifest, v4Additions);
    const twice = additiveMergeHooks(once, v4Additions);
    expect(twice).toEqual(once);
  });

  it('total hook count grows by exactly the number of NEW v4 entries', () => {
    const before = countHookEntries(v3Manifest);
    const v4Count = countHookEntries(v4Additions);
    const after = countHookEntries(additiveMergeHooks(v3Manifest, v4Additions));
    expect(after).toBe(before + v4Count);
  });

  it('a NEW matcher entirely absent from v3 is added as a new group', () => {
    const newEvent: HooksManifest = {
      Stop: [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: 'tools/spec-stop-hook.ts' }],
        },
      ],
    };
    const merged = additiveMergeHooks(v3Manifest, newEvent);
    expect(merged.Stop).toBeDefined();
    expect(merged.Stop![0].hooks[0].command).toBe('tools/spec-stop-hook.ts');
  });
});
