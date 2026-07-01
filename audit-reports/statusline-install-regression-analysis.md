# Регрессия: установка statusLine юзерам пропала после переезда на canonical plugin

**Дата:** 2026-06-03
**Симптом:** у новых пользователей dev-pomogator больше не появляется statusLine в Claude Code. Раньше плагин ставил его автоматически.
**Вердикт:** подтверждённая регрессия. Механизм установки удалён при v2-миграции и ничем не заменён.

---

## TL;DR (одним абзацем)

В v1 statusLine (`npx -y ccstatusline@latest`) прописывался в `~/.claude/settings.json`
императивным инсталлером, который запускался при `npm install -g` / `npx`. При переезде
на каноническую Anthropic plugin-систему коммит `43cf946` **destructive** снёс весь
`src/installer/` (включая логику statusLine). Канонический `plugin.json` **не умеет**
декларировать главный `statusLine` (только `subagentStatusLine` в plugin `settings.json`),
а Claude Code при `/plugin install` **не пишет** в пользовательский `~/.claude/settings.json`.
Итог: новым юзерам ставить statusLine стало нечем. (Уточнение после проверки: migrate-скрипт
**на практике не трогает** ванильный `npx -y ccstatusline@latest` — см. раздел «Про migrate».)

---

## Как было в v1 (рабочая цепочка)

Установка через `npx github:stgmt/dev-pomogator` запускала инсталлер, который писал в
**глобальный** `~/.claude/settings.json`:

```
npx/npm install
  └─ src/installer/claude.ts → setupClaudeStatusLine(extensions)
       └─ writeGlobalStatusLine(statusLineConfig)         // src/utils/statusline.ts
            └─ resolveClaudeStatusLine({...})
                 → settings.statusLine = { type:'command', command:'npx -y ccstatusline@latest' }
                 → writeJsonAtomic(~/.claude/settings.json)
```

Ключевая логика `resolveClaudeStatusLine` (из `src/utils/statusline.ts`, до удаления):

- нет существующего statusLine → ставит `DEFAULT_USER_STATUSLINE_COMMAND = 'npx -y ccstatusline@latest'`;
- legacy «managed»/«wrapped» (старый `statusline_render.cjs`) → заменяет на ccstatusline;
- **user-defined** statusLine → **сохраняет как есть** (не перетирает чужое).

То есть инсталлер каждый раз гарантировал, что у юзера есть statusLine, аккуратно
не ломая ручную настройку. Эволюция: сначала был «managed» test-progress рендер
(`statusline_render.cjs`), затем коммиты `cbb31ca`/`7f72522` упростили до прямого
auto-install ccstatusline (прогресс тестов уехал в TUI `compact_bar.py`).

**Evidence:**
- `git log --all -S resolveClaudeStatusLine` → функция жила только в `src/utils/statusline.ts` (+ скомпилированный `dist/`).
- `git show 43cf946^:src/installer/claude.ts` → `setupClaudeStatusLine()` вызывает `writeGlobalStatusLine`.
- `cbb31ca` "feat: global statusLine with ccstatusline auto-install".

---

## Что сломало (точка регрессии)

Коммит **`43cf946`** — `refactor(canonical-plugin): Phase 1 destructive — drop installer/updater/extensions/dist/cli`:

```
- src/installer/ (15 files: claude.ts, ...)   ← здесь жил setupClaudeStatusLine
- src/updater/   (10 files)                    ← здесь был updateClaudeStatusLineGlobal
- src/utils/     (7 files)                      ← здесь был statusline.ts (resolveClaudeStatusLine)
```

Удалили инсталлер целиком — вместе с ним и единственный код, писавший
`statusLine.command` в пользовательский settings.json.

**Evidence:** `git show 43cf946 --stat` (список из 15 файлов installer + 7 utils).

---

## Почему канонический плагин это не закрывает

Проверено по официальному спеку (`code.claude.com/docs/en/plugins-reference`) и по дереву репо:

| Канал | Умеет ставить главный statusLine? | Подтверждение |
|-------|-----------------------------------|---------------|
| `plugin.json` (поля: skills/commands/hooks/mcpServers) | **Нет** | текущий `.claude-plugin/plugin.json` — поля statusLine нет |
| plugin `settings.json` | **Нет** (только `agent` + `subagentStatusLine`) | спек: *"Only the `agent` and `subagentStatusLine` keys are currently supported"* |
| `/plugin install` запись в `~/.claude/settings.json` | **Нет** — Claude Code не трогает user settings | спек: плагин контрибьютит skills/agents/hooks, не user settings |
| SessionStart hook `statusline_session_start.ts` | **Нет** — он создаёт только `.test-status/` + session env | `tools/test-statusline/statusline_session_start.ts` (нет записи `statusLine.command`) |

`subagentStatusLine` — это статуслайн **сабагентов**, а не основной строки Claude Code.
Подмены главному statusLine он не даёт.

**Evidence:**
- `git grep '"statusLine"' HEAD -- '*.json'` → только docs/fixtures, ни одного manifest.
- `git grep "ccstatusline|writeGlobalStatusLine|setupClaudeStatusLine" HEAD -- tools/ .claude/` → только упоминания в rules-доках, **ни одного writer'а**.

---

## Про migrate-скрипт (проверено — удаление почти ни на кого не действует)

`tools/migrate-v1-to-v2/migrate-v1-to-v2.ts` теоретически вырезает statusLine из
`~/.claude/settings.json`, но по предикату:

```ts
// global cleanup predicate
(cmd) => cmd.includes('.dev-pomogator/scripts/tsx-runner-bootstrap.cjs')
      || cmd.includes('dev-pomogator-statusline')
// → delete parsed.statusLine
```

**Маркер `dev-pomogator-statusline` ни одна реально установленная команда не содержала.**
Проверка истории: `git log --all -S 'dev-pomogator-statusline'` → литерал встречается
**только в самом migrate-скрипте** (`96276cc`), нигде больше. Реальные v1-команды были
`npx -y ccstatusline@latest` (default) или legacy `statusline_render.cjs`/`statusline_wrapper.js` —
ни одна не матчит этот предикат. Значит **ванильный ccstatusline миграцию переживает**:
такие юзеры свою строку сохраняют (она просто перестаёт обновляться, апдейтер тоже удалён).

Вывод: «migrate всё стирает» — неверно. Реальная регрессия — **новые юзеры**, а не migrate.

**Evidence:** `git log --all -S 'dev-pomogator-statusline'` → один коммит `96276cc` (migrate сам).

---

## Кто пострадал (после уточнения)

1. **Новые canonical-юзеры** (`/plugin install dev-pomogator@stgmt`): statusLine не появляется вообще — ставить нечем. ← **главная и единственная by-design регрессия.**
2. **v1-юзеры с `npx -y ccstatusline@latest`**: строку сохраняют (migrate её не трогает), но обновлять/чинить её больше некому — апдейтер удалён.
3. **v1-юзеры с очень старым «managed» render**: запись осталась, но указывает на legacy-скрипты, которых в canonical-раскладке нет → строка может молча падать/пустеть.

---

## Как делают другие плагины (GitHub-ресёрч, 2026-06-04)

Прогнал `gh search code` по коду публичных репо + web-поиск + чтение конкретных реализаций.
Нашлись **три** устоявшихся паттерна. Главный вывод: **никто** не ставит главный statusLine
декларативно через plugin.json (фреймворк не даёт — см. выше). Кто раздаёт через плагин —
все делают это императивно из **SessionStart-хука**.

### Паттерн 1 — Standalone CLI `… init` (для не-плагинов)
`cc-statusline` ставится `npx @chongdashu/cc-statusline@latest init` → крутится в **терминале**,
сам пишет `statusLine` в settings.json, *«Preserves your existing settings.json configurations»*,
есть ручной fallback. То же у `sirmalloc/ccstatusline`. **Это ровно модель нашего v1** — работает
потому что запускается вне Claude Code (settings ещё не прочитан).

### Паттерн 2 — Dotfiles/шаблоны (вручную)
`petekp/claude-code-setup` и десятки dotfiles просто кладут `settings.json` с готовым
`statusLine`, управляют через chezmoi/stow. User-level, не плагин.

### Паттерн 3 — Canonical plugin + SessionStart «reconcile/auto-repair» хук ⭐ (наш случай)

| Репо | Механизм | Чему учит |
|------|----------|-----------|
| **ShivaeDev/pardes** | SessionStart → `reconcile-settings.ts`: *«installs the statusLine when the slot is empty or already ours, never touches a user's own custom statusLine»*; идемпотентно (пишет только при изменении), владение через marker-комментарий, `systemMessage` только когда что-то поменял | **эталон** — это один-в-один наш старый `resolveClaudeStatusLine`, перенесённый в хук |
| **nyldn/claude-octopus** | SessionStart `statusline-auto-repair.sh` (matcher `startup\|resume\|clear`) | самовосстановление строки каждую сессию |
| **biefan/anchor** | не ставит молча — документирует ручной `_optional_statusline` однострочник + wrapper для сосуществования с ccstatusline | opt-in + coexistence-wrapper (= наша старая «wrap user command» логика) |
| **Nerfherder16/BrickLayer** | `statusLine.command` → `${CLAUDE_PLUGIN_ROOT}/src/hooks/masonry-statusline.js` | строка указывает на скрипт внутри плагина через `CLAUDE_PLUGIN_ROOT` |

**Вывод для нас:** Вариант A — не самодеятельность, а mainstream-способ с рабочим референсом
(`pardes/reconcile-settings.ts`), который можно взять за основу. Паттерн «marker ownership +
идемпотентность + systemMessage только при изменении» снимает Нюанс-2 (инвазивность): юзер
получает уведомление, свою строку не теряет.

**Evidence (команды/источники):**
- `gh search code --filename hooks.json statusLine` → pardes, claude-octopus, anchor, BrickLayer (см. таблицу).
- `gh search code --filename settings.json statusLine` → dotfiles/templates (Паттерн 2).
- WebFetch `github.com/chongdashu/cc-statusline` → *«Auto-updated Claude Code configuration … Preserves your existing settings.json»* (Паттерн 1).
- WebFetch `raw.githubusercontent.com/ShivaeDev/pardes/main/plugins/statusline/hooks/session-start.sh` → делегирует в `reconcile-settings.ts`; *«installs the statusLine when the slot is empty or already ours»*.
- Open feature requests (нет install-события): `anthropics/claude-code#11240`, `#9394`.

---

## Что чинить (варианты, от безопасного к «как было»)

Поскольку канонический `plugin.json` не может декларировать главный statusLine,
единственное место — пользовательский `~/.claude/settings.json`. Записать туда может
только наш код (hook/skill), запускаемый внутри сессии.

### Вариант A — SessionStart hook (восстановить v1-поведение в canonical-модели) ⭐
Расширить существующий `tools/test-statusline/statusline_session_start.ts` (он уже
зарегистрирован как SessionStart hook): идемпотентно дописать
`statusLine.command = "npx -y ccstatusline@latest"` в `~/.claude/settings.json`,
**только если** у юзера ещё нет своего statusLine. По сути — портировать логику
`resolveClaudeStatusLine` (сохранять user-defined, заполнять пустой/managed).
Требования: идемпотентность, fail-open (NFR-R1), atomic write, уважение чужой настройки.

⚠️ Нюанс 1 (timing): `settings.json` читается Claude Code **на старте сессии**, а SessionStart
hook отрабатывает уже после загрузки. Значит запись из hook'а подхватится только **в
следующей** сессии — первый запуск сразу после install всё равно покажет пусто. У v1
install-time записи этого разрыва не было, поэтому A — **не** drop-in эквивалент v1.

⚠️ Нюанс 2 (invasiveness): авто-запись стороннего `npx ccstatusline` в **глобальный**
user-settings из hook'а — outward-facing изменение у юзера на машине. v1 так и делал, но в
canonical-мире честнее сделать это **opt-in** (см. C) либо хотя бы с однократным уведомлением.

### Вариант B — fix-action в `/pomogator-doctor`
Добавить проверку «statusLine отсутствует» + предложение поставить ccstatusline одной
командой. Безопасно (юзер сам подтверждает), вписывается в существующий doctor-флоу.

### Вариант C — on-demand skill/команда
Отдельная команда «установить statusline», которую юзер вызывает явно. Самый
неинвазивный путь, но требует, чтобы юзер знал о ней (хуже discoverability).

**Рекомендация:** A (идемпотентный SessionStart) для паритета с v1, ИЛИ A в opt-in
режиме + B как видимая ручка в doctor. Что бы ни выбрали — обязателен интеграционный
тест (`integration-tests-first`): SessionStart hook → реально пишет в settings.json →
читаем обратно. Именно отсутствие такого теста раньше дало багу «ccstatusline не
устанавливается» прожить месяцами (см. `.claude/rules/integration-tests-first.md`).

---

## План реализации (Вариант A по образцу `pardes/reconcile-settings.ts`)

Цель: вернуть авто-установку statusLine в canonical-модели — идемпотентно, с ownership-маркером,
не трогая чужую ручную строку, fail-open.

> ⚠️ **Разграничение доменов (обязательно).** Фикс живёт в НОВОМ домене **`native-statusline`**
> (главная строка Claude Code = `ccstatusline`, git/model info). Его НЕЛЬЗЯ класть в
> `tools/test-statusline/` — это **другой** домен (прогресс тестов через YAML → TUI
> `compact_bar.py`, спеки `test-statusline` / `tui-statusline-mode` / `tui-test-runner`).
> Новый код = `tools/native-statusline/` + спека `.specs/native-statusline/` + **отдельный**
> SessionStart-хук. Домен прогресса тестов в этом фиксе не трогаем.

### Шаг 1 — reconciler-модуль
**Файл:** `tools/native-statusline/reconcile-statusline.ts` *(create)*
Экспортирует чистую функцию (тестируемую без диска) + writer:

```ts
// pure (порт старого resolveClaudeStatusLine):
export function reconcileStatusLine(existing: string | undefined): {
  action: 'install' | 'keep-user' | 'noop';
  command: string;
} {
  const MARKER = 'ccstatusline';                 // ownership-признак нашей строки
  const DEFAULT = 'npx -y ccstatusline@latest';
  if (!existing?.trim())            return { action: 'install',   command: DEFAULT };  // пустой слот
  if (existing.includes(MARKER))    return { action: 'noop',      command: existing }; // уже наша
  return { action: 'keep-user', command: existing };                                  // чужая ручная — НЕ трогаем
}
```
Writer: читает `~/.claude/settings.json`, зовёт `reconcileStatusLine`, при `install` —
atomic write (`atomic-config-save` rule: temp + rename), при `keep-user`/`noop` — ничего.
Возвращает `{changed: boolean}` для systemMessage.

### Шаг 2 — ОТДЕЛЬНЫЙ SessionStart-хук (не трогать test-statusline hook)
**Файлы:** `tools/native-statusline/install_native_statusline.ts` *(create)* +
`.claude-plugin/hooks.json` *(edit — добавить SessionStart entry)* +
`.claude/settings.json` *(edit — dogfood)*
Новый хук читает stdin-JSON, зовёт writer. Если `changed` — вернуть hook JSON с `systemMessage`
(«dev-pomogator: statusline ccstatusline подключён, появится со следующей сессии»). Флаг
отключения `DEV_POMOGATOR_STATUSLINE=off`. `fail-open` (всегда exit 0). Существующий
`tools/test-statusline/statusline_session_start.ts` **не редактируем** — это другой домен.

### Шаг 3 — opt-in / выключатель (снимает Нюанс-2)
По умолчанию `install` для пустого слота (паритет с v1). Env-флаг
`DEV_POMOGATOR_STATUSLINE=off` отключает запись целиком. Документировать в `.env.example`
рядом с `TEST_STATUSLINE_*`.

### Шаг 4 — `/pomogator-doctor` fix-action (видимая ручка, работает в текущей сессии)
**Файл:** `.claude/skills/pomogator-doctor/scripts/engine/` *(edit — добавить check)*
Check «statusLine отсутствует/сломан» + fix «поставить ccstatusline сейчас» (тот же writer).
Закрывает Нюанс-1 (timing): юзер может применить немедленно, не дожидаясь рестарта.

### Шаг 5 — тесты (обязательно интеграционные)
**Файлы:** `tests/e2e/statusline-install.test.ts` *(create)* + `tests/features/.../statusline-install.feature` *(create)*
- unit: `reconcileStatusLine` — пустой → install; наш marker → noop; чужой → keep-user.
- **integration** (`integration-tests-first`): на temp `HOME` запустить SessionStart-хук через
  `spawnSync` со stdin-JSON → прочитать settings.json обратно → проверить запись; повторный
  прогон → файл не меняется (идемпотентность); с предзаписанной чужой строкой → не перетёрта.
- Удалить/заменить мёртвый `tests/e2e/tui-statusline.test.ts` (тест на удалённую `src/`-функцию).

### Шаг 6 — спека + индекс
`.specs/statusline-install/` (FR/AC/feature) по `create-spec`; снять exclude в `vitest.config.ts`;
при необходимости — строка в CLAUDE.md.

### File Changes (предварительно)

| Path | Action | Reason |
|------|--------|--------|
| `tools/native-statusline/reconcile-statusline.ts` | create | Порт `resolveClaudeStatusLine` + atomic writer (idempotent, marker-ownership) — НОВЫЙ домен |
| `tools/native-statusline/install_native_statusline.ts` | create | Отдельный SessionStart-хук: вызвать writer, `systemMessage` при изменении |
| `.claude-plugin/hooks.json` | edit | Зарегистрировать новый SessionStart-хук для users (canonical) |
| `.claude/settings.json` | edit | Зарегистрировать новый хук для dogfood |
| `.claude/skills/pomogator-doctor/scripts/engine/*` | edit | Check + fix-action «statusLine отсутствует» (немедленное применение) |
| `.env.example` | edit | Документировать `DEV_POMOGATOR_STATUSLINE=off` |
| `tests/e2e/native-statusline.test.ts` | create | Интеграционный тест: hook → settings.json → read-back + идемпотентность |
| `tests/features/.../native-statusline.feature` | create | BDD-сценарии 1:1 с тестом (`spec-test-sync`) |
| `tests/e2e/tui-statusline.test.ts` | delete/replace | Мёртвый тест на удалённую `src/utils/statusline.ts` |
| `vitest.config.ts` | edit | Снять exclude statusline-тестов |
| `.specs/native-statusline/*` | create | Спека фикса (FR/AC/feature) — отдельный домен от test-statusline |

> Ограничение, которое план **не** обходит (by design Anthropic): даже Вариант A покажет
> строку только со следующей сессии. Немедленный результат в текущей сессии даёт лишь
> Шаг 4 (doctor fix-action по явному действию юзера).

---

## Спеки/тесты, которые надо синхронизировать

- `.specs/test-statusline/` и `.specs/tui-statusline-mode/` — описывают старую модель.
- `tests/e2e/tui-statusline.test.ts` — **исключён** в `vitest.config.ts` («deleted src util») → мёртвый тест на удалённую функцию.
- При фиксе: добавить BDD `.feature` + интеграционный тест (по `spec-test-sync` rule).

---

## Приложение: команды для воспроизведения evidence

```bash
git log --all --oneline -S resolveClaudeStatusLine -- '*.ts'   # история функции
git show 43cf946 --stat | grep -i installer                     # что снесли
git show 43cf946^:src/installer/claude.ts | sed -n '414,432p'   # setupClaudeStatusLine
git grep -n '"statusLine"' HEAD -- '*.json'                      # никаких manifest
git grep -n 'writeGlobalStatusLine|setupClaudeStatusLine' HEAD -- tools/ .claude/  # нет writer'ов
```
