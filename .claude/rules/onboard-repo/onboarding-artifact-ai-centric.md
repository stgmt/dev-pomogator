# Onboarding artifact должен быть AI-centric

`.specs/.onboarding.json` — это файл для AI-агента, не generic project metadata. Schema enforced через AJV validator (`lib/schema-validator.ts`); эти правила ловят недостаточность ещё до compose/write.

## Когда применяется

Edit/Write в `.specs/.onboarding.json`, `extensions/onboard-repo/tools/onboard-repo/steps/finalize.ts`, `extensions/onboard-repo/tools/onboard-repo/schemas/onboarding.schema.json` или любые renderer-ы.

## Обязательные AI-specific секции

В `.onboarding.json` ДОЛЖНЫ присутствовать (как ключи, массивы могут быть пустыми):

- `rules_index[]` — `{name, trigger, enforces, path, always_loaded}` для каждого `.claude/rules/*.md` в target репо. Не список путей — `enforces` говорит AI что правило требует.
- `skills_registry[]` — `{name, trigger, description, invocation_example, path}` для каждого installed skill.
- `hooks_registry[]` — `{event, matcher, action, path, managed_by?}` для каждого hook из settings.json/settings.local.json.
- `mcp_servers[]` — `{name, capabilities, auth_required, url_or_path?}`.
- `boundaries.always[]` + `boundaries.ask_first[]` + `boundaries.never[]` — 3-tier AGENTS.md pattern.
- `gotchas[]` — `{symptom, cause, fix, severity}`. Repo-specific warnings, не generic advice.
- `glossary[]` — `{term, definition, example?}` domain-specific terms.
- `verification` — `{primary_command, success_criteria, manual_checks, screenshot_workflow?}`.

Если target репо не имеет `.claude/rules/` → `rules_index` MUST быть `[]` (empty array, не omitted) + warning в `warnings[]`.

## Запреты

- НЕ заменяй AI-specific секции на generic project metadata (CI system-style).
- НЕ omit обязательные ключи — пусть будут пустые массивы, но ключ present.
- НЕ хардкоди skill invocations как raw команды в `commands.*.preferred_invocation` — используй `/skill-name` нотацию когда есть `via_skill != null`.

## Проверка

- Schema validation через AJV на finalize pre-write отвергает `{valid: false}` JSON.
- `assertNoSecretsInObject()` pre-write guard отвергает artifact если values env vars просочились (NFR-S1).

## Ссылки

- [FR-10: AI-specific секции обязательны](../../../.specs/onboard-repo-phase0/FR.md)
- [AC-10: AI-specific sections mandatory](../../../.specs/onboard-repo-phase0/ACCEPTANCE_CRITERIA.md)
- [onboard-repo-phase0_SCHEMA.md](../../../.specs/onboard-repo-phase0/onboard-repo-phase0_SCHEMA.md) — полный reference

## История

Feedback в memory: `~/.claude/projects/D--repos-dev-pomogator/memory/feedback_onboarding-artifact-must-be-ai-centric.md` — user explicitly сказал "generic metadata — для CI system, а не для AI file" при первой версии schema. Без этого правила AI легко скатится к generic Cline techContext.md pattern.
