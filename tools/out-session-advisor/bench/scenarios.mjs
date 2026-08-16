/**
 * Advisor bench scenarios — каждый сценарий = {id, name, budget, run(ctx)}.
 * ctx: { tmp, TOOLS, NODE, PY, measure, log } — см. bench-runner.mjs.
 * run возвращает { ok, metrics: {key: value}, notes: string[] }.
 */
import fs from 'node:fs';
import path from 'node:path';
import { genTranscript, genProjectsTree, writeLock } from './fixtures-gen.mjs';

const TSX = () => path.resolve('node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

function json(out) {
  try { return JSON.parse(out); } catch { /* */ }
  try { return JSON.parse(out.trim().split('\n').slice(-1).join('\n')); } catch { return null; }
}

export const scenarios = [
  /* ── МАСШТАБ ─────────────────────────────────────────────── */
  {
    id: 'scale-tail-80mb',
    name: 'tail_session на транскрипте 80МБ (bounded read)',
    budget: { maxMs: 8000, maxRssMb: 512 },
    async run(ctx) {
      const root = path.join(ctx.tmp, 'p1');
      fs.mkdirSync(path.join(root, 'E--big'), { recursive: true });
      genTranscript(path.join(root, 'E--big', 'big.jsonl'), { sizeMb: 80, seed: 11, withFilePath: true });
      const r = await ctx.measure(ctx.PY, [path.join(ctx.TOOLS, 'tail_session.py'),
        '--session', 'big', '--project-dir', 'E--big', '--projects-root', root,
        '--state-dir', path.join(ctx.tmp, 'st'), '--max-lines', '50', '--compact']);
      const ok = r.exitCode === 0 && !r.timedOut;
      return { ok, metrics: { wallMs: r.wallMs, peakRssMb: r.peakRssMb }, notes: ok ? [] : [r.stderr.slice(0, 200)] };
    },
  },
  {
    id: 'scale-whowrote-40x10mb',
    name: 'diag --who-wrote по корпусу 40 сессий × 10МБ (400МБ)',
    budget: { maxMs: 12000, maxRssMb: 768 },
    async run(ctx) {
      const root = path.join(ctx.tmp, 'corpus');
      genProjectsTree(root, { sessions: 40, sizeMbEach: 10, seed: 21, withFilePath: true });
      const r = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'diag.ts'),
        '--who-wrote', 'src/foo.py', '--projects-root', root]);
      const parsed = json(r.stdout);
      const ok = r.exitCode === 0 && !r.timedOut && parsed !== null;
      return { ok, metrics: { wallMs: r.wallMs, peakRssMb: r.peakRssMb, hits: parsed?.rows?.length ?? -1 }, notes: ok ? [] : [r.stderr.slice(0, 200)] };
    },
  },
  {
    id: 'scale-gitguard-foreign-400mb',
    name: 'git-guard: чужой staged по корпусу 400МБ',
    budget: { maxMs: 4000, maxRssMb: 512 },
    async run(ctx) {
      const root = path.join(ctx.tmp, 'corpus');
      genProjectsTree(root, { sessions: 40, sizeMbEach: 10, seed: 31, withFilePath: true });
      const r = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'git-guard.ts'),
        'check', '--command', 'git add src/foo.py', '--transcripts-dir', root,
        '--staged-files', 'src/foo.py', '--window-ms', '0']);
      const parsed = json(r.stdout);
      const ok = !r.timedOut && parsed?.decision === 'block';
      return { ok, metrics: { wallMs: r.wallMs, peakRssMb: r.peakRssMb, decision: parsed?.decision ?? '?', exit: r.exitCode }, notes: ok ? [] : [r.stderr.slice(0, 200)] };
    },
  },
  /* ── КОНКУРЕНЦИЯ ─────────────────────────────────────────── */
  {
    id: 'conc-lock-race-50',
    name: '50 процессов гонятся за одним локом (ровно 1 держит)',
    budget: { maxMs: 30000, maxRssMb: 512 },
    async run(ctx) {
      const locks = path.join(ctx.tmp, 'locks');
      const racer = `import { acquire } from ${JSON.stringify('./tools/out-session-advisor/lock.ts')};
const d = process.env.PARALLEL_LOCK_DIR;
const r = acquire('src/foo.py', { ownerCmd: 'bench-racer', locksDir: d });
process.stdout.write(JSON.stringify(r));
setTimeout(() => process.exit(0), 1500);`;
      const jobs = Array.from({ length: 50 }, () => ctx.measure(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', racer],
        { env: { PARALLEL_LOCK_DIR: locks } }));
      const results = await Promise.all(jobs);
      const wins = results.filter((r) => /"status":"ok"/.test(r.stdout)).length;
      const eexist = results.filter((r) => /"status":"EEXIST"/.test(r.stdout)).length;
      const lockFiles = fs.existsSync(locks) ? fs.readdirSync(locks).filter((f) => f.endsWith('.lock')) : [];
      const lockParses = lockFiles.length === 1 && (() => { try { JSON.parse(fs.readFileSync(path.join(locks, lockFiles[0]), 'utf8')); return true; } catch { return false; } })();
      const ok = wins === 1 && eexist === 49 && lockParses;
      return { ok, metrics: { wins, eexist, wallMs: Math.max(...results.map((r) => r.wallMs)) }, notes: [] };
    },
  },
  {
    id: 'conc-recover-race-20',
    name: '20 процессов гонятся за stale-локом (1 восстановил, audit 1 строка)',
    budget: { maxMs: 30000, maxRssMb: 512 },
    async run(ctx) {
      const locks = path.join(ctx.tmp, 'locks');
      const { createHash } = await import('node:crypto');
      const hashName = createHash('sha256').update('x').digest('hex').slice(0, 16) + '.lock';
      writeLock(locks, hashName, 999999, 'dead', 'x');
      const racer = `import { recoverStale } from ${JSON.stringify('./tools/out-session-advisor/lock.ts')};
const d = process.env.PARALLEL_LOCK_DIR;
const r = recoverStale('x', 'bench-racer', d);
process.stdout.write(JSON.stringify(r));
setTimeout(() => process.exit(0), 1500);`;
      const jobs = Array.from({ length: 20 }, () => ctx.measure(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', racer],
        { env: { PARALLEL_LOCK_DIR: locks } }));
      const results = await Promise.all(jobs);
      const recovered = results.filter((r) => /"recovered":true/.test(r.stdout)).length;
      const auditPath = path.join(locks, 'audit.jsonl');
      const auditRows = fs.existsSync(auditPath) ? fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).length : 0;
      const ok = recovered === 1 && auditRows === 1;
      return { ok, metrics: { recovered, auditRows, wallMs: Math.max(...results.map((r) => r.wallMs)) }, notes: [] };
    },
  },
  /* ── УСТОЙЧИВОСТЬ К МУСОРУ ───────────────────────────────── */
  {
    id: 'malformed-robustness',
    name: 'BOM/обрыв/гигантская строка/бинарный мусор — ни один инструмент не падает',
    budget: { maxMs: 30000, maxRssMb: 512 },
    async run(ctx) {
      const variants = ['bom', 'truncated-last', 'giant-line', 'binary'];
      let failures = 0;
      const notes = [];
      for (const v of variants) {
        const root = path.join(ctx.tmp, `mal-${v}`);
        fs.mkdirSync(path.join(root, 'E--x'), { recursive: true });
        genTranscript(path.join(root, 'E--x', 'x.jsonl'), { sizeMb: 2, seed: 41, withFilePath: true, malformed: v });
        const t1 = await ctx.measure(ctx.PY, [path.join(ctx.TOOLS, 'tail_session.py'), '--session', 'x', '--project-dir', 'E--x', '--projects-root', root, '--state-dir', path.join(ctx.tmp, `st-${v}`), '--max-lines', '10', '--compact']);
        const t2 = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'diag.ts'), '--who-wrote', 'src/foo.py', '--projects-root', root]);
        const t3 = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'git-guard.ts'), 'check', '--command', 'git add src/foo.py', '--transcripts-dir', root, '--staged-files', 'src/foo.py', '--window-ms', '0']);
        for (const [name, r] of [['tail', t1], ['diag', t2], ['guard', t3]]) {
          if (r.exitCode !== 0 && r.exitCode !== 1) { failures++; notes.push(`${v}/${name}: exit ${r.exitCode}`); }
        }
      }
      return { ok: failures === 0, metrics: { failures }, notes };
    },
  },
  /* ── ТОЧНОСТЬ ────────────────────────────────────────────── */
  {
    id: 'accuracy-diag-matrix',
    name: 'Матрица вердиктов diag: conflict/dirty/ok/stale/пусто — точное совпадение',
    budget: { maxMs: 30000, maxRssMb: 512 },
    async run(ctx) {
      const errors = [];
      const now = new Date();
      // (a) свежая правка + живой процесс → conflict single-writer
      {
        const root = path.join(ctx.tmp, 'a');
        fs.mkdirSync(path.join(root, 'E--a'), { recursive: true });
        const f = path.join(root, 'E--a', 'a.jsonl');
        fs.writeFileSync(f, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/foo.py', new_string: 'x' } }] } }));
        fs.utimesSync(f, now, now);
        const proc = await ctx.spawnBg(process.execPath, ['-e', 'setTimeout(()=>{},90000)', 'a.jsonl']);
        await new Promise((res) => setTimeout(res, 1000));
        const r = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'diag.ts'), 'src/foo.py', '--projects-root', root]);
        const j = json(r.stdout);
        if (j?.conflicts?.[0]?.verdict !== 'conflict') errors.push('(a) не conflict');
        ctx.kill(proc);
      }
      // (b) свежая правка без процесса → dirty
      {
        const root = path.join(ctx.tmp, 'b');
        fs.mkdirSync(path.join(root, 'E--b'), { recursive: true });
        const f = path.join(root, 'E--b', 'b.jsonl');
        fs.writeFileSync(f, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/foo.py', new_string: 'x' } }] } }));
        fs.utimesSync(f, now, now);
        const r = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'diag.ts'), 'src/foo.py', '--projects-root', root]);
        const j = json(r.stdout);
        if (j?.rows?.[0]?.verdict !== 'dirty') errors.push(`(b) не dirty: got ${j?.rows?.[0]?.verdict} (${j?.rows?.[0]?.reason ?? r.stderr.slice(0, 80)})`);
      }
      // (c) старая правка → ok
      {
        const root = path.join(ctx.tmp, 'c');
        fs.mkdirSync(path.join(root, 'E--c'), { recursive: true });
        const f = path.join(root, 'E--c', 'c.jsonl');
        fs.writeFileSync(f, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'src/foo.py', new_string: 'x' } }] } }));
        fs.utimesSync(f, new Date(Date.now() - 5 * 3600 * 1000), new Date(Date.now() - 5 * 3600 * 1000));
        const r = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'diag.ts'), 'src/foo.py', '--projects-root', root]);
        const j = json(r.stdout);
        if (j?.rows?.[0]?.verdict !== 'ok') errors.push('(c) не ok');
      }
      // (d) лок мёртвого владельца → stale
      {
        const locks = path.join(ctx.tmp, 'locks-d');
        const { createHash } = await import('node:crypto');
        const hashName = createHash('sha256').update('x').digest('hex').slice(0, 16) + '.lock';
        writeLock(locks, hashName, 999999, 'dead');
        const r = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'lock.ts'), 'status', 'x'], { env: { PARALLEL_LOCK_DIR: locks } });
        const j = json(r.stdout);
        if (j?.status !== 'stale') errors.push('(d) не stale');
      }
      // (e) пусто → «0 active, 0 locks, 0 conflicts»
      {
        const root = path.join(ctx.tmp, 'e');
        fs.mkdirSync(root, { recursive: true });
        const r = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'diag.ts'), 'src/foo.py', '--projects-root', root]);
        const j = json(r.stdout);
        if (j?.summary !== '0 active, 0 locks, 0 conflicts') errors.push(`(e) summary=${j?.summary}`);
      }
      return { ok: errors.length === 0, metrics: { errors: errors.length }, notes: errors };
    },
  },
  {
    id: 'accuracy-verify-matrix',
    name: 'verify_claims: CONFIRMED/GAP точная классификация по 6 вариантам',
    budget: { maxMs: 30000, maxRssMb: 512 },
    async run(ctx) {
      const errors = [];
      const dir = path.join(ctx.tmp, 'claims');
      fs.mkdirSync(dir, { recursive: true });
      const target = path.join(dir, 't.txt');
      const data = 'hello-bench';
      fs.writeFileSync(target, data);
      const sha = (await import('node:crypto')).createHash('sha256').update(data).digest('hex');
      const cases = [
        { name: 'файл есть + верный sha', cmd: ['--claim', 'file', '--paths', target, '--expect-sha256', sha], expect: 'CONFIRMED' },
        { name: 'файл есть + НЕверный sha', cmd: ['--claim', 'file', '--paths', target, '--expect-sha256', 'f'.repeat(64)], expect: 'GAP' },
        { name: 'файл отсутствует', cmd: ['--claim', 'file', '--paths', path.join(dir, 'missing.txt')], expect: 'GAP' },
        { name: 'файл есть + верный size', cmd: ['--claim', 'file', '--paths', target, '--expect-size', String(Buffer.byteLength(data))], expect: 'CONFIRMED' },
        { name: 'файл есть + неверный size', cmd: ['--claim', 'file', '--paths', target, '--expect-size', '999'], expect: 'GAP' },
        { name: '403-цепочка (промежуточный 403 ≠ блокер)', cmd: ['--claim', 'chain', '--statuses', '307,403,200'], expect: 'GAP' },
      ];
      for (const c of cases) {
        const r = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'verify_claims.ts'), ...c.cmd]);
        const j = json(r.stdout) ?? {};
        const got = j.status ?? j.verdict ?? j.result ?? '?';
        if (got !== c.expect) errors.push(`${c.name}: got ${got}`);
      }
      return { ok: errors.length === 0, metrics: { errors: errors.length }, notes: errors };
    },
  },
  /* ── ХУК-ЛАТЕНТНОСТЬ ─────────────────────────────────────── */
  {
    id: 'hook-latency-add-all',
    name: 'git-guard --hook (add -A): 20 прогревов, p50 < 500мс',
    budget: { maxMs: 20000, maxRssMb: 512 },
    async run(ctx) {
      const hookInput = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git add -A .' } });
      const times = [];
      for (let i = 0; i < 20; i++) {
        const r = await ctx.measure(process.execPath, ['--import', 'tsx', path.join(ctx.TOOLS, 'git-guard.ts'), '--hook'], { input: hookInput });
        times.push(r.wallMs);
      }
      times.sort((a, b) => a - b);
      const p50 = times[Math.floor(times.length / 2)];
      return { ok: p50 < 500, metrics: { p50Ms: p50, minMs: times[0], maxMs: times[times.length - 1] }, notes: [] };
    },
  },
  {
    id: 'eventlog-tail-50k',
    name: 'tail_session --event-log: 50k событий, дедуп, bounded',
    budget: { maxMs: 15000, maxRssMb: 512 },
    async run(ctx) {
      const ev = path.join(ctx.tmp, 'events.jsonl');
      fs.mkdirSync(path.join(ctx.tmp, 'E--x'), { recursive: true });
      fs.writeFileSync(path.join(ctx.tmp, 'E--x', 'x.jsonl'), '{"type":"user","message":{"role":"user","content":"start"}}\n');
      const lines = [];
      let dup = 0;
      for (let i = 0; i < 50000; i++) {
        const id = i % 40000;
        if (i >= 40000) dup++;
        lines.push(JSON.stringify({ event: 'tool_use', id: `t${id}`, tool: 'Edit', tool_input: { file_path: 'src/foo.py' } }));
      }
      fs.writeFileSync(ev, lines.join('\n'));
      const r = await ctx.measure(ctx.PY, [path.join(ctx.TOOLS, 'tail_session.py'),
        '--session', 'x', '--project-dir', 'E--x', '--projects-root', ctx.tmp,
        '--event-log', ev, '--max-lines', '100000', '--compact']);
      const ok = r.exitCode === 0 && !r.timedOut;
      return { ok, metrics: { wallMs: r.wallMs, peakRssMb: r.peakRssMb, dupInjected: dup }, notes: ok ? [] : [r.stderr.slice(0, 200)] };
    },
  },
];
