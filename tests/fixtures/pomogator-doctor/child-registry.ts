import type { ChildProcess } from 'node:child_process';

const spawned = new Set<ChildProcess>();

process.on('exit', () => {
  for (const child of spawned) {
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        // process already gone
      }
    }
  }
});

export function registerChild(child: ChildProcess): void {
  spawned.add(child);
  child.on('exit', () => spawned.delete(child));
}

export function unregisterChild(child: ChildProcess): void {
  spawned.delete(child);
}

export async function killAllChildren(): Promise<void> {
  const alive = Array.from(spawned).filter((c) => c.exitCode === null && !c.killed);
  if (alive.length === 0) return;
  for (const child of alive) {
    try {
      child.kill('SIGKILL');
    } catch {
      // child already exited; ignore
    }
  }
  await Promise.all(
    alive.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null) return resolve();
          const timer = setTimeout(() => resolve(), 2000);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        }),
    ),
  );
  spawned.clear();
}

export function aliveChildCount(): number {
  return Array.from(spawned).filter((c) => c.exitCode === null && !c.killed).length;
}
