/**
 * Unit tests for the FR-49e gray-zone judge (tools/claim-evidence-gate/meridian-judge.ts).
 * Deterministic — injects `fetchImpl`, never touches a real Meridian. Pins the two contracts:
 * correct parse of the {block,reason} verdict, and FAIL-OPEN (null) on every failure mode so a
 * plugin Stop hook never hangs/crashes when the proxy is absent.
 */
import { describe, it, expect } from 'vitest';
import { judgeStop, buildJudgePrompt } from '../meridian-judge.ts';

const input = { finalMessage: 'Готово, дальше посмотрю.', tools: ['Bash'], openTasks: 20 };
const resp = (ok: boolean, body: unknown) => ({ ok, json: async () => body }) as unknown as Response;
const textResp = (text: string) => resp(true, { content: [{ type: 'text', text }] });

describe('judgeStop (FR-49e) — Meridian gray-zone judge', () => {
  it('parses a BLOCK verdict from the Meridian response', async () => {
    const v = await judgeStop(input, { fetchImpl: async () => textResp('{"block": true, "reason": "premature; 20 open"}') });
    expect(v).toEqual({ block: true, reason: 'premature; 20 open' });
  });

  it('parses an APPROVE verdict', async () => {
    const v = await judgeStop(input, { fetchImpl: async () => textResp('{"block": false, "reason": "genuinely blocked"}') });
    expect(v).toEqual({ block: false, reason: 'genuinely blocked' });
  });

  it('FAIL-OPEN: non-200 → null', async () => {
    expect(await judgeStop(input, { fetchImpl: async () => resp(false, {}) })).toBeNull();
  });

  it('FAIL-OPEN: fetch throws (proxy down / ECONNREFUSED) → null', async () => {
    expect(await judgeStop(input, { fetchImpl: async () => { throw new Error('ECONNREFUSED'); } })).toBeNull();
  });

  it('FAIL-OPEN: response carries no JSON verdict line → null', async () => {
    expect(await judgeStop(input, { fetchImpl: async () => textResp('I think it should keep going.') })).toBeNull();
  });

  it('FAIL-OPEN: block field not boolean → null (no malformed verdict trusted)', async () => {
    expect(await judgeStop(input, { fetchImpl: async () => textResp('{"block":"yes"}') })).toBeNull();
  });

  it('buildJudgePrompt feeds the census fact + asks for one JSON line', () => {
    const p = buildJudgePrompt(input);
    expect(p).toMatch(/20 open/); // the spec-generator census fact reaches the judge
    expect(p).toMatch(/ONLY one JSON line/);
    expect(p).toMatch(/genuine block, NOT a defer/i); // the blocking-question carve-out
  });
});
