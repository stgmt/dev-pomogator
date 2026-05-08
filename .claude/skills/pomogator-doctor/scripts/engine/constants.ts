export const DOCTOR_TIMEOUTS = {
  GLOBAL_MS: 15_000,
  PROBE_MS: 3_000,
  SPAWN_MS: 3_000,
  HOOK_MS: 10_000,
} as const;

export const DOCTOR_POOLS = {
  FS: 8,
  MCP: 4,
} as const;

export const DOCTOR_SCHEMA_VERSION = '1.0.0';
