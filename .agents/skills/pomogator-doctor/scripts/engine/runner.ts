import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pLimit from 'p-limit';
import { DOCTOR_POOLS, DOCTOR_SCHEMA_VERSION, DOCTOR_TIMEOUTS } from './constants.js';
import type {
  CheckContext,
  CheckDefinition,
  CheckResult,
  DevPomogatorConfig,
  DoctorOptions,
  DoctorReport,
  GatedOutEntry,
  InstalledExtensionInfo,
} from './types.js';

export async function executeChecks(
  options: DoctorOptions,
  checks: CheckDefinition[],
): Promise<DoctorReport> {
  const started = Date.now();
  const controller = new AbortController();
  const timeoutMs = options.timeout ?? DOCTOR_TIMEOUTS.GLOBAL_MS;
  const timer = setTimeout(() => controller.abort(new Error('Doctor timeout')), timeoutMs);

  try {
    const homeDir = options.homeDir ?? os.homedir();
    const projectRoot = options.projectRoot ?? process.cwd();

    const { config, configError } = loadConfig(homeDir);
    const installedExtensions = config?.installedExtensions ?? [];
    const referencedMcpServers = collectReferencedMcpServers(projectRoot, homeDir);
    const packageVersion = readPackageVersion(projectRoot);

    const ctx: CheckContext = {
      config,
      configError,
      referencedMcpServers,
      installedExtensions,
      projectRoot,
      homeDir,
      signal: controller.signal,
      packageVersion,
    };

    const { relevant, gatedOut } = gateChecks(checks, ctx, options.extension);

    const fsPool = pLimit(DOCTOR_POOLS.FS);
    const mcpPool = pLimit(DOCTOR_POOLS.MCP);
    const results: CheckResult[] = [];

    const tasks = relevant.map((def) => {
      const pool = def.pool === 'mcp' ? mcpPool : fsPool;
      return pool(async () => {
        const out = await runSingleCheck(def, ctx);
        results.push(...out);
      });
    });

    await Promise.allSettled(tasks);

    const sorted = results.sort((a, b) => a.id.localeCompare(b.id));
    const summary = buildSummary(sorted, checks.length);
    const reinstallableIssues = sorted.filter((r) => r.severity !== 'ok' && r.reinstallable);
    const manualIssues = sorted.filter((r) => r.severity !== 'ok' && !r.reinstallable);

    return {
      results: sorted,
      durationMs: Date.now() - started,
      gatedOut,
      installedExtensions: installedExtensions.map((e) => e.name),
      summary,
      reinstallableIssues,
      manualIssues,
      schemaVersion: DOCTOR_SCHEMA_VERSION,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runSingleCheck(
  def: CheckDefinition,
  ctx: CheckContext,
): Promise<CheckResult[]> {
  const started = Date.now();
  try {
    const out = await def.run(ctx);
    if (out === null) return [];
    const list = Array.isArray(out) ? out : [out];
    for (const r of list) {
      if (r.durationMs === undefined || r.durationMs === 0) {
        r.durationMs = Date.now() - started;
      }
    }
    return list;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [
      {
        id: def.id,
        fr: def.fr,
        name: def.name,
        group: def.group,
        severity: 'critical',
        reinstallable: def.reinstallable,
        message: `internal error: ${message}`,
        hint: 'Check logs and report bug',
        durationMs: Date.now() - started,
      },
    ];
  }
}

function gateChecks(
  checks: CheckDefinition[],
  ctx: CheckContext,
  extensionFilter?: string,
): { relevant: CheckDefinition[]; gatedOut: GatedOutEntry[] } {
  const relevant: CheckDefinition[] = [];
  const gatedOut: GatedOutEntry[] = [];

  const extInstalled = extensionFilter
    ? ctx.installedExtensions.some((e) => e.name === extensionFilter)
    : true;

  for (const def of checks) {
    if (extensionFilter && !extInstalled) {
      gatedOut.push({ id: def.id, fr: def.fr, reason: `extension '${extensionFilter}' not installed` });
      continue;
    }
    const gate = def.gate ? def.gate(ctx) : { relevant: true };
    if (!gate.relevant) {
      gatedOut.push({
        id: def.id,
        fr: def.fr,
        reason: gate.reason ?? 'check not relevant for current installed extensions',
      });
      continue;
    }
    relevant.push(def);
  }
  return { relevant, gatedOut };
}

function buildSummary(results: CheckResult[], totalPossible: number): DoctorReport['summary'] {
  const ok = results.filter((r) => r.severity === 'ok').length;
  const warnings = results.filter((r) => r.severity === 'warning').length;
  const critical = results.filter((r) => r.severity === 'critical').length;
  return {
    ok,
    warnings,
    critical,
    total: results.length,
    relevantOf: totalPossible,
  };
}

function loadConfig(homeDir: string): {
  config: DevPomogatorConfig | null;
  configError: Error | null;
} {
  const configPath = path.join(homeDir, '.dev-pomogator', 'config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as DevPomogatorConfig;
    return { config: parsed, configError: null };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { config: null, configError: new Error(`config not found: ${configPath}`) };
    }
    if (error instanceof SyntaxError) {
      return {
        config: null,
        configError: new Error(`config parse error: ${error.message}`),
      };
    }
    return { config: null, configError: error as Error };
  }
}

function collectReferencedMcpServers(projectRoot: string, homeDir: string): Set<string> {
  const refs = new Set<string>();
  const roots = [
    path.join(projectRoot, '.claude', 'rules'),
    path.join(projectRoot, '.claude', 'skills'),
    path.join(homeDir, '.claude', 'rules'),
    path.join(homeDir, '.claude', 'skills'),
  ];
  const pattern = /mcp__([A-Za-z0-9_-]+)__/g;
  for (const root of roots) {
    walkMarkdown(root, (content) => {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        refs.add(match[1]);
      }
      pattern.lastIndex = 0;
    });
  }
  return refs;
}

function walkMarkdown(root: string, onContent: (content: string) => void): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.stderr.write(`[doctor] walkMarkdown failed for ${root}: ${(error as Error).message}\n`);
    }
    return;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkMarkdown(full, onContent);
    } else if (entry.isFile() && full.endsWith('.md')) {
      try {
        onContent(fs.readFileSync(full, 'utf-8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          process.stderr.write(`[doctor] read failed for ${full}: ${(error as Error).message}\n`);
        }
      }
    }
  }
}

function readPackageVersion(projectRoot: string): string | null {
  const candidates = [
    path.join(projectRoot, 'node_modules', 'dev-pomogator', 'package.json'),
    path.join(projectRoot, 'package.json'),
  ];
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8')) as { name?: string; version?: string };
      if (parsed.version && parsed.name === 'dev-pomogator') return parsed.version;
      if (parsed.version) return parsed.version;
    } catch {
      continue;
    }
  }
  return null;
}

export type { InstalledExtensionInfo, DevPomogatorConfig };
