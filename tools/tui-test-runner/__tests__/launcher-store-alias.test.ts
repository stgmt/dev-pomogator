/**
 * Unit: the Microsoft Store execution-alias guard in the TUI launcher.
 *
 * Regression for "что за питон-менеджер открылся" (2026-06-10): on Windows,
 * executing the `…\WindowsApps\python.exe` alias stub OPENS the Microsoft Store.
 * `detectPython` must NEVER execute a `python` that resolves only to that stub.
 * The pure path predicate `everyPathIsStoreAlias` is the bug-prevention core —
 * tested cross-platform (the `where`-shelling wrapper is win32-only).
 */
import { describe, it, expect } from 'vitest';
import { everyPathIsStoreAlias } from '../launcher.ts';

describe('TUI launcher — Microsoft Store alias guard (no-Store regression)', () => {
  it('flags when the ONLY resolved path is the WindowsApps Store stub', () => {
    expect(everyPathIsStoreAlias(['C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe'])).toBe(true);
  });

  it('flags when EVERY resolved path is a WindowsApps stub (python + py aliases)', () => {
    expect(everyPathIsStoreAlias([
      'C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe',
      'C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\python3.exe',
    ])).toBe(true);
  });

  it('does NOT flag when a REAL interpreter resolves before the stub', () => {
    // the real machine case: real Python first, WindowsApps alias second.
    expect(everyPathIsStoreAlias([
      'C:\\Users\\u\\AppData\\Local\\Programs\\Python\\Python312\\python.exe',
      'C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe',
    ])).toBe(false);
  });

  it('does NOT flag a forward-slash real path (defensive on separator)', () => {
    expect(everyPathIsStoreAlias(['/usr/bin/python3'])).toBe(false);
  });

  it('treats empty resolution as NOT-alias (nothing on PATH → normal probe ENOENTs, no Store)', () => {
    expect(everyPathIsStoreAlias([])).toBe(false);
    expect(everyPathIsStoreAlias(['', '   '])).toBe(false);
  });
});
