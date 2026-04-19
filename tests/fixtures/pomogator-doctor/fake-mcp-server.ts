import { spawn, type ChildProcess } from 'node:child_process';
import { registerChild } from './child-registry.ts';

export type FakeMcpMode = 'responsive' | 'hangOnInit' | 'crashOnInit';

export interface FakeMcpHandle {
  child: ChildProcess;
  command: string;
  args: string[];
  kill: () => Promise<void>;
}

function buildScript(mode: FakeMcpMode): string {
  return `
    const mode = ${JSON.stringify(mode)};
    let buffer = '';
    let initialized = false;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      let idx;
      while ((idx = buffer.indexOf('\\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.method === 'initialize') {
          if (mode === 'hangOnInit') return;
          const resp = { jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake', version: '0.0.0' } } };
          process.stdout.write(JSON.stringify(resp) + '\\n');
          initialized = true;
          if (mode === 'crashOnInit') {
            setImmediate(() => process.exit(1));
          }
        } else if (msg.method === 'tools/list' && initialized) {
          const resp = { jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'tool_a', description: 'a', inputSchema: { type: 'object' } }, { name: 'tool_b', description: 'b', inputSchema: { type: 'object' } }] } };
          process.stdout.write(JSON.stringify(resp) + '\\n');
        }
      }
    });
    process.on('SIGTERM', () => process.exit(0));
  `;
}

export function spawnFakeMcp(mode: FakeMcpMode = 'responsive'): FakeMcpHandle {
  const script = buildScript(mode);
  const child = spawn(process.execPath, ['-e', script], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  registerChild(child);

  return {
    child,
    command: process.execPath,
    args: ['-e', script],
    async kill() {
      if (child.exitCode !== null || child.killed) return;
      child.kill('SIGKILL');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 2000);
        child.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    },
  };
}
