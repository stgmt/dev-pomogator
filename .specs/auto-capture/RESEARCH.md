# Research — Auto-Capture Layer

## Контекст

Исследование механизмов автоматического захвата сигналов обучения в AI-assisted IDE. Анализ существующего решения claude-reflect (BayramAnnakov) и проектирование интеграции auto-capture layer в suggest-rules extension dev-pomogator.

## Источники

- **claude-reflect** (BayramAnnakov): GitHub репозиторий — двухстадийная система capture + reflect
- **suggest-rules** (dev-pomogator): `extensions/suggest-rules/claude/commands/suggest-rules.md` — текущий pipeline
- **Claude Code Hooks API**: документация по PreToolUse, PostToolUse, Stop, UserPromptSubmit, SessionStart events
- **Existing hooks**: `auto-commit`, `claude-mem-health`, `specs-validator`, `phase-gate`

## Технические находки

### claude-reflect: архитектура захвата

**Stage 1 — автоматический захват** через Python hooks:
- `capture_learning.py` — hook на коррекции пользователя
- `extract_tool_errors.py` — отдельный скрипт для tool errors
- `extract_tool_rejections.py` — отдельный скрипт для tool rejections
- `semantic_detector.py` — AI-powered альтернатива regex

**Высококонфидентные сигналы:**
- Tool rejections (пользователь остановил действие с объяснением)
- "no, use X" / "don't use Y"
- "actually..." / "I meant..."
- "use X not Y"
- Явный маркер "remember:"

**Stage 2 — ручная обработка** через /reflect:
- Просмотр очереди `~/.claude/learnings-queue.json`
- Destination routing: ~/.claude/CLAUDE.md (global), ./CLAUDE.md (project), commands/*.md (skills)
- /reflect --dedupe: семантический мёрж похожих записей

**Ограничение:** Claude Code удаляет локальные сессии через 30 дней → ломает --scan-history.

### suggest-rules: текущий pipeline

**Single-pass ретроспектива** (7 фаз):
- Phase -1: Memory Context (MCP search)
- Phase -0.5: Insights Context (deep-insights skill)
- Phase 0: Rules tree
- Phase 0.5: Domain detection
- Phase 1: Session Analysis (T1-T6 сигналы)
- Phase 1.5: Abstraction + Decision Tree (rule/skill/hook)
- Phase 2-6: Ranking, Dedup, Generation, Optimization

**Нет queue/capture**: все сигналы извлекаются из текущей сессии в момент вызова /suggest-rules.

**Self-improving rule** (`self-improving.md`): замечает T2/T3/T4/T6 в реальном времени, выводит `💡 Заметка:` но НЕ сохраняет сигнал.

### Hook input/output protocol

**Input (stdin JSON):**
```json
{
  "conversation_id": "string",
  "generation_id": "string (optional)",
  "model": "string (optional)",
  "workspace_roots": ["string"],
  "transcript_path": "string (optional, Claude Code only)",
  "prompt": "string (UserPromptSubmit only)",
  "status": "string (optional)"
}
```

**Output (stdout JSON):**
- Stop: `{ "followup_message": "optional string" }`
- UserPromptSubmit: warnings/validation
- Generic: `{ "continue": true, "suppressOutput": true }`

### Cursor vs Claude Code hooks

| Feature | Claude Code | Cursor |
|---------|------------|--------|
| UserPromptSubmit | ✅ с prompt | ✅ beforeSubmitPrompt |
| Stop | ✅ с transcript_path | ✅ stop (без transcript_path) |
| PreToolUse | ✅ с matcher | ❌ не поддерживается |
| SessionStart | ✅ | ❌ не поддерживается |
| transcript_path | ✅ | ❌ |
| prompt в input | ✅ | ✅ (beforeSubmitPrompt) |

### Regex vs Semantic detection trade-offs

| Approach | Latency | Cost | Accuracy | False Positives |
|----------|---------|------|----------|-----------------|
| Regex only | < 50ms | $0 | ~70% T2/T6, ~40% T1/T3/T4/T5 | Medium |
| Semantic (Haiku) | 2-5s | ~$0.001/call | ~90% all T1-T6 | Low |
| Hybrid (regex for prompt, semantic for transcript) | Prompt: 50ms, Stop: 5s | ~$0.001/session | Best of both | Low |

**Рекомендация:** Hybrid approach — regex для UserPromptSubmit (latency-critical), semantic для Stop (можно подождать).

### Atomic file operations patterns

Из существующих правил:
- `atomic-config-save.md`: temp file → atomic move
- `atomic-update-lock.md`: flag 'wx' для file lock

Из `auto_commit_core.ts`: fs-extra writeJson + move pattern.

## Где лежит реализация

- Hooks installer: `src/installer/claude.ts` → `installExtensionHooks()`
- Portable commands: `src/installer/shared.ts` → `makePortableTsxCommand()`
- Hook examples: `.dev-pomogator/tools/auto-commit/`, `.dev-pomogator/tools/specs-validator/`
- Extension config: `extensions/suggest-rules/extension.json`
- suggest-rules command: `extensions/suggest-rules/claude/commands/suggest-rules.md`
- self-improving rule: `extensions/suggest-rules/claude/rules/self-improving.md`
- Rules optimizer: `extensions/suggest-rules/skills/rules-optimizer/scripts/`

## Выводы

1. **Hybrid capture** (regex prompt + semantic transcript) — оптимальный баланс latency/accuracy
2. **Per-project queue** в `.dev-pomogator/learnings-queue.json` — уже в .gitignore, атомарные операции
3. **Phase -1.5** в suggest-rules — между Memory и Insights, минимально инвазивная интеграция
4. **Auto-dedupe** встраивается в существующий Phase 2.5 (Smart Merge)
5. **Cursor fallback** — regex-only на prompt, без transcript analysis
6. Существующая инфраструктура hooks полностью подходит — portable commands, smart merge, managed tracking

## Claudeception Comparative Analysis

**Source:** https://github.com/blader/claudeception (2k stars, 187 forks)

### Заимствованные идеи

| Идея | Claudeception реализация | Наша адаптация |
|------|--------------------------|----------------|
| Auto-suggest threshold | Hook инджектит evaluation prompt в каждый промпт | FR-10: notification при N pending entries |
| Self-evaluation gates | 3 binary questions (non-trivial? reusable? non-obvious?) | FR-1b расширение: self-eval в LLM prompt |
| Description optimization | Skill description оптимизирован для semantic retrieval | FR-4 расширение: retrieval-optimized description |
| Web research | WebSearch/WebFetch в allowed-tools | Future: добавить в suggest-rules Phase 4 |
| Zero-friction setup | 1 файл SKILL.md + 1 bash hook | NFR-U7: capture.ts standalone без MCP |

### Что у нас лучше (не заимствуется)

- 3 типа артефактов (rules + skills + hooks) vs только skills
- Cross-session analytics (deep-insights)
- Category-specific scoring (6 формул)
- Smart deduplication (cross-type + merge strategies)
- Team distribution (installer + updater)

## claude-reflect-system Comparative Analysis

**Source:** https://github.com/haddock-development/claude-reflect-system

### Архитектура

- **Store**: SQLite (`~/.claude/reflect/learnings.db`) — cross-repo persistence
- **Detection**: Regex (EN/DE) + Semantic (claude CLI, multi-language)
- **Dedup**: SHA-256 fingerprinting (normalized content → 16-char hash)
- **Signals**: 3 уровня — HIGH (corrections, 0.85), MEDIUM (approvals, 0.65), LOW (observations, 0.45)
- **Auto-trigger**: Stop hook → background process, no /reflect needed
- **Backups**: Timestamped `SKILL_YYYYMMDD_HHMMSS.md` + 30-day auto-cleanup
- **Promotion**: repo_ids tracking → promote to global at threshold=2 repos

### Заимствованные идеи

| Идея | claude-reflect реализация | Наша адаптация |
|------|--------------------------|----------------|
| Approval signals | MEDIUM confidence regex: "perfect", "exactly", "works well" | FR-1a: approval_boost для existing pending entries |
| Fingerprint dedup | SHA-256(normalized)[:16] → count++ | FR-2/FR-3: fingerprint + count в QueueEntry |
| Cross-session scoring | count field influences promotion | FR-4: ACCUMULATED_EVIDENCE (+15), CROSS_SESSION_REPEAT (+20) |
| Diff-style output | "✗ Don't / ✓ Do" sections | Future: Phase 5 rule format enhancement |
| Rule backup | Timestamped .backups/ | NFR-R8: backup before Phase 6 merge |
| Cross-project promotion | repo_ids + threshold=2 | Future: claude-mem already covers partially |

### Что у нас лучше (не заимствуется)

- TypeScript (не Python) — единая экосистема с dev-pomogator
- JSON queue (не SQLite) — проще, не тянет binary зависимость, portable
- 3 типа артефактов (rules + skills + hooks) vs только skills
- Category-specific scoring (6 формул в suggest-rules)
- Per-project queue (в .gitignore) vs global SQLite
- Installer + updater — team distribution

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Конфиги через temp+move | Queue write | FR-3 |
| atomic-update-lock | `.claude/rules/atomic-update-lock.md` | Lock через flag 'wx' | Concurrent queue access | FR-3 |
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json = source of truth | Manifest update | FR-8 |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Tools+hooks синхронизация | Hook installation | FR-8, FR-9 |
| docker-only-tests | `.claude/rules/docker-only-tests.md` | Тесты только через Docker | BDD/E2E тесты | Testing |
| self-improving | `.claude/rules/pomogator/self-improving.md` | Real-time T2/T3/T4/T6 hints | Дополняется capture | FR-1 |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| specs-validator hook | `.dev-pomogator/tools/specs-validator/validate-specs.ts` | UserPromptSubmit hook pattern | Reuse для capture.ts |
| auto-commit hook | `.dev-pomogator/tools/auto-commit/auto_commit_core.ts` | LLM call + transcript reading | Reuse для semantic.ts |
| claude-mem-health hook | `.dev-pomogator/tools/claude-mem-health/health-check.ts` | SessionStart hook pattern | Reference |
| phase-gate hook | `.dev-pomogator/tools/specs-validator/phase-gate.ts` | PreToolUse matcher pattern | Reference |
| rules-optimizer | `extensions/suggest-rules/skills/rules-optimizer/scripts/audit.ts` | Rule audit/comparison | Reuse для dedupe.ts |
| suggest-rules command | `extensions/suggest-rules/claude/commands/suggest-rules.md` | Full pipeline (Phase -1..6) | Integration target |
| deep-insights skill | `extensions/suggest-rules/skills/deep-insights/SKILL.md` | Cross-session analysis | Phase -0.5 parallel |

### Architectural Constraints Summary

1. **Hooks installer** уже поддерживает multi-event hooks с matchers — capture hooks добавляются через extension.json без изменений installer кода.
2. **Portable commands** (`makePortableTsxCommand`) обязательны для cross-platform — capture.ts должен вызываться через tsx-runner.
3. **Smart merge** при обновлении — capture hooks не должны конфликтовать с existing hooks на те же events (UserPromptSubmit уже занят specs-validator).
4. **Docker-only tests** — E2E для capture hook тестируется через Docker, не standalone vitest.
5. **.dev-pomogator/ в .gitignore** — queue файл и tool scripts не коммитятся, устанавливаются инсталлером.
6. **UserPromptSubmit shared event** — specs-validator уже использует UserPromptSubmit. Capture hook должен быть отдельной записью в hooks array (Claude Code поддерживает multiple hooks на один event).
