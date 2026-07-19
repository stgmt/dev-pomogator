import { ensureUp } from './ensure-up.mjs';
import { loadRegistry, execute } from './server.mjs';
import { migrateManagedHooks, recoverManagedHooks } from './migrate-managed-hooks.mjs';

async function reconcileManagedHooks(root) {
  const settingsPath = process.env.DEV_POMOGATOR_MANAGED_SETTINGS_PATH;
  if (!settingsPath) return;
  const recovery = await recoverManagedHooks({ settingsPath });
  if (recovery.fixRequired) {
    await recoverManagedHooks({ settingsPath, fix: true });
    return;
  }
  await migrateManagedHooks({ root, settingsPath });
}

const readInput = () => new Promise(resolve => {
  let body = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { body += chunk; });
  process.stdin.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
  process.stdin.on('error', () => resolve({}));
});

const mergeSessionStart = (current, next) => {
  const merged = { ...current };
  for (const [key, value] of Object.entries(next)) {
    if (key === 'hookSpecificOutput' && value && typeof value === 'object') {
      merged.hookSpecificOutput = { ...(merged.hookSpecificOutput || {}), ...value };
    } else if (key === 'additionalContext' && typeof value === 'string') {
      merged.additionalContext = [merged.additionalContext, value].filter(Boolean).join('\n');
    } else {
      merged[key] = value;
    }
  }
  return merged;
};

const root = process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const input = await readInput();
try {
  await reconcileManagedHooks(root);
  const service = await ensureUp(root);
  if (!service.ready || typeof input.session_id !== 'string' || !input.session_id) process.exit(0);
  const registered = await fetch(`http://127.0.0.1:${service.port}/v1/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: input.session_id }),
    signal: AbortSignal.timeout(3000),
  });
  if (!registered.ok) process.exit(0);
  const registry = await loadRegistry(root);
  let merged = {};
  // Route keys encode legacy group/index identity; explicit numeric order makes
  // SessionStart output deterministic even if registry serialization changes.
  const sessionRoutes = Object.entries(registry.routes)
    .filter(([id]) => id.startsWith('SessionStart/'))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));
  for (const [, entry] of sessionRoutes) merged = mergeSessionStart(merged, await execute(entry, input, root, 'SessionStart'));
  if (Object.keys(merged).length) process.stdout.write(JSON.stringify(merged));
} catch {
  // SessionStart remains fail-open.
}
