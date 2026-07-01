/**
 * Shared hook-stdin readers (node builtins only — safe for plugin-distributed
 * hooks per the dead-integration-guard deps-absent rule; esbuild inlines this
 * module into the bundled hooks).
 *
 * Before /simplify 2026-06-07 the same 8-line `readStdin()` lived as ~16
 * near-identical copies across hook scripts. All TS hook carriers import from
 * here now (specs-validator family + the bundled spec-conformance-guard/push,
 * test_quality_gate and the anchor hooks). Two JSON flavours exist because
 * the hooks split into two failure philosophies:
 *   - readStdinJson      — THROWS on bad JSON (PreToolUse guards whose
 *     main().catch decides fail-open vs fail-closed explicitly);
 *   - readStdinJsonSafe  — NEVER throws, `{}` on any error (Stop/PostToolUse
 *     hooks that are fail-open by contract — a broken pipe must not block).
 */

/** Accumulate stdin to a string (empty string when no input). */
export async function readStdin(): Promise<string> {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk.toString();
  return buf;
}

/** Read stdin and JSON-parse it; `{}` on empty input, THROWS on bad JSON. */
export async function readStdinJson<T = unknown>(): Promise<T> {
  const raw = await readStdin();
  return (raw.trim() ? JSON.parse(raw) : {}) as T;
}

/** Fail-open variant: `{}` on empty input, bad JSON, or stream error. */
export async function readStdinJsonSafe<T = unknown>(): Promise<T | Record<string, never>> {
  try {
    return await readStdinJson<T>();
  } catch {
    return {};
  }
}
