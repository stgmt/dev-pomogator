# Commands via skill-reference, не hardcode

В `.onboarding.json` каждая команда (test/build/lint/commit/...) — блок со ссылкой на skill-обёртку, когда она существует. Не raw command строки. Enforced через schema validator custom keyword `viaSkillConsistency` + PreToolUse hook блокирует обход.

## Когда применяется

Edit/Write в `.specs/.onboarding.json` поле `commands`, `extensions/onboard-repo/tools/onboard-repo/steps/finalize.ts`, `extensions/onboard-repo/tools/onboard-repo/renderers/compile-hook.ts`.

## Структура одной команды

```json
{
  "test": {
    "via_skill": "run-tests",                  // skill name если есть wrapper, null если нет
    "preferred_invocation": "/run-tests",       // что AI должен использовать
    "fallback_cmd": "uv run pytest",            // raw command для degraded mode
    "raw_pattern_to_block": "^pytest|^npm\\s+test",
    "forbidden_if_skill_present": true,        // true → PreToolUse hook denies raw matches
    "reason": "/run-tests wraps pytest с TUI + YAML status"
  }
}
```

## Правила (enforced)

- Если `via_skill != null` И `forbidden_if_skill_present == true` → `raw_pattern_to_block` ОБЯЗАН быть non-empty valid regex. AJV custom keyword `viaSkillConsistency` кидает error иначе.
- Если skill существует в target repo (`.claude/skills/<name>/SKILL.md`) и wraps эту команду → `via_skill` ОБЯЗАН быть заполнен. Hardcoded raw command в `preferred_invocation` без `via_skill` — violation.
- `fallback_cmd` — raw команда для degraded mode (skill недоступен или на другой машине без dev-pomogator). Без fallback AI не сможет работать на bare metal.
- `reason` — одно предложение почему skill wrapper нужен (e.g. "TUI integration", "auto-commit semantics"). Попадает в `permissionDecisionReason` hook-а.

## Что генерится автоматически

PreToolUse hook в `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "onboard-repo-guard",
        "_managed": true,
        "_entries": [
          { "command_name": "test", "pattern": "^pytest", "skill": "run-tests", "reason": "..." }
        ]
      }]
    }]
  }
}
```

Руководит runtime evaluation (см. `renderers/compile-hook.ts:evaluateBashCommand`).

## Запреты

- НЕ хардкодь `npm test`/`pytest`/`dotnet test` в `preferred_invocation` если в target repo есть skill wrapper.
- НЕ ставь `forbidden_if_skill_present: true` с пустым `raw_pattern_to_block` — это schema violation.
- НЕ пиши "do not run raw X" в prose — вместо этого документируй wrapper decoratively (GitHub AGENTS.md 2500-repo study pattern), enforcement через hook.

## Ссылки

- [FR-18: Commands via skill-reference](../../../.specs/onboard-repo-phase0/FR.md)
- [AC-18: via_skill consistency](../../../.specs/onboard-repo-phase0/ACCEPTANCE_CRITERIA.md)
- [centralized-test-runner](../tui-test-runner/centralized-test-runner.md) — связанное правило для самого dev-pomogator repo
