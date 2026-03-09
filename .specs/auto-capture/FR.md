# Functional Requirements (FR)

## FR-1: Capture Hook Script @feature1

Скрипт `.dev-pomogator/tools/learnings-capture/capture.ts` принимает JSON с hook input через stdin, анализирует текст на T1-T6 паттерны, записывает найденные сигналы в `.dev-pomogator/learnings-queue.json`.

Скрипт вызывается двумя hook events:
- **UserPromptSubmit** (Claude) / **beforeSubmitPrompt** (Cursor) — анализ промпта пользователя
- **Stop** (обе платформы) — анализ transcript сессии

**Связанные AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1-capture-hook-script)
**Use Case:** [UC-1](USE_CASES.md#uc-1-автозахват-коррекции-пользователя-happy-path), [UC-2](USE_CASES.md#uc-2-захват-при-завершении-сессии)

## FR-1a: Regex-based Detection @feature1a

Regex-паттерны для высококонфидентных сигналов. Применяются к prompt (UserPromptSubmit) и к отдельным сообщениям transcript (Stop).

**T2 (User Correction):**
- EN: `no,?\s*use`, `don't use`, `actually[,.]`, `I meant`, `use\s+\w+\s+not\s+\w+`, `instead of`
- RU: `нет,?\s*(делай|используй)`, `не так`, `на самом деле`, `используй\s+\w+\s+а?\s*не\s+\w+`

**T3 (Repeated Confusion):**
- EN: `again`, `same issue`, `same problem`, `still not`, `keeps happening`
- RU: `опять`, `снова`, `та же (проблема|ошибка)`, `до сих пор`

**T6 (Workaround Applied):**
- EN: `workaround`, `hack`, `temporary fix`, `for now`
- RU: `костыль`, `обход`, `обходное`, `пока что`, `временно`

**Explicit markers (any trigger):**
- `remember:`, `запомни:`, `always `, `never `, `всегда `, `никогда `

**Confidence scoring:** каждый regex имеет base confidence (0.6-0.9). При совпадении 2+ паттернов одного trigger type confidence = min(max_confidence, sum * 0.9).

**Approval Patterns (confidence booster, NOT new entry):**

Approval не создаёт новый entry. Вместо этого бустит confidence существующих pending entries, если контекст пересекается.

- EN: `perfect`, `exactly`, `correct`, `works?\s*(perfectly|great|well)`, `good\s+(job|work)`, `that's\s+(what I (needed|wanted))`
- RU: `отлично`, `идеально`, `правильно`, `именно\s+(так|это)`, `то что\s+(нужно|надо)`

**Boost algorithm:**
1. Detect approval pattern → extract context keywords
2. Search pending entries: keyword overlap with signal/context
3. For each matching entry: `confidence = min(confidence + 0.15, 1.0)`
4. If no matching pending entry → skip (approval alone is not a signal)

> Источник: claude-reflect-system MEDIUM confidence approvals (0.65)

**Связанные AC:** [AC-1a](ACCEPTANCE_CRITERIA.md#ac-1a-fr-1a-regex-based-detection)

## FR-1b: AI-powered Semantic Detection @feature1b

Для Stop hook: передача последних N сообщений (N=20) transcript в LLM (Haiku) для семантического анализа T1-T6 с structured JSON output.

**LLM prompt template:**
Analyze the conversation transcript and identify learning signals:
- T1: New utility/helper/pattern created
- T2: User corrected the AI's approach
- T3: Same topic caused confusion 2+ times
- T4: AI violated an existing rule
- T5: Undocumented convention discovered via code reading
- T6: Workaround applied due to missing documentation

**Output format:**
```json
{
  "signals": [
    { "trigger": "T2", "signal": "...", "context": "...", "confidence": 0.85 }
  ]
}
```

**Self-evaluation gates (inspired by Claudeception):**
В LLM prompt добавляются 3 дополнительных вопроса:
- Was non-trivial investigation required (>10 min estimated effort)?
- Was something non-obvious from documentation discovered?
- Would this knowledge help in future similar situations?

Если хотя бы один ответ YES и нет T1-T6 match → создать entry с trigger=T5 (Convention Discovered), confidence=0.7.

> Источник: Claudeception self-evaluation gates (3 binary questions after each task)

**Fallback:** если LLM недоступен (timeout, error, env var не задан) → regex-only analysis transcript.

**Config:** `LEARNINGS_SEMANTIC_ENABLED=true|false` (default: true). При false — только regex.

**Связанные AC:** [AC-1b](ACCEPTANCE_CRITERIA.md#ac-1b-fr-1b-ai-powered-semantic-detection)

## FR-2: Queue Schema @feature2

JSON-файл `.dev-pomogator/learnings-queue.json` со следующей схемой:

```json
{
  "version": 1,
  "entries": [
    {
      "id": "uuid-v4",
      "timestamp": "2026-03-08T12:30:00.000Z",
      "sessionId": "conversation_id_from_hook",
      "trigger": "T1|T2|T3|T4|T5|T6",
      "signal": "краткое описание (< 100 chars)",
      "context": "цитата или контекст (< 200 chars)",
      "confidence": 0.85,
      "source": "UserPromptSubmit|Stop",
      "platform": "claude|cursor",
      "status": "pending|consumed|rejected",
      "consumedBy": null,
      "consumedAt": null
    }
  ]
}
```

**Cross-session deduplication fields (inspired by claude-reflect-system):**

```json
{
  "fingerprint": "a1b2c3d4e5f6g7h8",
  "count": 3,
  "lastSeen": "2026-03-08T15:00:00.000Z"
}
```

- `fingerprint`: SHA-256(lowercase + collapse_whitespace(signal))[:16]
- `count`: количество раз, когда этот сигнал захвачен (across sessions). Default: 1
- `lastSeen`: ISO8601 последнего обнаружения (может отличаться от timestamp первого)

> Источник: claude-reflect-system SHA-256 fingerprinting + count tracking

**Invariants:**
- `signal` truncated до 100 символов
- `context` truncated до 200 символов (без полных промптов — privacy)
- `confidence` ∈ [0.0, 1.0]
- `trigger` ∈ {T1, T2, T3, T4, T5, T6}
- `status` ∈ {pending, consumed, rejected}
- `fingerprint`: 16 hex characters (SHA-256[:16])
- `count` ≥ 1

**Связанные AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2-queue-schema)

## FR-3: Atomic Queue Operations @feature3

Queue файл записывается атомарно для предотвращения corruption при concurrent access (несколько hooks могут сработать одновременно).

**Write protocol:**
1. Acquire file lock: `writeFile(lockFile, pid, { flag: 'wx' })`
2. Read existing queue (или создать default)
3. Append new entries
4. Write to temp file: `writeJson(queue.json.tmp, data)`
5. Atomic move: `move(queue.json.tmp, queue.json, { overwrite: true })`
6. Release lock: `unlink(lockFile)`

**Fingerprint-based deduplication (inspired by claude-reflect-system):**

При appendEntries(), ПЕРЕД вставкой нового entry:
1. Вычислить fingerprint для нового entry
2. Проверить existing entries: `entries.find(e => e.fingerprint === newFingerprint && e.status === 'pending')`
3. Если найден:
   - `existing.count++`
   - `existing.lastSeen = new Date().toISOString()`
   - `existing.confidence = Math.max(existing.confidence, newEntry.confidence)`
   - НЕ создавать новый entry
4. Если не найден → вставить новый entry с `count: 1`

> Источник: claude-reflect-system learning_ledger.py fingerprint dedup

**Stale lock recovery:** если lock file старше 60 секунд → удалить + retry.

**Queue file recovery:** если JSON parse fails → backup corrupted file → create new.

**Связанные AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3-atomic-queue-operations)
**Use Case:** [UC-1](USE_CASES.md#uc-1-автозахват-коррекции-пользователя-happy-path)

## FR-4: /suggest-rules Phase -1.5 Integration @feature4

Новая Phase -1.5 (Queue Context) в suggest-rules pipeline, между Phase -1 (Memory Context) и Phase -0.5 (Insights Context).

**Алгоритм:**
1. Check: `.dev-pomogator/learnings-queue.json` exists?
2. Read queue, filter entries с `status === "pending"`
3. Для каждого pending entry → создать pre-candidate:
   - Тип определяется по trigger (T2 → antipattern/gotcha, T6 → gotcha, T3 → pattern/gotcha, T1 → pattern, T4 → pattern refinement, T5 → pattern)
   - Источник: `📥 queue`
   - Confidence: из entry
4. Output summary: `📥 Queue: N pending entries (breakdown by trigger type)`
5. Pre-candidates передаются в Phase 1 для enrichment
6. После Phase 5 (file creation): update consumed entries

**Description optimization (inspired by Claudeception):**
При создании skill из queue-sourced candidate, pre-candidate должен содержать `descriptionHint`:
- Exact error message/symptom (если есть в context)
- Technology stack
- Trigger conditions (когда skill полезен)

Phase 4 suggest-rules использует hint для генерации retrieval-optimized description.

> Источник: Claudeception description-optimized retrieval

**Scoring bonuses for cross-session evidence (inspired by claude-reflect-system):**

Phase -1.5 применяет scoring bonuses к pre-candidates на основе count:
- `ACCUMULATED_EVIDENCE` (+15): queue-sourced candidate (любой entry из queue)
- `CROSS_SESSION_REPEAT` (+20): entry с `count >= 3` (сигнал повторялся в 3+ сессиях)

Бонусы суммируются и добавляются к Phase 1.5 scoring formula.

Phase -1.5 output включает count: `📥 Queue: 5 pending (1×T2 seen 4 times, 2×T6, 1×T3 seen 2 times, 1×T2)`

> Источник: claude-reflect-system count-based promotion + session-reflect plan

**Если queue пуст или не существует:**
```
📥 Queue: пуст (сигналы появятся автоматически при работе)
```

**Связанные AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4-suggest-rules-phase--15-integration)
**Use Case:** [UC-3](USE_CASES.md#uc-3-suggest-rules-потребляет-очередь)

## FR-5: Auto-Dedupe in Phase 2.5 @feature3

Расширение Phase 2.5 (Duplicate Check) suggest-rules для queue-based candidates.

**Алгоритм:**
1. Для каждого queue-based кандидата:
   a. Извлечь ключевые слова из `signal` и `context`
   b. Grep `.claude/rules/**/*.md` на совпадение ключевых слов
   c. Если найден файл → Read и оценить overlap:
      - >80% → DUP: пометить queue entry status=consumed, consumedBy="DUP:{rule-path}"
      - 30-80% → MERGE: показать кандидата с пометкой "🔀 MERGE with {rule-path}"
      - <30% → NEW: обычный кандидат

2. Dedupe decisions логируются в Phase 3 output

**Связанные AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5-auto-dedupe-in-phase-25-feature3)
**Use Case:** [UC-5](USE_CASES.md#uc-5-auto-dedupe-при-suggest-rules)

## FR-6: /reflect Command @feature2

Команда `/reflect` для быстрого просмотра и управления очередью сигналов.

**Вывод:**
```
📥 Learnings Queue — {project-name}

| # | Trigger | Signal | Confidence | Age | Status |
|---|---------|--------|------------|-----|--------|
| 1 | T2 | use bun not npm | 0.9 | 2h | pending |
| 2 | T6 | workaround for CRLF | 0.7 | 1d | pending |
| 3 | T3 | repeated confusion about paths | 0.8 | 3d | consumed |

📊 Stats: 5 total, 3 pending, 1 consumed, 1 rejected

💡 Actions:
- reject N — пометить entry N как rejected
- clear — удалить consumed/rejected entries
- stats — подробная статистика
- 0 — выход
```

**Связанные AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6-reflect-command)
**Use Case:** [UC-4](USE_CASES.md#uc-4-reflect--быстрый-просмотр-очереди)

## FR-7: Auto-Dedupe Rules in Phase 6 @feature3

Автоматическая семантическая дедупликация существующих rules в `.claude/rules/` как часть /suggest-rules Phase 6 (Rules Optimization). Не является отдельной командой — запускается исключительно внутри pipeline /suggest-rules.

**Алгоритм (внутри Phase 6 suggest-rules):**
1. Glob `.claude/rules/**/*.md` → прочитать все файлы
2. Для каждой пары файлов → извлечь ключевые слова (заголовки, чеклист пункты, примеры)
3. Оценить semantic overlap:
   - >70% → merge candidate (показать в Phase 6 summary)
   - ≤70% → не дубликат
4. Показать merge candidates в финальном отчёте Phase 6
5. По выбору пользователя (в рамках Phase 6 flow) — мержить файлы

**Запускается автоматически:** после Phase 5 (file creation), как часть Phase 6 (Rules Optimization). Silent — результаты в отчёте.

**Связанные AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7-auto-dedupe-rules-in-phase-6-feature3)

## FR-8: Extension Manifest Update @feature4

Обновить `extensions/suggest-rules/extension.json`:

**Hooks:**
```json
{
  "hooks": {
    "claude": {
      "UserPromptSubmit": "npx tsx .dev-pomogator/tools/learnings-capture/capture.ts --event UserPromptSubmit",
      "Stop": "npx tsx .dev-pomogator/tools/learnings-capture/capture.ts --event Stop"
    },
    "cursor": {
      "beforeSubmitPrompt": "npx tsx .dev-pomogator/tools/learnings-capture/capture.ts --event UserPromptSubmit",
      "stop": "npx tsx .dev-pomogator/tools/learnings-capture/capture.ts --event Stop"
    }
  }
}
```

**toolFiles:** все файлы в `.dev-pomogator/tools/learnings-capture/`

**commands:** добавить `reflect.md` для обеих платформ

**version:** bump minor (1.7.0 → 1.8.0)

**Связанные AC:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8-extension-manifest-update)

## FR-9: Installation Verification @feature4

При запуске `/verify-install` проверять auto-capture компоненты:

**Checks:**
1. `capture.ts` существует в `.dev-pomogator/tools/learnings-capture/`
2. `queue.ts` существует
3. Hooks зарегистрированы: Claude → `.claude/settings.json`, Cursor → `~/.cursor/hooks/hooks.json`
4. Hook command содержит `learnings-capture/capture.ts`
5. Нет конфликта с другими hooks на тех же events

**Output:**
```
✅ auto-capture: capture.ts installed
✅ auto-capture: hooks registered (UserPromptSubmit, Stop)
⚠️ auto-capture: queue.json not yet created (will be created on first capture)
```

**Связанные AC:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9-installation-verification)

## FR-10: Auto-Suggest Threshold @feature5

При UserPromptSubmit hook, ПОСЛЕ записи нового entry, capture.ts проверяет количество pending entries в queue. Если count >= threshold (env var `LEARNINGS_SUGGEST_THRESHOLD`, default 5) → вывести информационное сообщение в stderr.

**Алгоритм:**
1. После appendEntries() → readQueue() → filter pending
2. If pending.length >= threshold AND threshold > 0:
   - stderr: "📥 {N} pending learnings. Run /suggest-rules to process."
3. Не блокирует промпт, не модифицирует stdout

**Config:** `LEARNINGS_SUGGEST_THRESHOLD=5` (default). 0 = disabled.

> Источник идеи: Claudeception auto-activation hook (blader/claudeception)

**Связанные AC:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10-auto-suggest-threshold-feature5)
