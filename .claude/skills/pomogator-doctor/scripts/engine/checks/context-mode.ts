import type { CheckDefinition, CheckResult } from '../types.js';
import { buildResult } from './_helpers.js';
import {
  runContextModeDoctor,
  type ContextModeDoctorStatus,
} from '../../../../../../tools/context-mode-health/check.ts';
import { fireContextModeInstaller } from '../../../../../../tools/context-mode-setup/setup.ts';

const META = {
  id: 'C-CMODE',
  fr: 'CTXMODE-FR-4',
  name: 'context-mode plugin health',
  group: 'needs-external' as const,
  reinstallable: false,
};

const SEVERITY_BY_STATUS: Record<ContextModeDoctorStatus, CheckResult['severity']> = {
  OK: 'ok',
  MCP_ONLY_CONFIGURED: 'ok',
  INSTALL_MISSING: 'warning',
  CONFIG_POISONED: 'warning',
  MCP_DEAD_IN_SESSION: 'warning',
  HANDSHAKE_FAILED: 'warning',
  HOOK_UNSAFE: 'warning',
  ERROR_FAIL_OPEN: 'warning',
};

const MESSAGE_BY_STATUS: Record<ContextModeDoctorStatus, string> = {
  OK: 'context-mode plugin is registered and no runtime issue was detected',
  MCP_ONLY_CONFIGURED: 'context-mode MCP-only configuration is present',
  INSTALL_MISSING: 'context-mode plugin is not installed',
  CONFIG_POISONED: 'context-mode plugin registry is present but inconsistent',
  MCP_DEAD_IN_SESSION: 'context-mode MCP appears dead in the current session',
  HANDSHAKE_FAILED: 'context-mode MCP handshake failed',
  HOOK_UNSAFE: 'context-mode hook safety check reported an unsafe state',
  ERROR_FAIL_OPEN: 'context-mode health check failed open',
};

function isInstallRepairable(status: ContextModeDoctorStatus): boolean {
  return status === 'INSTALL_MISSING' || status === 'CONFIG_POISONED';
}

function statusHint(status: ContextModeDoctorStatus, remediation: string[]): string {
  const base = remediation.join(' -> ');
  if (isInstallRepairable(status)) {
    const fix = 'Run /pomogator-doctor --fix to start the context-mode installer automatically';
    return process.platform === 'win32'
      ? `${base}. ${fix}. Windows note: use pwsh -NoProfile for PowerShell commands; ctx shell snippets run under bash.`
      : `${base}. ${fix}.`;
  }
  if (process.platform === 'win32') {
    return `${base}. Windows note: use pwsh -NoProfile for PowerShell commands; ctx shell snippets run under bash.`;
  }
  return base;
}

export const contextModeCheck: CheckDefinition = {
  ...META,
  pool: 'mcp',
  async run(ctx): Promise<CheckResult> {
    const report = runContextModeDoctor({
      homeRoot: ctx.homeDir,
      pluginRoot: ctx.projectRoot,
      processSnapshotPath: process.env.DEV_POMOGATOR_CONTEXT_MODE_PROCESS_SNAPSHOT,
      handshakeResult:
        process.env.DEV_POMOGATOR_CONTEXT_MODE_HANDSHAKE === 'ok'
          ? { ok: true }
          : process.env.DEV_POMOGATOR_CONTEXT_MODE_HANDSHAKE === 'failed'
            ? { ok: false }
            : { skipped: true },
      hookSafety: process.env.DEV_POMOGATOR_CONTEXT_MODE_HOOK_UNSAFE === '1' ? 'unsafe' : 'unknown',
    });
    const repairable = isInstallRepairable(report.status);
    const fixAttempted = ctx.fix && repairable;
    const fixLaunched = fixAttempted ? fireContextModeInstaller() : false;

    return buildResult({
      ...META,
      reinstallable: repairable,
    }, SEVERITY_BY_STATUS[report.status], MESSAGE_BY_STATUS[report.status], {
      hint: statusHint(report.status, report.remediation),
      reinstallHint: repairable ? '/pomogator-doctor --fix (or /plugin install context-mode@context-mode)' : undefined,
      details: {
        status: report.status,
        registration: report.registration,
        process: report.process,
        handshake: report.handshake,
        hookSafety: report.hookSafety,
        manifestCommand: report.manifestCommand,
        evidence: report.evidence,
        remediation: report.remediation,
        fixAction: repairable ? 'context-mode-install' : undefined,
        fixAttempted,
        fixLaunched,
      },
    });
  },
};
