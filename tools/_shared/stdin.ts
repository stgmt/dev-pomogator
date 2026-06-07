/**
 * Shared hook-stdin readers (node builtins only — safe for plugin-distributed
 * hooks per the dead-integration-guard deps-absent rule).
 *
 * Before /simplify 2026-06-07 the same 8-line `readStdin()` lived as ~16
 * near-identical copies across hook scripts. The specs-validator family now
 * imports from here; the BUNDLED hooks (spec-conformance-guard/push,
 * test_quality_gate) keep local copies until their next bundle-touching
 * change (migrating them forces three rebuild+deps-absent cycles for zero
 * behaviour change).
 */

/** Accumulate stdin to a string (empty string when no input). */
export async function readStdin(): Promise<string> {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk.toString();
  return buf;
}

/** Read stdin and JSON-parse it; `{}` on empty input, throws on bad JSON. */
export async function readStdinJson<T = unknown>(): Promise<T> {
  const raw = await readStdin();
  return (raw.trim() ? JSON.parse(raw) : {}) as T;
}
