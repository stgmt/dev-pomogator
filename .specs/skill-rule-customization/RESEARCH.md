# RESEARCH — Кастомизируемые skills/rules с сохранением правок при обновлении

> **Статус:** research-only (Phase 1 deliverable). Спека ещё не развёрнута.
> **Дата:** 2026-05-28
> **Вопрос:** как дать пользователю кастомизировать встроенные skills/rules плагина dev-pomogator и НЕ терять кастомизацию при обновлении — через умный авто-мерж. Как это решают другие.
> **Метод:** research-workflow (4 фазы). Каждая гипотеза проверена через ≥3 независимых источника.

---

## 1. Результат (кратко)

Существует **пять зрелых паттернов** решения «vendored-артефакт + правки юзера + обновление без потерь». Они не взаимоисключающие — реальные инструменты комбинируют 2-3.

| # | Паттерн | Одной фразой | Кто использует |
|---|---------|--------------|----------------|
| **P1** | **Sidecar-override** | Не трогай vendored-файл; положи свой рядом, он грузится с приоритетом; vendored-папка gitignored | Oh My Zsh `$ZSH_CUSTOM`, Cursor `.cursor/rules`, Claude Code user-rules |
| **P2** | **3-way merge (diff3)** | Храним «предка» (то что поставили), при апдейте мержим предок↔новый-upstream↔текущий-юзерский | chezmoi, Debian `ucf`, git merge driver |
| **P3** | **Diff capture & reapply** | Сохраняем diff юзера как `.patch`, переприменяем после каждого обновления; конфликт → ошибка | patch-package, yarn `patch:` |
| **P4** | **Layered cascade** | Базовый слой + пользовательский слой композятся при загрузке; на диске ничего не мержится | Claude Code settings/CLAUDE.md/rules, Kustomize overlays, ESLint `extends` |
| **P5** | **Backup + overwrite** (текущий dev-pomogator) | Перезаписать upstream-версией, старую сохранить в backup-папку; мерж вручную | Debian `.dpkg-old`/`.dpkg-dist`, **dev-pomogator сейчас** |

**Главный вывод для dev-pomogator:** мы уже на P5 (худшем для UX — мерж вручную). Минимальный скачок с максимальным эффектом — **P2 (3-way merge)**, потому что переиспользует существующую инфру (SHA-256 трекинг managed-файлов) — нужно лишь дополнительно кешировать **pristine-копию** upstream-версии как «предка». Для rules вдобавок почти бесплатно доступен **P4**, потому что Claude Code **нативно** конкатенирует user-level и project-level rules.

Ответ на твой вопрос «extension.json рядом с каждым или общий»: и то и другое — это форма **per-file merge-strategy декларации** (аналог `.gitattributes merge=<driver>`). Рекомендация — НЕ отдельный json на каждый скил, а поле в существующем `extension.json` (по одному правилу на файл/глоб), плюс опционально marker-блоки внутри самих файлов. Детали в §6.

> **Расширение области (turn 2).** К исходному вопросу добавлены 5 требований: (1) **хук-страж**, запрещающий запись в оригинальные файлы; (2) **скил-помощник**, ведущий юзера по «правильному» пути расширения; (3) дописки/доп-контекст — уже решено (P2/P4); (4) **множественность** расширений (стек overlay'ев); (5) **вычитание** — отключить/проигнорировать кусок инструкции из оригинала. Пункты 1-2-4-5 разобраны в новом **§9**. Главный вывод §9: дописки лёгкие, а **вычитание принципиально требует адресуемости юнитов → это и есть смена архитектуры плагинов**, которую ты предположил.

---

## 2. Текущее состояние dev-pomogator (заземление)

Зафиксировано чтением кода в этой сессии (file:line):

| Артефакт | Поведение при апдейте | Защита правок юзера |
|----------|----------------------|---------------------|
| commands / rules / skills / tools | **Перезапись целиком** (`fs.writeFile(destFile, content)`) | Если SHA-256 не совпал с сохранённым → бэкап в `.dev-pomogator/.user-overrides/`, потом **затирается** upstream-версией |
| hooks (`settings.local.json`) | **Smart-merge**: purge managed + добавить с dedup | User-хуки сохраняются |
| MCP servers (`.mcp.json`) | atomic smart-merge, preserve user keys | да |

Ключевые места:
- `src/updater/content-hash.ts:32-47` — `isModifiedByUser(filePath, storedHash)`: сравнивает текущий SHA-256 с сохранённым.
- `src/updater/backup.ts:20-104` — копия в `USER_OVERRIDES_DIR` + отчёт в `~/.dev-pomogator/last-update-report.md` («merge your changes back if needed»).
- `src/updater/github.ts:8-56` — `ExtensionManifest`: `ruleFiles / commandFiles / tools / toolFiles / skillFiles / hooks / mcpServers / statusLine / postUpdate`. **Нет ни одного поля про override / merge-strategy / extension-points.**

**Вывод:** per-skill/per-rule extension-points сегодня НЕТ. Единственная защита — backup-папка с ручным мержем (P5). 3-way merge невозможен без хранения предка (есть только хеш).

Релевантные правила репозитория (куда подключится механизм): `.claude/rules/updater-managed-cleanup.md`, `.claude/rules/updater-sync-tools-hooks.md`, `.claude/rules/extension-manifest-integrity.md`, `.claude/rules/extension-layout.md`.

---

## 3. Каталог паттернов (детально, с пруфами)

### P1 — Sidecar-override (Oh My Zsh / Cursor / Claude Code)

**Oh My Zsh `$ZSH_CUSTOM`** — канон «don't edit, override alongside»:
> «The `ZSH_CUSTOM` directory (default: `$ZSH/custom`) provides a location for user customizations that persist across Oh My Zsh updates and are prioritized over built-in files. By default, git is set to ignore the custom directory, so that Oh My Zsh's update process does not interfere with your customizations.»

Два режима:
- **Полный override:** `$ZSH_CUSTOM/plugins/<name>/<name>.plugin.zsh` грузится вместо оригинала.
- **Частичный («patch plugin»):** создать отдельный плагин, переопределяющий только нужные функции/переменные, и загрузить его **после** базового.

**Cursor rules** — иерархия с precedence:
> «Rules are applied: Team Rules → Project Rules → User Rules. When rules conflict, earlier sources take precedence. Nested: root `.cursorrules` loaded first, then `packages/api/.cursorrules` layered on top; if they conflict, the nested file wins.»

**Релевантность:** для dev-pomogator — позволить юзеру shadow-ить целый скил/рул из неуправляемой папки. Просто, без мержа, но **частичная** правка managed-файла требует дублировать его целиком.

### P2 — 3-way merge / diff3 (chezmoi / ucf / git merge-file) ★ ключевой

**chezmoi:**
> «chezmoi performs a three-way merge between the destination state, the target state, and the source state for each target… If the target state cannot be computed, a two-way merge is performed instead.»

**Debian `ucf`** (update configuration file) — ровно наш кейс «пакет обновляет конфиг, юзер его менял»:
> «ucf can store one old version of the maintainer's copy… on upgrade, calculate the changes made in the maintainer's version, and apply that patch to the local version (on user request). This is accomplished by stashing the file in a cache during registration, and **using diff3 during the install**. Unlike dpkg, ucf stores the content of these files and is therefore able to offer merge options.»
→ **Прямая аналогия:** ucf хранит контент предка (а dev-pomogator — только хеш). Именно хранение pristine-копии включает diff3.

**git merge driver** — низкоуровневый примитив 3-way:
> «the driver variable's value is used to construct a command for the common ancestor's version (`%O`), current version (`%A`), and the other branch's version (`%B`)… `merge=union` runs a 3-way file-level merge but takes lines from both versions instead of leaving conflict markers.»

**Релевантность:** даёт **истинный авто-мерж** — юзер дописал секцию, апстрим поправил другую → обе применятся без конфликта; конфликт только при правке одних и тех же строк (тогда conflict-маркеры + отчёт, как у git/ucf preview). Markdown rules/SKILL.md мержатся отлично (текст). Скрипты (.ts) — тоже, но рискованнее. **Стоимость:** хранить pristine-копию каждого managed-файла (или его в git-blob/cache).

### P3 — Diff capture & reapply (patch-package)

> «patch-package lets you patch an npm package, keep that patch in version control, and ensure it gets reapplied every time someone installs dependencies… You make changes in `node_modules`, run `patch-package` → it creates `patches/some-package+3.14.15.patch` (a diff)… A `postinstall` hook reapplies the patch on every install.»

**Релевантность:** юзер правит managed-файл → мы генерим его diff против upstream и храним; после каждого обновления переприменяем поверх свежего upstream. Чисто концептуально элегантно, но **diff ломается при дрейфе** (если upstream поменял те же строки — patch fails, нужен ручной разбор). patch-package в этом случае падает с ошибкой. По сути это «P2, но diff хранится явно, а не вычисляется каждый раз».

### P4 — Layered cascade (Claude Code / Kustomize / ESLint) ★ почти бесплатно для rules

**Claude Code НАТИВНО композит rules и память** (самый релевантный — мы и есть Claude Code плагин):
- `.claude/rules/*.md`: «All discovered files are concatenated into context rather than overriding each other.»
- **User-level rules** `~/.claude/rules/`: «User-level rules are loaded before project rules, giving project rules higher priority.»
- `CLAUDE.md` `@path` import: «CLAUDE.md files can import additional files using `@path/to/import` syntax… recursively, max depth four hops.»
- `CLAUDE.local.md` — gitignored персональный слой, грузится рядом с `CLAUDE.md`.
- **Block-level HTML-комментарии** `<!-- ... -->` вырезаются из контекста → готовый механизм маркеров для maintainer-заметок.
- Symlinks в `.claude/rules/` поддерживаются (можно линковать shared-набор).

**Kustomize** — base + overlays без правки базы:
> «A base has no knowledge of an overlay… By using patches it allows resource modifications without changing the base files. Strategic Merge Patch = partial YAML merged with base (specify only fields to change); JSON6902 = surgical add/remove/replace.»

**Релевантность:** для **rules** кастомизация может вообще НЕ трогать managed-файлы — юзер кладёт свои `.claude/rules/*.md` (или `~/.claude/rules/`), Claude Code сам их подмешивает. Для «переопределить тон/добавить пункт» это идеально. Не работает для «отключить/переписать конкретный managed-rule» (конкатенация, не override) и не применимо к скриптам скилов.

### P5 — Backup + overwrite (Debian dpkg / текущий dev-pomogator)

> «When dpkg encounters a modified conffile: "Y" → install new, backup current to `.dpkg-old`; "N" → install new as `.dpkg-dist`, leave original untouched.»

Это **не мерж**, а safety-net. dev-pomogator сейчас здесь (`.user-overrides/`). dpkg при этом хотя бы спрашивает интерактивно; dev-apgrade тихо затирает + пишет отчёт.

---

## 4. Верификация гипотез

| # | Гипотеза | Статус | Достоверность | Источники |
|---|----------|--------|---------------|-----------|
| H1 | Sidecar-override (vendored gitignored + приоритетный user-файл) — доминирующий low-complexity паттерн | **ПОДТВЕРЖДЕНО** | 95% | Oh My Zsh wiki, Cursor docs, Claude Code memory docs |
| H2 | 3-way merge (diff3 с хранимым предком) — стандарт авто-мержа «правки юзера ↔ апстрим» | **ПОДТВЕРЖДЕНО** | 95% | chezmoi docs, Debian ucf manpage, git gitattributes docs |
| H3 | Diff-capture & reapply (P3) выживает при апдейте, но падает при дрейфе строк | **ПОДТВЕРЖДЕНО** | 85% | patch-package README + npm; ucf diff3 (как контраст) |
| H4 | Layered cascade с precedence — чистейший способ для rules; Claude Code делает это нативно | **ПОДТВЕРЖДЕНО** | 95% | Claude Code memory/settings docs, Cursor docs, Kustomize docs |
| H5 | dev-pomogator сегодня = P5 (overwrite+backup), 3-way невозможен без хранения предка | **ПОДТВЕРЖДЕНО** | 100% | Чтение кода: `schema.ts:5-7`, `updater/index.ts:208-215`, `backup.ts` |
| H6 | «extension.json рядом с каждым» избыточен; per-file merge-strategy в одном манифесте достаточно (аналог `.gitattributes merge=`) | **ЧАСТИЧНО** | 70% | git merge driver (per-path attribute), Kustomize (per-resource patch) — прямого «один json на артефакт» прецедента в топ-инструментах не нашёл |
| H7 | Надёжное **вычитание** (отключить кусок инструкции) требует адресуемости юнитов; на голой markdown-прозе возможен только file-level disable или ненадёжный семантический | **ПОДТВЕРЖДЕНО** | 90% | Kustomize `$patch: delete` (по merge-key), ESLint `"rule":"off"` (по rule-id), Claude `claudeMdExcludes` (по файлу) |
| H8 | Механизм «запрет записи в оригиналы» в dev-pomogator уже существует и переиспользуем (PreToolUse deny) | **ПОДТВЕРЖДЕНО** | 100% | Чтение кода: `extension-layout-guard.ts:44-73` (`permissionDecision:'deny'` + Fix-hint) |
| H9 | Множественность overlay'ев требует детерминированного compose (явный порядок + last-wins + отчёт о конфликтах), а не «как-нибудь смержим» | **ПОДТВЕРЖДЕНО** | 90% | ESLint `extends` (later wins), Kustomize overlay stacking, Cursor team→project→user, Claude «arrays merge across layers» |
| H10 | Семантическое вычитание («игнорируй X» в higher-precedence слое) НЕнадёжно | **ПОДТВЕРЖДЕНО** | 85% | Claude memory docs: «If two rules contradict, Claude may pick one arbitrarily» |

---

## 5. Ключевые пруфы (топ-3 цитаты)

1. **ucf (Debian)** — точный аналог нашей задачи + почему нужен контент предка:
   > «ucf stores the content of these files and is therefore able to offer merge options… using diff3 during the install.»

2. **Oh My Zsh** — паттерн «не форкая»:
   > «Oh My Zsh is fully configurable… all that without forking! Customizations in `$ZSH_CUSTOM` are protected from updates… prioritized over built-in files.»

3. **Claude Code** — нативная композиция (нам не надо изобретать загрузчик для rules):
   > «User-level rules `~/.claude/rules/` are loaded before project rules, giving project rules higher priority… All discovered files are concatenated into context rather than overriding each other.»

4. **Вычитание требует адресуемости** (почему именно архитектуру надо менять) — Kustomge удаляет элемент только по merge-key:
   > «to delete a specific item from a list, use the `$patch: delete` directive… Lists without merge keys (like `args`) will be replaced entirely.»
   ESLint выключает унаследованное правило по его **id**: `rules: { "some-rule": "off" }`. У markdown-прозы нет ни merge-key, ни id → surgical-вычитание невозможно без предварительного дробления на адресуемые секции.

---

## 6. Дизайн-опции для dev-pomogator

Три реализуемых подхода (можно комбинировать). Сопоставление паттерн → механизм → trade-off.

### Опция A — 3-way merge (P2) + per-file merge-strategy в `extension.json`

**Суть:** апдейтер хранит pristine-копию каждого managed-файла (предка). При апдейте, если файл изменён юзером → `git merge-file`/diff3(предок, новый-upstream, текущий-юзерский) → авто-мерж; конфликт → conflict-маркеры в файле + строка в отчёте.

**`extension.json` — новое поле (один манифест, не json-на-скил):**
```jsonc
{
  "mergeStrategy": {
    ".claude/rules/**/*.md": "3way",        // текстовый diff3
    ".claude/skills/*/SKILL.md": "3way",
    ".claude/skills/*/scripts/**": "replace", // код безопаснее перезаписывать (с backup)
    ".dev-pomogator/tools/**": "replace"
  }
}
```
Это прямой аналог `.gitattributes merge=<driver>`: per-glob, в одном месте, source of truth — манифест (консистентно с правилом `extension-manifest-integrity`).

- **Что добавить в код:** хранить контент предка (расширить `ManagedFileEntry` → `{ path, hash, baseRef }`, где baseRef — путь в cache `~/.dev-pomogator/.pristine/` или git-blob). diff3 через `git merge-file` (git уже зависимость).
- **Плюсы:** настоящий авто-мерж, переиспользует SHA-трекинг, проверенный механизм (ucf/chezmoi/git), работает для непредвиденных правок.
- **Минусы:** хранение предков (диск); конфликты на скриптах рискованны (→ для `scripts/**` оставить `replace`).

### Опция B — Marker-delimited user-блоки (managed/unmanaged внутри файла)

**Суть:** в managed-файле выделены зоны, которые апдейтер НИКОГДА не трогает:
```markdown
<!-- dev-pomogator:managed:start -->
...тело правила, обновляется апстримом...
<!-- dev-pomogator:managed:end -->

<!-- dev-pomogator:user:start -->
## Мои дополнения (сохраняются при апдейте)
- ...
<!-- dev-pomogator:user:end -->
```
Апдейтер обновляет только managed-зону, user-зону переносит as-is. Опирается на то, что Claude Code **вырезает HTML-комментарии** из контекста (маркеры не засоряют промпт).

- **Плюсы:** предсказуемо, прозрачно юзеру, не нужен diff3, легко аудитить. Идеально для кейса «дописать свой пункт в конец рула».
- **Минусы:** не покрывает правку самого managed-тела (только append/«свои зоны»); требует, чтобы шаблоны скилов/рулесов содержали user-зону.

### Опция C — Layered cascade (P4), opt-in, только для rules

**Суть:** для rules ничего не мержить вообще — документировать, что кастомные правила юзер кладёт в `~/.claude/rules/` или неуправляемый `.claude/rules/_local/`, и Claude Code сам их подмешает (project > user по precedence). Managed-rules остаются read-only.

- **Плюсы:** ноль кода в апдейтере, нативная фича Claude Code, обновления managed-rules никогда не конфликтуют.
- **Минусы:** работает только для rules/CLAUDE.md (не для скрипт-скилов); нельзя «выключить» managed-rule, только дополнить.

### Рекомендуемая комбинация

**A (3way для .md) + B (marker-зоны в шаблонах) + C (документировать cascade для новых правил юзера).**
Скрипты скилов (`scripts/**`) — оставить `replace` с backup (P5), т.к. авто-мерж кода опасен. Конфликты 3-way — НЕ затирать молча: писать conflict-маркеры + отчёт (паттерн git/ucf-preview), что прямо чинит сегодняшний UX-провал «тихо затёрли, мержи вручную».

---

## 7. Ограничения ресёрча (что НЕ нашёл / не проверял)

- **«Один extension.json на каждый скил»** — прямого прецедента в топ-инструментах нет (H6 частично). Все используют либо один манифест с per-glob правилами, либо атрибут на файл. Вывод против россыпи json'ов — обоснован аналогиями, но это [INFERENCE], не прямой пруф.
- **Cline custom instructions** precedence — поиск не дал конкретики (`[UNVERIFIED]`). Cursor покрыл AI-нишу достаточно.
- **Поведение `git merge-file` на Windows/CRLF** в контексте dev-pomogator не тестировал — нужен PoC перед спекой (риск: line-ending дрейф ломает diff3).
- **Производительность 3-way** на больших наборах managed-файлов не замерял (chezmoi/ucf делают per-file on-demand — вряд ли проблема, но [UNVERIFIED] для нашего объёма).
- Не проверял, как Claude Code **plugin marketplace** обновляет установленные плагины (релевантно, если dev-pomogator переедет на нативный plugin-механизм) — отдельная ветка ресёрча.

---

## 8. Рекомендации (что дальше)

1. **Развернуть полную спеку** `create-spec` для `skill-rule-customization`, взяв за основу Опцию A+B+C. Этот файл станет её `RESEARCH.md`.
2. **PoC до спеки:** проверить `git merge-file` на Windows с CRLF на паре реальных rule/SKILL.md (закрыть риск из §7).
3. **FR-кандидаты для будущей спеки:**
   - FR: хранить pristine-копию managed-файла (расширить `ManagedFileEntry`).
   - FR: per-glob `mergeStrategy` в `extension.json` (`3way` / `replace` / `marker`).
   - FR: marker-зоны `<!-- dev-pomogator:user:start/end -->` в шаблонах rules/skills.
   - FR: при конфликте 3-way — conflict-маркеры + строка в `last-update-report.md`, НЕ тихая перезапись.
   - FR (docs): cascade-гайд для кастомных rules через `~/.claude/rules/`.
   - FR: **guard-хук** `managed-write-guard` — deny Write/Edit/MultiEdit на managed-пути, reason → ссылка на overlay + `/customize-pomogator` (§9.1).
   - FR: **скил** `customize-pomogator` — знает архитектуру, спрашивает intent, скаффолдит правильный overlay, валидирует, показывает compiled-preview, не трогает оригиналы (§9.2).
   - FR: **disable-overlay** — file-level (T1) сразу; section-level (T2) — только после введения адресуемых ID секций (§9.3).
   - FR: **compose-шаг** `pomogator compile` — детерминированно складывает base + N overlays (явный order, last-wins, отчёт о конфликтах), эмитит финальные `.claude/rules|skills/*` (§9.4).
   - NFR: миграция старых конфигов без baseRef (fallback на текущий P5).
   - [ARCH] Для надёжного T2-вычитания — переструктурировать rules/skills в **адресуемые юниты** (frontmatter `id` + стабильные section-якоря). Это смена архитектуры плагинов; нужен отдельный design-раунд (§9.3, §9.5).
4. **Variant matrix** на стадии спеки: тип артефакта (rule.md / SKILL.md / script.ts / tool) × стратегия (3way / marker / replace / cascade) — заполнить через `Skill("variant-matrix-build")`.

---

## 9. Расширение области (turn 2): запрет-записи, скил-помощник, вычитание, множественность

Этот раздел отвечает на 5 добавленных требований. Сквозной принцип: **сделать «правильный» путь (overlay) проще, чем «неправильный» (правка оригинала)** — paved-road подход.

### 9.1 — Запрет записи в оригиналы (guard-хук)

Механизм **уже существует** в репозитории и переиспользуем 1:1:

- `extensions/_shared/extension-layout-guard.ts` — PreToolUse хук на `Write`/`Edit`/`MultiEdit` (`:95`), при попытке писать в запрещённое место делает `denyAndExit()` (`:44`) → возвращает `{ permissionDecision: 'deny', permissionDecisionReason }` (`:71-73`) c подсказкой «`Fix: Write to <correctPath> instead`» (`:61`).

**Новый хук `managed-write-guard`:** deny `Write/Edit/MultiEdit`, если нормализованный путь входит в managed-список (из `~/.dev-pomogator/config.json` → `managed.*`) ИЛИ совпадает с pristine-baseline. `reason` указывает: «это управляемый файл; кастомизируй через overlay `<path>` или запусти `/customize-pomogator`».

| Уровень защиты | Что покрывает | Что НЕ покрывает |
|----------------|---------------|------------------|
| guard-хук (PreToolUse deny) | правки **агентом** Claude Code | правку файла руками в IDE / `sed` |
| 3-way merge (P2, §3) | правку руками — поймает при апдейте | — |

→ Хук и 3-way **комплементарны**: хук рулит агентом, 3-way — safety-net для ручных правок. Только хука недостаточно (он advisory на уровне permission-gate, человека в редакторе не остановит).

### 9.2 — Скил-помощник `customize-pomogator`

Прецедент — scaffolding-ассистенты: Kustomize `kustomize create`, Yeoman-генераторы, и **собственный** `scaffold-spec.ts` dev-pomogator. Скил = «paved road», который делает intended-путь самым лёгким.

**Обязанности скила:**
1. Знает архитектуру (где overlay-папка, какие merge-стратегии, синтаксис маркеров/disable).
2. Спрашивает intent бытовым языком (per rule `clear-questions-to-user`, ≤2 опции): «дописать контекст» / «добавить шаг» / «выключить часть» / «заменить целиком» / «новое своё правило».
3. Скаффолдит **правильный** overlay-файл под выбранный intent (не трогая оригинал).
4. Валидирует (schema overlay + layout-guard validator) и показывает **compiled-preview** (что получится после compose — §9.4).
5. Спарен с guard-хуком: его deny-reason указывает «запусти `/customize-pomogator`».

[INFERENCE] прямого «customization-assistant skill» прецедента в чужих инструментах не нашёл — паттерн собран по аналогии со scaffolding-генераторами + собственным scaffold-spec.

### 9.3 — Вычитание (отключить/проигнорировать часть оригинала) — ТРУДНОЕ

Центральная находка: **вычитание = функция адресуемости.** Чужие инструменты умеют выключать унаследованное только потому, что у юнита есть стабильный ключ/ID:

- **Kustomize:** `$patch: delete` удаляет элемент списка **по merge-key** (`name`); списки без merge-key «will be replaced entirely».
- **ESLint:** `rules: { "some-rule": "off" }` гасит правило **по его id**.
- **Claude Code:** `claudeMdExcludes` исключает **целый файл** rule/CLAUDE.md по глобу (грубо).

У markdown-прозы dev-pomogator **нет ни merge-key, ни id** → surgical-вычитание невозможно «как есть». Три реалистичных тира:

| Тир | Гранулярность | Механизм | Прецедент | Стоимость / надёжность |
|-----|---------------|----------|-----------|------------------------|
| **T1 file-level** | целый rule/skill | overlay `disable: ["<glob>"]` → loader/updater пропускает файл (или не ставит) | Claude `claudeMdExcludes`, ESLint `off` | низкая; **надёжно**; доступно почти сразу |
| **T2 section-level** | секция / пункт правила | дать секциям стабильный `id`; overlay `disable: ["rule#id"]`; **compose** генерит финал = база − секции | Kustomize `$patch: delete`, JSON6902 `remove` | **высокая — требует переструктурировать .md в адресуемые юниты = смена архитектуры**; надёжно после |
| **T3 semantic** | произвольная фраза | higher-precedence инструкция «игнорируй пункт X» | — | низкая, но **НЕнадёжно** (Claude: «may pick one arbitrarily») |

**Вывод по вычитанию:** сейчас доступны только **T1 (грубо)** и **T3 (хрупко)**. Желаемое «инструкция почти подходит — убрать один пункт» = **T2**, для которого нужен **compile-шаг**, собирающий effective-файл из base + overlays (аналог `kustomize build`).

> **Коррекция (turn 3, см. §10):** изначально я считал, что T2 требует ручной простановки `id` во все правила (большая миграция). Это **ложная предпосылка** — у markdown уже есть адресное пространство (заголовки → slug через `github-slugger`/`mdast-util-heading-range`), поэтому T2 достижим на текущих .md с **near-zero миграцией**. Смена архитектуры в смысле «переписать все правила» — НЕ обязательна. Детальный спектр и план — в §10.

### 9.4 — Множественность (стек overlay'ев)

Несколько расширений должны складываться **детерминированно**, а не «как-нибудь».

- Прецеденты: ESLint `extends`-массив (later wins), Kustomize overlay stacking, Cursor team→project→user, Claude «arrays merge across layers».
- **Дизайн:** overlay-файлы в папке, применяются в явном `order:` (или лексикографически по имени); каждый декларирует `target` + `op` (`append` / `disable` / `replace`); compose-шаг сворачивает их по порядку, last-wins для конфликтов.
- Два overlay'я, трогающие один и тот же юнит, → **строка в отчёте о конфликте**, не молчаливый выбор (паттерн git/ucf-preview).
- **Auditable compiled output** (как `kustomize build`): юзер видит финальный effective-файл и какой слой что внёс.

### 9.5 — Сводный анализ: решаемо сейчас vs требует смены архитектуры

| Требование | Тип | Реализуемо на текущей архитектуре? | Что нужно |
|------------|-----|-----------------------------------|-----------|
| Дописать контекст/шаг в rule/skill | additive | **Да** | P2 (3way) + B (marker-зоны) |
| Новое своё правило | additive | **Да, почти нативно** | P4 cascade (`~/.claude/rules/`) |
| Запрет записи в оригиналы | guard | **Да** | новый PreToolUse `managed-write-guard` (§9.1) |
| Скил-помощник | UX | **Да** | новый skill `customize-pomogator` (§9.2) |
| Выключить **целый** rule/skill | subtractive T1 | **Да** | disable-overlay (file-level) |
| Выключить **часть** rule (один пункт) | subtractive T2 | **Да, near-zero миграция** (см. §10: AST-compile по slug заголовков; ручные `id` НЕ обязательны) | `mdast-util-heading-range` + `github-slugger` + `pomogator compile` + drift-detector |
| Стек из нескольких расширений | compose | **Да, но нужен compile-шаг** | детерминированный compose (§9.4) |

**Ключевой архитектурный развилок:** если нужен только additive + file-level disable — текущую архитектуру (opaque .md + 3way/markers/cascade) менять НЕ надо, это инкремент к апдейтеру + 2 новых артефакта (хук + скил). Если нужно section-level вычитание (T2) — **придётся** перейти на адресуемые правила и compile-pipeline (это бОльшая работа, отдельный design-раунд; не делать в одной спеке с additive).

---

## 10. Углубление T2 (turn 3): section-level вычитание БЕЗ миграции

Прямой ответ на «мб есть решения лучше/хуже/автоматичнее без головоёбки миграции»: **да — и ручная простановка `id` оказалась ложной предпосылкой.**

### 10.1 Ключевая находка: адресное пространство УЖЕ существует

У markdown готовые адреса секций — **заголовки**, превращаемые в стабильные slug'и автоматически:

- **`github-slugger`** — slug из текста заголовка ровно как GitHub; **держит кириллицу и emoji**. `## Запреты` → `запреты`; дубликаты → `запреты-1`.
- **`mdast-util-heading-range`** (опубликованный npm-util, v4.0.0) — берёт заголовок + **его секцию как диапазон** и применяет handler (удалить/заменить). Сигнатура `(tree, options|test, handler)`. Ровно «адресуй секцию по заголовку и трансформируй» — **без единого ручного `id`**.
- **`remark`/`mdast` + `unist-util-visit`** — общий обход/мутация AST; `vivliostyle/vfm` строит секции через `unist-util-find-after` (реальный sectionize).

→ Compile-шаг адресует любую секцию текущих .md **как есть** (`overlay: disable: ["plan-freshness#запреты"]`), вычислив slug на лету. Миграция = 0 строк в правилах.

### 10.2 Спектр решений T2 (что автоматичнее / что хуже)

| # | Подход | Миграция | Автоматизм | Надёжность | Чем платим |
|---|--------|----------|-----------|------------|-----------|
| **A** | **AST-compile по slug заголовков** (`heading-range` + slugger) | **0** | высокий | средняя | ломается при переименовании заголовка апстримом → нужен drift-warn |
| **B** | Content-anchored removal (overlay цитирует текст, fuzzy) | 0 | высокий | низкая-средняя | ломается при рерайте; fuzz + warn (модель patch-package) |
| **C** | Negative unified diff (reverse-patch, reapply с fuzz) | 0 | средний | низкая | ломается при line-drift |
| **D** | Ручные `id` во frontmatter + якоря секций | **высокая (рефактор всех правил)** | низкий | высокая | головоёбка миграции волнами |
| **E** | Структурный source-of-truth (правила как данные → генерим .md) | **наивысшая** | высокий после | наивысшая | переписать все правила в YAML/JSON |
| **F** | Семантическая инъекция («эти пункты SUPERSEDED») | 0 | n/a | **низшая** | LLM может проигнорировать (= T3) |

### 10.3 Главное: A и D — НЕ развилка, а континуум

A вычисляет slug **на лету** при компиляции; D **записывает** тот же slug в файл как явный `id`. Адресное пространство одно. Поэтому:

> **Стартовать с A (ноль миграции). Проставлять явный `id` (шаг к D) ЛЕНИВО — только тем секциям, по которым drift-detector реально показал нестабильность заголовка.**

Это растворяет «головоёбку миграции»: нет big-bang волны — миграция **ленивая, точечная, по факту поломки**, а не превентивная по всем файлам.

### 10.4 Если всё же robust-by-design (D) — то волнами, но через codemod

Даже при выборе D миграция **не ручная**: одноразовый **codemod** материализует auto-slug'и в явные якоря и пишет обратно. Тогда «волны/батчи» = прогон codemod + ревью диффов:

| Волна | Что | Изменения в правилах |
|-------|-----|---------------------|
| W0 | tooling: slugger + `heading-range` compile + drift-detector + overlay-schema + `managed-write-guard` + skill | нет |
| W1 | самые кастомизируемые правила (откуда юзеры реально хотят вычитать) | codemod проставляет `id`, ревью |
| W2..N | по 5-10 файлов на батч, по папкам `.claude/rules/{ext}/` | codemod + validator, **без смены поведения** |

Codemod идемпотентен; динамический тест в стиле `CORE003_RULES` ловит непокрытые файлы.

### 10.5 Риски/ограничения этого углубления

- **Переименование заголовка апстримом** ломает A-адрес → обязателен **drift-detector** (overlay target не сматчился → WARNING + строка в отчёте, как patch fuzz). Это цена zero-migration.
- **CRLF/Windows** — AST-парс нормализует переносы, но pristine-сравнение по SHA чувствительно; проверить на PoC (тот же риск, что §7).
- **Determinism** — A/D детерминированы; **F и LLM-assisted compile — НЕТ**; для воспроизводимого билда compile обязан быть детерминированным (LLM допустим только на авторинге overlay, не на компиляции).
- **`mdast-util-heading-range`** — зафиксировать версию; [UNVERIFIED] поведение на вложенных одноимённых заголовках (slugger даёт `-1`, автор overlay должен видеть это в preview) — проверить на PoC.

### 10.6 Обновлённая рекомендация по T2

Порядок реализации: **A → (ленивый) D**, с B/C как fallback для не-заголовочных кусков. E — только если когда-нибудь захочется единый структурный источник (отдельная большая инициатива). F не использовать как механизм вычитания (ненадёжно).

> **Решение (turn 4, см. §11): A ОТКЛОНЁН.** Ленивый slug-на-лету оставляет слабое место — апстрим переименовал заголовок → overlay-адрес поплыл → ловить косяки от юзерских апдейтов. Выбран **robust-by-design D**, но без головоёбки миграции: контракт адресуемости зашивается **при создании** (микро-скил рождает born-addressable артефакты), существующие мигрируются codemod'ом волнами, дрейф ловит постоянный хук-варнинг. Детали — §11.

---

## 11. Решение (turn 4): robust-by-design + born-addressable + хук-варнинг

### 11.0 Решение

**A отклонён.** Ленивый slug-на-лету ломается при апстрим-переименовании заголовка → ловить баги от юзерских обновлений. Выбран **D (стабильный `id` как якорь, не текст заголовка)**, но без «головоёбки миграции»: бремя авторинга снимает **скил-создатель** (новые артефакты рождаются совместимыми), существующие мигрируются **codemod'ом волнами** (§10.4), дальше дрейф ловит **постоянный хук-варнинг**. Неломаемый контракт + обвязка зашиваются сразу.

### 11.1 Контракт адресуемости («born-addressable»)

Каждый rule/skill несёт:
- frontmatter `id` — стабильный, НЕ зависит от текста заголовка/имени файла;
- секции с явными стабильными якорями (`### [<section-id>] Заголовок`) — overlay адресует `rule-id#section-id`, который **не рвётся при рерайте заголовка апстримом** (фикс слабого места A);
- объявленную merge-стратегию (3way/marker/replace) + user-зоны для дописок.

### 11.2 Микро-скил `pomogator-skill-new` (или расширить `skill-creator`)

Любой новый скил/рул **рождается** совместимым. Скил:
1. Скаффолдит с frontmatter `id`, section-id якорями, user-зонами, merge-стратегией в `extension.json`.
2. Прогоняет compatibility-чеклист (§11.3) + validator ДО записи.
3. Регистрирует артефакт в манифесте (id, merge-strategy), чтобы apдейтер/compile знали правила.
4. Не даёт создать «неадресуемый» артефакт — структурный gate на входе.

Прецедент: собственный `scaffold-spec.ts` + skill `skill-creator`; born-valid дешевле, чем чинить потом.

### 11.3 Compatibility-чеклист (future-proof)

- [ ] frontmatter `id` уникален и стабилен (kebab, не переименовывается);
- [ ] каждая адресуемая секция имеет стабильный `section-id` якорь;
- [ ] merge-стратегия объявлена в `extension.json` (per-file/glob);
- [ ] есть user-зона(ы) для дописок (marker-блоки);
- [ ] нет правки оригинала вне overlay (guard-hook);
- [ ] добавлен в манифест (`extension-manifest-integrity`);
- [ ] динамический тест (`CORE003`-стиль) покрывает автоматически.

### 11.4 Обвязка enforcement (тройка — паттерн dev-pomogator)

| Слой | Что делает | Прецедент в репо |
|------|-----------|------------------|
| creation-skill | рождает born-addressable | `scaffold-spec`, `skill-creator` |
| PreToolUse guard + standalone validator | отвергает non-compliant Write/Edit + CI | `extension-layout-guard.ts` + `extension-layout-validate.ts` |
| dynamic test | покрывает ВСЕ артефакты автоматически | `CORE003_RULES` |

### 11.5 Хук-варнинг «нужна ручная миграция»

Прецедент 1:1: ~~`src/updater/hook-migration.ts`~~ (removed in v2 migration) крутится **на каждом Stop-событии** (до cooldown) и мигрирует устаревший формат «даже у проектов, которые никогда не апдейтятся» (`hook-migration.ts:7-8`).

Новый хук `addressability-migration-guard` (Stop/SessionStart):
- сканит rules/skills + overlays: есть ли артефакт без `id`/якорей, ИЛИ overlay, чей target-`id`/`section-id` после апдейта больше не находится (дрейф / апстрим удалил секцию);
- если да → **WARNING (не блок)** + строка в `last-update-report.md` + **prompt-hint**: «N артефактов требуют миграции под адресуемую архитектуру — запусти `/pomogator-skill-new --migrate` или попроси Claude Code: „мигрируй X под адресуемость"»;
- идемпотентно; **подсвечивает постоянно**, пока не мигрировано (как hook-migration не молчит).

### 11.6 Почему это «неломаемо» при юзерских обновлениях

- overlay цепляется за `id`, не за текст/позицию → рерайт заголовка апстримом overlay не рвёт;
- остаточный случай (апстрим **удалил** целевую секцию) — не молчит: хук-варнинг + отчёт, решает юзер/Claude (cf. ucf preview, git conflict);
- слои перекрываются: 3-way (P2) ловит ручные правки тела, guard-hook рулит агентом, born-addressable + тест не дают появиться неадресуемому артефакту.

### 11.7 FR-кандидаты (добавить к §8)

- FR: контракт адресуемости (frontmatter `id` + section-id якоря) — обязателен для новых rules/skills.
- FR: микро-скил `pomogator-skill-new` (born-addressable scaffolding + чеклист-gate).
- FR: `addressability-migration-guard` Stop/SessionStart hook (WARNING + prompt-hint, идемпотентно).
- FR: одноразовый codemod миграции существующих артефактов (волнами, §10.4).
- NFR: compile/overlay используют `id`-якоря, НЕ heading-slug (надёжность > zero-migration).

---

## 12. Валидаторы (turn 5): нет сирот + всё ок по требованиям и еджам

Ещё один слой обвязки (§11.4). Запускаются в 3 точках (§12.4), findings — единый `AuditFinding[]` (как `audit-spec.ts` / `spec-reality-check`), severity **ERROR / WARNING / INFO**. Принцип: каждая ссылка имеет цель, каждая кастомизируемая цель прослеживается — **двунаправленно** (ref→target И target→ref), как cross-references в `audit-spec` + CHK-traceability.

### 12.1 Orphan-checks (нет сирот)

| Код | Что ловит | Severity |
|-----|-----------|----------|
| `ORPH_OVERLAY_TARGET` | overlay указывает на `rule-id#section-id`, которого нет (апстрим удалил/переименовал) — это и есть дрейф из §11.5 | ERROR |
| `ORPH_ID_DUP` | два артефакта/секции с одинаковым `id` | ERROR |
| `ORPH_MANIFEST_MISSING` | `id` в манифесте есть, файла на диске нет (cf. `CORE003` / `extension-manifest-integrity`) | ERROR |
| `ORPH_DISK_UNREGISTERED` | артефакт на диске не зарегистрирован в манифесте | WARNING |
| `ORPH_SECTION_ANCHOR` | `section-id` в индексе frontmatter, якоря в теле нет (или наоборот) | ERROR |
| `ORPH_PRISTINE_MISSING` | managed-файл без сохранённого предка → 3-way невозможен (fallback P5) | WARNING |
| `ORPH_USERZONE_UNBALANCED` | marker `user:start` без `user:end` | ERROR |
| `ORPH_OVERLAY_DEAD_EXT` | overlay ссылается на артефакт удалённого/невключённого расширения | WARNING |

### 12.2 Requirements coverage (всё ок по требованиям)

| Код | Что ловит | Severity |
|-----|-----------|----------|
| `REQ_FR_NO_VALIDATOR` | FR без парного теста/валидатора (traceability gap; паттерн `requirements-chk-matrix`) | ERROR |
| `REQ_AC_NO_SCENARIO` | AC без BDD-сценария | WARNING |
| `REQ_MERGE_STRATEGY_MISSING` | артефакт без объявленной merge-стратегии — нельзя обновлять детерминированно | ERROR |
| `REQ_VARIANT_GAP` | полиморфный FR без variant-matrix (cf. `VARIANT_COVERAGE`) | WARNING |

### 12.3 Edge-cases, которые валидаторы ОБЯЗАНЫ покрыть («еджи»)

| Edge | Риск | Реакция валидатора |
|------|------|--------------------|
| два overlay'я на один target (append+disable / два disable) | недетерминизм | `CONFLICT` finding (не молчать, cf. git/ucf) |
| disable секции, на которую другой overlay делает append | append повисает | `ORPH`/`CONFLICT` |
| дублирующиеся/вложенные одноимённые заголовки | slug `-1` неоднозначен | require explicit `section-id` (тянет к D, §10.5) |
| CRLF / encoding дрейф | ложный «modified» по SHA | нормализация перед сравнением |
| циклический `order` overlay'ев | compile не сходится | ERROR |
| half-migrated state (часть born-addressable, часть нет) | тихая потеря кастомизаций | хук-варнинг §11.5 + REQ |
| пустой / no-op overlay | мусор | INFO (positive signal, cf. `verify-divergent-contracts`) |

### 12.4 Где запускаются (3 точки)

| Точка | Что валидирует | Прецедент в репо |
|-------|----------------|------------------|
| born-time (PreToolUse в skill/guard) | контракт §11.3 до записи | `extension-layout-guard.ts` |
| CI / pre-commit | весь corpus: orphans + req + edge | `extension-layout-validate.ts`, `audit-spec.ts` |
| runtime (`addressability-migration-guard`) | дрейф после апдейта | `hook-migration.ts` |

**Bulk-run на реальном corpus обязателен** (rules/skills + overlays), не только изолированные fixtures: `spec-reality-check` bulk-run поймал 4 false-positive за один проход, которых fixtures не видели (rule `maintain-evals-on-edit`).

### 12.5 FR-кандидаты (добавить к §8)

- FR: orphan-валидатор (`ORPH_*`) — двунаправленная trace, fail CI на ERROR.
- FR: requirements/edge-валидатор (`REQ_*`, `CONFLICT` + edge-каталог §12.3).
- FR: единый `AuditFinding[]` формат + severity-gate (как `audit-spec`/`spec-reality-check`).
- FR: bulk-run на реальных rules/skills + overlays перед релизом.

---

## Источники

- Oh My Zsh — Customization: https://github.com/ohmyzsh/ohmyzsh/wiki/Customization
- Oh My Zsh — Configuration & Customization (DeepWiki): https://deepwiki.com/ohmyzsh/ohmyzsh/8-configuration-and-customization
- patch-package — npm: https://www.npmjs.com/package/patch-package
- patch-package — GitHub (ds300): https://github.com/ds300/patch-package
- chezmoi — merge command: https://www.chezmoi.io/reference/commands/merge/
- chezmoi — Usage FAQ (preserve local changes): https://www.chezmoi.io/user-guide/frequently-asked-questions/usage/
- Debian conffiles (Raphaël Hertzog): https://raphaelhertzog.com/2010/09/21/debian-conffile-configuration-file-managed-by-dpkg/
- ucf(1) manpage (Debian): https://manpages.debian.org/bookworm/ucf/ucf.1.en.html
- Kustomize — Declarative Management (k8s docs): https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/
- Kustomize — strategic merge vs JSON6902: https://github.com/kubernetes-sigs/kustomize/blob/master/examples/inlinePatch.md
- Claude Code — Memory (CLAUDE.md / rules / @import): https://code.claude.com/docs/en/memory
- Claude Code — Settings (precedence): https://code.claude.com/docs/en/settings
- git — gitattributes (merge drivers, union): https://git-scm.com/docs/gitattributes
- Custom git merge driver (Praqma example): https://github.com/Praqma/git-merge-driver
- Cursor — Rules (hierarchy): https://cursor.com/docs/rules
- Kustomize — `$patch: delete` / JSON6902 remove (KodeKloud Patches list): https://notes.kodekloud.com/docs/CKA-Certification-Course-Certified-Kubernetes-Administrator/2025-Updates-Kustomize-Basics/Patches-list/page
- ESLint — Configure Rules (turn off `"off"`): https://eslint.org/docs/latest/use/configure/rules
- ESLint — отключение унаследованного из shareable config (issue #3261): https://github.com/eslint/eslint/issues/3261
- dev-pomogator (in-repo) — `extensions/_shared/extension-layout-guard.ts:44-73` (PreToolUse deny + Fix-hint)
- remark — markdown processor (mdast/unified): https://github.com/remarkjs/remark
- mdast — Markdown AST format: https://github.com/syntax-tree/mdast
- github-slugger (slug из заголовков, кириллица): https://github.com/Flet/github-slugger
- mdast-util-heading-range (секция по заголовку как диапазон): https://www.npmjs.com/package/mdast-util-heading-range
- vivliostyle/vfm — sectionize plugin (`unist-util-find-after`): https://github.com/vivliostyle/vfm/blob/main/packages/vfm/src/plugins/section.ts
- dev-pomogator (in-repo) — `src/updater/hook-migration.ts:7-8` (миграция на каждом Stop-событии, прецедент для хук-варнинга)
