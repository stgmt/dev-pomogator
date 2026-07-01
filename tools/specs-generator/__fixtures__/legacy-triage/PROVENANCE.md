# Legacy-triage fixtures — captured from the REAL corpus (real-fixtures discipline)

NOT hand-fabricated. Each fixture is a verbatim capture of a real producer output,
so the classifier test reconciles against reality, not a made-up shape.

## superseded-v4/legacy.feature
- Captured from: `.specs/archive/legacy-v3.feature` (git-tracked; archived in commit ebc4c23).
- Ground truth: SUPERSEDED — 28 SPECGEN003 scenarios preserved from the v3→v4 consolidation;
  the file header documents its own lineage. Older-version ids inside a v4 spec.

## drifted-real/FILE_CHANGES.md
- Captured from: `.specs/worktree-setup/FILE_CHANGES.md` (a LIVE, healthy skill).
- Ground truth: DRIFTED — the skill works, but its FILE_CHANGES rows still point at
  pre-v2-migration paths (src/*, extensions/*) that moved to .claude/* and tools/*.
  A missing FILE_CHANGES path is staleness, NOT a removed implementation (FR-43a default).

Re-capture: `node --import tsx .dev-pomogator/.tmp/capture-fixtures.mjs` (or move into a committed script).
