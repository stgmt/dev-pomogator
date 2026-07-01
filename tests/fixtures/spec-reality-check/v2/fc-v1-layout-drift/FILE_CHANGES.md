# File Changes

| Path | Action | Reason |
|------|--------|--------|
| `src/old_v1_module.ts` | edit | v1 layout path: `src/` was removed in the v2.0 canonical-plugin migration. With a `.claude-plugin/plugin.json` marker present and no `src/` dir, this must trigger FC_V1_LAYOUT_DRIFT (not generic FC_EDIT_MISSING). |
