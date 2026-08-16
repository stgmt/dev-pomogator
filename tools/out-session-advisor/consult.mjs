/**
 * consult.mjs — FR-3 дополнение «модель-пара»: консультация более сильной модели-адвизора
 * (ADVISOR_MODEL, default gpt-5.6-sol) на ключевых точках цикла (перед «готово», при
 * повторяющейся ошибке, перед сменой подхода) по фактическому транскрипту воркера.
 *
 * Детерминированный verify_claims остаётся основой «проверки на пиздёж»; эта консультация —
 * совет уровня «что упущено/что перепроверить» в стиле стокового Anthropic Advisor.
 *
 * Читает: главный транскрипт (~/.claude/projects/<proj>/<sid>.jsonl) + субагенты +
 * событийный лог worker_driver (--event-log), если передан.
 * Зовёт: {ANTHROPIC_BASE_URL}/v1/messages модель ADVISOR_MODEL (thinking disabled).
 * Fail-open: нет env/транскрипта/HTTP — короткий честный текст, exit 0.
 *
 * Usage: node consult.mjs --session <sid> --project-dir <enc> [--event-log <path>] [--point done|recurring|plan]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTranscriptPacket, consultAdvisorFromTranscript } from '../advisor/transcript-packet.mjs';

const TIMEOUT_MS = Number(process.env.ADVISOR_TIMEOUT_MS || 30_000);

function readArgs(argv) {
  const args = { sid: '', projectDir: '', eventLog: null, point: 'done' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--session') args.sid = next();
    else if (a === '--project-dir') args.projectDir = next();
    else if (a === '--event-log') args.eventLog = next();
    else if (a === '--point') args.point = next();
  }
  return args;
}

function collectTranscript(args) {
  const home = os.homedir();
  const projDir = args.projectDir;
  const base = path.join(home, '.claude', 'projects', projDir);
  const mainPath = path.join(base, `${args.sid}.jsonl`);
  const chunks = [];
  if (fs.existsSync(mainPath)) {
    chunks.push(`# main transcript (${mainPath})\n`);
    chunks.push(fs.readFileSync(mainPath, 'utf8'));
  } else {
    return null;
  }
  // субагенты (nested scan, depth ≤ 3)
  const subRoot = path.join(base, args.sid, 'subagents');
  if (fs.existsSync(subRoot)) {
    const walk = (dir, depth) => {
      if (depth > 3) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isFile() && e.name.startsWith('agent-') && e.name.endsWith('.jsonl')) {
          chunks.push(`\n# subagent ${e.name}\n`);
          chunks.push(fs.readFileSync(full, 'utf8'));
        } else if (e.isDirectory()) {
          walk(full, depth + 1);
        }
      }
    };
    walk(subRoot, 0);
  }
  // event-log (живые события stream-json)
  if (args.eventLog && fs.existsSync(args.eventLog)) {
    chunks.push(`\n# live event-log (stream-json)\n`);
    chunks.push(fs.readFileSync(args.eventLog, 'utf8'));
  }
  return chunks.join('\n');
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const base = (process.env.ANTHROPIC_BASE_URL ?? '').trim();
  const key = (process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!base || !key) {
    console.log('[consult] нет ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN — skipping (fail-open)');
    return 0;
  }
  const raw = collectTranscript(args);
  if (!raw) {
    console.log('[consult] транскрипт не найден — skipping (fail-open)');
    return 0;
  }
  const packet = buildTranscriptPacket(raw);
  const pointNote = {
    done: 'Ключевая точка: агент собирается объявить завершение.',
    recurring: 'Ключевая точка: агент застрял на повторяющейся ошибке.',
    plan: 'Ключевая точка: агент выбирает подход.',
  }[args.point] ?? '';
  const guidance = await consultAdvisorFromTranscript(`${pointNote}\n\n${packet}`);
  console.log(guidance);
  return 0;
}

main().then((c) => { process.exitCode = c; }).catch((e) => {
  console.log(`[consult] call failed: ${e.message}`);
  process.exitCode = 0;
});