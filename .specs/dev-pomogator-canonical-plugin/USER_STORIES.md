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

**Why:** Cursor CLI отвергается с v1.5 (`~~`src/index.ts`~~ (removed in v2 migration):44-47`), но обрывки cursor-кода остались: `extensions/edge-debug-port/extension.json:5` всё ещё содержит `["claude", "cursor"]`, `package.json` `description` упоминает Cursor, в `keywords` есть `"cursor"`. Это технический долг.

**Independent Test:** Grep `cursor` (case-insensitive) по всему репозиторию (`tools/`, `package.json`, манифесты `.claude-plugin/`) — должно вернуть 0 результатов кроме комментариев типа "removed since v2". Legacy CLI (если remains для migration utility) `--cursor` всё ещё отвергается с error message указывающим v2 canonical install.

**Acceptance Scenarios:**

Given репозиторий dev-pomogator v2
When grep `cursor` по всему репозиторию (tools/, package.json, .claude-plugin/ manifests)
Then не найдено ни одной активной ссылки на Cursor (только removal-комментарии)
And legacy CLI `dev-pomogator --cursor` (если remains) exits с non-zero код и сообщением "Cursor support was removed in v2.0. Use canonical install: /plugin marketplace add stgmt/dev-pomogator"
And `package.json` description и keywords не содержат "Cursor"

---

### User Story 7: Portable hook dispatch does not block sessions (Priority: P1)

As a dev-pomogator plugin user running Claude Code from POSIX, Windows, or a foreign project directory, I want hook guarding and doctor checks to select the correct Node executable before Node starts and fail open when diagnostics are unavailable, so that prohibited host BDD calls are stopped early without a platform-specific launcher or transient doctor outage blocking ordinary hook work.

**Требование:** [FR-14](FR.md#fr-14-plugin-hook-commands-are-portable-deps-absent-safe-and-fail-open)

**Why:** Canonical plugin hooks must operate from the installed plugin tree rather than the repository CWD, and a Windows-only executable name or global doctor state turns a diagnostic into an outage for unrelated projects.

**Independent Test:** Invoke the real shell launcher from a POSIX environment and two distinct project CWDs; assert that prohibited host BDD is rejected before Node, a permitted invocation uses `node`, and unavailable or malformed doctor state leaves the permitted action running.

**Acceptance Scenarios:**

Given a canonical plugin hook launcher in a POSIX shell from a foreign project CWD
And doctor state is unavailable or malformed
When the launcher receives a prohibited host BDD command
Then it rejects the command before starting Node
And a permitted hook invocation uses `node`, not `node.exe`
And the permitted hook invocation continues fail-open

---

### User Story 7: Hook runtime recovery that never blocks work (Priority: P1)

**Требование:** [FR-13], [FR-14]

As a Claude Code user, I want every canonical cached-plugin and dogfood hook launcher to run a portable shell-only pre-Node preflight so that a missing or unusable Node runtime recovers safely rather than breaking my hook workflow.

**Why:** Hook launchers run before their Node entry points; recovery must therefore be independent of Node and must leave Claude Code usable on every failure path.

**Independent Test:** Start a hook from each launcher location with its expected Node executable unavailable or non-runnable. Verify shell preflight does not invoke TypeScript, performs only the allowed recovery/migration attempt, emits concise diagnostic guidance, and exits 0.

**Acceptance Scenarios:**

Given Node cannot be executed by a canonical or dogfood hook launcher
When the launcher preflight runs
Then it completes via portable shell without blocking the hook event
And it returns exit 0 after recording an attempted recovery outcome
And later Node availability allows normal hook execution.

---

### User Story 8: Cross-platform runtime resolution (Priority: P1)

**Требование:** [FR-13], [FR-14]

As a Windows or POSIX user, I want hook launchers to select the platform-appropriate Node command without relying on their current working directory so that canonical installs and source-tree dogfood behave identically.

**Why:** Windows commonly exposes `node.exe`, whereas POSIX commonly exposes `node`; hook CWD is not a stable plugin-root contract.

**Independent Test:** Invoke each launcher from a non-plugin CWD on POSIX and Windows-compatible fixtures, preserving an argument containing spaces. Verify the resolved script/root comes from launcher location or approved environment, `node.exe` is accepted on Windows, and a non-runnable candidate follows the recovery path.

**Acceptance Scenarios:**

Given a hook starts outside the plugin root
When the launcher resolves its runtime and target script
Then it never derives the target from the current working directory
And it preserves all original hook arguments
And it treats missing and non-runnable Node candidates consistently.

---

### User Story 9: CWD-scoped once-per-session recovery (Priority: P1)

**Требование:** [FR-13]

As a developer using several repositories in one Claude Code session, I want each project to recover once independently so that a failure in one CWD neither repeats work nor suppresses recovery in another.

**Why:** A process-global marker causes cross-project false sharing; session-only state is insufficient.

**Independent Test:** Trigger two hooks for CWD A and one for CWD B under one session identity, then repeat with a different session identity. Verify one recovery attempt per `(session, normalized CWD)` key and no cross-key suppression.

**Acceptance Scenarios:**

Given recovery has already been attempted for one session and normalized CWD
When another hook runs with that same key
Then it does not repeat recovery
But a different CWD or session receives its own independent attempt.

---

### User Story 10: Safe legacy recovery-state transition and doctor guidance (Priority: P2)

**Требование:** [FR-7], [FR-13]

As an upgrader, I want old unscoped recovery state handled as inert data and actionable doctor guidance when recovery is needed so that upgrading cannot execute stale content or hide the next remedy.

**Why:** Existing legacy markers may collide with the new CWD-scoped model and should never be trusted as executable shell input.

**Independent Test:** Seed a legacy marker plus unrelated state, run preflight, and inspect outcomes. Verify managed legacy state is migrated or retired atomically without evaluation, unrelated state remains unchanged, and doctor output explains runtime status, scoped recovery state, and the next safe action.

**Acceptance Scenarios:**

Given legacy recovery state is present
When the new preflight processes it
Then it does not source or execute marker contents
And it preserves non-managed state
And `/pomogator-doctor` reports an actionable recovery diagnosis.

---

### User Story 11: One bounded Stop lifecycle without lost behavior (Priority: P1)

**Требование:** [FR-13]

As a Claude Code user with DevPomogator enabled, I want one plugin-owned Stop dispatcher instead of thirteen host-visible Node clients so that Stop processing does not amplify memory pressure while every existing approval, block, context, failure, order, and self-heal behavior stays the same.

**Why:** The incident combined 13 DevPomogator Stop clients with exhausted disk and low RAM; coalescing service work alone does not remove host-visible process fanout.

**Independent Test:** Compare the single-dispatch result against a captured 13-route black-box oracle and assert one manifest command, registry-order execution, one-at-a-time legacy child fallback, 256 KiB bounds, and same-session daemon recovery.

**Acceptance Scenarios:** CORE024_21 and CORE024_22.

---

### User Story 12: Shared service never mixes repositories (Priority: P1)

**Требование:** [FR-13], [FR-14]

As a developer working in multiple repositories through one global plugin service, I want project identity, CWD, environment, event flights, workers, and conformance state bound to each current request so that one repository cannot read, write, block, or fill storage on behalf of another or the installed cache.

**Why:** A daemon-start environment and plugin-root fallback are global process state, but the service handles requests for independently owned repositories.

**Independent Test:** Interleave Stop requests for two projects and one non-spec project through an installed-cache fixture, then assert independent FIFO/results and project-confined bounded state.

**Acceptance Scenarios:** CORE024_20 and CORE024_22.
