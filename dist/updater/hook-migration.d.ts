/**
 * Automatic migration of old-format hooks to portable tsx-runner format.
 *
 * Old hooks use `npx tsx .dev-pomogator/tools/...` (relative path, no tsx-runner).
 * New format uses `node -e "require(...tsx-runner-bootstrap.cjs)" -- "ABSOLUTE/path"`.
 *
 * Called from standalone.ts on every Stop event (before cooldown check)
 * so that even projects that never update still get migrated hooks.
 *
 * Note: migrated hooks still target `.claude/settings.json` here (existing target).
 * Personal-pomogator FR-2/FR-3 migration from settings.json → settings.local.json
 * runs only during full `installClaude` (not in this standalone updater path),
 * so dev pomogator should re-run `dev-pomogator install` to move hooks to local.
 */
/**
 * Scan all Claude project settings and migrate old-format hooks.
 * Returns total number of migrated hook commands.
 */
export declare function migrateOldProjectHooks(platform: 'claude'): Promise<number>;
//# sourceMappingURL=hook-migration.d.ts.map