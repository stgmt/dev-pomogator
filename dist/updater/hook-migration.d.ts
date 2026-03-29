/**
 * Automatic migration of old-format hooks to portable tsx-runner format.
 *
 * Old hooks use `npx tsx .dev-pomogator/tools/...` (relative path, no tsx-runner).
 * New format uses `node -e "require(...tsx-runner.js)" -- "ABSOLUTE/path"`.
 *
 * Called from standalone.ts on every Stop event (before cooldown check)
 * so that even projects that never update still get migrated hooks.
 */
/**
 * Scan all Claude project settings and migrate old-format hooks.
 * Returns total number of migrated hook commands.
 */
export declare function migrateOldProjectHooks(platform: 'claude'): Promise<number>;
//# sourceMappingURL=hook-migration.d.ts.map