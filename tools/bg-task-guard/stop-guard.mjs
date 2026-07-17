import { existsSync, statSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const output = body => process.stdout.write(`${JSON.stringify(body)}\n`);
const stateRoot = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.dev-pomogator');
const now = Date.now();
const session = process.env.CLAUDE_SESSION_ID;
let marker = join(stateRoot, `.bg-task-active${session ? `.${session}` : ''}`);
if (!existsSync(marker) && session) marker = join(stateRoot, '.bg-task-active');
if (!existsSync(marker) || !readFileSync(marker, 'utf8').trim()) process.exit(0);
const [taskId] = readFileSync(marker, 'utf8').trim().split(/\s+/);
const ageSeconds = Math.floor((now - statSync(marker).mtimeMs) / 1000);
if (/^\d+$/.test(taskId)) {
  try { process.kill(Number(taskId), 0); } catch { unlinkSync(marker); process.exit(0); }
}
if (ageSeconds >= 900) { unlinkSync(marker); process.exit(0); }
if (ageSeconds >= 180) output({decision:'block', reason:`Background TaskOutput ${taskId} remains active after ${Math.floor(ageSeconds / 60)} minute(s).`});
