// Auto-Capture Learnings — Shared Types
// Source of truth: .specs/auto-capture/DESIGN.md

export const TRIGGER_TYPES = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export type HookSource = 'UserPromptSubmit' | 'Stop';

export type Platform = 'claude' | 'cursor';

export type EntryStatus = 'pending' | 'consumed' | 'rejected';

export interface QueueEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  trigger: TriggerType;
  signal: string;
  context: string;
  confidence: number;
  source: HookSource;
  platform: Platform;
  status: EntryStatus;
  consumedBy: string | null;
  consumedAt: string | null;
  fingerprint: string;
  count: number;
  lastSeen: string;
}

export interface Queue {
  version: 1;
  entries: QueueEntry[];
}

export interface Signal {
  trigger: TriggerType;
  signal: string;
  context: string;
  confidence: number;
}

export interface HookInput {
  conversation_id: string;
  workspace_roots: string[];
  prompt?: string;
  transcript_path?: string;
}

// Constants
export const MAX_SIGNAL_LENGTH = 100;
export const MAX_CONTEXT_LENGTH = 200;
export const DEFAULT_SUGGEST_THRESHOLD = 5;
export const LOCK_STALE_TIMEOUT_MS = 60_000;
export const QUEUE_RELATIVE_PATH = '.dev-pomogator/learnings-queue.json';
export const LOCK_RELATIVE_PATH = '.dev-pomogator/learnings-queue.lock';
