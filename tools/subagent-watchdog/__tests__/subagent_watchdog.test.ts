import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeTranscript, buildHookOutput, runHook } from '../subagent_watchdog.ts';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'subagent-watchdog-'));
}

function writeJsonl(file: string, rows: unknown[]): void {
  fs.writeFileSync(file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
}

function touchOld(file: string, ms: number): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  const date = new Date(ms);
  fs.utimesSync(file, date, date);
}

describe('subagent watchdog', () => {
  it('flags an Agent launch whose output file went stale without completion', () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const output = path.join(dir, 'a1.output');
    touchOld(output, now - 61 * 60_000);
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'assistant',
        timestamp: '2026-07-11T08:59:00.000Z',
        message: { content: [{ type: 'tool_use', id: 'toolu_agent', name: 'Agent', input: { description: 'Audit visual artifacts gate', subagent_type: 'general-purpose', model: 'gpt-5.6-terra-high' } }] },
      },
      {
        type: 'user',
        timestamp: '2026-07-11T08:59:10.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_agent', content: `Async agent launched successfully. agentId: a1 output_file: ${output}` }] },
      },
    ]);

    const result = analyzeTranscript(transcript, { nowMs: now, staleMs: 30 * 60_000 });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      kind: 'stale-running',
      taskId: 'a1',
      taskKind: 'agent',
      title: 'Audit visual artifacts gate',
    });
  });

  it('does not flag a completed agent', () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const output = path.join(dir, 'a2.output');
    touchOld(output, now - 120 * 60_000);
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'assistant',
        timestamp: '2026-07-11T08:00:00.000Z',
        message: { content: [{ type: 'tool_use', id: 'toolu_agent', name: 'Agent', input: { description: 'Trace route' } }] },
      },
      {
        type: 'user',
        timestamp: '2026-07-11T08:00:05.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_agent', content: `Async agent launched successfully. agentId: a2 output_file: ${output}` }] },
      },
      {
        type: 'queue-operation',
        timestamp: '2026-07-11T08:10:00.000Z',
        content: `<task-notification><task-id>a2</task-id><tool-use-id>toolu_agent</tool-use-id><output-file>${output}</output-file><status>completed</status><summary>Agent "Trace route" finished</summary></task-notification>`,
      },
    ]);

    const result = analyzeTranscript(transcript, { nowMs: now, staleMs: 30 * 60_000 });

    expect(result.issues).toHaveLength(0);
  });

  it('flags Claude stopped/no-completion notifications as lost completion', () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const output = path.join(dir, 'a3.output');
    touchOld(output, now - 10 * 60_000);
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'queue-operation',
        timestamp: '2026-07-11T09:50:00.000Z',
        content: `<task-notification><task-id>a3</task-id><output-file>${output}</output-file><status>stopped</status><summary>No completion record was found for background agent "Fix reel visual E2E" from the previous session.</summary></task-notification>`,
      },
    ]);

    const result = analyzeTranscript(transcript, { nowMs: now, staleMs: 30 * 60_000 });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      kind: 'lost-completion',
      taskId: 'a3',
      title: 'Fix reel visual E2E',
    });
  });

  it('flags failed Agent API stream errors as unresolved work', () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const output = path.join(dir, 'a7.output');
    touchOld(output, now - 7 * 60_000);
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'queue-operation',
        timestamp: '2026-07-11T09:53:00.000Z',
        content: `<task-notification><task-id>a7</task-id><output-file>${output}</output-file><status>failed</status><summary>Agent "Inspect visual gate" failed: Agent terminated early due to an API error: API Error: Stream ended without receiving any events</summary></task-notification>`,
      },
    ]);

    const result = analyzeTranscript(transcript, { nowMs: now, staleMs: 30 * 60_000 });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      kind: 'failed-api-error',
      taskId: 'a7',
      title: 'Inspect visual gate',
      status: 'failed',
    });
  });

  it('does not flag ordinary non-API failed task notifications', () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'queue-operation',
        timestamp: '2026-07-11T09:53:00.000Z',
        content: '<task-notification><task-id>b8</task-id><status>failed</status><summary>Background command "Run unit tests" failed with exit code 1</summary></task-notification>',
      },
    ]);

    const result = analyzeTranscript(transcript, { nowMs: now, staleMs: 30 * 60_000 });

    expect(result.issues).toHaveLength(0);
  });

  it('blocks Stop hooks when unresolved subagent work exists', () => {
    const output = buildHookOutput('Stop', {
      transcriptPath: 'session.jsonl',
      observedTasks: 1,
      issues: [{
        kind: 'stale-running',
        taskId: 'a4',
        taskKind: 'agent',
        ageMinutes: 45,
        evidence: 'test evidence',
      }],
    });

    expect(output).toMatchObject({ decision: 'block' });
    expect(String(output.reason)).toContain('a4');
  });

  it('injects additional context on UserPromptSubmit for stale work', async () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const output = path.join(dir, 'a5.output');
    touchOld(output, now - 61 * 60_000);
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'user',
        timestamp: '2026-07-11T08:59:10.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_agent', content: `Async agent launched successfully. agentId: a5 output_file: ${output}` }] },
      },
    ]);

    const originalNow = Date.now;
    Date.now = () => now;
    try {
      const hook = await runHook(JSON.stringify({ transcript_path: transcript, cwd: dir }), ['node', 'subagent_watchdog.ts', '--event', 'UserPromptSubmit']);
      expect(hook).toMatchObject({ continue: true });
      expect(String(hook.additionalContext)).toContain('a5');
      expect(fs.existsSync(path.join(dir, '.dev-pomogator', '.subagent-watchdog.jsonl'))).toBe(true);
    } finally {
      Date.now = originalNow;
    }
  });

  /**
   * The old version of this test called `process.chdir(dir)`, which forced
   * `process.cwd() === input.cwd`. That is precisely the invariant that does NOT hold in
   * production: on Windows a UNC project collapses the child's cwd to C:\Windows, so the
   * ack was written there while the Stop hook kept reading the project. The test was green
   * because it manufactured the one condition under which the bug cannot happen.
   *
   * So: never chdir. The ack is written with an explicit --cwd that DIFFERS from
   * process.cwd(), exactly as the hook now prints it.
   */
  it('suppresses an issue after an ack written from a different working directory', async () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const output = path.join(dir, 'a6.output');
    touchOld(output, now - 61 * 60_000);
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'assistant',
        timestamp: '2026-07-11T08:59:00.000Z',
        message: { content: [{ type: 'tool_use', id: 'toolu_agent', name: 'Agent', input: { description: 'stuck agent' } }] },
      },
      {
        type: 'user',
        timestamp: '2026-07-11T08:59:10.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_agent', content: `Async agent launched successfully. agentId: a6 output_file: ${output}` }] },
      },
    ]);

    const originalNow = Date.now;
    Date.now = () => now;
    try {
      expect(process.cwd()).not.toBe(dir); // the whole point: writer cwd != project

      const before = await runHook(JSON.stringify({ transcript_path: transcript, cwd: dir }), ['node', 'subagent_watchdog.ts', '--event', 'Stop']);
      expect(before).toMatchObject({ decision: 'block' });

      await runHook('', ['node', 'subagent_watchdog.ts', '--ack', 'a6', '--cwd', dir, '--reason', 'recovered by hand']);

      // The ack must land in the PROJECT, not in whatever cwd the writer happened to have.
      const ackFile = path.join(dir, '.dev-pomogator', '.subagent-watchdog-ack.jsonl');
      expect(fs.existsSync(ackFile)).toBe(true);
      expect(fs.readFileSync(ackFile, 'utf-8')).toContain('a6');

      const after = await runHook(JSON.stringify({ transcript_path: transcript, cwd: dir }), ['node', 'subagent_watchdog.ts', '--event', 'Stop']);
      expect(after).toMatchObject({ decision: 'approve' });
    } finally {
      Date.now = originalNow;
    }
  });

  it('treats a TaskStop-ed agent (status=killed) as resolved', () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const output = path.join(dir, 'a7.output');
    touchOld(output, now - 120 * 60_000);
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'assistant',
        timestamp: '2026-07-11T08:00:00.000Z',
        message: { content: [{ type: 'tool_use', id: 'toolu_k', name: 'Agent', input: { description: 'killed agent' } }] },
      },
      {
        type: 'user',
        timestamp: '2026-07-11T08:00:10.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_k', content: `Async agent launched successfully. agentId: a7 output_file: ${output}` }] },
      },
      {
        type: 'user',
        timestamp: '2026-07-11T08:30:00.000Z',
        message: { content: [{ type: 'tool_result', content: '<task-notification><task-id>a7</task-id><status>killed</status><summary>stopped by the agent</summary></task-notification>' }] },
      },
    ]);

    const result = analyzeTranscript(transcript, { nowMs: now, staleMs: 30 * 60_000 });

    // The watchdog tells the agent to use TaskStop. Doing so must actually clear the gate —
    // 'killed' was absent from TaskStatus/isFinal, so a stopped task stayed 'stale-running' forever.
    expect(result.issues).toHaveLength(0);
  });

  it('does not wedge on a status word it has never seen, and surfaces it', () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'assistant',
        timestamp: '2026-07-11T08:00:00.000Z',
        message: { content: [{ type: 'tool_use', id: 'toolu_u', name: 'Agent', input: { description: 'future status' } }] },
      },
      {
        type: 'user',
        timestamp: '2026-07-11T08:00:10.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_u', content: 'Async agent launched successfully. agentId: a8' }] },
      },
      {
        type: 'user',
        timestamp: '2026-07-11T08:30:00.000Z',
        message: { content: [{ type: 'tool_result', content: '<task-notification><task-id>a8</task-id><status>evaporated</status></task-notification>' }] },
      },
    ]);

    const result = analyzeTranscript(transcript, { nowMs: now, staleMs: 30 * 60_000 });

    expect(result.issues).toHaveLength(0);
    expect(result.unknownStatuses).toEqual(['evaporated']);
  });

  it('does not invent a task from a launch banner merely quoted in file content', () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'assistant',
        timestamp: '2026-07-11T08:00:00.000Z',
        message: { content: [{ type: 'tool_use', id: 'toolu_read', name: 'Read', input: { file_path: 'subagent_watchdog.test.ts' } }] },
      },
      {
        // The agent READ a file that quotes the banner. No agent was launched.
        type: 'user',
        timestamp: '2026-07-11T08:00:10.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_read', content: 'Async agent launched successfully. agentId: a9 output_file: C:\\tmp\\a9.output' }] },
      },
    ]);

    const result = analyzeTranscript(transcript, { nowMs: now, staleMs: 30 * 60_000 });

    expect(result.observedTasks).toBe(0);
    expect(result.issues).toHaveLength(0);
  });

  it('stops blocking after repeated identical blocks instead of wedging the session', async () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const output = path.join(dir, 'a10.output');
    touchOld(output, now - 61 * 60_000);
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'assistant',
        timestamp: '2026-07-11T08:59:00.000Z',
        message: { content: [{ type: 'tool_use', id: 'toolu_l', name: 'Agent', input: { description: 'unresolvable' } }] },
      },
      {
        type: 'user',
        timestamp: '2026-07-11T08:59:10.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_l', content: `Async agent launched successfully. agentId: a10 output_file: ${output}` }] },
      },
    ]);

    const originalNow = Date.now;
    Date.now = () => now;
    const payload = JSON.stringify({ transcript_path: transcript, cwd: dir });
    const argv = ['node', 'subagent_watchdog.ts', '--event', 'Stop'];
    try {
      process.env.SUBAGENT_WATCHDOG_MAX_BLOCKS = '3';
      expect(await runHook(payload, argv)).toMatchObject({ decision: 'block' });
      expect(await runHook(payload, argv)).toMatchObject({ decision: 'block' });
      expect(await runHook(payload, argv)).toMatchObject({ decision: 'block' });

      // Four identical blocks is not persuasion, it is a wedged session.
      const fourth = await runHook(payload, argv);
      expect(fourth.decision).toBeUndefined();
      expect(fourth).toMatchObject({ continue: true });
      expect(String(fourth.additionalContext)).toContain('a10');
    } finally {
      delete process.env.SUBAGENT_WATCHDOG_MAX_BLOCKS;
      Date.now = originalNow;
    }
  });

  it('survives a UTF-8 BOM on stdin instead of silently approving', async () => {
    const dir = tempDir();
    const now = Date.parse('2026-07-11T10:00:00.000Z');
    const output = path.join(dir, 'a11.output');
    touchOld(output, now - 61 * 60_000);
    const transcript = path.join(dir, 'session.jsonl');
    writeJsonl(transcript, [
      {
        type: 'assistant',
        timestamp: '2026-07-11T08:59:00.000Z',
        message: { content: [{ type: 'tool_use', id: 'toolu_b', name: 'Agent', input: { description: 'bom' } }] },
      },
      {
        type: 'user',
        timestamp: '2026-07-11T08:59:10.000Z',
        message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_b', content: `Async agent launched successfully. agentId: a11 output_file: ${output}` }] },
      },
    ]);

    const originalNow = Date.now;
    Date.now = () => now;
    try {
      const withBom = '﻿' + JSON.stringify({ transcript_path: transcript, cwd: dir });
      const result = await runHook(withBom, ['node', 'subagent_watchdog.ts', '--event', 'Stop']);
      expect(result).toMatchObject({ decision: 'block' });
    } finally {
      Date.now = originalNow;
    }
  });
});
