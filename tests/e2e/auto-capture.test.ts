import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { runTsx, appPath } from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CAPTURE_TOOL_PATH = 'extensions/suggest-rules/tools/learnings-capture';
const QUEUE_PATH = '.dev-pomogator/learnings-queue.json';
const LOCK_PATH = '.dev-pomogator/learnings-queue.lock';
const FIXTURES_DIR = 'tests/fixtures/learnings-capture';

interface CaptureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCaptureHook(input: Record<string, unknown>, event: string): CaptureResult {
  const result = runTsx(path.join(CAPTURE_TOOL_PATH, 'capture.ts'), {
    input,
    args: ['--event', event],
    timeout: 30000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function setupQueue(fixtureName?: string): Promise<void> {
  const queueDir = path.dirname(appPath(QUEUE_PATH));
  await fs.ensureDir(queueDir);
  if (fixtureName) {
    await fs.copy(
      appPath(FIXTURES_DIR, fixtureName),
      appPath(QUEUE_PATH)
    );
  } else {
    await fs.writeJson(appPath(QUEUE_PATH), { version: 1, entries: [] });
  }
}

async function cleanupQueue(): Promise<void> {
  const files = [
    QUEUE_PATH,
    LOCK_PATH,
    QUEUE_PATH + '.tmp',
    QUEUE_PATH + '.bak',
  ];
  for (const f of files) {
    await fs.remove(appPath(f));
  }
}

interface QueueData {
  version: number;
  entries: Array<Record<string, unknown>>;
}

async function readQueue(): Promise<QueueData> {
  return fs.readJson(appPath(QUEUE_PATH));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PLUGIN009: Auto-Capture Learnings', () => {
  beforeEach(async () => {
    await cleanupQueue();
  });

  afterEach(async () => {
    await cleanupQueue();
  });

  // ---------- @feature1: Capture T2 ----------

  describe('Capture T2', () => {
    // @feature1
    it('should capture T2 correction from UserPromptSubmit', async () => {
      await setupQueue();
      const result = runCaptureHook(
        { conversation_id: 'test-1', workspace_roots: ['.'], prompt: 'no, use bun instead of npm' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      expect(queue.entries.length).toBe(1);
      expect(queue.entries[0].trigger).toBe('T2');
      expect(queue.entries[0].confidence).toBeGreaterThanOrEqual(0.8);
      expect(queue.entries[0].signal).toContain('bun');
    });

    // @feature1
    it('should not capture when prompt has no correction patterns', async () => {
      await setupQueue();
      const result = runCaptureHook(
        { conversation_id: 'test-2', workspace_roots: ['.'], prompt: 'please refactor this function' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      expect(queue.entries.length).toBe(0);
    });
  });

  // ---------- @feature1a: Regex Detection ----------

  describe('Regex Detection', () => {
    // @feature1a
    it('should detect T2 pattern in English', async () => {
      await setupQueue();
      const result = runCaptureHook(
        { conversation_id: 'test-3', workspace_roots: ['.'], prompt: 'actually, I meant to use vitest not jest' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      expect(queue.entries.length).toBe(1);
      expect(queue.entries[0].trigger).toBe('T2');
    });

    // @feature1a
    it('should detect T2 pattern in Russian', async () => {
      await setupQueue();
      const result = runCaptureHook(
        { conversation_id: 'test-4', workspace_roots: ['.'], prompt: 'нет, делай через bun а не npm' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      expect(queue.entries.length).toBe(1);
      expect(queue.entries[0].trigger).toBe('T2');
    });

    // @feature1a
    it('should detect T6 workaround pattern', async () => {
      await setupQueue();
      const result = runCaptureHook(
        { conversation_id: 'test-5', workspace_roots: ['.'], prompt: "let's use this workaround for now" },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      expect(queue.entries.length).toBe(1);
      expect(queue.entries[0].trigger).toBe('T6');
    });

    // @feature1a
    it('should detect explicit remember marker', async () => {
      await setupQueue();
      const result = runCaptureHook(
        { conversation_id: 'test-6', workspace_roots: ['.'], prompt: 'remember: always use --frozen-lockfile with bun install' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      expect(queue.entries.length).toBe(1);
      expect(queue.entries[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    // @feature1a
    it('should increment count for same signal fingerprint', async () => {
      await setupQueue('queue-with-fingerprint.json');

      // Prompt generates signal "use bun not npm" (matching fixture fingerprint)
      const result = runCaptureHook(
        { conversation_id: 'test-7', workspace_roots: ['.'], prompt: 'no, use bun not npm' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      // Should not add a new entry, but increment count on existing
      const bunEntries = queue.entries.filter((e: Record<string, unknown>) =>
        typeof e.signal === 'string' && e.signal.includes('bun')
      );
      expect(bunEntries.length).toBe(1);
      expect(bunEntries[0].count).toBeGreaterThanOrEqual(2);
    });

    // @feature1a
    it('should create different fingerprints for different signals', async () => {
      await setupQueue('queue-with-fingerprint.json');

      const result = runCaptureHook(
        { conversation_id: 'test-8', workspace_roots: ['.'], prompt: 'no, use vitest not jest' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      expect(queue.entries.length).toBe(2);
      const fingerprints = queue.entries.map((e: Record<string, unknown>) => e.fingerprint);
      expect(fingerprints[0]).not.toBe(fingerprints[1]);
    });
  });

  // ---------- @feature2: Queue Schema ----------

  describe('Queue Schema', () => {
    // @feature2
    it('should validate queue schema with required fields', async () => {
      await setupQueue('populated-queue.json');
      const queue = await readQueue();

      expect(queue.version).toBe(1);
      for (const entry of queue.entries) {
        expect(entry).toHaveProperty('id');
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('sessionId');
        expect(entry).toHaveProperty('trigger');
        expect(entry).toHaveProperty('signal');
        expect(entry).toHaveProperty('context');
        expect(entry).toHaveProperty('confidence');
        expect(entry).toHaveProperty('source');
        expect(entry).toHaveProperty('platform');
        expect(entry).toHaveProperty('status');
        // Invariants
        expect(String(entry.signal).length).toBeLessThanOrEqual(100);
        expect(String(entry.context).length).toBeLessThanOrEqual(200);
      }
    });
  });

  // ---------- @feature3: Atomic Queue Operations ----------

  describe('Atomic Queue Operations', () => {
    // @feature3
    it('should atomically write entry with lock', async () => {
      await setupQueue();
      const result = runCaptureHook(
        { conversation_id: 'test-atomic', workspace_roots: ['.'], prompt: 'no, use bun instead of npm' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      // Lock should be released after write
      expect(await fs.pathExists(appPath(LOCK_PATH))).toBe(false);

      const queue = await readQueue();
      expect(queue.entries.length).toBe(1);
    });

    // @feature3
    it('should recover from corrupted queue file', async () => {
      await setupQueue('corrupted-queue.json');
      const result = runCaptureHook(
        { conversation_id: 'test-corrupt', workspace_roots: ['.'], prompt: 'no, use bun instead of npm' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      // Corrupted file should be backed up
      expect(await fs.pathExists(appPath(QUEUE_PATH + '.bak'))).toBe(true);

      // New queue should be valid
      const queue = await readQueue();
      expect(queue.entries.length).toBe(1);
    });
  });

  // ---------- @feature5: Auto-Suggest Threshold ----------

  describe('Auto-Suggest Threshold', () => {
    // @feature5
    it('should show notification when threshold reached', async () => {
      // Create queue with 4 pending entries
      const queue = {
        version: 1,
        entries: Array.from({ length: 4 }, (_, i) => ({
          id: `threshold-${i}`,
          timestamp: new Date().toISOString(),
          sessionId: `session-t-${i}`,
          trigger: 'T2',
          signal: `signal ${i}`,
          context: `context ${i}`,
          confidence: 0.8,
          source: 'UserPromptSubmit',
          platform: 'claude',
          status: 'pending',
          consumedBy: null,
          consumedAt: null,
          fingerprint: `fp${i}`.padEnd(16, '0'),
          count: 1,
          lastSeen: new Date().toISOString(),
        })),
      };
      await fs.ensureDir(path.dirname(appPath(QUEUE_PATH)));
      await fs.writeJson(appPath(QUEUE_PATH), queue);

      const result = runCaptureHook(
        { conversation_id: 'test-threshold', workspace_roots: ['.'], prompt: 'no, use vitest not jest' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const updatedQueue = await readQueue();
      const pending = updatedQueue.entries.filter((e: Record<string, unknown>) => e.status === 'pending');
      expect(pending.length).toBeGreaterThanOrEqual(5);

      expect(result.stderr).toContain('pending learnings');
    });

    // @feature5
    it('should not show notification when below threshold', async () => {
      // Create queue with 2 pending entries
      const queue = {
        version: 1,
        entries: Array.from({ length: 2 }, (_, i) => ({
          id: `below-${i}`,
          timestamp: new Date().toISOString(),
          sessionId: `session-b-${i}`,
          trigger: 'T2',
          signal: `signal below ${i}`,
          context: `context ${i}`,
          confidence: 0.8,
          source: 'UserPromptSubmit',
          platform: 'claude',
          status: 'pending',
          consumedBy: null,
          consumedAt: null,
          fingerprint: `bfp${i}`.padEnd(16, '0'),
          count: 1,
          lastSeen: new Date().toISOString(),
        })),
      };
      await fs.ensureDir(path.dirname(appPath(QUEUE_PATH)));
      await fs.writeJson(appPath(QUEUE_PATH), queue);

      const result = runCaptureHook(
        { conversation_id: 'test-below', workspace_roots: ['.'], prompt: 'no, use bun' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      expect(result.stderr).not.toContain('pending learnings');
    });
  });

  // ---------- @feature6: Approval Boost ----------

  describe('Approval Boost', () => {
    // @feature6
    it('should boost existing pending entry confidence on approval', async () => {
      // Create queue with pending entry
      const crypto = await import('crypto');
      const fingerprint = crypto.createHash('sha256').update('use vitest not jest').digest('hex').slice(0, 16);
      const queue = {
        version: 1,
        entries: [{
          id: 'approval-test-1',
          timestamp: new Date().toISOString(),
          sessionId: 'session-approval',
          trigger: 'T2',
          signal: 'use vitest not jest',
          context: 'no, use vitest instead of jest',
          confidence: 0.85,
          source: 'UserPromptSubmit',
          platform: 'claude',
          status: 'pending',
          consumedBy: null,
          consumedAt: null,
          fingerprint,
          count: 1,
          lastSeen: new Date().toISOString(),
        }],
      };
      await fs.ensureDir(path.dirname(appPath(QUEUE_PATH)));
      await fs.writeJson(appPath(QUEUE_PATH), queue);

      const result = runCaptureHook(
        { conversation_id: 'test-approval', workspace_roots: ['.'], prompt: 'perfect, exactly what I needed' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const updatedQueue = await readQueue();
      // Should not add a new entry for approval
      expect(updatedQueue.entries.length).toBe(1);
      // Confidence should be boosted
      expect(updatedQueue.entries[0].confidence).toBeGreaterThanOrEqual(0.95);
    });

    // @feature6
    it('should ignore approval without matching pending entry', async () => {
      await setupQueue();
      const result = runCaptureHook(
        { conversation_id: 'test-no-match', workspace_roots: ['.'], prompt: 'perfect, great job' },
        'UserPromptSubmit'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      expect(queue.entries.length).toBe(0);
    });
  });

  // ---------- @feature1b: Semantic Detection (stubs) ----------

  describe('Semantic Detection', () => {
    // @feature1b
    it('should fallback to regex when LLM unavailable', async () => {
      await setupQueue();
      // Use Stop event with transcript containing T2 pattern
      // LLM is unavailable (no env vars) → regex fallback on transcript text
      const result = runCaptureHook(
        {
          conversation_id: 'test-semantic-fallback',
          workspace_roots: ['.'],
          transcript_path: appPath(FIXTURES_DIR, 'sample-transcript.jsonl'),
        },
        'Stop'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      // Regex should detect T2, T6, T3 from transcript
      expect(queue.entries.length).toBeGreaterThanOrEqual(1);
    });

    // @feature1b
    it('should skip Stop event without transcript_path', async () => {
      await setupQueue();
      const result = runCaptureHook(
        { conversation_id: 'test-no-transcript', workspace_roots: ['.'] },
        'Stop'
      );
      expect(result.exitCode).toBe(0);

      const queue = await readQueue();
      expect(queue.entries.length).toBe(0);
    });

    // @feature1b
    it('should have semantic.ts module', async () => {
      const semanticPath = appPath(CAPTURE_TOOL_PATH, 'semantic.ts');
      expect(await fs.pathExists(semanticPath)).toBe(true);
    });
  });

  // ---------- @feature4: Hook Registration ----------

  describe('Hook Registration', () => {
    // @feature4
    it('should have capture.ts entry point', async () => {
      const capturePath = appPath(CAPTURE_TOOL_PATH, 'capture.ts');
      expect(await fs.pathExists(capturePath)).toBe(true);
    });

    // @feature4
    it('should have queue.ts module', async () => {
      const queuePath = appPath(CAPTURE_TOOL_PATH, 'queue.ts');
      expect(await fs.pathExists(queuePath)).toBe(true);
    });

    // @feature4
    it('should have dedupe.ts module', async () => {
      const dedupePath = appPath(CAPTURE_TOOL_PATH, 'dedupe.ts');
      expect(await fs.pathExists(dedupePath)).toBe(true);
    });

    // @feature4
    it('should have hooks in extension.json', async () => {
      const extJson = await fs.readJson(appPath('extensions/suggest-rules/extension.json'));
      expect(extJson.hooks).toBeDefined();
      expect(extJson.hooks.claude).toBeDefined();
      expect(extJson.hooks.claude.UserPromptSubmit).toContain('capture.ts');
      expect(extJson.hooks.claude.Stop).toContain('capture.ts');
      expect(extJson.hooks.cursor).toBeDefined();
    });

    // @feature4
    it('should have reflect.md command for both platforms', async () => {
      const claudeReflect = appPath('extensions/suggest-rules/claude/commands/reflect.md');
      const cursorReflect = appPath('extensions/suggest-rules/cursor/commands/reflect.md');
      expect(await fs.pathExists(claudeReflect)).toBe(true);
      expect(await fs.pathExists(cursorReflect)).toBe(true);
    });
  });
});
