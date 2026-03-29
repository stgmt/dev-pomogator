# Use Cases

## UC-1: Remove dead Cursor functions from memory.ts

**Actor:** Developer
**Precondition:** memory.ts contains exported `installCursorHooks` with 0 external callers
**Flow:**
1. Identify all Cursor-only functions via grep (0 callers outside dead chain)
2. Delete dead functions and their transitive callees
3. Remove unused imports
4. Update outdated comments
**Postcondition:** memory.ts compiles, ensureClaudeMem chain works, ~415 lines removed

## UC-2: Remove dead Cursor code from updater/index.ts

**Actor:** Developer
**Precondition:** updateCursorHooksForProject defined but never called
**Flow:**
1. Delete CursorHooksJson interface and updateCursorHooksForProject function
2. Simplify unreachable `.cursor` ternary branches
**Postcondition:** updater compiles, updateClaudeHooksForProject still works

## UC-3: Verify regression safety

**Actor:** Developer
**Flow:**
1. npm run build passes
2. ensureClaudeMem import succeeds
3. Existing CORE003 tests pass
