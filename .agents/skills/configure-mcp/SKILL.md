---
name: configure-mcp
description: |
  Настроить auth для глобальных MCP-серверов Context7 и Octocode, когда SessionStart-варнинг говорит
  «Context7 без API-ключа» / «Octocode без GitHub-доступа», или когда пользователь даёт ключ/токен
  прямо в чате. Skill: спрашивает ключ, говорит ГДЕ его взять, либо пробует добыть сам (Context7 OAuth
  `npx ctx7 setup`; Octocode `gh auth login`/`gh auth token`), затем ВПИСЫВАЕТ секрет в user-global
  `~/.claude.json` через `set-mcp-key.ts` и РЕАЛЬНО проверяет, что настройка применилась (не вслепую).
  Триггеры (RU): «настрой mcp», «настрой context7», «настрой octocode», «впиши ключ context7»,
  «вот ключ context7 …», «вот github токен …», «убери варнинг про mcp», «mcp не настроен».
  Триггеры (EN): «configure mcp», «set context7 key», «set octocode token», «wire mcp auth»,
  «here is my context7 key …», «fix the mcp warning». Не использовать для установки самих серверов
  (это делает SessionStart-хук `mcp-bootstrap`) и для общей диагностики (это `/pomogator-doctor`).
allowed-tools: Read, Bash, Grep, AskUserQuestion
---

> **Stub (retired mirror).** This skill is provided by the canonical Claude Code
> copy: [`.claude/skills/configure-mcp`](../.claude/skills/configure-mcp/SKILL.md).
> Use that copy — it is the single distributed source. This stub exists only so
> legacy paths under `.agents/skills/` keep resolving; nothing here is
> maintained and no payload (references/scripts/evals/templates) is duplicated.
