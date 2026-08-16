/**
 * mindlas-stats.mjs — bridge: читает детерминированные метрики MINDLAS в нашего адвизора.
 *
 * MINDLAS (Evolutionairy-AI/MINDLAS) — детерминистический reliability-инструмент 4 гейджа:
 *   context_rot, verification_debt, change_blast_radius, tool_failure_loop,
 * вычисляемые БЕЗ модели из event-ledger сессии.
 *
 * Наш inner-advisor — модельный (две головы: luna→выжимка, sol→совет). Статы MINDLAS дают
 * адвизору детерминированную «термометрию»: где ROT/VERIFY/BLAST/LOOP — чтобы смысловая
 * интерпретация базировалась на измеримых сигналах, а не только на восприятии.
 *
 * Fail-open: нет `mindlas` на PATH / ошибка / таймаут → `null` (пакет строится без секции),
 * адвизор не ломается. Источник: `mindlas scorecard --json` (структурированный), опционально
 * `status --plain` для однострочника.
 */
import { spawn } from 'node:child_process';

export const GATE = (process.env.ADVISOR_MINDLAS ?? '1') === '1'; // default: включено (если mindlas есть)
export const STATS_TIMEOUT_MS = 12000;

/** Read binary path at call time (env can be set after import). */
export function mindlasBin() {
  return process.env.MINDLAS_BIN || (process.platform === 'win32' ? 'mindlas.exe' : 'mindlas');
}

/** Run a mindlas subcommand capturing stdout; resolves null on any failure (fail-open). */
export function runMindlas(args, { timeoutMs = STATS_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const bin = mindlasBin();
    const useShell = !pathAbs(bin);
    const cmd = useShell ? spawn(bin, args, { shell: true, windowsHide: true, encoding: 'utf-8' })
      : spawn(bin, args, { windowsHide: true, encoding: 'utf-8' });
    let out = '';
    let errOk = true;
    const timer = setTimeout(() => { try { cmd.kill(); } catch { /* ok */ } resolve(null); }, timeoutMs);
    cmd.stdout?.on('data', (d) => { out += d; });
    cmd.stderr?.on('data', () => { /* ignore */ });
    cmd.on('error', () => { clearTimeout(timer); resolve(null); });
    cmd.on('close', (code) => { clearTimeout(timer); resolve((code === 0 || code === null) && out ? out : null); });
    void errOk;
  });
}

function pathAbs(bin) {
  return /^[A-Za-z]:[\\/]/.test(bin) || bin.startsWith('/');
}

/** Parse `mindlas scorecard --json` output into a compact {features, corrections} summary. */
export function parseScorecard(jsonText) {
  try {
    const j = JSON.parse(jsonText);
    const features = j?.features ?? {};
    const out = {
      context_rot: { max: features.context_rot?.max, final: features.context_rot?.final, alerts: features.context_rot?.alerts },
      verification_debt: {
        max: features.verification_debt?.max, final: features.verification_debt?.final,
        alerts: features.verification_debt?.alerts, lastResult: features.verification_debt?.last_result,
      },
      change_blast_radius: {
        max: features.change_blast_radius?.max, final: features.change_blast_radius?.final,
        finalStatus: features.change_blast_radius?.final_status, alerts: features.change_blast_radius?.alerts,
      },
      tool_failure_loop: {
        max: features.tool_failure_loop?.max, final: features.tool_failure_loop?.final,
        finalStatus: features.tool_failure_loop?.final_status, alerts: features.tool_failure_loop?.alerts,
        activeStop: features.tool_failure_loop?.active_stop,
      },
      corrections: (j?.corrections ?? []).map((c) => c?.type).filter(Boolean),
    };
    return out;
  } catch {
    return null;
  }
}

/** Render compact text for the advisor's packet. Returns '' when no data. */
export function renderMindlasStats(stats) {
  if (!stats) return '';
  const rows = [];
  const r = stats.context_rot;
  if (typeof r?.final === 'number') rows.push(`context_rot: ${r.final}/${r.max}${r.alerts ? ` (${r.alerts} alert(s))` : ''}`);
  const v = stats.verification_debt;
  if (typeof v?.final === 'number') rows.push(`verification_debt: ${v.final}/${v.max}${v.lastResult ? ` last=${v.lastResult}` : ''}`);
  const b = stats.change_blast_radius;
  if (typeof b?.final === 'number') rows.push(`change_blast_radius: ${b.final}/${b.max} status=${b.finalStatus ?? '?'}`);
  const l = stats.tool_failure_loop;
  if (typeof l?.final === 'number') rows.push(`tool_failure_loop: ${l.final}/${l.max} status=${l.finalStatus ?? '?'}${l.activeStop ? ' (stop active)' : ''}`);
  if (stats.corrections?.length) rows.push(`corrections_applied: ${stats.corrections.join(', ')}`);
  if (!rows.length) return '';
  return `## MINDLAS METRICS (deterministic, read via mindlas scorecard --json)\n${rows.join('\n')}`;
}

/** One-shot: get MINDLAS stats for the advisor's packet; null on disable/failure.
 *  `demoFixture` (test/offline): if set and `--latest` yields no JSON, read that demo fixture. */
export async function getMindlasStats(demoFixture) {
  if (!GATE) return null;
  let jsonOut = await runMindlas(['scorecard', '--latest', '--json']);
  if (!parseScorecard(jsonOut ?? '') && demoFixture) {
    jsonOut = await runMindlas(['scorecard', '--demo', demoFixture, '--json']);
  }
  if (!jsonOut) return null;
  const parsed = parseScorecard(jsonOut);
  if (!parsed) return null;
  const plain = await runMindlas(['status', '--latest', '--plain']);
  return { parsed, plain: plain ? plain.trim() : null, source: 'mindlas' };
}