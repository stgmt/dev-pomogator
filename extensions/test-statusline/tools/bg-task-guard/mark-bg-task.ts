#!/usr/bin/env npx tsx
/**
 * PostToolUse hook (Bash matcher): NO-OP.
 * Marker creation moved to test_runner_wrapper.ts (centralized lifecycle).
 * Wrapper creates .bg-task-active.{session_prefix} at start, deletes on exit.
 * This hook exists for backward compatibility — always approve.
 */
process.stdout.write('{}');
