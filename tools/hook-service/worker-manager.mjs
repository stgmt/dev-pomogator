import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAX_FRAME_BYTES = 256_000;
const DEFAULT_IDLE_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 30_000;

function workerEntry(entry) {
  return entry?.execution === 'persistent' && typeof entry.worker_target === 'string';
}

function errorWithCode(message, code) {
  return Object.assign(new Error(message), { code });
}

export class WorkerManager {
  constructor({ root, idleMs = DEFAULT_IDLE_MS, onRecycle = () => {} } = {}) {
    this.root = root;
    this.idleMs = idleMs;
    this.onRecycle = onRecycle;
    this.workers = new Map();
    this.metrics = new Map();
  }

  canUse(entry) { return workerEntry(entry); }

  getMetrics() { return Object.fromEntries(this.metrics); }

  async execute(route, entry, input, event) {
    if (!this.canUse(entry)) return null;
    const key = `${route}:${entry.worker_target}`;
    let worker = this.workers.get(key);
    if (!worker || worker.dead) {
      worker = this.start(key, entry);
      this.workers.set(key, worker);
      const metric = this.metrics.get(key) || { dispatches: 0, spawns: 0, pid: worker.child.pid };
      metric.spawns += 1;
      metric.pid = worker.child.pid;
      this.metrics.set(key, metric);
    }
    try {
      const result = await worker.request({ route, event, input, args: entry.worker_args || [] });
      const metric = this.metrics.get(key) || { dispatches: 0, spawns: 1, pid: worker.child.pid };
      metric.dispatches += 1;
      this.metrics.set(key, metric);
      return result;
    } catch (error) {
      this.recycle(key, worker, error?.code || 'worker-failure');
      throw error;
    }
  }

  start(key, entry) {
    const target = resolve(this.root, entry.worker_target);
    const host = fileURLToPath(new URL('./worker-host.mjs', import.meta.url));
    const workerArgs = entry.worker_loader === 'tsx'
      ? ['--import', pathToFileURL(resolve(this.root, 'node_modules/tsx/dist/loader.mjs')).href, host, target, entry.worker_protocol || 'handle']
      : [host, target, entry.worker_protocol || 'handle'];
    const child = spawn(process.execPath, workerArgs, {
      cwd: process.env.CLAUDE_PROJECT_DIR || this.root,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: this.root },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const pending = new Map();
    const queue = [];
    const worker = {
      child,
      pending,
      queue,
      closePromise: null,
      dead: false,
      writing: false,
      idleTimer: null,
      key,
      entry,
    };

    const fail = error => {
      if (worker.dead) return;
      worker.dead = true;
      clearTimeout(worker.idleTimer);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(error);
      }
      pending.clear();
      while (queue.length) queue.shift().reject(error);
    };
    const failProtocol = message => fail(errorWithCode(message, 'WORKER_PROTOCOL'));

    child.once('error', error => fail(errorWithCode(error.message, error.code || 'HOOK_SPAWN')));
    child.once('close', code => {
      if (!worker.dead) fail(errorWithCode(`worker exited ${code ?? 1}`, 'WORKER_EXIT'));
    });
    child.stdin.once('error', error => fail(errorWithCode(error.message, 'WORKER_TRANSPORT')));
    child.stdin.once('close', () => {
      if (!worker.dead) fail(errorWithCode('worker input closed', 'WORKER_TRANSPORT'));
    });

    const pump = () => {
      if (worker.dead || worker.writing || queue.length === 0) return;
      const item = queue.shift();
      worker.writing = true;
      const frame = JSON.stringify(item.frame);
      child.stdin.write(`${frame}\n`, error => {
        worker.writing = false;
        if (error) {
          item.reject(errorWithCode(error.message, 'WORKER_TRANSPORT'));
          fail(errorWithCode(error.message, 'WORKER_TRANSPORT'));
        } else pump();
      });
    };

    lines.on('line', line => {
      if (Buffer.byteLength(line) > MAX_FRAME_BYTES) return failProtocol('worker response exceeded frame limit');
      let frame;
      try { frame = JSON.parse(line); } catch { return failProtocol('worker sent malformed frame'); }
      if (frame.version !== 1 || typeof frame.request_id !== 'string') return failProtocol('worker response missing protocol identity');
      const item = pending.get(frame.request_id);
      if (!item) return failProtocol('worker response request id mismatch');
      pending.delete(frame.request_id);
      clearTimeout(item.timer);
      if (frame.error) item.reject(errorWithCode(frame.error, frame.code || 'WORKER_RUNTIME'));
      else item.resolve(frame.output || {});
      clearTimeout(worker.idleTimer);
      worker.idleTimer = setTimeout(() => this.recycle(key, worker, 'idle'), this.idleMs);
      worker.idleTimer.unref?.();
    });

    worker.request = request => new Promise((resolveResult, rejectResult) => {
      if (worker.dead) return rejectResult(errorWithCode('worker unavailable', 'WORKER_DEAD'));
      const requestId = randomUUID();
      const frame = { version: 1, request_id: requestId, ...request };
      if (Buffer.byteLength(JSON.stringify(frame)) > MAX_FRAME_BYTES) return rejectResult(errorWithCode('worker request exceeded frame limit', 'WORKER_FRAME_LIMIT'));
      const timeout = Math.max(1, entry.timeout || DEFAULT_TIMEOUT_MS / 1000) * 1000;
      const item = { frame, resolve: resolveResult, reject: rejectResult, timer: null };
      item.timer = setTimeout(() => {
        if (!pending.delete(requestId)) return;
        const error = errorWithCode('worker timed out', 'HOOK_TIMEOUT');
        rejectResult(error);
        this.recycle(key, worker, 'timeout');
      }, timeout);
      pending.set(requestId, item);
      queue.push(item);
      pump();
    });
    return worker;
  }

  recycle(key, worker, reason) {
    if (this.workers.get(key) === worker) this.workers.delete(key);
    if (worker.dead) return;
    worker.dead = true;
    clearTimeout(worker.idleTimer);
    worker.child.stdin.end();
    worker.child.kill();
    worker.closePromise = new Promise(resolveClose => {
      if (worker.child.exitCode !== null) return resolveClose();
      worker.child.once('close', resolveClose);
    });
    const error = errorWithCode(`worker recycled: ${reason}`, 'WORKER_RECYCLED');
    for (const item of worker.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    worker.pending.clear();
    while (worker.queue.length) worker.queue.shift().reject(error);
    this.onRecycle({ key, reason, pid: worker.child.pid });
  }

  close() {
    for (const [key, worker] of this.workers) this.recycle(key, worker, 'shutdown');
  }
}
