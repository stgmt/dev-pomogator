import type { Node, SpecGraph } from '../../spec-graph/types.ts';
import type { SqliteHandle } from './wrapper.ts';

interface NodeRow {
  id: string;
  json: string;
}

interface EdgeRow {
  src: string;
  dst: string;
  type: string;
  json: string | null;
}

interface DefinitionRow {
  alias: string;
  canonical_id: string;
  file: string;
  line: number;
}

function setMeta(handle: SqliteHandle, key: string, value: string): void {
  handle.backend.prepare(
    'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  ).run(key, value);
}

export function persistGraph(handle: SqliteHandle, graph: SpecGraph, sourceFingerprint: string): boolean {
  if (!handle.backend.available) return false;
  handle.backend.exec('BEGIN IMMEDIATE');
  try {
    handle.backend.exec('DELETE FROM nodes; DELETE FROM edges; DELETE FROM definitions;');
    const insertNode = handle.backend.prepare('INSERT INTO nodes(id,type,file,line,json) VALUES(?,?,?,?,?)');
    for (const node of graph.nodes.values()) {
      insertNode.run(node.id, node.type, node.file, node.line, JSON.stringify(node));
    }
    const insertEdge = handle.backend.prepare('INSERT INTO edges(src,dst,type,json) VALUES(?,?,?,?)');
    for (const edge of graph.edges) {
      insertEdge.run(edge.from, edge.to, edge.type, edge.metadata ? JSON.stringify(edge.metadata) : null);
    }
    const insertDefinition = handle.backend.prepare('INSERT INTO definitions(alias,canonical_id,file,line) VALUES(?,?,?,?)');
    for (const [alias, location] of graph.definitions) {
      const canonicalId = graph.nodes.has(alias)
        ? alias
        : [...graph.nodes.values()].find((node) => node.file === location.file && node.line === location.line)?.id ?? alias;
      insertDefinition.run(alias, canonicalId, location.file, location.line);
    }
    setMeta(handle, 'graph_version', String(graph.version));
    setMeta(handle, 'built_at', graph.builtAt);
    setMeta(handle, 'source_fingerprint', sourceFingerprint);
    handle.backend.exec('COMMIT');
    return true;
  } catch (error) {
    try { handle.backend.exec('ROLLBACK'); } catch { /* best effort */ }
    throw error;
  }
}

export function loadGraph(handle: SqliteHandle, sourceFingerprint: string): SpecGraph | null {
  if (!handle.backend.available) return null;
  const meta = handle.backend.prepare('SELECT key,value FROM meta').all() as Array<{ key: string; value: string }>;
  const values = new Map(meta.map((row) => [row.key, row.value]));
  if (
    Number.parseInt(values.get('graph_version') ?? '', 10) !== 1
    || !values.get('built_at')
    || values.get('source_fingerprint') !== sourceFingerprint
  ) return null;
  const nodeRows = handle.backend.prepare('SELECT id,json FROM nodes ORDER BY id').all() as NodeRow[];
  if (nodeRows.length === 0) return null;
  const nodes = new Map<string, Node>();
  for (const row of nodeRows) nodes.set(row.id, JSON.parse(row.json) as Node);
  const edges = (handle.backend.prepare('SELECT src,dst,type,json FROM edges ORDER BY rowid').all() as EdgeRow[]).map((row) => ({
    from: row.src,
    to: row.dst,
    type: row.type as SpecGraph['edges'][number]['type'],
    ...(row.json ? { metadata: JSON.parse(row.json) } : {}),
  }));
  const definitions = new Map<string, { file: string; line: number }>();
  const backlinks = new Map<string, Array<{ file: string; line: number; type: SpecGraph['edges'][number]['type'] }>>();
  for (const row of handle.backend.prepare('SELECT alias,canonical_id,file,line FROM definitions ORDER BY alias').all() as DefinitionRow[]) {
    definitions.set(row.alias, { file: row.file, line: row.line });
  }
  for (const edge of edges) {
    const source = nodes.get(edge.from);
    if (!source) continue;
    const list = backlinks.get(edge.to) ?? [];
    list.push({ file: source.file, line: source.line, type: edge.type });
    backlinks.set(edge.to, list);
  }
  return { version: 1, builtAt: values.get('built_at')!, nodes, edges, definitions, backlinks };
}
