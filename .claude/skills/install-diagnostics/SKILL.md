---
name: install-diagnostics
description: >
  Diagnose silent or failed dev-pomogator installation via npx/npm. Use when user reports
  "ничего не происходит при установке", "молча", "silent install", "npx exits with no output",
  "exit code 2 без ошибок", "не работает установка", "ничего не выводит", "молчком",
  "fyfkbp установки", "анализ установки", "почему молча", "install fails silently", or shows
  a screenshot/log where `npx github:stgmt/dev-pomogator` returns to prompt with no installer
  output. Also use when checking why `~/.dev-pomogator/logs/install.log` was not updated after
  an install attempt.
allowed-tools: Bash, Read, Grep, Glob
---

# /install-diagnostics — Why dev-pomogator install was silent

## Когда использовать

- Пользователь запустил `npx github:stgmt/dev-pomogator …` и не увидел НИКАКОГО вывода
- Установщик завершился с exit 2 без сообщений об ошибке
- `~/.dev-pomogator/logs/install.log` не обновился после попытки установки
- Нужно найти РЕАЛЬНУЮ причину silent failure (не догадки)

## Принципы (читай первым)

1. **Evidence first** — собери логи и timestamps ДО формулировки гипотез
2. **Никогда не говори "наверное" про причину** — каждое утверждение с pruff (путь к логу + строка)
3. **Reproduce с verbose** — silent failure становится verbose при `--loglevel verbose`
4. **Не блокировать сессию** на длинных npm install — параллельно собирай другие evidence

## Phase 1 — Snapshot текущего состояния

Собери информацию ДО любых исправлений. Все 4 шага параллельно (один Bash вызов или несколько в одном сообщении):

### Step 1.1 — installer-side logs

```bash
ls -la "$HOME/.dev-pomogator/logs/" 2>&1
ls -la "$HOME/.dev-pomogator/last-install-report.md" 2>&1
ls -la "$HOME/.dev-pomogator/config.json" 2>&1
```

**Что искать:**
- `install.log` mtime — если СТАРШЕ чем попытка установки → installer НЕ ЗАПУСКАЛСЯ (бин не вызвался)
- `last-install-report.md` mtime — то же самое
- Если файлов вообще нет → installer никогда не доходил до `installLog.info(...)` или `report.write()`

### Step 1.2 — npm cache logs (главный источник правды)

```bash
ls -lat "$LOCALAPPDATA/npm-cache/_logs/" 2>&1 | head -10
# или эквивалент:
ls -lat "C:/Users/$USER/AppData/Local/npm-cache/_logs/" 2>&1 | head -10
```

**Найди логи с правильным timestamp:**
- timestamp коррелирует с моментом запуска `npx`
- npm rotates after 10 logs — если прошло время, лог мог быть удалён
- ищи через `Grep` по `pomogator|stgmt|github:` в `_logs/`

```bash
# найти лог нужной команды
grep -l "pomogator\|stgmt" "$LOCALAPPDATA/npm-cache/_logs/"*.log 2>/dev/null
```

### Step 1.3 — npx cache state (вторая критическая зона)

```bash
ls -la "$LOCALAPPDATA/npm-cache/_npx/" 2>&1
```

Для каждой папки `_npx/<hash>/`:

```bash
# Проверить какой пакет в этой папке
cat "$LOCALAPPDATA/npm-cache/_npx/<hash>/package.json" 2>&1
ls "$LOCALAPPDATA/npm-cache/_npx/<hash>/node_modules/" 2>&1
```

**Что искать:**
- Папка `_npx/<hash>/` существует, но `node_modules/` ПУСТАЯ или содержит только partial-extract subdirs
- В `node_modules/` есть `@inquirer/external-editor` или `@inquirer/core` без файлов в `dist/` — следы failed reify
- Папка `_npx/<hash>/` без `package.json` в корне → reify откатился, но dirs остались

### Step 1.4 — env

```bash
node --version 2>&1
npm --version 2>&1
which npx 2>&1
npm config get cache 2>&1
```

## Phase 2 — Сопоставить с известными failure modes

После сбора evidence — сопоставь с этой таблицей. ВЫБЕРИ конкретный режим, не угадывай.

### Mode A — Windows EPERM на reify cleanup (HIGH probability на Win)

**Симптомы:**
- exit code 2 (или 0 в редких случаях)
- npm output ПУСТОЙ при default loglevel
- `~/.dev-pomogator/logs/install.log` НЕ обновился (installer не запускался)
- `_npx/<hash>/` существует, но `node_modules` пустая или partial

**Подтверждение (запусти):**

```bash
# В пустом temp dir, чтобы не трогать рабочую папку
TEMP_DIR=/tmp/pom-diag-$(date +%s) && mkdir -p "$TEMP_DIR" && cd "$TEMP_DIR" && \
yes y | npx --loglevel verbose --yes github:stgmt/dev-pomogator --claude --all 2>&1 | tail -80
```

**Ищи в выводе:**

```
npm warn cleanup Failed to remove some directories
... [Error: EPERM: operation not permitted, rmdir 'C:\…\_npx\…\node_modules\@inquirer\external-editor\dist\esm']
... errno: -4048, code: 'EPERM', syscall: 'rmdir'
npm silly unfinished npm timer reify
npm silly unfinished npm timer reify:unpack
npm silly unfinished npm timer reifyNode:node_modules/dev-pomogator
npm verbose exit 2
```

**Если все 4 маркера найдены → Mode A confirmed.**

**Почему молча:** `npm warn cleanup` — это `warn`-уровень, который при default loglevel НЕ ВЫВОДИТСЯ для `npm exec`. Exit code 2 пробрасывается без user-visible message. Bin `dev-pomogator` так и не извлекается → main() не запускается → installer.log пустой.

**Root cause:** реальная причина EPERM на Windows — file lock от:
- Windows Defender realtime scan нового файла
- Другой node-процесс держит handle
- OneDrive sync (если cache на synced диске)
- read-only attribute от tar extraction
- TOCTOU race между unpack и cleanup

**Fix варианты (предложить пользователю по приоритету):**

1. **Установка из исходников (recommended)** — обходит npm reify полностью:
   ```bash
   git clone https://github.com/stgmt/dev-pomogator.git
   cd dev-pomogator
   npm install
   node bin/cli.js --claude --all
   ```

2. **Globally installed:**
   ```bash
   npm install -g github:stgmt/dev-pomogator
   dev-pomogator --claude --all
   ```

3. **Полная очистка кэша + retry:**
   ```bash
   npm cache clean --force
   rm -rf "$LOCALAPPDATA/npm-cache/_npx"
   # отключить Windows Defender временно для папки _npx
   npx github:stgmt/dev-pomogator --claude --all
   ```

4. **Защищённая папка кэша** (исключить из Defender):
   ```powershell
   Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\npm-cache"
   ```

### Mode B — Bin entry resolved, но import упал

**Симптомы:**
- `_npx/<hash>/node_modules/dev-pomogator/package.json` СУЩЕСТВУЕТ
- `_npx/<hash>/node_modules/dev-pomogator/dist/index.js` НЕ СУЩЕСТВУЕТ или partial
- npm не печатает cleanup warnings
- exit 1, не 2

**Подтверждение:**

```bash
ls -la "$LOCALAPPDATA/npm-cache/_npx/<hash>/node_modules/dev-pomogator/dist/" 2>&1
find "$LOCALAPPDATA/npm-cache/_npx/<hash>/node_modules/dev-pomogator/" -name "*.js" 2>&1 | head -5
```

**Root cause:** prepare script (`tsc`) failed, dist/ не построился. Часто из-за:
- devDependencies не установлены при `npm install --production`
- TypeScript compile error в src/

**Fix:** проверить ли `dist/` в git, проверить prepare script.

### Mode C — Installer запустился, но молча упал в импортах

**Симптомы:**
- `~/.dev-pomogator/logs/install.log` СУЩЕСТВУЕТ и УПОМИНАЕТ recent timestamp
- НО последняя запись — без `=== Installation finished ===`
- exit 1

**Подтверждение:**

```bash
tail -30 "$HOME/.dev-pomogator/logs/install.log" 2>&1
```

**Root cause:** ошибка в одном из модулей `dist/installer/*.js` ИЛИ в одном из extension hooks.

**Fix:** прочитать stack trace из install.log и грепнуть по модулю.

### Mode D — main.catch перехватил ошибку и напечатал её

**Симптомы:**
- Пользователь видит `Error: <message>` в начале вывода (НЕ silent)
- exit 1

**Подтверждение:** уже видно в выводе.

**Это НЕ silent install** — сразу читать `error.message` и фиксить.

## Phase 3 — Reproduce с verbose

После определения mode, всегда воспроизведи в чистом temp dir:

```bash
# Изолированно, без shared cache
TEMP_DIR=/tmp/pom-diag-$(date +%s)
FRESH_CACHE=/tmp/pom-cache-$(date +%s)
mkdir -p "$TEMP_DIR" "$FRESH_CACHE"
cd "$TEMP_DIR"

NPM_CONFIG_CACHE="$FRESH_CACHE" \
  yes y | npx --loglevel verbose --yes github:stgmt/dev-pomogator --claude --all 2>&1 | tail -100
echo "EXIT=$?"

# Проверить что попало в кэш
find "$FRESH_CACHE/_npx" -type f -name "package.json" 2>&1 | head -10
```

## Phase 4 — Report

После confirmation покажи пользователю в формате:

```markdown
## Install Diagnostics — Result

**Mode:** [A/B/C/D]
**Confirmed via:** [конкретный лог + строка]

### Evidence
- npm cache log: `<path>:line` — `<exact npm warn cleanup line>`
- exit code: `<N>`
- ~/.dev-pomogator/logs/install.log mtime: `<datetime>` (vs install attempt time `<datetime>`)
- _npx state: `<empty | partial | full>`

### Root cause
[1-2 sentence explanation]

### Why silent (если silent)
[ссылка на конкретный механизм — `warn cleanup` hidden by default loglevel]

### Recommended fix
[1 main + 1 fallback, конкретные команды]
```

## Анти-паттерны

- ❌ Гадать "наверное network проблема" без проверки `npm http fetch` lines
- ❌ Запускать `npm cache clean --force` ДО анализа — теряешь evidence
- ❌ Менять рабочую папку пользователя — ВСЕ reproduce делать в /tmp
- ❌ Пропускать `--loglevel verbose` — без него хуже половины evidence не видно
- ❌ Считать что отсутствие `~/.dev-pomogator/logs/install.log` означает "файла нет" — оно означает "installer не запускался" (это сильное evidence!)
- ❌ Принимать exit 0 как успех без проверки `_npx/<hash>/node_modules/dev-pomogator/` — npm может exit 0 с failed cleanup

## Чеклист

- [ ] Phase 1 пройдена — собран snapshot ВСЕХ 4 источников
- [ ] Найден правильный npm cache log (по timestamp)
- [ ] Выбран конкретный Mode (A/B/C/D), не "возможно X или Y"
- [ ] Reproduce в /tmp подтвердил mode
- [ ] Report с evidence + root cause + fix предложен пользователю
- [ ] Не запускал `cache clean` до завершения диагностики
