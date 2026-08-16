/**
 * Advisor bench-runner — оркестратор сценариев с бюджетами.
 *
 * Usage: node tools/out-session-advisor/bench/bench-runner.mjs [--only id1,id2] [--no-fix]
 *
 * Каждый сценарий: временный корпус → реальный прогон инструмента → метрики
 * (wall-ms, пиковый RSS) → сверка с бюджетом → вердикт. Артефакт:
 * .dev-pomogator/.advisor-bench.json (последний прогон + тренд).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scenarios } from './scenarios.mjs';
import { measureSpawn } from './measure.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TOOLS = path.join(REPO, 'tools', 'out-session-advisor');
const PY = (() => {
  if (process.platform !== 'win32') return 'python3';
  const r = spawnSync('where.exe', ['python'], { encoding: 'utf8' });
  const first = (r.stdout ?? '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return first ?? 'py';
})();

function spawnBg(cmd, args) {
  const p = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  p.unref();
  return p;
}

const ARTIFACT = path.join(REPO, '.dev-pomogator', '.advisor-bench.json');

async function main() {
  const argv = process.argv.slice(2);
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(argv[onlyIdx + 1].split(',')) : null;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osa-bench-'));
  const ctx = {
    tmp, TOOLS, PY, REPO,
    measure: (cmd, args, opts = {}) => measureSpawn(cmd, args, { cwd: REPO, ...opts }),
    spawnBg,
    kill: (p) => { try { process.kill(p.pid, 'SIGKILL'); } catch { /* */ } },
    log: (m) => process.stdout.write(`   ${m}\n`),
  };

  const rows = [];
  const started = Date.now();
  for (const s of scenarios) {
    if (only && !only.has(s.id)) continue;
    process.stdout.write(`\n▶ ${s.id} — ${s.name}\n`);
    const t0 = Date.now();
    let result;
    try {
      result = await s.run(ctx);
    } catch (e) {
      result = { ok: false, metrics: { crash: 1 }, notes: [`CRASH: ${e.message}`] };
    }
    const wall = Date.now() - t0;
    const overMs = result.metrics.wallMs !== undefined && result.metrics.wallMs > s.budget.maxMs;
    const overRss = result.metrics.peakRssMb !== undefined && result.metrics.peakRssMb > s.budget.maxRssMb;
    const pass = result.ok && !overMs && !overRss;
    rows.push({ id: s.id, name: s.name, pass, ok: result.ok, budgetOver: { ms: overMs, rss: overRss }, metrics: result.metrics, notes: result.notes, wallMs: wall });
    const flag = pass ? '✅' : '❌';
    const metrics = Object.entries(result.metrics).map(([k, v]) => `${k}=${v}`).join(' ');
    process.stdout.write(`${flag} ${pass ? 'PASS' : 'FAIL'} (${(wall / 1000).toFixed(1)}s) ${metrics}\n`);
    for (const n of (result.notes ?? []).slice(0, 3)) process.stdout.write(`     · ${n.slice(0, 160)}\n`);
  }

  fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
  const prev = fs.existsSync(ARTIFACT) ? JSON.parse(fs.readFileSync(ARTIFACT, 'utf8')) : null;
  const run = {
    at: new Date().toISOString(),
    totalWallMs: Date.now() - started,
    rows,
    summary: {
      pass: rows.filter((r) => r.pass).length,
      fail: rows.filter((r) => !r.pass).length,
      total: rows.length,
    },
  };
  fs.writeFileSync(ARTIFACT, JSON.stringify({ latest: run, previous: prev?.latest ?? null }, null, 2));

  process.stdout.write(`\n══════ ИТОГ: ${run.summary.pass}/${run.summary.total} PASS (${(run.totalWallMs / 1000).toFixed(1)}s) → ${ARTIFACT}\n`);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  process.exitCode = run.summary.fail > 0 ? 1 : 0;
}

main().catch((e) => { console.error('bench fatal:', e); process.exit(2); });
