#!/usr/bin/env node
/**
 * SessionStart hook for the NATIVE statusLine domain.
 *
 * Writes `statusLine.command` into ~/.claude/settings.json so the main Claude
 * Code status bar (ccstatusline) is restored for plugin users — the canonical
 * plugin model has no declarative statusLine and no install-time event, so a
 * SessionStart hook is the only place this can happen (see .specs/native-statusline/).
 *
 * Domain boundary: this is the NATIVE statusLine, NOT the test-progress bar
 * (tools/test-statusline/ is a different domain — never edit it from here).
 *
 * Behaviour:
 * - DEV_POMOGATOR_STATUSLINE=off → no-op (FR-5).
 * - changed → emit { systemMessage } (line appears next session — settings load
 *   before this hook fires) (FR-3).
 * - Always exit 0 (fail-open, NFR-R1) (FR-8).
 *
 * NOTE: green tests prove the WRITE happened; they do NOT prove Claude Code
 * RENDERS the bar — that needs a real install→restart→observe (DESIGN.md
 * "Manual Verification").
 */

import { log as _logShared } from '../_shared/hook-utils.ts';
import { writeCcstatuslineWidgets } from './ccstatusline-widgets.ts';
import { writeNativeStatusLine } from './reconcile-statusline.ts';

const LOG_PREFIX = 'NATIVE-STATUSLINE';
const VERBOSE = process.env.DEV_POMOGATOR_HOOK_VERBOSE === '1';

function log(level: 'INFO' | 'DEBUG' | 'ERROR', message: string): void {
  if (level !== 'ERROR' && !VERBOSE) return;
  _logShared(level, LOG_PREFIX, message);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function main(): Promise<void> {
  try {
    // Drain stdin (hook protocol) — we don't require any field from it.
    await readStdin();

    if (process.env.DEV_POMOGATOR_STATUSLINE === 'off') {
      log('DEBUG', 'Disabled via DEV_POMOGATOR_STATUSLINE=off');
      process.stdout.write('{}');
      return;
    }

    const result = writeNativeStatusLine();
    log('INFO', `reconcile action=${result.action} changed=${result.changed}`);

    // Install path (FR-11): seed the ccstatusline WIDGET config (repo + cwd
    // widgets) ONLY when the file is missing — existing configs are never
    // mutated by the hook (repair of a degraded config = doctor fix-action).
    const widgets = writeCcstatuslineWidgets({ enrichExisting: false });
    log('INFO', `widgets action=${widgets.action} changed=${widgets.changed}`);

    if (result.changed || widgets.changed) {
      const parts: string[] = [];
      if (result.changed) {
        parts.push(
          'native statusline (ccstatusline) подключён в ~/.claude/settings.json — строка появится со следующей сессии',
        );
      }
      if (widgets.changed) {
        parts.push(
          'виджеты statusline (repo + cwd) настроены в ~/.config/ccstatusline/settings.json',
        );
      }
      process.stdout.write(
        JSON.stringify({
          systemMessage: `dev-pomogator: ${parts.join('; ')}. Отключить: DEV_POMOGATOR_STATUSLINE=off.`,
        }),
      );
      return;
    }
  } catch (err) {
    log('ERROR', `Hook error: ${err}`);
  }

  // Always succeed (fail-open).
  process.stdout.write('{}');
}

const isDirectRun =
  process.argv[1]?.endsWith('install_native_statusline.ts') ||
  process.argv[1]?.endsWith('install_native_statusline.js');
if (isDirectRun) {
  void main();
}

export { main };
