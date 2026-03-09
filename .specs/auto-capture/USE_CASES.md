# Use Cases — Auto-Capture Layer

## UC-1: Автозахват коррекции пользователя (happy path) @feature1

Пользователь работает в Claude Code и корректирует подход агента.

1. Пользователь пишет промпт "нет, используй bun а не npm"
2. UserPromptSubmit hook перехватывает промпт
3. capture.ts анализирует текст regex-паттернами
4. Находит совпадение с T2 (User Correction): `нет, используй`
5. Формирует entry: trigger=T2, signal="use bun not npm", confidence=0.9
6. Атомарно записывает в `.dev-pomogator/learnings-queue.json`
7. Hook завершается за < 500ms, пользователь не замечает задержки

**Edge cases:**
- Промпт не содержит паттернов → ничего не записывается
- Queue файл не существует → создаётся с version=1
- Queue файл повреждён → backup + новый файл

## UC-2: Захват при завершении сессии @feature1

Сессия завершается, Stop hook анализирует transcript.

1. Claude Code вызывает Stop hook с `transcript_path`
2. capture.ts читает transcript (последние N сообщений)
3. Вызывает LLM (Haiku) для семантического анализа T1-T6
4. LLM возвращает structured output: 3 workaround-а (T6), 1 repeated confusion (T3)
5. Для каждого — формирует entry и записывает в queue
6. Hook завершается за < 10s

**Edge cases:**
- transcript_path отсутствует (Cursor) → fallback на regex analysis промпта
- LLM недоступен → fallback на regex без семантики
- Transcript пустой → ничего не записывается

## UC-3: /suggest-rules потребляет очередь @feature3

Пользователь запускает `/suggest-rules` после нескольких сессий.

1. Phase -1.5 (Queue Context) читает `.dev-pomogator/learnings-queue.json`
2. Фильтрует entries со status=pending (5 entries)
3. Pre-classify каждый entry по trigger type → pre-candidates с источником `📥 queue`
4. Показывает summary: `📥 Queue: 5 pending entries (2×T2, 2×T6, 1×T3)`
5. Pre-candidates обогащают Phase 1 (Session Analysis)
6. Phase 2.5 дедуплицирует queue candidates с existing rules
7. После Phase 5 (file creation): потреблённые entries → status=consumed

**Edge cases:**
- Queue пуст → Phase -1.5 пропускается, `📥 Queue: пуст`
- Queue файл не существует → Phase -1.5 пропускается
- Все entries уже consumed → `📥 Queue: нет pending entries`

## UC-4: /reflect — быстрый просмотр очереди @feature2

Пользователь хочет видеть что накопилось без полного анализа.

1. Пользователь запускает `/reflect`
2. Команда читает queue, фильтрует pending entries
3. Выводит таблицу: #, Trigger, Signal, Confidence, Age, Status
4. Показывает stats: total, pending, consumed, rejected
5. Предлагает actions: reject N (пометить rejected), clear (удалить consumed)

**Edge cases:**
- Queue пуст → "Очередь пуста. Сигналы появятся при работе с агентом."
- Все entries consumed → показывает consumed + предлагает clear

## UC-5: Auto-dedupe при /suggest-rules @feature3

Queue entry совпадает с existing rule.

1. Phase 2.5 берёт queue candidate "use bun not npm" (T2)
2. Grep `.claude/rules/` на ключевые слова: "bun", "npm", "package manager"
3. Находит `package-manager-bun.md` с >80% overlap
4. Помечает queue entry status=consumed, consumedBy="DUP:package-manager-bun.md"
5. Candidate не предлагается пользователю
6. В Phase 3 output: "📥 1 queue entry auto-deduped (DUP)"

**Edge cases:**
- Partial overlap (30-80%) → MERGE candidate, показывается пользователю
- No overlap → NEW candidate
- Existing rule deleted после capture → NEW candidate

## UC-7: Auto-Suggest Notification @feature5

Пользователь работает несколько сессий подряд. Auto-capture накапливает сигналы.

1. capture.ts обработал 5-й pending entry (threshold default=5)
2. При следующем UserPromptSubmit hook проверяет queue count
3. Выводит в stderr: "📥 5 pending learnings. Run /suggest-rules to process."
4. Пользователь видит подсказку и решает запустить
5. Hook НЕ блокирует промпт, уведомление информационное

**Edge cases:**
- Threshold не достигнут → тишина
- Queue не существует → тишина
- Пользователь уже запустил /suggest-rules → consumed entries не считаются
- Env var LEARNINGS_SUGGEST_THRESHOLD=0 → уведомления выключены

> Источник идеи: Claudeception "MANDATORY SKILL EVALUATION REQUIRED" injection

## UC-8: Approval Boosts Pending Signal @feature6

Пользователь ранее сказал "нет, используй vitest". Позже в другой сессии Claude использует vitest, пользователь пишет "perfect, exactly what I needed".

1. UserPromptSubmit hook получает "perfect, exactly what I needed"
2. capture.ts детектит approval pattern (MEDIUM)
3. capture.ts ищет pending entries с пересечением по ключевым словам текущего контекста
4. Находит entry "use vitest not jest" (T2, confidence 0.85)
5. Confidence бустится: 0.85 + 0.15 = 1.0 (cap)
6. Entry НЕ создаётся (approval — не самостоятельный сигнал), но existing entry усиливается

**Edge cases:**
- Approval без matching pending entry → игнорируется (не создаёт новый entry)
- Approval матчит несколько entries → бустит все с overlap
- Approval после consumed entry → игнорируется
- Approval pattern + correction pattern в одном prompt → correction создаёт entry, approval бустит другие

> Источник идеи: claude-reflect-system MEDIUM confidence approvals

## UC-6: Cursor fallback @feature4

Пользователь работает в Cursor, где ограниченные hook events.

1. Cursor вызывает beforeSubmitPrompt hook с промптом
2. capture.ts анализирует regex-паттернами (без transcript analysis)
3. При stop event: нет transcript_path → только regex на prompt summary
4. Записи в ту же очередь `.dev-pomogator/learnings-queue.json`

**Edge cases:**
- Cursor не передаёт все поля JSON → graceful handling с default values
- Cursor hooks format отличается от Claude → capture.ts нормализует input
