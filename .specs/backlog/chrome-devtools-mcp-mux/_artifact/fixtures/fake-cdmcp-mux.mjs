#!/usr/bin/env node
// Stub of cdmcp-mux for CI smoke tests. Speaks line-delimited JSON-RPC over
// stdio without launching Chrome. Responds to `initialize` and `tools/list`
// with the minimum shape the real package returns; ignores everything else
// except `shutdown` (graceful exit) and SIGTERM.

import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin, terminal: false });

function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    return;
  }
  if (!req || typeof req !== 'object' || req.jsonrpc !== '2.0') return;

  switch (req.method) {
    case 'initialize':
      send({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'fake-cdmcp-mux', version: '0.0.0' },
        },
      });
      return;
    case 'tools/list':
      send({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          tools: [
            { name: 'navigate_page', description: 'stub' },
            { name: 'take_screenshot', description: 'stub' },
            { name: 'list_pages', description: 'stub' },
            { name: 'select_page', description: 'stub' },
          ],
        },
      });
      return;
    case 'shutdown':
      send({ jsonrpc: '2.0', id: req.id, result: null });
      process.exit(0);
    case 'notifications/initialized':
      return;
    default:
      send({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      });
  }
});

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
