// Auto-Capture Learnings — Atomic Queue Operations
// Reuse patterns: src/updater/lock.ts (flag 'wx'), src/config/index.ts (atomic write)

import { promises as nodeFs } from 'node:fs';
import path from 'path';
import { createHash, randomUUID } from 'node:crypto';
import type { Queue, QueueEntry, Signal, HookSource, Platform, EntryStatus } from './types.ts';
import {
  QUEUE_RELATIVE_PATH,
  LOCK_RELATIVE_PATH,
  LOCK_STALE_TIMEOUT_MS,
  MAX_SIGNAL_LENGTH,
  MAX_CONTEXT_LENGTH,
} from './types.ts';

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

export function generateFingerprint(signal: string): string {
  const normalized = signal.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function queuePath(projectPath: string): string {
  return path.join(projectPath, QUEUE_RELATIVE_PATH);
}

function lockPath(projectPath: string): string {
  return path.join(projectPath, LOCK_RELATIVE_PATH);
}

function emptyQueue(): Queue {
  return { version: 1, entries: [] };
}

export async function writeQueueAtomic(projectPath: string, queue: Queue): Promise<void> {
  const filePath = queuePath(projectPath);
  await nodeFs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = filePath + '.tmp';
  await nodeFs.writeFile(tmpPath, JSON.stringify(queue, null, 2));
  await nodeFs.rename(tmpPath, filePath);
}

// ---------------------------------------------------------------------------
// Lock (reuse pattern from src/updater/lock.ts)
// ---------------------------------------------------------------------------

export async function acquireLock(projectPath: string): Promise<void> {
  const lp = lockPath(projectPath);
  await nodeFs.mkdir(path.dirname(lp), { recursive: true });

  try {
    await nodeFs.writeFile(lp, process.pid.toString(), { flag: 'wx' });
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') {
      throw error;
    }
  }

  // Lock exists — check if stale
  try {
    const stat = await nodeFs.stat(lp);
    if (Date.now() - stat.mtimeMs > LOCK_STALE_TIMEOUT_MS) {
      await nodeFs.unlink(lp);
      await nodeFs.writeFile(lp, process.pid.toString(), { flag: 'wx' });
      return;
    }
  } catch {
    // stat failed — try creating again
    try {
      await nodeFs.writeFile(lp, process.pid.toString(), { flag: 'wx' });
      return;
    } catch {
      // ignore
    }
  }

  throw new Error('Failed to acquire queue lock');
}

export async function releaseLock(projectPath: string): Promise<void> {
  try {
    await nodeFs.unlink(lockPath(projectPath));
  } catch {
    // Ignore errors on release
  }
}

// ---------------------------------------------------------------------------
// Queue Read
// ---------------------------------------------------------------------------

export async function readQueue(projectPath: string): Promise<Queue> {
  const filePath = queuePath(projectPath);

  let raw: string;
  try {
    raw = await nodeFs.readFile(filePath, 'utf-8');
  } catch {
    return emptyQueue();
  }

  try {
    const data = JSON.parse(raw);
    if (data && typeof data.version === 'number' && Array.isArray(data.entries)) {
      return data as Queue;
    }
    return emptyQueue();
  } catch {
    // Corrupted JSON — backup and return empty
    try {
      await nodeFs.rename(filePath, filePath + '.bak');
    } catch {
      // ignore backup failure
    }
    return emptyQueue();
  }
}

// ---------------------------------------------------------------------------
// Queue Append (with fingerprint dedup)
// ---------------------------------------------------------------------------

export async function appendEntries(
  projectPath: string,
  signals: Signal[],
  source: HookSource,
  platform: Platform,
  sessionId: string
): Promise<void> {
  if (signals.length === 0) return;

  await acquireLock(projectPath);
  try {
    const queue = await readQueue(projectPath);
    appendEntriesInPlace(queue, signals, source, platform, sessionId);
    await writeQueueAtomic(projectPath, queue);
  } finally {
    await releaseLock(projectPath);
  }
}

// ---------------------------------------------------------------------------
// Queue Append In-Place (no lock/read/write — caller manages lifecycle)
// ---------------------------------------------------------------------------

export function appendEntriesInPlace(
  queue: Queue,
  signals: Signal[],
  source: HookSource,
  platform: Platform,
  sessionId: string
): void {
  const now = new Date().toISOString();

  for (const sig of signals) {
    const fp = generateFingerprint(sig.signal);
    const existing = queue.entries.find(
      (e) => e.fingerprint === fp && e.status === 'pending'
    );

    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      existing.confidence = clampConfidence(
        Math.max(existing.confidence, sig.confidence)
      );
    } else {
      const entry: QueueEntry = {
        id: randomUUID(),
        timestamp: now,
        sessionId,
        trigger: sig.trigger,
        signal: truncate(sig.signal, MAX_SIGNAL_LENGTH),
        context: truncate(sig.context, MAX_CONTEXT_LENGTH),
        confidence: clampConfidence(sig.confidence),
        source,
        platform,
        status: 'pending',
        consumedBy: null,
        consumedAt: null,
        fingerprint: fp,
        count: 1,
        lastSeen: now,
      };
      queue.entries.push(entry);
    }
  }
}

// ---------------------------------------------------------------------------
// Queue Update
// ---------------------------------------------------------------------------

export async function updateEntries(
  projectPath: string,
  updates: Map<string, Partial<QueueEntry>>
): Promise<void> {
  if (updates.size === 0) return;

  await acquireLock(projectPath);
  try {
    const queue = await readQueue(projectPath);

    for (const entry of queue.entries) {
      const patch = updates.get(entry.id);
      if (patch) {
        Object.assign(entry, patch);
        if (patch.confidence !== undefined) {
          entry.confidence = clampConfidence(entry.confidence);
        }
      }
    }

    await writeQueueAtomic(projectPath, queue);
  } finally {
    await releaseLock(projectPath);
  }
}

// ---------------------------------------------------------------------------
// Queue Remove by Status
// ---------------------------------------------------------------------------

export async function removeByStatus(
  projectPath: string,
  statuses: EntryStatus[]
): Promise<number> {
  await acquireLock(projectPath);
  try {
    const queue = await readQueue(projectPath);
    const before = queue.entries.length;
    queue.entries = queue.entries.filter((e) => !statuses.includes(e.status));
    const removed = before - queue.entries.length;

    if (removed > 0) {
      await writeQueueAtomic(projectPath, queue);
    }

    return removed;
  } finally {
    await releaseLock(projectPath);
  }
}
