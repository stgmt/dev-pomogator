// Marksman binary resolver (FR-7 / Option D — hybrid, "package not crutch").
//
// Resolution order, package-first:
//   1. PATH      — marksman installed via the OS package manager
//                  (winget / brew / snap / nix). The real "package" path: we
//                  download nothing, we use what the user's package manager put
//                  on PATH. No pinned hashes, no version drift.
//   2. managed   — a binary we fetched into `.dev-pomogator/bin/` as a fallback
//                  when no system package is present (integrity-checked download,
//                  separate module).
//   3. null      — neither present → caller uses the graph-backed js-fallback.
//
// Pure + injectable (whichFn / existsFn) so the policy is unit-testable without
// touching the real PATH or filesystem.

import fs from 'node:fs';
import path from 'node:path';

export type MarksmanSource = 'env' | 'path' | 'managed';

export interface ResolvedMarksman {
  source: MarksmanSource;
  binaryPath: string;
}

export interface ResolveOptions {
  repoRoot: string;
  platform?: NodeJS.Platform;
  /** Look up an executable on PATH; returns its absolute path or null. Injectable. */
  whichFn?: (cmd: string) => string | null;
  /** fs.existsSync, injectable for tests. */
  existsFn?: (p: string) => boolean;
  /** Process env, injectable for tests. Honours `DEV_POMOGATOR_MARKSMAN_BIN`. */
  env?: NodeJS.ProcessEnv;
}

/** Pure PATH scan — no shell-out. Honours PATHEXT-style extensions on Windows.
 *  Uses platform-aware path semantics (`path.win32`/`path.posix`) so it is
 *  correct AND testable regardless of the host OS the test runs on. */
export function whichOnPath(
  cmd: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  existsFn: (p: string) => boolean = fs.existsSync,
): string | null {
  const P = platform === 'win32' ? path.win32 : path.posix;
  const exts = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const dirs = (env.PATH ?? env.Path ?? '').split(P.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = P.join(dir, cmd + ext);
      if (existsFn(candidate)) return candidate;
    }
  }
  return null;
}

/** Absolute path of the managed (downloaded) binary for the current platform. */
export function managedBinaryPath(repoRoot: string, platform: NodeJS.Platform = process.platform): string {
  const P = platform === 'win32' ? path.win32 : path.posix;
  const name = platform === 'win32' ? 'marksman.exe' : 'marksman';
  return P.join(repoRoot, '.dev-pomogator', 'bin', name);
}

/**
 * Resolve the active Marksman binary, package-first. Returns `null` when nothing
 * is available (→ js-fallback). Does NOT download — that's the managed-fetch
 * module's job, invoked by the trigger when this returns null.
 */
export function resolveMarksmanBinary(opts: ResolveOptions): ResolvedMarksman | null {
  const platform = opts.platform ?? process.platform;
  const existsFn = opts.existsFn ?? fs.existsSync;
  const env = opts.env ?? process.env;
  const whichFn = opts.whichFn ?? ((c: string) => whichOnPath(c, env, platform, existsFn));

  // Explicit override (highest priority): the Docker test image installs the real
  // binary to a testuser path and points `DEV_POMOGATOR_MARKSMAN_BIN` at it (the
  // dir is not on PATH); honouring it is what lets the launcher + e2e find the
  // binary in Docker — without it, "installed ≠ integrated".
  const override = env.DEV_POMOGATOR_MARKSMAN_BIN;
  if (override && existsFn(override)) return { source: 'env', binaryPath: override };

  const onPath = whichFn('marksman');
  if (onPath) return { source: 'path', binaryPath: onPath };

  const managed = managedBinaryPath(opts.repoRoot, platform);
  if (existsFn(managed)) return { source: 'managed', binaryPath: managed };

  return null;
}
