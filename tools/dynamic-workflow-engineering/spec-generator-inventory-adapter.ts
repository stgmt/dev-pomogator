import { collectFinite, type CollectionEvidence } from './collectors.ts';

export interface SpecTaskRecord {
  id: string;
  status: string;
  phase?: string;
  title?: string;
  [key: string]: unknown;
}

export interface SpecInventoryClient {
  listTasks(args: { spec: string; statuses: string[]; limit: number; cursor?: string }): Promise<{ total: number; returned: number; results: SpecTaskRecord[]; next_cursor?: string | null }>;
  summary(args: { spec: string }): Promise<Record<string, unknown>>;
}

export async function collectSpecInventory(client: SpecInventoryClient, spec: string, options: { maxCalls?: number; maxBytes?: number; pageLimit?: number } = {}): Promise<{ evidence: CollectionEvidence<SpecTaskRecord>; summary: Record<string, unknown>; calls: number; responseBytes: number }> {
  const maxCalls = options.maxCalls ?? 3;
  const maxBytes = options.maxBytes ?? 512 * 1024;
  const pageLimit = options.pageLimit ?? 200;
  const tasks: SpecTaskRecord[] = [];
  let cursor: string | undefined;
  let calls = 0;
  let responseBytes = 0;
  do {
    if (calls + 1 >= maxCalls) throw new Error('DWE_SPEC_MCP_CALL_CEILING');
    const page = await client.listTasks({ spec, statuses: ['todo', 'ready', 'in-progress', 'blocked'], limit: pageLimit, cursor });
    calls++;
    responseBytes += Buffer.byteLength(JSON.stringify(page), 'utf8');
    if (page.returned !== page.results.length) throw new Error('DWE_SPEC_TASK_CARDINALITY_MISMATCH');
    tasks.push(...page.results);
    cursor = page.next_cursor ?? undefined;
  } while (cursor);
  const summary = await client.summary({ spec });
  calls++;
  responseBytes += Buffer.byteLength(JSON.stringify(summary), 'utf8');
  if (calls > maxCalls || responseBytes > maxBytes) throw new Error('DWE_SPEC_INVENTORY_BUDGET_EXCEEDED');
  const evidence = collectFinite({ source: 'spec-mcp:list_tasks', scope: [spec], items: tasks, id: (task) => task.id, limit: tasks.length || 1 });
  return { evidence, summary, calls, responseBytes };
}
