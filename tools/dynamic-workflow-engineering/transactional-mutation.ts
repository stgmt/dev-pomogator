import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { WorkflowRunState } from './run-state.ts';
import { assertAuthority } from './run-state.ts';

export interface MutationEntry {
  path: string;
  content: string | Buffer;
}

export interface StagedMutation {
  target: string;
  staged: string;
  backup: string | null;
  baselineHash: string | null;
  replacementHash: string;
}

function hash(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function inside(root: string, target: string): boolean {
  const resolvedRoot = fs.realpathSync.native(root);
  const lexicalTarget = path.resolve(root, target);
  const relative = path.relative(resolvedRoot, lexicalTarget);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return false;
  let cursor = path.dirname(lexicalTarget);
  while (cursor !== resolvedRoot && cursor.startsWith(resolvedRoot)) {
    if (fs.existsSync(cursor) && fs.realpathSync.native(cursor) !== cursor) return false;
    cursor = path.dirname(cursor);
  }
  return cursor === resolvedRoot;
}

export function stageMutations(repoRoot: string, state: WorkflowRunState, entries: MutationEntry[], authority: { ownerInstanceId: string; fencingToken: number }): StagedMutation[] {
  assertAuthority(state, authority.ownerInstanceId, authority.fencingToken);
  if (!['PLAN_FROZEN', 'RUNNING', 'VERIFYING'].includes(state.state)) throw new Error(`DWE_MUTATION_STATE_FORBIDDEN:${state.state}`);
  const stageRoot = path.join(repoRoot, '.dev-pomogator', 'runtime', 'runs', state.runId, 'artifacts', 'staged');
  fs.mkdirSync(stageRoot, { recursive: true });
  return entries.map((entry) => {
    if (!inside(repoRoot, entry.path)) throw new Error(`DWE_MUTATION_OUTSIDE_ROOT:${entry.path}`);
    const target = path.resolve(repoRoot, entry.path);
    const current = fs.existsSync(target) ? fs.readFileSync(target) : null;
    const staged = path.join(stageRoot, `${randomUUID()}.stage`);
    const replacement = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, 'utf8');
    fs.writeFileSync(staged, replacement, { flag: 'wx', mode: 0o600 });
    return { target, staged, backup: current ? path.join(stageRoot, `${randomUUID()}.backup`) : null, baselineHash: current ? hash(current) : null, replacementHash: hash(replacement) };
  });
}

export function commitStaged(state: WorkflowRunState, staged: StagedMutation[], authority: { ownerInstanceId: string; fencingToken: number }): void {
  assertAuthority(state, authority.ownerInstanceId, authority.fencingToken);
  if (state.state !== 'COMMITTING') throw new Error(`DWE_COMMIT_STATE_FORBIDDEN:${state.state}`);
  if (state.gateResults.some((gate) => gate.status !== 'passed')) throw new Error('DWE_REQUIRED_GATE_NOT_PASSED');
  const committed: StagedMutation[] = [];
  try {
    for (const mutation of staged) {
      assertAuthority(state, authority.ownerInstanceId, authority.fencingToken);
      const relativeTarget = path.relative(state.expectedRoot, mutation.target);
      if (!inside(state.expectedRoot, relativeTarget)) throw new Error(`DWE_MUTATION_PARENT_CHANGED:${mutation.target}`);
      const current = fs.existsSync(mutation.target) ? fs.readFileSync(mutation.target) : null;
      const actual = current ? hash(current) : null;
      if (actual !== mutation.baselineHash) throw new Error(`DWE_MUTATION_CAS_MISMATCH:${mutation.target}`);
      fs.mkdirSync(path.dirname(mutation.target), { recursive: true });
      if (!inside(state.expectedRoot, relativeTarget)) throw new Error(`DWE_MUTATION_PARENT_CHANGED:${mutation.target}`);
      if (current && mutation.backup) fs.writeFileSync(mutation.backup, current, { flag: 'wx', mode: 0o600 });
      fs.renameSync(mutation.staged, mutation.target);
      committed.push(mutation);
    }
  } catch (error) {
    for (const mutation of committed.reverse()) {
      try {
        if (mutation.backup && fs.existsSync(mutation.backup)) fs.renameSync(mutation.backup, mutation.target);
        else fs.unlinkSync(mutation.target);
      } catch { /* preserve original error; quarantine remains inspectable */ }
    }
    throw error;
  }
}
