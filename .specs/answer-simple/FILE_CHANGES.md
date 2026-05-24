# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `extensions/answer-simple/extension.json` | create | [FR-3](FR.md#fr-3-extension-следует-конвенциям-extension-layout) — manifest extension со ссылками на rule + skill, без tools и hooks |
| `.claude/rules/answer-simple/clear-questions-to-user.md` | create | [FR-5](FR.md#fr-5-миграция-существующего-rule-с-обновлением-claude-md-глоссария) — мигрированный rule из root path в extension-specific path |
| `.claude/rules/clear-questions-to-user.md` | delete | [FR-5](FR.md#fr-5-миграция-существующего-rule-с-обновлением-claude-md-глоссария) — старый путь удаляется как часть atomic 3-step migration |
| `.claude/skills/answer-simple/SKILL.md` | create | [FR-2](FR.md#fr-2-slash-команда-answer-simple-для-ручного-аудита-черновика) — определение slash-команды и workflow двух режимов (silent + explicit invocation) |
| `CLAUDE.md` | edit | [FR-5](FR.md#fr-5-миграция-существующего-rule-с-обновлением-claude-md-глоссария) — обновление пути rule в always-apply таблице глоссария |
| `tests/e2e/answer-simple.test.ts` | create | [FR-1, FR-2, FR-3, FR-4, FR-5](FR.md) — integration tests на 5 CHKs, 5 it'ов с CODE_NN mapping 1:1 с .feature scenarios PLUGIN017_01..05 |
| `~/.claude/projects/D--repos-dev-pomogator/memory/feedback_no-jargon-questions-to-user.md` | edit | [FR-5](FR.md#fr-5-миграция-существующего-rule-с-обновлением-claude-md-глоссария) — cross-reference в body на новый rule path |
