# Design

## Реализуемые требования

- FR-1: Auto-install claude-mem-health
- FR-2: Post-install validation
- FR-3: Structured error logging
- FR-4: User-facing diagnostics
- FR-5: Graceful degradation
- FR-6: Re-install idempotency
- FR-7: Integration tests

## Изменения по компонентам

### 1. src/installer/index.ts — auto-install health extension (FR-1)

```
if (needsClaudeMem) {
  // EXISTING: ensureClaudeMem('claude')
  // NEW: auto-install claude-mem-health extension
  if (!extensions.includes('claude-mem-health')) {
    await installClaude({ extensions: ['claude-mem-health'], executedSharedHooks });
  }
}
```

Существующий код `installClaude()` уже умеет ставить extensions по имени. Просто добавить вызов.

### 2. src/installer/memory.ts — post-install validation + logging (FR-2, FR-3)

После line 726 (конец ensureClaudeMem) добавить:

```typescript
// Post-install validation
const validation = {
  worker: await isWorkerRunning(),
  chroma: await isChromaRunning(),
  mcpBinary: await fs.pathExists(mcpServerPath),
};

if (!validation.worker) {
  console.log(chalk.yellow('  ⚠ Worker not responding on port 37777'));
  installLog?.warn('Post-install: worker health check failed');
}
if (!validation.chroma) {
  console.log(chalk.gray('  ℹ Chroma not running (basic memory works, semantic search unavailable)'));
  installLog?.info('Post-install: chroma not running (degraded mode)');
}

return validation;
```

Для FR-3: каждый catch в memory.ts (lines 258, 318, 340, 354, 475, 630) — добавить `installLog.warn()` с контекстом. Передавать logger как параметр в ensureClaudeMem.

### 3. src/installer/report.ts — per-component statuses (FR-4)

Расширить InstallReport:

```typescript
// claude-mem report entries:
report.add({ component: 'claude-mem/worker', status: validation.worker ? 'ok' : 'fail' });
report.add({ component: 'claude-mem/chroma', status: validation.chroma ? 'ok' : 'warn', message: 'degraded mode' });
report.add({ component: 'claude-mem/mcp', status: validation.mcpBinary ? 'ok' : 'fail' });
report.add({ component: 'claude-mem/hooks', status: healthHooksInstalled ? 'ok' : 'fail' });
```

### 4. src/installer/memory.ts — graceful degradation (FR-5)

Текущий код уже не блокирует на chroma failure (non-blocking catch). Нужно:
- Когда worker fail → НЕ регистрировать MCP (line 724 — добавить guard)
- Когда chroma fail → worker стартует, but log degraded mode

```typescript
// Before MCP registration
if (!await isWorkerRunning()) {
  console.log(chalk.red('  ✗ Worker not running — skipping MCP registration'));
  installLog?.error('Worker not running, MCP registration skipped');
  return { worker: false, chroma: false, mcpBinary: false };
}
await registerClaudeMemMcp();
```

### 5. Тесты (FR-7)

В `tests/e2e/claude-installer.test.ts` describe `CORE003-Claude-mem`:
- Тест: health hooks registered в settings.json (новый)
- Тест: install report содержит per-component статусы (новый)
- Усилить существующие: worker-service.cjs size > 1000 (уже сделано), MCP markers (уже сделано)

## Reuse

| Что | Откуда | Зачем |
|-----|--------|-------|
| `isWorkerRunning()` | `src/installer/memory.ts:88` | Post-install validation |
| `isChromaRunning()` | `src/installer/memory.ts:113` | Post-install validation |
| `installClaude()` | `src/installer/claude.ts` | Auto-install health extension |
| `InstallReport` | `src/installer/report.ts` | Per-component statuses |
| `formatErrorChain` | `src/utils/logger.ts` | Error logging |

## BDD Test Infrastructure

**Classification:** TEST_DATA_NONE
**Evidence:** Тесты через runInstaller() в Docker. Нет внешних API, нет persistent state между тестами.
**Verdict:** Hooks/fixtures не требуются.
