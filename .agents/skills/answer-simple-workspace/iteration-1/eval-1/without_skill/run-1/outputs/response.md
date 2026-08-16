Отлично, спасибо за апдейт!

Чтобы я был в курсе и мог дальше помогать по этой задаче, уточни пару моментов:

1. **FR-12** — какой именно spec? У тебя в репо несколько `.specs/*/FR.md`. Дай слаг (например, `.specs/spec-variant-matrix/FR.md`) или скинь diff, чтобы я понимал, что именно поменялось в требовании.

2. **VARIANT_COVERAGE category** — это audit category для Phase 3+ в `create-spec` workflow. Хочешь, чтобы я:
   - проверил, что подключение прошло корректно (запустил `audit-spec.ts` на соответствующем spec)?
   - проревьюил изменения в `extensions/specs-workflow/tools/specs-generator/specs-generator-core.mjs` (он у тебя в `git status` как M)?
   - обновил связанные rules/docs (`.claude/rules/specs-workflow/variant-matrix/` или `.claude/skills/create-spec/references/phase3plus_audit-variant-coverage.md`)?

3. Нужно что-то закоммитить/запушить, или это пока локально на проверку?

Если хочешь — могу прямо сейчас прогнать `audit-spec.ts` по затронутому spec и показать, что VARIANT_COVERAGE триггерится как ожидалось.
