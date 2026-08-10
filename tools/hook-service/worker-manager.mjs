import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
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
  constructor({ root, idleMs = DEFAULT_IDLE_MS, spawnProcess = spawn, onRecycle = () => {} } = {}) {
    this.root = root;
    this.idleMs = idleMs;
    this.spawnProcess = spawnProcess;
    this.onRecycle = onRecycle;
    this.workers = new Map();
    this.starting = new Map();
    this.metrics = new Map();
  }

  canUse(entry) { return workerEntry(entry); }

  getMetrics() { return Object.fromEntries(this.metrics); }

  metricFor(key, worker) {
    return this.metrics.get(key) || {
      spawnAttempts: 0,
      spawns: 0,
      spawnFailures: 0,
      dispatches: 0,
      successes: 0,
      failures: 0,
      timeouts: 0,
      recycles: 0,
      pid: worker?.child?.pid ?? null,
      lastPid: null,
      state: worker?.state || 'starting',
      queued: 0,
      inFlight: 0,
      lastErrorCode: null,
    };
  }

  updateMetric(key, worker, update = {}) {
    const metric = { ...this.metricFor(key, worker), ...update };
    this.metrics.set(key, metric);
    return metric;
  }

  async execute(route, entry, input, event, context = {}) {
    if (!this.canUse(entry)) return null;
    const projectRoot = context.projectRoot || '';
    const key = `${projectRoot}:${route}:${entry.worker_target}`;
    let worker = this.workers.get(key);
    if (!worker || worker.state === 'dead' || worker.state === 'recycling') {
      let startup = this.starting.get(key);
      if (!startup) {
        startup = this.start(key, entry, context)
          .then(started => {
            this.workers.set(key, started);
            return started;
          })
          .finally(() => this.starting.delete(key));
        this.starting.set(key, startup);
      }
      try {
        worker = await startup;
      } catch (error) {
        this.updateMetric(key, null, {
          spawnFailures: (this.metricFor(key).spawnFailures || 0) + 1,
          failures: (this.metricFor(key).failures || 0) + 1,
          state: 'dead',
          lastErrorCode: error?.code || 'WORKER_STARTUP',
        });
        throw error;
      }
    }
    worker.metricKey = key;
    const metric = this.updateMetric(key, worker, {
      dispatches: this.metricFor(key, worker).dispatches + 1,
      queued: worker.queue.length,
    });
    try {
      const result = await worker.request({ route, event, input, projectRoot, args: entry.worker_args || [] });
      this.updateMetric(key, worker, {
        successes: metric.successes + 1,
        queued: worker.queue.length,
        inFlight: worker.inFlight,
        state: worker.state,
      });
      return result;
    } catch (error) {
      this.updateMetric(key, worker, {
        failures: this.metricFor(key, worker).failures + 1,
        timeouts: this.metricFor(key, worker).timeouts + (error?.code === 'HOOK_TIMEOUT' ? 1 : 0),
        queued: worker.queue.length,
        inFlight: worker.inFlight,
        state: worker.state,
        lastErrorCode: error?.code || 'WORKER_RUNTIME',
      });
      this.recycle(key, worker, error?.code || 'worker-failure');
      throw error;
    }
  }

  async start(key, entry, context = {}) {
    const target = resolve(this.root, entry.worker_target);
    const host = fileURLToPath(new URL('./worker-host.mjs', import.meta.url));
    const childArgs = [host, target, entry.worker_protocol || 'handle'];
    let child;
    this.updateMetric(key, null, { spawnAttempts: this.metricFor(key).spawnAttempts + 1, state: 'starting' });
    try {
      child = this.spawnProcess(process.execPath, childArgs, {
        cwd: context.projectRoot || undefined,
        env: {
          ...process.env,
          CLAUDE_PLUGIN_ROOT: this.root,
          ...(context.projectRoot ? { CLAUDE_PROJECT_DIR: context.projectRoot } : {}),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      throw errorWithCode(error?.message || String(error), error?.code || 'HOOK_SPAWN');
    }
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const pending = new Map();
    const queue = [];
    let readyResolve;
    let readyReject;
    const ready = new Promise((resolveReady, rejectReady) => { readyResolve = resolveReady; readyReject = rejectReady; });
    const worker = {
      child,
      pending,
      queue,
      state: 'starting',
      writing: false,
      idleTimer: null,
      inFlight: 0,
      request: null,
      metricKey: key,
    };
    const fail = error => {
      if (worker.state === 'dead') return;
      worker.state = 'dead';
      clearTimeout(worker.idleTimer);
      if (worker.pending.size === 0 && worker.queue.length === 0) readyReject?.(error);
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.reject(error);
      }
      pending.clear();
      while (queue.length) queue.shift().reject(error);
      this.updateMetric(key, worker, { state: 'dead', lastErrorCode: error?.code || 'WORKER_EXIT' });
    };
    const failProtocol = message => fail(errorWithCode(message, 'WORKER_PROTOCOL'));
    child.once('error', error => { const normalized = errorWithCode(error.message, error.code || 'HOOK_SPAWN'); readyReject?.(normalized); fail(normalized); });
    child.once('close', code => {
      if (worker.state !== 'dead') {
        const normalized = errorWithCode(`worker exited ${code ?? 1}`, 'WORKER_EXIT');
        readyReject?.(normalized);
        fail(normalized);
      }
    });
    child.stdin.once('error', error => fail(errorWithCode(error.message, 'WORKER_TRANSPORT')));
    child.stdin.once('close', () => { if (worker.state !== 'dead') fail(errorWithCode('worker input closed', 'WORKER_TRANSPORT')); });
    const pump = () => {
      if (worker.state !== 'ready' || worker.writing || queue.length === 0) return;
      const item = queue.shift();
      worker.writing = true;
      worker.inFlight += 1;
      this.updateMetric(key, worker, { queued: queue.length, inFlight: worker.inFlight });
      child.stdin.write(`${JSON.stringify(item.frame)}\n`, error => {
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
      if (frame.type === 'ready') {
        if (worker.state !== 'starting' || frame.version !== 1 || !Number.isInteger(frame.worker_pid)) return failProtocol('worker ready frame invalid');
        worker.state = 'ready';
        this.updateMetric(key, worker, {
          spawns: this.metricFor(key, worker).spawns + 1,
          pid: frame.worker_pid,
          lastPid: frame.worker_pid,
          state: 'ready',
        });
        readyResolve(worker);
        pump();
        return;
      }
      if (worker.state !== 'ready' || frame.version !== 1 || typeof frame.request_id !== 'string') return failProtocol('worker response missing protocol identity');
      const item = pending.get(frame.request_id);
      if (!item) return failProtocol('worker response request id mismatch');
      pending.delete(frame.request_id);
      clearTimeout(item.timer);
      worker.inFlight = Math.max(0, worker.inFlight - 1);
      if (frame.error) {
        item.reject(errorWithCode(frame.error, frame.code || 'WORKER_RUNTIME'));
        this.recycle(key, worker, frame.code || 'WORKER_RUNTIME');
        return;
      }
      item.resolve(frame.output || {});
      clearTimeout(worker.idleTimer);
      worker.idleTimer = setTimeout(() => this.recycle(key, worker, 'idle'), this.idleMs);
      worker.idleTimer.unref?.();
      this.updateMetric(key, worker, { queued: queue.length, inFlight: worker.inFlight, state: worker.state });
      pump();
    });
    worker.request = request => new Promise((resolveResult, rejectResult) => {
      if (worker.state !== 'ready') return rejectResult(errorWithCode('worker unavailable', 'WORKER_DEAD'));
      const requestId = randomUUID();
      const frame = { version: 1, request_id: requestId, ...request };
      if (Buffer.byteLength(JSON.stringify(frame)) > MAX_FRAME_BYTES) return rejectResult(errorWithCode('worker request exceeded frame limit', 'WORKER_FRAME_LIMIT'));
      const timeout = Math.max(1, entry.timeout || DEFAULT_TIMEOUT_MS / 1000) * 1000;
      const item = { frame, resolve: resolveResult, reject: rejectResult, timer: null };
      item.timer = setTimeout(() => {
        if (!pending.delete(requestId)) return;
        worker.inFlight = Math.max(0, worker.inFlight - 1);
        const error = errorWithCode('worker timed out', 'HOOK_TIMEOUT');
        rejectResult(error);
        this.recycle(key, worker, 'timeout');
      }, timeout);
      pending.set(requestId, item);
      queue.push(item);
      this.updateMetric(key, worker, { queued: queue.length });
      pump();
    });
    try {
      await ready;
      return worker;
    } catch (error) {
      this.recycle(key, worker, error?.code || 'WORKER_STARTUP');
      throw error;
    }
  }

  recycle(key, worker, reason) {
    if (worker.state === 'dead' || worker.state === 'recycling') return;
    if (this.workers.get(key) === worker) this.workers.delete(key);
    worker.state = 'recycling';
    clearTimeout(worker.idleTimer);
    worker.child.stdin.end();
    worker.child.kill();
    const error = errorWithCode(`worker recycled: ${reason}`, 'WORKER_RECYCLED');
    for (const item of worker.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    worker.pending.clear();
    while (worker.queue.length) worker.queue.shift().reject(error);
    this.updateMetric(key, worker, {
      recycles: this.metricFor(key, worker).recycles + 1,
      state: 'recycling',
      queued: 0,
      inFlight: 0,
      lastErrorCode: reason,
    });
    this.onRecycle({ key, reason, pid: worker.child.pid });
  }

  close() {
    for (const [key, worker] of this.workers) this.recycle(key, worker, 'shutdown');
    for (const startup of this.starting.values()) startup.catch(() => {});
    this.starting.clear();
  }
}
