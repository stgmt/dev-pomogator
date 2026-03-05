# Research: Phase Gate Anti-Hallucination

## Контекст

Claude систематически пропускает 4 СТОП-точки в workflow `/create-spec`, заполняя все 13 файлов спеки за один проход. Текущий механизм — advisory warnings через `validate-specs.ts` (UserPromptSubmit hook, exit code 0) — не блокирует действия. Нужна архитектура жёсткого enforcement через PreToolUse hooks.

## Источники

- Anthropic claude-code (74k stars): https://github.com/anthropics/claude-code
- Claude Code hooks docs: https://code.claude.com/docs/en/hooks
- SienkLogic/plan-build-run: https://github.com/SienkLogic/plan-build-run
- Hitenze/Claude-suite: https://github.com/Hitenze/Claude-suite
- hardness1020/VibeFlow: https://github.com/hardness1020/VibeFlow
- originlabs-app/claude-codex-team-orchestration: https://github.com/originlabs-app/claude-codex-team-orchestration
- searls/icloud-dotfiles (prove-it-gate): https://github.com/searls/icloud-dotfiles
- masonjames/dockhand-plugin: https://github.com/masonjames/dockhand-plugin
- mauhpr/agentlint: https://github.com/mauhpr/agentlint
- jhlee0409/all-for-claudecode: https://github.com/jhlee0409/all-for-claudecode
- Nick Tune blog (FSM): https://nick-tune.me/blog/2026-02-28-hook-driven-dev-workflows-with-claude-code/
- Наш V-Model ресерч: `.specs/spec-workflow-vmodel/RESEARCH.md`

## Технические находки

### 1. Claude Code PreToolUse Hook — формат и поведение

**18 hook events** поддерживается. Только **PreToolUse** может блокировать tool execution.

**Stdin**:
```json
{
  "session_id": "abc123",
  "cwd": "/project",
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": { "file_path": "/abs/path", "content": "..." },
  "tool_use_id": "toolu_01ABC123..."
}
```

**Stdout для блокировки**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Причина"
  }
}
```

**Exit codes**: 0 = allow, 2 = block (НЕ 1!). Matcher: `"Write|Edit"` (regex по tool_name).

### 2. SienkLogic/plan-build-run — check-phase-boundary.js (ОСНОВНОЙ РЕФЕРЕНС)

Блокирует cross-phase writes. Файлы в `.planning/phases/N-name/`, фаза из `STATE.md`.

**Паттерны**:
- Dual mode enforce/warn через `config.json → safety.enforce_phase_boundaries`
- Fail-open: `catch(_e) -> process.exit(0)`
- Exportable `checkBoundary(data)` для тестов
- Logging: `logHook()` + `logEvent()`

**Код блокировки**:
```javascript
const output = { decision: "block", reason: `Cross-phase write blocked...` };
process.stdout.write(JSON.stringify(output));
process.exit(2);
```

### 3. Hitenze/Claude-suite — check_phase.py (САМЫЙ ЧИСТЫЙ КОД)

5 фаз (explore/plan/testdesign/code/sandbox). Фаза из `.claude/current_phase`.

**Паттерны**:
- Подробные stderr-сообщения "что можно, что нельзя, как переключить"
- Unknown phase → block (fail-closed для invalid state)
- ~160 строк Python

### 4. VibeFlow — 3-слойная архитектура (САМАЯ ПОХОЖАЯ)

12-стадийный pipeline. 3 уровня hooks:
- UserPromptSubmit: workflow-state-inject + branch-guard + checkpoint-gate
- PreToolUse: git-push-guard
- Stop: auto-validate + stage-transition-update

**Ключевое**: `workflow-state-inject.py` инжектирует `[VibeFlow] Active: <slug> (Stage X)` в каждый промпт.

### 5. originlabs-app — marker files

`.claude/phase-approved/phase-2.approved` маркер-файлы как гейты. Session-aware.

### 6. searls/icloud-dotfiles — prove-it-gate.js (updatedInput)

Вместо deny, перезаписывает команду через `updatedInput` — prepend test suite. Stop hook блокирует "всё готово" если тесты fail.

### 7. mauhpr/agentlint — framework с circuit breaker

59 правил, 8 пакетов. 3 severity: ERROR (exit 2) → WARNING → INFO. Circuit breaker: после 3+ fires, ERROR degrades. Security pack: `no-bash-file-write` блокирует escape через Bash.

### 8. V-Model spec-kit (наш ресерч)

`.specs/spec-workflow-vmodel/RESEARCH.md`:
- Строка 475: "нет coverage gate" в нашем workflow
- Строка 828: "Hook: auto-trigger coverage after Phase 2"
- Строка 1974: "4 STOP-point workflow — NOT enforced"
- Принцип: "Scripts Verify, AI Generates"

### 9. Zoho case — баги pipeline (UC-6, UC-7)

`.specs/zoho-ms-18210-bin-locations/` — case study. 5 системных дыр:
- DYR-1: Нет FR splitting rule
- DYR-2: Нет AC↔FR scope match
- DYR-3: Нет partial implementation detection
- DYR-4: Нет task↔FR atomicity check
- DYR-5: Audit не обязателен

## Где лежит реализация

- Текущий hook: `extensions/specs-workflow/tools/specs-validator/validate-specs.ts`
- Phase gate logic: `validate-specs.ts:220-253` (checkPhaseGate function)
- Phase constants: `validate-specs.ts:71-91` (PHASE_FILES, PHASE_ORDER, STOP_LABELS)
- State machine: `extensions/specs-workflow/tools/specs-generator/spec-status.ps1`
- Audit: `extensions/specs-workflow/tools/specs-generator/audit-spec.ps1`
- Hook config: `.claude/settings.json` (UserPromptSubmit)
- Extension manifest: `extensions/specs-workflow/extension.json`
- Spec completeness: `extensions/specs-workflow/tools/specs-validator/completeness.ts`
- Reporter: `extensions/specs-workflow/tools/specs-validator/reporter.ts`
- Matcher: `extensions/specs-workflow/tools/specs-validator/matcher.ts`

## Выводы

1. PreToolUse hook с exit code 2 — проверенный паттерн (7+ open-source реализаций)
2. Fail-open (catch -> exit(0)) — обязательный паттерн для production hooks
3. 3-слойная архитектура (UserPromptSubmit inject + PreToolUse gate + skill template) — наиболее надёжная
4. Наш `.progress.json` уже содержит `stopConfirmed` — осталось подключить PreToolUse hook
5. Audit checks (partial impl, FR atomicity) закрывают дыры, обнаруженные в zoho case

## Project Context & Constraints

### Relevant Rules

| Rule | Path | Summary | Triggered By | Impacts |
|------|------|---------|--------------|---------|
| extension-manifest-integrity | `.claude/rules/extension-manifest-integrity.md` | extension.json = source of truth; обновлять files/hooks | Изменение extension | FR-1, FR-7 |
| updater-sync-tools-hooks | `.claude/rules/updater-sync-tools-hooks.md` | Апдейтер синхронизирует tools + hooks | Апдейт extensions | FR-1 |
| specs-management | `.claude/rules/specs-management.md` | 4 СТОП-точки, phase workflow | Создание спеков | FR-12, FR-13, FR-14 |
| specs-validation | `.claude/rules/specs-validation.md` | @featureN кросс-ссылки | Работа с .specs/ | FR-8, FR-9 |
| atomic-config-save | `.claude/rules/atomic-config-save.md` | Atomic write через temp file | Запись конфигов | NFR-Reliability |

### Existing Patterns & Extensions

| Source | Path | What It Provides | Relevance |
|--------|------|-------------------|-----------|
| validate-specs.ts | `extensions/specs-workflow/tools/specs-validator/validate-specs.ts` | UserPromptSubmit hook, stdin parsing, phase gate (advisory) | Переиспользовать stdin parsing, вынести constants в shared |
| spec-status.ps1 | `extensions/specs-workflow/tools/specs-generator/spec-status.ps1` | State machine, .progress.json read/write, ConfirmStop | Читаем .progress.json, не модифицируем |
| audit-spec.ps1 | `extensions/specs-workflow/tools/specs-generator/audit-spec.ps1` | 8 existing checks (FR↔AC, tags, terms) | Добавляем 4 новых check |
| reporter.ts | `extensions/specs-workflow/tools/specs-validator/reporter.ts` | Warning formatting, stdout output | Переиспользовать формат warnings |
| phase constants | `validate-specs.ts:71-91` | PHASE_ORDER, PHASE_FILES, STOP_LABELS | Вынести в shared модуль |

### Architectural Constraints Summary

- **extension-manifest-integrity**: новые файлы (phase-gate.ts, phase-constants.ts) ОБЯЗАНЫ быть в `toolFiles` extension.json
- **updater-sync-tools-hooks**: PreToolUse hook ОБЯЗАН быть в `hooks.claude` секции extension.json для автоустановки
- **atomic-config-save**: `.progress.json` пишется через spec-status.ps1, мы только ЧИТАЕМ — atomic write не наша забота
- **specs-management**: новые правила (FR Decomposition, Task Integrity, AC Scope Match) добавляются В КОНЕЦ Phase 2/Phase 3 описания, не заменяя существующие
