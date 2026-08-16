/**
 * verify_claims.ts — FR-3 "проверка на пиздёж": сверяет заявления воркера с реальными
 * фактами (диск/БД/live). Детерминированный слой, без LLM: только проверяемые факты.
 *
 * Вердикт: { status: "CONFIRMED" | "GAP", evidence: string[], reason: string }
 *
 * Моды:
 *   --claim file    --paths a.ts,b.ts [--expect-size N --expect-sha256 H]   файл существует? size? hash?
 *   --claim chain   --statuses 307,403,200 [--final-url U]                  "403-цепочка": промежуточный 403 ≠ блокер
 *   --claim blocker --sqlite <db> --run-id R                                run_external_blockers source=live|archived
 *
 * fail-open JSON line: отдельно (utils).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';

export type ClaimVerdict = {
  status: 'CONFIRMED' | 'GAP';
  evidence: string[];
  reason: string;
  kind?: string;
};

/* ---------- 403-цепочка (доменная истина) ---------- */

/**
 * Промежуточный 403 в цепочке 307→403→200 НЕ блокер (может быть штатный хоп Ozon).
 * Блокер = финальный document >= 400 И url = page.url.
 * @param statuses упорядоченная цепочка статусов document-ответов
 */
export function evaluateChain(
  statuses: number[],
  opts: { finalUrl?: string; pageUrl?: string },
): ClaimVerdict {
  if (statuses.length === 0) {
    return { status: 'GAP', evidence: [], reason: 'document_response_chain пуст' };
  }
  const fin = statuses[statuses.length - 1];
  const intermediate403 = statuses
    .slice(0, -1)
    .some((s) => s === 403 || s === 429);
  const isBlocker = fin >= 400;
  const urlOk = !opts.finalUrl || !opts.pageUrl || opts.finalUrl === opts.pageUrl;
  if (isBlocker && urlOk) {
    return {
      status: 'CONFIRMED',
      kind: 'live-blocker',
      evidence: [`chain=${statuses.join('→')}`],
      reason: `финальный document ${fin} >= 400 и url совпал — живой блокер`,
    };
  }
  if (isBlocker && !urlOk) {
    return {
      status: 'GAP',
      kind: 'url-mismatch',
      evidence: [`final=${opts.finalUrl} page=${opts.pageUrl}`],
      reason: 'финальный ответ >=400, но url не совпадает с page.url — не блокер',
    };
  }
  if (intermediate403) {
    return {
      status: 'GAP',
      kind: 'intermediate-403',
      evidence: [`chain=${statuses.join('→')}`],
      reason: '403/429 был промежуточным; финальный document <400 — не блокер',
    };
  }
  return {
    status: 'CONFIRMED',
    kind: 'ok-chain',
    evidence: [`chain=${statuses.join('→')}`],
    reason: 'цепочка без блокера финального document',
  };
}

/* ---------- файл ---------- */

export function verifyFile(
  paths: string[],
  opts: { expectSize?: number; expectSha256?: string } = {},
): ClaimVerdict {
  const evidence: string[] = [];
  const reasons: string[] = [];
  let ok = true;
  for (const p of paths) {
    if (!existsSync(p)) {
      ok = false;
      reasons.push(`нет файла: ${p}`);
      continue;
    }
    evidence.push(p);
    const st = statSync(p);
    if (opts.expectSize !== undefined && st.size !== opts.expectSize) {
      ok = false;
      reasons.push(`размер ${p}: ${st.size} != ожидаемый ${opts.expectSize}`);
    }
    if (opts.expectSha256) {
      const h = createHash('sha256').update(readFileSync(p)).digest('hex');
      if (h !== opts.expectSha256) {
        ok = false;
        reasons.push(`sha256 ${p}: ${h.slice(0, 12)}… != ${opts.expectSha256.slice(0, 12)}…`);
      }
    }
  }
  return ok
    ? { status: 'CONFIRMED', evidence, reason: reasons.length ? reasons.join('; ') : `файлы существуют: ${paths.join(', ')}` }
    : { status: 'GAP', evidence, reason: reasons.join('; ') };
}

/* ---------- run_external_blockers ---------- */

/** Проверка live/archived блокера в SQLite координаторе (sales-харнесс). */
export async function verifyBlockers(sqlitePath: string, runId: string): Promise<ClaimVerdict> {
  let rows;
  try {
    // node:sqlite доступен только на новых Node — ленивый импорт, чтобы file/chain-моды
    // работали и на старых рантаймах (контейнер).
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    rows = db.prepare(
      `SELECT source, url, http_status, reason, cleared_at FROM run_external_blockers WHERE run_id = ?`,
    ).all(runId);
    db.close();
  } catch (e) {
    return {
      status: 'GAP',
      evidence: [sqlitePath],
      reason: `не удалось прочитать БД: ${e instanceof Error ? e.message : e}`,
    };
  }
  if (rows.length === 0) {
    return { status: 'CONFIRMED', evidence: [], reason: `live-блокер для run ${runId} отсутствует` };
  }
  const live = (rows as any[]).filter((r) => r.source === 'live' && r.cleared_at === null);
  if (live.length === 0) {
    return {
      status: 'CONFIRMED',
      kind: 'no-live-blocker',
      evidence: rows.map((r: any) => `source=${r.source} ${r.url} ${r.http_status}`),
      reason: `все блокеры для run ${runId} — archived/cleared; свежий run не заморожен`,
    };
  }
  return {
    status: 'CONFIRMED',
    kind: 'live-blocker',
    evidence: live.map((r: any) => `${r.url} ${r.http_status} (${r.reason})`),
    reason: `активный live-блокер установлен (${live.length}) — стоп до clear_run_external_blocker`,
  };
}

/* ---------- CLI ---------- */

function parseArgs(argv: string[]) {
  const args = { claim: '' as string, paths: [] as string[], statuses: [] as number[], finalUrl: '', pageUrl: '', sqlite: '', runId: '', expectSize: undefined as number | undefined, expectSha256: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--claim') args.claim = next();
    else if (a === '--paths') args.paths = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--statuses') args.statuses = next().split(',').map(Number);
    else if (a === '--final-url') args.finalUrl = next();
    else if (a === '--page-url') args.pageUrl = next();
    else if (a === '--sqlite') args.sqlite = next();
    else if (a === '--run-id') args.runId = next();
    else if (a === '--expect-size') args.expectSize = Number(next());
    else if (a === '--expect-sha256') args.expectSha256 = next();
  }
  return args;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  let verdict: ClaimVerdict;
  if (args.claim === 'file') {
    verdict = verifyFile(args.paths, { expectSize: args.expectSize, expectSha256: args.expectSha256 });
  } else if (args.claim === 'chain') {
    verdict = evaluateChain(args.statuses, { finalUrl: args.finalUrl, pageUrl: args.pageUrl });
  } else if (args.claim === 'blocker') {
    if (!args.sqlite || !args.runId) {
      console.error('--claim blocker требует --sqlite <db> --run-id <R>');
      return 2;
    }
    verdict = await verifyBlockers(args.sqlite, args.runId);
  } else {
    console.error('usage: verify_claims.ts --claim file|chain|blocker ...');
    return 2;
  }
  console.log(JSON.stringify(verdict, null, 2));
  return verdict.status === 'CONFIRMED' ? 0 : 1;
}

if (process.argv[1] && /verify_claims/.test(process.argv[1])) {
  main().then((c) => { process.exitCode = c; });
}

export const __test = { verifyFile, evaluateChain, verifyBlockers };