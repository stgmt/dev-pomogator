#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { auditFile, readAudit } from './audit.mjs';
import { HOST, PORT, stateFile } from './server.mjs';

const args = process.argv.slice(2);
const command = args.find(arg => !arg.startsWith('-')) || 'status';
const json = args.includes('--json');
const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const since = text => { const match = /^(\d+)(m|h|d)$/.exec(text || ''); return match ? Number(match[1]) * ({m:60000,h:3600000,d:86400000}[match[2]]) : undefined; };

async function state() { try { return JSON.parse(await readFile(stateFile(), 'utf8')); } catch { return null; } }
async function health() { try { const r = await fetch(`http://${HOST}:${PORT}/health`, { signal:AbortSignal.timeout(1000) }); return { status:r.status, body:await r.json() }; } catch (error) { return { status:0, error:error.code || error.name || 'unreachable' }; } }

async function report() {
  const service = await state();
  const live = await health();
  const errors = await readAudit({ errors:true, limit:20 });
  return { command, auditPath:auditFile(), service, health:live, recentErrors:errors, ok:live.status===200 && Boolean(service) && service.serviceId===live.body?.serviceId };
}

async function logs() { return { command, auditPath:auditFile(), events:await readAudit({ errors:args.includes('--errors'), route:value('--route'), sinceMs:since(value('--since')), limit:Number(value('--limit')||100) }) }; }

async function routes() {
  const root = process.env.CLAUDE_PLUGIN_ROOT || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try { const registry = JSON.parse(await readFile(`${root}/tools/hook-service/registry.json`, 'utf8')); return { command, auditPath:auditFile(), routes:Object.keys(registry.routes).sort() }; }
  catch { return { command, auditPath:auditFile(), routes:[], error:'registry_unavailable' }; }
}

let result;
if (command === 'logs') result = await logs();
else if (command === 'routes') result = await routes();
else if (command === 'status' || command === 'doctor') result = await report();
else result = { command, auditPath:auditFile(), error:'supported commands: status, doctor, logs, routes' };

if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
else {
  console.log(`hook-service ${result.ok === false ? 'UNHEALTHY' : 'OK'}`);
  console.log(`logs: ${result.auditPath}`);
  if (result.health) console.log(`health: ${result.health.status}`);
  if (result.service) console.log(`pid: ${result.service.pid} service: ${result.service.serviceId || 'legacy'}`);
  if (result.events) for (const event of result.events) console.log(`${event.ts} ${event.outcome} ${event.route || event.stage || '-'}`);
  if (result.routes) for (const route of result.routes) console.log(route);
  if (result.recentErrors?.length) console.log(`recent errors: ${result.recentErrors.length} (run logs --errors)`);
  if (result.error) console.log(`error: ${result.error}`);
}
