import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import type { CommandRequest, CommandResult, CommandRunner, UrlOpener } from './types.ts';

export const runCommand: CommandRunner = (request) => new Promise((resolve) => {
  const child = spawn(request.file, request.args, { cwd: request.cwd, shell: false, windowsHide: true });
  let stdout = '';
  let stderr = '';
  let settled = false;
  const finish = (result: CommandResult): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve(result);
  };
  const timer = setTimeout(() => {
    child.kill();
    finish({ code: null, stdout, stderr, error: 'timeout' });
  }, request.timeoutMs);
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  child.on('error', (error: NodeJS.ErrnoException) => finish({ code: null, stdout, stderr, error: error.code === 'ENOENT' ? 'missing' : 'spawn' }));
  child.on('close', (code) => finish({ code, stdout, stderr }));
});

export const openUrl: UrlOpener = async (url) => {
  const spec = platform() === 'win32'
    ? { file: 'cmd', args: ['/c', 'start', '', url] }
    : platform() === 'darwin'
      ? { file: 'open', args: [url] }
      : { file: 'xdg-open', args: [url] };
  const result = await runCommand({ ...spec, cwd: process.cwd(), timeoutMs: 3_000 });
  return result.code === 0;
};
