export { log, normalizePath } from './hook-utils.ts';
export { markerPath, readMarker, writeMarkerAtomic, isWithinCooldown, hashFileList } from './marker-utils.ts';
export type { MarkerData } from './marker-utils.ts';

// scope-gate: reusable scoring + marker primitives
// Used by: scope-gate extension (PreToolUse hook), plan-pomogator (plan-gate), specs-workflow (audit-spec)
export { scoreDiff, isDocsOrTestsOnly, parseFilesFromDiff, isGuardFile, detectGuardFiles } from './scope-gate-score-diff.ts';
export type { ScoreResult, ScoreOptions } from './scope-gate-score-diff.ts';
export {
  writeMarker,
  readFreshMarker,
  runGC,
  sha256,
  shortSha,
  markerDir,
  appendEscapeLog,
  TTL_MS,
  GC_STALE_MS,
  GC_THROTTLE_MS,
} from './scope-gate-marker-store.ts';
export type { Marker, MarkerVariant, EscapeLogEntry } from './scope-gate-marker-store.ts';
