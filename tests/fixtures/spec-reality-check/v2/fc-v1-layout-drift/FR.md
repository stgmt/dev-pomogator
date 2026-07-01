# FR

## FR-1 v1 layout drift fixture

Triggers FC_V1_LAYOUT_DRIFT: FILE_CHANGES has action=edit on a removed-v1-prefix path (`src/`)
AND the repo is a canonical plugin (`.claude-plugin/plugin.json` present, created by the eval
setup) with that prefix dir gone. A plain user repo (no plugin marker, or a present `src/` dir)
keeps the generic FC_EDIT_MISSING instead — see the v2-code-drift-no-git negative eval.
