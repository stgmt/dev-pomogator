/**
 * GitHub Codespaces autostart entry (FR-16 / SPECGEN004_36, _37).
 *
 * Two responsibilities, both real and independently testable:
 *
 *   1. {@link ensureCodespacesPostStart} — the *install* side. dev-pomogator's
 *      installer calls this to inject a `postStartCommand` into the target
 *      repo's `.devcontainer/devcontainer.json` so the Codespace lifecycle
 *      launches the spec MCP server on every cold / warm / resume start.
 *      Idempotent + atomic (temp-file + rename per `atomic-config-save`).
 *
 *   2. {@link codespacesAutostart} — the *runtime* side. The injected
 *      postStartCommand invokes this entry. It boots the lifecycle with the
 *      env auto-derived from the ambient Codespaces variables (CODESPACES +
 *      CODESPACE_NAME → `codespaces:<machine-id>`), so the lock is tagged for
 *      the running environment. On resume after hibernation the previous
 *      process is gone, so its lock is stale → acquireLock auto-cleans it and
 *      rebuilds the graph from the persistent `/workspaces/` files.
 *
 * The BDD scenarios run THIS exact entry with Codespaces env vars set, rather
 * than asserting a config string — closing the gap between what the
 * postStartCommand runs and what the test runs (verify-against-real-artifact).
 *
 * @see .specs/spec-generator-v4/FR.md FR-16
 * @see ./lifecycle.ts (startLifecycle)
 * @see ./lock-manager.ts (detectEnvironment → codespaces:<machine-id>)
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { startLifecycle, type LifecycleHandle, type LifecycleOptions } from './lifecycle.ts';

/**
 * The canonical command the installer injects. `${CLAUDE_PLUGIN_ROOT}` is
 * resolved by the Codespaces shell to the installed plugin tree. A literal
 * marker substring (`MARKER`) lets {@link postStartHasMcpAutostart} detect our
 * line even when chained after a pre-existing postStartCommand.
 */
export const MARKER = 'spec-mcp-server/codespaces-autostart';
export const POST_START_COMMAND =
  `node --import tsx "\${CLAUDE_PLUGIN_ROOT}/tools/${MARKER}.ts"`;

/** True when a devcontainer `postStartCommand` value launches our autostart. */
export function postStartHasMcpAutostart(postStartCommand: unknown): boolean {
  return typeof postStartCommand === 'string' && postStartCommand.includes(MARKER);
}

/**
 * Install side — ensure `.devcontainer/devcontainer.json` runs the MCP
 * autostart on Codespace start. Returns the resolved devcontainer.json path.
 *
 * - No file yet → create a minimal one with our postStartCommand.
 * - Existing postStartCommand → chain ours after it with `&&` (idempotent: a
 *   second call detects our marker and no-ops).
 * - Existing-but-unparseable (jsonc with comments we can't safely rewrite) →
 *   leave untouched and signal via the returned `injected: false`.
 */
export function ensureCodespacesPostStart(repoRoot: string): {
  path: string;
  injected: boolean;
  alreadyPresent: boolean;
} {
  const dir = path.join(repoRoot, '.devcontainer');
  const file = path.join(dir, 'devcontainer.json');

  let config: Record<string, unknown> = {};
  let existed = false;
  if (fs.existsSync(file)) {
    existed = true;
    try {
      config = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch {
      // Unparseable (likely jsonc with comments) — don't risk corrupting it.
      return { path: file, injected: false, alreadyPresent: false };
    }
  }

  const current = config.postStartCommand;
  if (postStartHasMcpAutostart(current)) {
    return { path: file, injected: false, alreadyPresent: true };
  }

  config.postStartCommand =
    typeof current === 'string' && current.trim().length > 0
      ? `${current} && ${POST_START_COMMAND}`
      : POST_START_COMMAND;
  if (!existed) {
    config.name = config.name ?? 'dev-pomogator';
  }

  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return { path: file, injected: true, alreadyPresent: false };
}

export interface CodespacesAutostartOptions {
  repoRoot: string;
  /** Test seam — inject the watch-mode probe result (default: real touch test). */
  watchProbe?: LifecycleOptions['watchProbe'];
  /** Test seam — override the env tag (default: detectEnvironment from process.env). */
  env?: LifecycleOptions['env'];
  skipNdjson?: boolean;
}

/**
 * Runtime side — boot the lifecycle for the running Codespace. The env tag is
 * auto-derived from process.env (CODESPACES / CODESPACE_NAME) unless overridden,
 * so the lock records `codespaces:<machine-id>`.
 */
export async function codespacesAutostart(opts: CodespacesAutostartOptions): Promise<LifecycleHandle> {
  return startLifecycle({
    repoRoot: opts.repoRoot,
    env: opts.env,
    skipNdjson: opts.skipNdjson ?? true,
    autoDetectWatchMode: true,
    watchProbe: opts.watchProbe,
  });
}

// CLI entry: invoked by the injected postStartCommand inside the Codespace.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoRoot = process.env.DEV_POMOGATOR_REPO_ROOT ?? process.cwd();
  codespacesAutostart({ repoRoot })
    .then((handle) => {
      process.stdout.write(
        `[spec-mcp-server][codespaces] autostarted — lock env=${handle.lock.record.env}\n`,
      );
      // The lifecycle keeps the process alive via the watcher + heartbeat.
    })
    .catch((err) => {
      process.stderr.write(
        `[spec-mcp-server][codespaces] autostart failed: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      process.exit(1);
    });
}
