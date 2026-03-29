---
paths:
  - "**/*SKILL.md"
  - "**/commands/*.md"
  - "**/skills/**"
---

# Skill allowed-tools — аудит полноты

При создании или модификации skill/command с `allowed-tools` в frontmatter — проверь что ВСЕ инструменты, используемые в workflow, перечислены. Пропущенный tool = agent не может выполнить шаг pipeline.

## Пример из практики

```yaml
# ❌ suggest-rules skill: pipeline требует MCP, Bash, AskUserQuestion — но их нет
allowed-tools: Read, Write, Glob, Grep

# ✅ Все tools, реально используемые в pipeline
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, AskUserQuestion, Skill, WebFetch, WebSearch, mcp__plugin_claude-mem_mcp-search__search, ...
```

Результат пропуска: agent "отмазывается" — говорит "контекст слишком длинный" вместо выполнения работы, потому что буквально не имеет доступа к нужным tools.

## Чеклист по типам инструментов

- [ ] **Read/Write/Edit/Glob/Grep** — базовые файловые операции
- [ ] **Bash** — если workflow запускает скрипты (`npx tsx`, `audit.ts`, etc.)
- [ ] **AskUserQuestion** — если workflow имеет СТОП-точки с выбором пользователя
- [ ] **Skill** — если workflow вызывает другие skills (`/deep-insights`, etc.)
- [ ] **Agent** — если workflow использует параллельные sub-agents
- [ ] **WebFetch/WebSearch** — если workflow ищет информацию в интернете
- [ ] **MCP tools** — если workflow использует MCP серверы (claude-mem, Context7, etc.)
  - `mcp__plugin_claude-mem_mcp-search__search` / `timeline` / `get_observations` / `save_memory`
  - `mcp__context7__resolve-library-id` / `query-docs`

## Как проверить

1. Прочитать SKILL.md / command.md
2. Найти все упоминания tool-вызовов: `MCP search`, `Bash`, `Skill("...")`, `AskUserQuestion`
3. Сверить с `allowed-tools` в frontmatter
4. Добавить недостающие
