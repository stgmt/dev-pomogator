import fs from 'node:fs';
import path from 'node:path';
import type { CheckContext, CheckDefinition, CheckResult } from '../types.js';

/**
 * Native statusLine presence check (FR-7, .specs/native-statusline/).
 *
 * Detects whether the main Claude Code statusLine (ccstatusline) is configured
 * in <home>/.claude/settings.json. Self-contained detection — the immediate
 * fix-action is `writeNativeStatusLine` in tools/native-statusline/, surfaced
 * via the hint (lets the user restore the bar in the current session instead of
 * waiting for the SessionStart hook to take effect next session).
 *
 * Domain: NATIVE statusLine only — NOT the test-progress bar (test-statusline).
 */
const OWNERSHIP_MARKER = 'ccstatusline';

export const statuslineCheck: CheckDefinition = {
  id: 'C-NSL',
  fr: 'FR-7',
  name: 'Native statusLine (ccstatusline)',
  group: 'self-sufficient',
  reinstallable: false,
  pool: 'fs',
  async run(ctx: CheckContext): Promise<CheckResult> {
    const settingsFile = path.join(ctx.homeDir, '.claude', 'settings.json');
    const base = {
      id: 'C-NSL',
      fr: 'FR-7',
      name: 'Native statusLine (ccstatusline)',
      group: 'self-sufficient' as const,
      reinstallable: false,
      durationMs: 0,
    };

    let command: string | undefined;
    let unreadable = false;
    try {
      const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf-8')) as {
        statusLine?: { command?: unknown };
      };
      command = typeof parsed.statusLine?.command === 'string' ? parsed.statusLine.command : undefined;
    } catch {
      unreadable = fs.existsSync(settingsFile); // exists but invalid JSON
    }

    if (command && command.includes(OWNERSHIP_MARKER)) {
      return { ...base, severity: 'ok', message: 'native statusLine (ccstatusline) configured' };
    }
    if (command) {
      return {
        ...base,
        severity: 'ok',
        message: 'custom user statusLine present — left untouched',
      };
    }
    if (unreadable) {
      return {
        ...base,
        severity: 'warning',
        message: 'settings.json is unreadable (invalid JSON) — statusLine not verified',
        hint: 'Fix ~/.claude/settings.json JSON, then it will be reconciled next session',
      };
    }

    return {
      ...base,
      severity: 'warning',
      message: 'native statusLine not set in ~/.claude/settings.json',
      hint:
        'Apply NOW (current session): node -e "require(require(\'path\').join(process.env.CLAUDE_PLUGIN_ROOT||\'.\',\'tools\',\'_shared\',\'bootstrap.cjs\'))" -- "tools/native-statusline/apply-statusline.ts". ' +
        'Otherwise the SessionStart hook installs it next session. Opt out: DEV_POMOGATOR_STATUSLINE=off.',
      details: {
        fixAction: 'apply-statusline',
        fixScript: 'tools/native-statusline/apply-statusline.ts',
        settingsFile,
      },
    };
  },
};
