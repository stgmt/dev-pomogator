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

# configure-mcp — настройка auth для Context7 / Octocode

Серверы Context7 + Octocode ставятся глобально автоматически (SessionStart-хук
`tools/mcp-setup/mcp-bootstrap.ts`). Этот skill закрывает **настройку (auth)**: пока Context7 без
API-ключа (анонимный тир, лимиты) или Octocode без GitHub-доступа — варнинг сыпется каждую сессию.
Задача skill — довести оба до «настроено» по **реальной проверке**, после чего варнинг исчезает.

Секрет пишется ТОЛЬКО в user-global `~/.claude.json` (не git-tracked) — **никогда** в project
`.mcp.json` (риск утечки, personal-pomogator FR-10).

## Когда invoke
- SessionStart-варнинг сообщил, что Context7/Octocode не настроены.
- Пользователь прислал в чат API-ключ Context7 или GitHub-токен и просит вписать.
- Пользователь сказал «настрой mcp» / «убери варнинг про mcp».

## Алгоритм

### 1. Понять что не настроено
Прочитать текущий статус (реальный):
```bash
node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT||'.','tools','_shared','bootstrap.cjs'))" -- "tools/mcp-setup/print-mcp-status.ts"
```
(или прочитать `~/.claude.json` `mcpServers` и применить предикаты из `tools/mcp-setup/mcp-auth-detect.ts`).
Дальше — по каждому ненастроенному серверу.

### 2. Context7 — нужен API-ключ
Анонимный тир имеет низкие лимиты, поэтому ключ обязателен для «настроено».

1. **Попросить ключ у пользователя**, явно сказав ГДЕ взять: бесплатный ключ на
   **https://context7.com/dashboard** (или у Upstash). Попросить прислать ключ в чат.
2. **Или предложить добыть сам** (OAuth, авто-генерация ключа):
   ```bash
   npx ctx7 setup --claude
   ```
   (интерактивный OAuth — пользователь подтверждает в браузере; команду пусть запустит сам через `!`).
3. Когда ключ получен — **вписать** (создаст запись, если её ещё нет; затем реальная пост-проверка):
   ```bash
   node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT||'.','tools','_shared','bootstrap.cjs'))" -- "tools/mcp-setup/set-mcp-key.ts" context7 "<API_KEY>"
   ```
   Exit 0 + `"verified":true` → ключ принят. (В dogfood-репо можно `npx tsx tools/mcp-setup/set-mcp-key.ts context7 "<API_KEY>"`.)

### 3. Octocode — нужен GitHub-доступ
GitHub-поиск не работает без auth. Любой ОДИН способ достаточен.

1. **Сначала проверить, не залогинен ли уже `gh`** (добыть сам):
   ```bash
   gh auth status
   ```
   Exit 0 → уже настроено, ничего писать не нужно (варнинг уйдёт сам).
2. Если нет — предложить пользователю **залогиниться** (он запускает сам через `!`, интерактивный браузер):
   ```bash
   gh auth login
   ```
   либо взять токен из существующего gh и вписать в запись:
   ```bash
   gh auth token   # → вывести токен, затем set-mcp-key octocode <token>
   ```
3. **Или попросить GitHub Personal Access Token** (scopes: `repo`, `read:user`, `read:org`) — сказать
   что создать его на https://github.com/settings/tokens — и вписать:
   ```bash
   node -e "require(require('path').join(process.env.CLAUDE_PLUGIN_ROOT||'.','tools','_shared','bootstrap.cjs'))" -- "tools/mcp-setup/set-mcp-key.ts" octocode "<GITHUB_TOKEN>"
   ```

### 4. Подтвердить и сказать про рестарт
- Перечитать `~/.claude.json` и подтвердить, что предикаты теперь true (это делает `set-mcp-key.ts` сам — `"verified":true`).
- Сказать пользователю: изменения user-scope MCP подхватываются **со следующей сессии** (перезапусти сессию / `/reload-plugins`), после чего варнинг исчезнет.

## Запреты
- НЕ писать секрет в project `.mcp.json` — только `~/.claude.json` (FR-10).
- НЕ объявлять «настроено» без `"verified":true` от `set-mcp-key.ts` (не вслепую — с проверкой).
- НЕ ставить сами серверы здесь — это делает `mcp-bootstrap` на SessionStart.

## Связанные
- Установка серверов: `tools/mcp-setup/mcp-bootstrap.ts` (SessionStart).
- Детект auth: `tools/mcp-setup/mcp-auth-detect.ts`.
- Writer: `tools/mcp-setup/set-mcp-key.ts`.
- Диагностика: `/pomogator-doctor` (чек C-MCPA с этим же fix-action).
