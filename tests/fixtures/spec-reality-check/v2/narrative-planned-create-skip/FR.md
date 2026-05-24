# FR

## FR-1 planned narrative reconciliation

This spec mentions `src/planned_thing_v2.ts` in narrative — same path is in FC as action=create. Should NOT emit NARRATIVE_PATH_MISSING (FC plan covers it).

Also mentions `src/unplanned_missing_v2.ts` in narrative — NOT in FC. Should still emit NARRATIVE_PATH_MISSING.
