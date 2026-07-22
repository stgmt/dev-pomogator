import fs from 'node:fs';
import path from 'node:path';

/** Stable comparison key for Windows-host and WSL `/mnt/<drive>` spellings. */
export function normalizeRootIdentity(value) {
  const trimmed = value.trim().replace(/\\/g, '/');
  const wsl = trimmed.match(/^\/mnt\/([a-zA-Z])(?:\/(.*))?$/i);
  if (wsl) return `${wsl[1].toLowerCase()}:/${wsl[2] ?? ''}`.replace(/\/+$/, '').toLowerCase();
  const drive = trimmed.match(/^([a-zA-Z]):(?:\/(.*))?$/);
  if (drive) return `${drive[1].toLowerCase()}:/${drive[2] ?? ''}`.replace(/\/+$/, '').toLowerCase();
  return path.resolve(trimmed).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function unsafeReason(value) {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized) return 'empty';
  if (normalized.includes('${')) return 'placeholder';
  if (/^[a-z]:\/windows(?:\/|$)/i.test(normalized)) return 'unsafe_windows';
  if (/^\/\//.test(normalized) || /^\\\\/.test(value)) return 'unsafe_unc';
  if (/(?:^|\/)\.claude\/(?:plugins|cache)(?:\/|$)/i.test(normalized) || /dev-pomogator[\/-]cache/i.test(normalized)) return 'plugin_cache';
  return null;
}

function validate(source, value, rejected) {
  const observed = value ?? '';
  const unsafe = unsafeReason(observed);
  if (unsafe) {
    rejected.push({ source, observed, reason: unsafe });
    return null;
  }
  const candidate = path.resolve(observed);
  if (!fs.existsSync(path.join(candidate, '.specs'))) {
    rejected.push({ source, observed, reason: 'missing_specs' });
    return null;
  }
  return candidate;
}

/**
 * Resolve the target project without consulting stdin. Candidates are
 * validated in deterministic priority order and plugin-cache roots cannot win.
 */
export function resolveTargetProjectRoot(input) {
  const rejected = [];
  const observed = {
    env_override: input.envRoot ?? null,
    caller_project: input.cwd || null,
    script_dir: input.scriptDir || null,
  };
  for (const [source, value] of [
    ['env_override', input.envRoot],
    ['caller_project', input.cwd],
    ['script_dir', input.scriptDir],
  ]) {
    const root = validate(source, value, rejected);
    if (root) {
      return {
        status: 'READY', root, source, observed, rejected,
        corrective_action: 'Use a repository root containing .specs/ in SPECS_GENERATOR_ROOT or run from that project.',
      };
    }
  }
  return {
    status: 'NOT_READY', root: null, source: null, observed, rejected,
    corrective_action: 'Set SPECS_GENERATOR_ROOT to the target project root containing .specs/, or run the command from that project; do not launch it from a plugin cache, C:\\Windows, or a UNC-relative directory.',
  };
}
