import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';

/**
 * Statusline WIDGETS check (FR-11, .specs/native-statusline/).
 *
 * Detects the "плохо настроен statusline" symptom: ccstatusline is the
 * configured statusLine, but its widget config (~/.config/ccstatusline/
 * settings.json) is missing or stock-default-shaped — i.e. the bar shows
 * model/context/branch but NOT the repo name (`git-root-dir`) and NOT the
 * cwd (`current-working-dir`).
 *
 * Defers to C-NSL when statusLine is absent or a foreign command — one root
 * cause, one warning. Custom widget layouts are reported OK (left untouched).
 *
 * Fix-action: tools/native-statusline/apply-statusline.ts (enrich mode).
 */
const OWNERSHIP_MARKER = 'ccstatusline';
const REQUIRED_WIDGET_TYPES = ['git-root-dir', 'current-working-dir'];
const STOCK_DEFAULT_TYPES = new Set([
  'model',
  'separator',
  'context-length',
  'git-branch',
  'git-changes',
  'flex-separator',
]);

export const statuslineWidgetsCheck: CheckDefinition = {
  id: 'C-NSW',
  fr: 'FR-11',
  name: 'Statusline widgets (repo + cwd)',
  group: 'self-sufficient',
  reinstallable: false,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult> {
    const base = {
      id: 'C-NSW',
      fr: 'FR-11',
      name: 'Statusline widgets (repo + cwd)',
      group: 'self-sufficient' as const,
      reinstallable: false,
      durationMs: 0,
    };

    // 1) Is ccstatusline the active statusLine at all? If not — C-NSL's domain.
    const settingsFile = path.join(ctx.homeDir, '.claude', 'settings.json');
    let command: string | undefined;
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf-8')) as {
        statusLine?: { command?: unknown };
      };
      command = typeof parsed.statusLine?.command === 'string' ? parsed.statusLine.command : undefined;
    } catch {
      command = undefined;
    }
    if (!command || !command.includes(OWNERSHIP_MARKER)) {
      return {
        ...base,
        severity: 'ok',
        message: 'statusLine is not ccstatusline — widget config not applicable (see C-NSL)',
      };
    }

    // 2) Inspect the ccstatusline widget config.
    const configFile = path.join(ctx.homeDir, '.config', 'ccstatusline', 'settings.json');
    const fixHint =
      'Apply NOW: node -e "require(require(\'path\').join(process.env.CLAUDE_PLUGIN_ROOT||\'.\',\'tools\',\'_shared\',\'bootstrap.cjs\'))" -- "tools/native-statusline/apply-statusline.ts" ' +
      '(adds git-root-dir + current-working-dir widgets; custom layouts are never touched).';

    let lines: Array<Array<{ type?: unknown }>> | undefined;
    let unreadable = false;
    try {
      const parsed = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as {
        lines?: Array<Array<{ type?: unknown }>>;
      };
      lines = Array.isArray(parsed.lines) ? parsed.lines : undefined;
    } catch {
      unreadable = fs.existsSync(configFile);
    }

    if (unreadable) {
      return {
        ...base,
        severity: 'warning',
        message: 'ccstatusline config is unreadable (invalid JSON) — widgets not verified',
        hint: `Fix ${configFile} JSON, then re-run /pomogator-doctor`,
      };
    }

    if (!lines) {
      return {
        ...base,
        severity: 'warning',
        message:
          'ccstatusline widget config missing — bar renders stock defaults without repo and cwd',
        hint: fixHint,
        details: { fixAction: 'apply-statusline', configFile },
      };
    }

    const present = new Set<string>();
    for (const line of lines) {
      for (const item of line) {
        if (typeof item?.type === 'string') present.add(item.type);
      }
    }
    const missing = REQUIRED_WIDGET_TYPES.filter((t) => !present.has(t));

    if (missing.length === 0) {
      return { ...base, severity: 'ok', message: 'statusline shows repo + cwd widgets' };
    }

    const stockShaped = [...present].every((t) => STOCK_DEFAULT_TYPES.has(t));
    if (!stockShaped) {
      return {
        ...base,
        severity: 'ok',
        message: `custom widget layout present — left untouched (no ${missing.join(', ')})`,
      };
    }

    return {
      ...base,
      severity: 'warning',
      message: `statusline is stock-default — missing ${missing.join(', ')} (no repo/cwd on the bar)`,
      hint: fixHint,
      details: { fixAction: 'apply-statusline', configFile, missing },
    };
  },
};
