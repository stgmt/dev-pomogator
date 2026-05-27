/**
 * Generic passthrough adapter for non-test long-running background commands
 * (npm run build, dotnet ef migrations, sleep, etc).
 *
 * Returns null for every line — no test events are parsed. The wrapper still
 * provides persistent log on disk + YAML status lifecycle + bg-task marker,
 * so AI can read .dev-pomogator/.test-status/test.<prefix>.log to observe
 * the command's actual progress even when Claude Code Bash tool drops bg
 * capture (Anthropic bugs #16305 / #21915 / #36915 / #50616).
 *
 * See .specs/fix-bg-output-loss/ FR-11 (v0.3.0).
 */

import { AdapterBase } from './adapter_base.ts';
import type { TestEvent } from './types.ts';

export class GenericAdapter extends AdapterBase {
  parseLine(_line: string): TestEvent | null {
    return null;
  }
}
