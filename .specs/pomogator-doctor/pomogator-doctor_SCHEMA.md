# pomogator-doctor — Schema Reference

TypeScript interfaces для `src/doctor/types.ts` + JSON output schema для `--json` mode.

## CheckResult

Результат одной проверки (C1..C17 / FR-1..FR-14).

```typescript
export type Severity = 'ok' | 'warning' | 'critical';

export type CheckGroup = 'self-sufficient' | 'needs-env' | 'needs-external';

export interface CheckResult {
  /** Stable check ID (C1, C2, ..., C17) — machine-readable */
  id: string;
  /** FR reference (FR-1..FR-14) — traceability to spec */
  fr: string;
  /** Human-readable name — displayed in chalk table */
  name: string;
  /** Traffic-light grouping for FR-20 output */
  group: CheckGroup;
  /** Result severity */
  severity: Severity;
  /** Can `npx dev-pomogator` fix this? Drives FR-18 reinstall offer */
  reinstallable: boolean;
  /** Human-readable description of what was detected */
  message: string;
  /** Actionable hint when severity != 'ok' (NFR-U-1 — mandatory) */
  hint?: string;
  /** What reinstall would fix (only when reinstallable=true) */
  reinstallHint?: string;
  /** Relevant extension name for extension-gated checks (FR-7, FR-8, FR-14) */
  extension?: string;
  /** Check execution time in milliseconds */
  durationMs: number;
  /** Details для debugging (not shown in main table, в --verbose) */
  details?: Record<string, unknown>;
  /** Redacted env value metadata для --json + env-requirement checks (FR-25) */
  envStatus?: { name: string; status: 'set' | 'unset' };
  /** Plugin-loader 4-state classification (FR-13 / C15 only) */
  state?: 'OK-physical' | 'OK-dynamic' | 'BROKEN-missing' | 'STALE-orphan';
}
```

### Notes on `envStatus`

Для checks типа `env-requirement` (FR-5, C7), field `envStatus` replaces direct value. Гарантирует что API keys не попадают в JSON output (NFR-S-2).

## DoctorOptions

Параметры вызова `runDoctor(options)`.

```typescript
export interface DoctorOptions {
  /** Interactive mode: chalk output + reinstall prompts (default true for CLI) */
  interactive?: boolean;
  /** Machine-readable JSON output to stdout (FR-24) */
  json?: boolean;
  /** SessionStart hook mode: JSON hook payload only (FR-17) */
  quiet?: boolean;
  /** Filter checks to specific extension (CLI --extension flag) */
  extension?: string;
  /** Global timeout override in ms (default 15000, NFR-P-4) */
  timeout?: number;
  /** Override home dir for tests */
  homeDir?: string;
  /** Override project root для gitignore + .env checks */
  projectRoot?: string;
}
```

## DoctorReport

Aggregated результат всех checks.

```typescript
export interface DoctorReport {
  /** All check results (only relevant per FR-21 gating) */
  results: CheckResult[];
  /** Total runtime wall-clock in ms */
  durationMs: number;
  /** Which checks were gated out due to FR-21 (for transparency) */
  gatedOut: Array<{ id: string; fr: string; reason: string }>;
  /** Installed extensions считанные из config.installedExtensions */
  installedExtensions: string[];
  /** Summary по severity */
  summary: {
    ok: number;
    warnings: number;
    critical: number;
    total: number;
    relevantOf: number; // "N of 17 checks relevant"
  };
  /** Reinstallable findings — drives FR-18 prompt */
  reinstallableIssues: CheckResult[];
  /** Non-reinstallable findings — always shown separately (NFR-U) */
  manualIssues: CheckResult[];
  /** Doctor version — запись формата report */
  schemaVersion: string; // "1.0.0"
}
```

## Hook Output Payload (FR-17)

Для SessionStart `--quiet` mode. Следует Claude Code hook JSON protocol.

```typescript
export interface HookOutput {
  /** Всегда true — hook не блокирует session start (NFR-R-2) */
  continue: true;
  /** true когда все checks ok → не захламлять chat */
  suppressOutput?: boolean;
  /** Короткий баннер ≤100 chars когда есть проблемы (NFR-U-7) */
  additionalContext?: string;
}
```

Примеры:

- Happy path: `{"continue":true,"suppressOutput":true}`
- With problems: `{"continue":true,"additionalContext":"⚠ pomogator-doctor: 2 critical (1 reinstallable), run /pomogator-doctor"}`

## extension.json Schema Addition (FR-22)

Новое optional поле добавляется к существующей `extension.json` схеме.

```typescript
export interface ExtensionManifest {
  // ... existing fields (name, version, description, platforms, category, etc.)

  /** NEW: dependencies field for FR-21 per-extension gating */
  dependencies?: {
    /** Node.js version range (semver), default ">=22.6.0" */
    node?: string;
    /** External binaries required: bun, python3, docker, devcontainer, chroma, etc. */
    binaries?: string[];
    /** Python packages to verify via `python3 -c 'import <pkg>'` */
    pythonPackages?: string[];
    /** Docker + devcontainer CLI required */
    docker?: boolean;
  };

  /** Existing field — continues to drive FR-5 env check */
  envRequirements?: Array<{
    name: string;
    required: boolean;
    description?: string;
    default?: string;
    example?: string;
  }>;
}
```

### Extension → dependencies mapping (current extensions)

| Extension | binaries | pythonPackages | docker |
|-----------|----------|----------------|--------|
| auto-simplify | — | — | — |
| bg-task-guard | — | — | — |
| plan-pomogator | — | — | — |
| specs-workflow | — | — | — |
| test-quality | — | — | — |
| auto-commit | — | — | — |
| prompt-suggest | — | — | — |
| learnings-capture | — | — | — |
| test-statusline | — | — | — |
| claude-mem-health | ['chroma', 'python3'] | ['chromadb'] | — |
| bun-oom-guard | ['bun'] | — | — |
| context-menu | — | — | — |
| devcontainer | — | — | true |
| forbid-root-artifacts | ['python3'] | ['pyyaml', 'simple-term-menu'] | — |
| tui-test-runner | ['python3'] | ['textual'] | — |

## JSON Output Example (FR-24)

`dev-pomogator --doctor --json`:

```json
{
  "schemaVersion": "1.0.0",
  "durationMs": 1243,
  "installedExtensions": ["auto-commit", "plan-pomogator"],
  "summary": { "ok": 5, "warnings": 1, "critical": 1, "total": 7, "relevantOf": 17 },
  "gatedOut": [
    { "id": "C9", "fr": "FR-7", "reason": "no installed extension requires bun" },
    { "id": "C10a", "fr": "FR-8", "reason": "no installed extension requires python3" }
  ],
  "results": [
    {
      "id": "C1",
      "fr": "FR-1",
      "name": "Node version",
      "group": "self-sufficient",
      "severity": "ok",
      "reinstallable": false,
      "message": "Node v22.7.0 (>=22.6 required)",
      "durationMs": 8
    },
    {
      "id": "C7",
      "fr": "FR-5",
      "name": "AUTO_COMMIT_API_KEY",
      "group": "needs-env",
      "severity": "critical",
      "reinstallable": false,
      "message": "Required env var unset in both .env and settings.local.json",
      "hint": "Set AUTO_COMMIT_API_KEY in .env (see .env.example line 3)",
      "extension": "auto-commit",
      "durationMs": 3,
      "envStatus": { "name": "AUTO_COMMIT_API_KEY", "status": "unset" }
    }
  ],
  "reinstallableIssues": [],
  "manualIssues": []
}
```

Note: **NO `value` field** for env-requirement checks — только `envStatus.status` (NFR-S-2, FR-25).
