export type Severity = 'ok' | 'warning' | 'critical';

export type CheckGroup = 'self-sufficient' | 'needs-env' | 'needs-external';

export type PluginLoaderState =
  | 'OK-physical'
  | 'OK-dynamic'
  | 'BROKEN-missing'
  | 'STALE-orphan';

export interface CheckResult {
  id: string;
  fr: string;
  name: string;
  group: CheckGroup;
  severity: Severity;
  reinstallable: boolean;
  message: string;
  hint?: string;
  reinstallHint?: string;
  extension?: string;
  durationMs: number;
  details?: Record<string, unknown>;
  envStatus?: { name: string; status: 'set' | 'unset' };
  state?: PluginLoaderState;
}

export interface DoctorOptions {
  interactive?: boolean;
  json?: boolean;
  quiet?: boolean;
  extension?: string;
  timeout?: number;
  homeDir?: string;
  projectRoot?: string;
}

export interface DoctorSummary {
  ok: number;
  warnings: number;
  critical: number;
  total: number;
  relevantOf: number;
}

export interface GatedOutEntry {
  id: string;
  fr: string;
  reason: string;
}

export interface DoctorReport {
  results: CheckResult[];
  durationMs: number;
  gatedOut: GatedOutEntry[];
  installedExtensions: string[];
  summary: DoctorSummary;
  reinstallableIssues: CheckResult[];
  manualIssues: CheckResult[];
  schemaVersion: string;
}

export interface HookOutput {
  continue: true;
  suppressOutput?: boolean;
  additionalContext?: string;
}

export interface ExtensionDependencies {
  node?: string;
  binaries?: string[];
  pythonPackages?: string[];
  docker?: boolean;
}

export interface InstalledExtensionInfo {
  name: string;
  version?: string;
  dependencies?: ExtensionDependencies;
  envRequirements?: Array<{
    name: string;
    required: boolean;
    description?: string;
    default?: string;
    example?: string;
  }>;
}

export interface DevPomogatorConfig {
  platforms?: string[];
  version?: string;
  autoUpdate?: boolean;
  installedExtensions?: InstalledExtensionInfo[];
  managed?: Record<
    string,
    {
      hooks?: Record<string, unknown>;
      commands?: Array<{ path: string; hash: string }>;
      rules?: Array<{ path: string; hash: string }>;
      tools?: Array<{ path: string; hash: string }>;
      skills?: Array<{ path: string; hash: string }>;
    }
  >;
}

export interface CheckContext {
  config: DevPomogatorConfig | null;
  configError: Error | null;
  referencedMcpServers: Set<string>;
  installedExtensions: InstalledExtensionInfo[];
  projectRoot: string;
  homeDir: string;
  signal: AbortSignal;
  packageVersion: string | null;
}

export type CheckFn = (ctx: CheckContext) => Promise<CheckResult | CheckResult[] | null>;

export interface CheckDefinition {
  id: string;
  fr: string;
  name: string;
  group: CheckGroup;
  reinstallable: boolean;
  run: CheckFn;
  gate?: (ctx: CheckContext) => { relevant: boolean; reason?: string };
  pool: 'fs' | 'mcp';
}
