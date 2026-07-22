export type HandshakeState = 'ok' | 'failed' | 'skipped';

export function classifyHandshake(result: { ok?: boolean; skipped?: boolean } | null | undefined): HandshakeState {
  if (!result || result.skipped) return 'skipped';
  return result.ok === true ? 'ok' : 'failed';
}
