# Design — Auto-Capture Layer

## Реализуемые требования

- [FR-1: Capture Hook Script](FR.md#fr-1-capture-hook-script)
- [FR-1a: Regex-based Detection](FR.md#fr-1a-regex-based-detection)
- [FR-1b: AI-powered Semantic Detection](FR.md#fr-1b-ai-powered-semantic-detection)
- [FR-2: Queue Schema](FR.md#fr-2-queue-schema)
- [FR-3: Atomic Queue Operations](FR.md#fr-3-atomic-queue-operations)
- [FR-4: Phase -1.5 Integration](FR.md#fr-4-suggest-rules-phase--15-integration)
- [FR-5: Auto-Dedupe](FR.md#fr-5-auto-dedupe-in-phase-25-feature3)
- [FR-6: /reflect Command](FR.md#fr-6-reflect-command)
- [FR-7: Auto-Dedupe Rules в Phase 6](FR.md#fr-7-auto-dedupe-rules-in-phase-6-feature3)
- [FR-8: Extension Manifest](FR.md#fr-8-extension-manifest-update)
- [FR-9: Installation Verification](FR.md#fr-9-installation-verification)
- [FR-10: Auto-Suggest Threshold](FR.md#fr-10-auto-suggest-threshold-feature5)

## Компоненты

### 1. capture.ts — Hook Entry Point

Единый скрипт для обоих hook events. Определяет event type через `--event` аргумент.

```
capture.ts --event UserPromptSubmit  ← вызывается из UserPromptSubmit hook
capture.ts --event Stop              ← вызывается из Stop hook
```

**Flow:**
```
stdin (JSON) → parse hook input → normalize (Claude/Cursor)
                                      │
                        ┌─────────────┴─────────────┐
                        │                           │
                  UserPromptSubmit               Stop
                        │                           │
                   regex detect               ┌─────┴─────┐
                        │                     │           │
                  ┌─────┴─────┐        has transcript?  no transcript
             entries[]    approval?         │           │
                  │            │      semantic + regex  regex only
                  │      boost pending       │           │
                  │      confidence     entries[]    entries[]
                  │            │             │           │
                  └───┬────────┘─────────────┘───────────┘
                      │
               queue.appendEntries(entries)
               (with fingerprint dedup)
                      │
               check threshold (FR-10)
                      │
         ┌────────────┴────────────┐
      >= threshold              < threshold
         │                         │
   stderr notification          (silent)
         │                         │
         └────────────┬────────────┘
                      │
                 exit 0
```

### 2. queue.ts — Queue Operations Module

Модуль для atomic read/write/lock операций с queue файлом.

**Exports:**
- `readQueue(projectPath): Promise<Queue>` — чтение (returns empty queue if not exists)
- `appendEntries(projectPath, entries: QueueEntry[]): Promise<void>` — atomic append with fingerprint dedup
- `updateEntries(projectPath, updates: Map<string, Partial<QueueEntry>>): Promise<void>` — batch update
- `removeByStatus(projectPath, statuses: string[]): Promise<number>` — cleanup
- `acquireLock(projectPath): Promise<void>` — lock acquisition
- `releaseLock(projectPath): Promise<void>` — lock release
- `generateFingerprint(signal: string): string` — SHA-256[:16] of normalized text (claude-reflect-system)

**Fingerprint dedup logic (appendEntries):**
1. For each new entry: compute `generateFingerprint(entry.signal)`
2. Check existing pending entries for same fingerprint
3. If match: increment `count`, update `lastSeen`, take `Math.max(confidence)` — do NOT insert
4. If no match: insert new entry with `count: 1`

### 3. semantic.ts — AI Semantic Detector

Модуль для LLM-based T1-T6 detection.

**Exports:**
- `detectSignals(messages: Message[]): Promise<Signal[]>` — semantic detection
- `isSemanticEnabled(): boolean` — check env var

**Self-evaluation gates (added):**
LLM prompt дополнен 3 вопросами. Если T1-T6 не найдены, но self-eval = YES → T5 entry.
> Источник: Claudeception self-evaluation gates

**Dependencies:**
- HTTP client для LLM API (reuse pattern из `auto_commit_core.ts`)
- `AUTO_COMMIT_LLM_URL` env var для API endpoint
- `AUTO_COMMIT_API_KEY` env var для auth

### 4. dedupe.ts — Semantic Deduplication

Модуль для keyword-based overlap detection между candidates и existing rules.

**Exports:**
- `checkOverlap(candidate: { signal, context }, rulePath: string): Promise<OverlapResult>`
- `findMergeCandidates(rulesDir: string): Promise<MergeCandidate[]>`

**Overlap algorithm:**
1. Extract keywords: заголовки (## ...), checklist пункты (- [ ]), code blocks
2. Normalized comparison: lowercase, stem, remove stop words
3. Jaccard similarity coefficient
4. Threshold: >0.8 = DUP, 0.3-0.8 = MERGE, <0.3 = NEW

### 5. reflect.md — /reflect Command

Markdown command для обеих платформ (Claude и Cursor).

**Frontmatter:**
```yaml
---
description: "Просмотр очереди захваченных сигналов"
allowed-tools: Read, Write, Glob
argument-hint: "[stats|clear]"
---
```

### 6. Phase -1.5 — suggest-rules Integration

Текстовый блок добавляемый в suggest-rules.md между Phase -1 и Phase -0.5.

## Где лежит реализация

- Hook scripts: `.dev-pomogator/tools/learnings-capture/`
- Queue data: `.dev-pomogator/learnings-queue.json`
- Lock file: `.dev-pomogator/learnings-queue.lock`
- Commands: `extensions/suggest-rules/{claude,cursor}/commands/reflect.md`
- Manifest: `extensions/suggest-rules/extension.json`
- Phase -1.5: `extensions/suggest-rules/{claude,cursor}/commands/suggest-rules.md`

## Директории и файлы

```
.dev-pomogator/tools/learnings-capture/
├── capture.ts          # Hook entry point (FR-1)
├── queue.ts            # Atomic queue operations (FR-2, FR-3)
├── semantic.ts         # LLM-based detection (FR-1b)
├── dedupe.ts           # Semantic deduplication (FR-5, FR-7)
└── types.ts            # Shared TypeScript interfaces

.dev-pomogator/
├── learnings-queue.json    # Queue data (runtime, created on first capture)
└── learnings-queue.lock    # Lock file (runtime, transient)

extensions/suggest-rules/
├── claude/commands/
│   ├── suggest-rules.md    # edit: add Phase -1.5
│   └── reflect.md          # create: /reflect command
├── cursor/commands/
│   ├── suggest-rules.md    # edit: add Phase -1.5
│   └── reflect.md          # create: /reflect command
└── extension.json          # edit: hooks, toolFiles, commands, version
```

## Алгоритм

### Capture Flow (UserPromptSubmit)

1. Read stdin → parse JSON hook input
2. Normalize: extract `prompt` field (Claude: `prompt`, Cursor: same via beforeSubmitPrompt)
3. Run regex patterns against prompt text
4. For each match → create QueueEntry with trigger, signal, context, confidence
5. If entries.length > 0 → queue.appendEntries(entries)
6. Exit 0 (success, no output to user)

### Capture Flow (Stop)

1. Read stdin → parse JSON hook input
2. Check `transcript_path` exists
3. If transcript_path:
   a. Read transcript file (last 20 messages)
   b. If semantic enabled → detectSignals(messages)
   c. Also run regex on each message
   d. Merge results (dedup by signal text)
4. If no transcript_path (Cursor):
   a. Use any available prompt/context from hook input
   b. Regex-only analysis
5. queue.appendEntries(entries)
6. Exit 0

### /suggest-rules Phase -1.5

1. Read queue → filter pending
2. If pending.length === 0 → show "📥 Queue: пуст" → skip to Phase -0.5
3. Group by trigger type → show summary
4. For each entry → create pre-candidate:
   - Map trigger → default artifact type (T2→antipattern/gotcha, T6→gotcha, T3→pattern, etc.)
   - Set source = "📥 queue"
   - Set confidence from entry
5. Pass pre-candidates to Phase 1 for enrichment
6. Track consumed IDs for post-Phase 5 update

### /reflect Flow

1. Read queue
2. If empty → show empty message
3. Sort by timestamp desc
4. Render table
5. Show stats (total, pending, consumed, rejected)
6. Await user action (reject N, clear, stats, 0)
7. Execute action → update queue

### Auto-Dedupe Flow (Phase 2.5)

1. For each queue-based candidate:
   a. Extract keywords from signal + context
   b. Glob `.claude/rules/**/*.md`
   c. For each rule → checkOverlap(candidate, rule)
   d. Best match overlap score determines action:
      - >0.8 → DUP (auto-consume queue entry)
      - 0.3-0.8 → MERGE (show with merge target)
      - <0.3 → NEW

## Hook Input/Output Protocol

### Input (stdin JSON)

**Claude Code UserPromptSubmit:**
```json
{
  "conversation_id": "abc123",
  "workspace_roots": ["/path/to/project"],
  "prompt": "no, use bun instead of npm"
}
```

**Claude Code Stop:**
```json
{
  "conversation_id": "abc123",
  "workspace_roots": ["/path/to/project"],
  "transcript_path": "/path/to/transcript.jsonl"
}
```

**Cursor beforeSubmitPrompt:**
```json
{
  "conversation_id": "abc123",
  "workspace_roots": ["/path/to/project"],
  "prompt": "no, use bun instead of npm"
}
```

### Output (stdout JSON)

capture.ts does NOT produce stdout output — silent operation.
Errors logged to stderr only.
Exit code always 0 (hook failure must not block user).

## TypeScript Interfaces

```typescript
interface QueueEntry {
  id: string;           // uuid-v4
  timestamp: string;    // ISO8601
  sessionId: string;    // conversation_id
  trigger: 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6';
  signal: string;       // max 100 chars
  context: string;      // max 200 chars
  confidence: number;   // 0.0 - 1.0
  source: 'UserPromptSubmit' | 'Stop';
  platform: 'claude' | 'cursor';
  status: 'pending' | 'consumed' | 'rejected';
  consumedBy: string | null;
  consumedAt: string | null;
  fingerprint: string;    // SHA-256[:16] of normalized signal (claude-reflect-system)
  count: number;          // cross-session occurrence count, default: 1 (claude-reflect-system)
  lastSeen: string;       // ISO8601 of last detection (claude-reflect-system)
}

interface Queue {
  version: 1;
  entries: QueueEntry[];
}

interface Signal {
  trigger: QueueEntry['trigger'];
  signal: string;
  context: string;
  confidence: number;
}

interface PreCandidate {
  signal: string;
  context: string;
  trigger: QueueEntry['trigger'];
  confidence: number;
  source: string;
  descriptionHint?: string;  // retrieval-optimized description hint (Claudeception)
}

interface OverlapResult {
  score: number;        // 0.0 - 1.0
  action: 'DUP' | 'MERGE' | 'NEW';
  matchedRule: string;  // path to matching rule
  keywords: string[];   // matched keywords
}
```

## BDD Testability

32 BDD сценария классифицированы по testability:

| Category | Count | Tag | Description |
|----------|-------|-----|-------------|
| Testable (code) | 18 | — | Вызов capture.ts/queue.ts с JSON stdin, проверка queue файла |
| Testable (LLM) | 3 | — | Требуют `AUTO_COMMIT_LLM_URL` в Docker env |
| Agent-behavior | 11 | `@agent-behavior` | Описывают поведение AI-агента (prompt инструкции), не вызываемый код |

### @agent-behavior сценарии (документация, не E2E тест)

| # | Сценарий | @featureN | Причина |
|---|----------|-----------|---------|
| 12 | Phase -1.5 consumes pending queue entries | @feature4 | prompt инструкция |
| 13 | Phase -1.5 skips when queue is empty | @feature4 | prompt инструкция |
| 14 | Auto-dedupe marks DUP for matching existing rule | @feature3 | Phase 2.5 = prompt |
| 15 | Auto-dedupe shows MERGE for partial overlap | @feature3 | Phase 2.5 = prompt |
| 16 | /reflect shows queue table | @feature2 | /reflect = markdown cmd |
| 17 | /reflect reject marks entry as rejected | @feature2 | /reflect = markdown cmd |
| 18 | /reflect shows empty queue message | @feature2 | /reflect = markdown cmd |
| 19 | Auto-dedupe in Phase 6 identifies similar rules | @feature3 | Phase 6 = prompt |
| 20 | Auto-dedupe in Phase 6 reports no duplicates | @feature3 | Phase 6 = prompt |
| 27 | Queue-sourced candidate has description hint | @feature4 | Phase -1.5 = prompt |
| 32 | Phase -1.5 applies scoring bonus for repeated signal | @feature4 | Phase -1.5 = prompt |

Phase -1.5, Phase 2.5, Phase 6, /reflect — это markdown prompt-ы для AI агента. Их нельзя вызвать как функции и протестировать E2E. BDD сценарии с тегом `@agent-behavior` служат документацией ожидаемого поведения, а не основой для Vitest тестов.

## BDD Test Infrastructure

**Classification:** TEST_DATA_ACTIVE

**Evidence:** capture.ts creates/modifies `.dev-pomogator/learnings-queue.json` through hooks; tests require pre-created queue fixtures and cleanup after queue write tests.

**Verdict:** Hooks and fixtures required for queue setup/cleanup.

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|-------------------------|
| `tests/e2e/hook.ts` | BeforeAll/AfterAll | global | Docker Compose up/down | Да — test lifecycle |
| `tests/setup/ensure-docker.ts` | BeforeAll | global | Verify Docker environment | Да — env check |

### Новые hooks (если нужны)

| Hook файл | Тип | Тег/Scope | Что делает | По аналогии с |
|-----------|-----|-----------|------------|---------------|
| `tests/e2e/fixtures/queue-setup.ts` | BeforeEach | per-test | Create/seed learnings-queue.json | `tests/e2e/helpers.ts` setupCleanState |
| `tests/e2e/fixtures/queue-cleanup.ts` | AfterEach | per-test | Remove learnings-queue.json + .lock | `tests/e2e/helpers.ts` cleanup |

### Cleanup Strategy

1. AfterEach: remove `.dev-pomogator/learnings-queue.json`
2. AfterEach: remove `.dev-pomogator/learnings-queue.lock`
3. AfterEach: remove `.dev-pomogator/learnings-queue.json.tmp`
4. AfterEach: remove `.dev-pomogator/learnings-queue.json.bak`

No cascading dependencies — queue is a standalone file.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| empty-queue.json | `tests/fixtures/learnings-capture/empty-queue.json` | Queue v1 with 0 entries | shared |
| populated-queue.json | `tests/fixtures/learnings-capture/populated-queue.json` | Queue v1 with 5 entries (mixed status) | shared |
| corrupted-queue.json | `tests/fixtures/learnings-capture/corrupted-queue.json` | Invalid JSON for recovery test | shared |
| hook-input-correction.json | `tests/fixtures/learnings-capture/hook-input-correction.json` | UserPromptSubmit with T2 pattern | shared |
| hook-input-stop.json | `tests/fixtures/learnings-capture/hook-input-stop.json` | Stop with transcript_path | shared |
| sample-transcript.jsonl | `tests/fixtures/learnings-capture/sample-transcript.jsonl` | Transcript with T2, T3, T6 signals | shared |
| existing-rule.md | `tests/fixtures/learnings-capture/existing-rule.md` | Rule file for dedupe overlap test | shared |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| queuePath | string | beforeEach setup | capture.ts, reflect tests | Path to test queue file |
| projectPath | string | beforeEach setup | all tests | Path to test project root |
