# User Stories

> Each story uses the User Story Form (v3). Required fields per block:
> `(Priority: P1|P2|P3)` in heading + **Why:** + **Independent Test:** + **Acceptance Scenarios:** (inline Given/When/Then).
> Skill `discovery-forms` auto-populates this file during Phase 1. Hook `user-story-form-guard` enforces the form at Write/Edit time.

### User Story 1: Установка без коммита в общий .gitignore (Priority: P1)

As a разработчик в командном репозитории, I want установить dev-pomogator через canonical Anthropic marketplace command (`/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt`), чтобы плагин работал во всех моих проектах без коммита изменений в shared `.gitignore` или иные team-файлы — review проходит без блокера.

**Why:** Текущая v1 архитектура пишет managed-block в shared `.gitignore` target-проекта через npm postinstall. Ревьюверы команд блокируют такие коммиты. Невозможно поставить помогатор в строго ревьюируемый репозиторий — это главный практический blocker. Canonical Anthropic mechanism не пишет в project files (cache живёт в `~/.claude/plugins/cache/`).

**Independent Test:** В чистом git-репозитории команды (CWD) запустить `/plugin marketplace add stgmt/dev-pomogator` затем `/plugin install dev-pomogator@stgmt`. После завершения установки в CWD выполнить `git status --porcelain` — должен вернуть пустую строку (нет changes). Дополнительно проверить наличие `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/.claude-plugin/plugin.json`.

**Acceptance Scenarios:**

Given чистый git-репозиторий в CWD без dev-pomogator install
When пользователь запускает `/plugin marketplace add stgmt/dev-pomogator`
And пользователь запускает `/plugin install dev-pomogator@stgmt`
Then в `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/` создан canonical plugin tree
And `~/.claude/settings.json` содержит `"dev-pomogator@stgmt": true` в `enabledPlugins`
And `git status --porcelain` в CWD возвращает пустую строку
And `.gitignore` в CWD не изменён

---

### User Story 2: Plugin виден в Claude Desktop (Priority: P1)

As a пользователь Claude Desktop, I want видеть skills и команды dev-pomogator после canonical install (через UI «**+** → Plugins» в Desktop или CLI `/plugin install`), чтобы переключение между Claude Code CLI и Desktop приложением не требовало повторной установки или ручной настройки.

**Why:** Anthropic plugin spec (verified per desktop-quickstart.md verbatim quote) задокументировал Desktop UI «**+** → Plugins» button. User-scope (`~/.claude/plugins/`) — это canonical location, который читают и CLI и Desktop. Если distribution через npm postinstall — Desktop ничего не увидит без отдельного manual setup. Canonical install bypass-ит эту проблему.

**Independent Test:** Запустить `/plugin marketplace add stgmt/dev-pomogator` + `/plugin install dev-pomogator@stgmt`, открыть Claude Desktop (после restart если требуется), проверить что в списке доступных skills появились skills из плагина (например `create-spec`, `research-workflow`, `proxy-up`).

**Acceptance Scenarios:**

Given dev-pomogator установлен через canonical `/plugin install dev-pomogator@stgmt` (default user-scope)
When пользователь открывает Claude Desktop
Then skills из `~/.claude/plugins/cache/stgmt/dev-pomogator/<version>/skills/` доступны в Desktop UI Skill picker
And нет необходимости в дополнительной настройке Desktop (после restart application)

---

### User Story 3: Activation через `/reload-plugins` без manual setup (Priority: P1)

As a пользователь который выполнил `/plugin install dev-pomogator@stgmt`, I want чтобы плагин активировался единственной командой `/reload-plugins` (CLI) или automatic Desktop reload, чтобы install flow был как у любого другого Claude Code plugin без custom dev-pomogator-specific шагов.

**Why:** Per Anthropic discover-plugins.md verbatim: «After installing, run `/reload-plugins` to activate the plugin». File placement в `~/.claude/plugins/` без `enabledPlugins` declaration в settings.json НЕ активирует plugin. Canonical mechanism handles это automatically через `/plugin install` updating `enabledPlugins` + `/reload-plugins` triggering activation.

**Independent Test:** В Claude Code CLI session: `/plugin install dev-pomogator@stgmt` → verify skills not yet visible → `/reload-plugins` → verify skills become available через `/skill` picker (e.g., `dev-pomogator:create-spec` discoverable).

**Acceptance Scenarios:**

Given пользователь выполнил `/plugin install dev-pomogator@stgmt` в active CLI session
And current CLI session не yet видит plugin skills
When пользователь запускает `/reload-plugins`
Then skills становятся available в current session
And `/skill` picker отображает skills с namespace `dev-pomogator:<skill-name>`

---

### User Story 4: Авто-миграция v1 → v2 cleanup (Priority: P1)

As a существующий пользователь dev-pomogator v1.x, I want чтобы migration script `tools/migrate-v1-to-v2.ts` (запускаемый через `npx tsx`) удалял ВСЕ v1 artifacts (project AND global, через `--global` flag), чтобы upgrade на v2 не оставлял orphan-файлы в `~/.dev-pomogator/`, stale entries в `~/.claude/settings.json`, или managed marker в `.gitignore`.

**Why:** v1 install пишет в multiple locations: project (`.claude/skills/`, `.claude/rules/`, `.dev-pomogator/`, `.gitignore` block, `.claude/settings.local.json` hooks) AND global (`~/.dev-pomogator/scripts/`, `~/.claude/settings.json` SessionStart hook + statusLine wrapper, `~/.config/dev-pomogator/`). Migration без `--global` оставит global artifacts hanging — confusing user experience.

**Independent Test:** На fixture проекте с v1 install (предсозданные `.dev-pomogator/`, `.claude/skills/`, `.gitignore` с marker) AND fixture global state (`~/.dev-pomogator/`, `~/.claude/settings.json` с dev-pomogator hook entry) запустить `npx tsx tools/migrate-v1-to-v2.ts --global`. Проверить: project artifacts удалены, global directories удалены, settings.json hook entry stripped (preserving other user keys), `.migrated-to-v2` marker записан.

**Acceptance Scenarios:**

Given проект с v1 install (`.dev-pomogator/`, `.claude/skills/`, marker в `.gitignore`)
And global v1 artifacts: `~/.dev-pomogator/scripts/tsx-runner-bootstrap.cjs`, dev-pomogator entries в `~/.claude/settings.json`
When пользователь запускает `npx tsx tools/migrate-v1-to-v2.ts --global`
Then скилы/правила/команды копируются в `<cwd>/.dev-pomogator/.user-overrides/` если content hash mismatch
And project-scope managed files удаляются
And `.gitignore` managed block удалён (preserving user entries)
And `.dev-pomogator/.migrated-to-v2` marker записан
And `~/.dev-pomogator/` директория удалена
And dev-pomogator entries удалены из `~/.claude/settings.json` через smart merge
And `~/.config/dev-pomogator/` удалён (если existует)

---

### User Story 5: Project-scope opt-in для специфичных кейсов (Priority: P2)

As a разработчик который привязал помогатор к одному репо (CI runner, изолированный sandbox, team-shared install committed в repo), I want опт-ин `/plugin install dev-pomogator@stgmt --scope project`, чтобы install был committed в `<cwd>/.claude/settings.json` для team-sharing.

**Why:** Не все случаи покрываются user-scope. Команда хочет install dev-pomogator который виден всем collaborators этого репозитория и committed в git. `--scope project` per Anthropic plugin spec пишет в `<cwd>/.claude/settings.json` `enabledPlugins` (committed file). Это canonical Anthropic behavior, dev-pomogator не custom override.

**Independent Test:** В чистом проекте запустить `/plugin install dev-pomogator@stgmt --scope project`. Проверить наличие `"dev-pomogator@stgmt": true` в `<cwd>/.claude/settings.json` (committed file) AND `<cwd>/.claude/settings.local.json` НЕ содержит entry AND `~/.claude/settings.json` НЕ содержит new entry от этого install action.

**Acceptance Scenarios:**

Given чистый git-репозиторий в CWD
When пользователь запускает `/plugin install dev-pomogator@stgmt --scope project`
Then `<cwd>/.claude/settings.json` `enabledPlugins` содержит `"dev-pomogator@stgmt": true`
And `<cwd>/.claude/settings.local.json` не модифицирован
And `~/.claude/settings.json` не получает new entry от этого install action

---

### User Story 6: Cursor support удалён без сюрпризов (Priority: P3)

As a maintainer dev-pomogator, I want чтобы Cursor-related код был удалён полностью (manifests, code paths, package.json keywords), чтобы не поддерживать мёртвый функционал и не путать пользователей.

**Why:** Cursor CLI отвергается с v1.5 (`src/index.ts:44-47`), но обрывки cursor-кода остались: `extensions/edge-debug-port/extension.json:5` всё ещё содержит `["claude", "cursor"]`, `package.json` `description` упоминает Cursor, в `keywords` есть `"cursor"`. Это технический долг.

**Independent Test:** Grep `cursor` (case-insensitive) по всему репозиторию (`tools/`, `package.json`, манифесты `.claude-plugin/`) — должно вернуть 0 результатов кроме комментариев типа "removed since v2". Legacy CLI (если remains для migration utility) `--cursor` всё ещё отвергается с error message указывающим v2 canonical install.

**Acceptance Scenarios:**

Given репозиторий dev-pomogator v2
When grep `cursor` по всему репозиторию (tools/, package.json, .claude-plugin/ manifests)
Then не найдено ни одной активной ссылки на Cursor (только removal-комментарии)
And legacy CLI `dev-pomogator --cursor` (если remains) exits с non-zero код и сообщением "Cursor support was removed in v2.0. Use canonical install: /plugin marketplace add stgmt/dev-pomogator"
And `package.json` description и keywords не содержат "Cursor"
