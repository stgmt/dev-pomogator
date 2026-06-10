/**
 * native-statusline: seed/repair the ccstatusline WIDGET config
 * (~/.config/ccstatusline/settings.json) so the bar shows repo + cwd (FR-11).
 *
 * Problem this solves: ccstatusline's stock default is a SINGLE line
 * model | context-length | git-branch | git-changes — no repo name, no cwd.
 * A single line also truncates at terminal width (live incident 2026-06-06:
 * "(+555,-59…" — tail widgets swallowed), so dev-pomogator's canonical layout
 * is a 3-line column (ccstatusline supports up to 3 lines):
 *
 *   line 0: model | context-length
 *   line 1: git-root-dir (repo) | current-working-dir (cwd, ~-abbreviated)
 *   line 2: git-branch | git-changes
 *
 * Widget type ids verified against the REAL producer
 * (sirmalloc/ccstatusline src/utils/widget-manifest.ts + src/types/Settings.ts
 * zod defaults) — see .claude/rules/testing/verify-against-real-artifact.md.
 *
 * Two consumers with different aggressiveness (mirrors FR-2 keep-user discipline):
 * - SessionStart hook (install path):  install-only — write config ONLY when the
 *   file is missing. Never mutate an existing third-party config silently.
 * - Doctor fix-action (repair path):   explicit user confirmation — additionally
 *   NORMALIZE an "ours-shaped" config (only stock + our widget types — i.e. the
 *   stock default, or a previous dev-pomogator layout revision) to the canonical
 *   column. Custom layouts are NEVER touched by either path.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Widget types we require on the bar (real ccstatusline ids). */
export const REQUIRED_WIDGET_TYPES = ['git-root-dir', 'current-working-dir'] as const;

/**
 * Widget types of the UNTOUCHED ccstatusline stock default line
 * (src/types/Settings.ts SettingsSchema lines .default(...)).
 */
const STOCK_DEFAULT_TYPES = new Set([
  'model',
  'separator',
  'context-length',
  'git-branch',
  'git-changes',
  'flex-separator',
]);

/**
 * "Ours-shaped" = every widget type is stock or one of ours. Covers the stock
 * default AND previous dev-pomogator layout revisions (tail-appended /
 * after-model single-line) — all safe to normalize on explicit confirmation.
 * Any other type means the user customized → keep-user.
 */
const OURS_TYPES = new Set([...STOCK_DEFAULT_TYPES, ...REQUIRED_WIDGET_TYPES]);

/** Config file ccstatusline reads (verified on a real machine + its docs). */
export function ccstatuslineConfigPath(home: string): string {
  return path.join(home, '.config', 'ccstatusline', 'settings.json');
}

interface WidgetItem {
  id: string;
  type: string;
  color?: string;
  metadata?: Record<string, string>;
}

interface CcstatuslineConfig {
  version?: number;
  lines?: WidgetItem[][];
  [key: string]: unknown;
}

export type WidgetsAction = 'install' | 'enrich' | 'noop' | 'keep-user';

export interface WidgetsReconcileResult {
  action: WidgetsAction;
  /** Required widget types absent from the config (empty when both present). */
  missing: string[];
}

/**
 * Canonical 3-line column layout (the "столбик"). Colors = stock defaults /
 * widget defaults from the producer; cwd is ~-abbreviated.
 */
export function canonicalLines(): WidgetItem[][] {
  let id = 0;
  const next = () => String(++id);
  return [
    [
      { id: next(), type: 'model', color: 'cyan' },
      { id: next(), type: 'separator' },
      { id: next(), type: 'context-length', color: 'brightBlack' },
    ],
    [
      { id: next(), type: 'git-root-dir', color: 'cyan' },
      { id: next(), type: 'separator' },
      {
        id: next(),
        type: 'current-working-dir',
        color: 'blue',
        metadata: { abbreviateHome: 'true' },
      },
    ],
    [
      { id: next(), type: 'git-branch', color: 'magenta' },
      { id: next(), type: 'separator' },
      { id: next(), type: 'git-changes', color: 'yellow' },
    ],
  ];
}

/** Full default config we write when the file is missing (install). */
export function defaultWidgetsConfig(): CcstatuslineConfig {
  return { version: 3, lines: canonicalLines() };
}

function collectTypes(lines: WidgetItem[][]): Set<string> {
  const types = new Set<string>();
  for (const line of lines) {
    for (const item of line) types.add(item.type);
  }
  return types;
}

/** Per-line widget-type sequences match the canonical layout exactly. */
function isCanonical(lines: WidgetItem[][]): boolean {
  const canonical = canonicalLines();
  const nonEmpty = lines.filter((l) => l.length > 0);
  if (nonEmpty.length !== canonical.length) return false;
  return canonical.every(
    (cline, i) =>
      nonEmpty[i].length === cline.length &&
      cline.every((w, j) => nonEmpty[i][j].type === w.type),
  );
}

/**
 * Pure classification of an existing parsed config (no I/O).
 * - missing/invalid lines      → install
 * - exactly canonical          → noop
 * - only stock + our types     → enrich (normalize to the canonical column)
 * - any foreign widget type    → keep-user
 */
export function reconcileWidgets(config: CcstatuslineConfig | undefined): WidgetsReconcileResult {
  if (!config || !Array.isArray(config.lines)) {
    return { action: 'install', missing: [...REQUIRED_WIDGET_TYPES] };
  }
  const present = collectTypes(config.lines);
  const missing = REQUIRED_WIDGET_TYPES.filter((t) => !present.has(t));
  if (isCanonical(config.lines)) {
    return { action: 'noop', missing: [] };
  }
  const oursShaped = [...present].every((t) => OURS_TYPES.has(t));
  return { action: oursShaped ? 'enrich' : 'keep-user', missing };
}

export interface WidgetsWriteResult {
  changed: boolean;
  action: WidgetsAction;
  missing: string[];
}

export interface WidgetsWriteOptions {
  /** Home dir override (tests). Defaults to os.homedir(). */
  home?: string;
  /**
   * Repair mode (doctor fix-action, explicit confirmation): also normalize an
   * existing ours-shaped config to the canonical column. Install path
   * (SessionStart hook) leaves existing files alone (false).
   */
  enrichExisting?: boolean;
}

/**
 * Read the ccstatusline config, reconcile, write atomically when allowed.
 * Fail-open: a present-but-unparseable file is never overwritten (keep-user).
 * Idempotent: noop/keep-user perform no write.
 */
export function writeCcstatuslineWidgets(opts: WidgetsWriteOptions = {}): WidgetsWriteResult {
  const home = opts.home ?? os.homedir();
  const configFile = ccstatuslineConfigPath(home);

  let config: CcstatuslineConfig | undefined;
  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as CcstatuslineConfig;
  } catch {
    if (fs.existsSync(configFile)) {
      // exists but unreadable/corrupt — never overwrite (fail-open)
      return { changed: false, action: 'keep-user', missing: [] };
    }
    config = undefined;
  }

  const resolved = reconcileWidgets(config);

  if (resolved.action === 'install') {
    writeJsonAtomic(configFile, defaultWidgetsConfig());
    return { changed: true, action: 'install', missing: resolved.missing };
  }

  if (resolved.action === 'enrich' && opts.enrichExisting && config) {
    // Normalize: replace lines with the canonical column; every other config
    // field (flexMode, powerline, colorLevel, …) preserved (read-modify-write).
    config.lines = canonicalLines();
    writeJsonAtomic(configFile, config);
    return { changed: true, action: 'enrich', missing: resolved.missing };
  }

  return { changed: false, action: resolved.action, missing: resolved.missing };
}

/** Atomic config save: temp file + rename (.claude/rules/atomic-config-save.md). */
function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
    fs.renameSync(tmp, filePath);
  } finally {
    if (fs.existsSync(tmp)) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore temp cleanup failure
      }
    }
  }
}
