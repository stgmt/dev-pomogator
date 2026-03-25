#!/usr/bin/env bash
# PostToolUse hook (Bash matcher): NO-OP.
# Marker creation moved to test_runner_wrapper.ts (centralized lifecycle).
# Wrapper creates .bg-task-active.{session_prefix} at start, deletes on exit.
# This hook exists for backward compatibility — always exit 0.
exit 0
