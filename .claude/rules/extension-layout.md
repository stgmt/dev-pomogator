# Extension Layout Convention

Rules, skills, commands в dev-pomogator extensions ОБЯЗАНЫ жить **в `.claude/` дерева dev-pomogator repo**, а не внутри `extensions/{name}/`.

## Правильно

```
dev-pomogator/
├── .claude/
│   ├── rules/
│   │   ├── {extension-name}/*.md       ← rule files здесь
│   │   └── {subfolder}/*.md
│   ├── skills/
│   │   └── {skill-name}/
│   │       ├── SKILL.md                ← skill files здесь
│   │       └── scripts/*.ts
│   └── commands/
│       └── *.md                        ← command files здесь
└── extensions/
    └── {extension-name}/
        ├── extension.json              ← manifest ссылается на .claude/ пути
        └── tools/
            └── {tool-name}/*.ts        ← только tools здесь
```

## Неправильно (не работает через installer)

```
extensions/{extension-name}/
├── rules/*.md                          ← ❌ installer не копирует
└── skills/{skill-name}/SKILL.md        ← ❌ installer не копирует
```

## Почему

`src/installer/extensions.ts` функции `getExtensionRules()` + `getExtensionSkills()` резолвят source path относительно **dev-pomogator package root**, ожидая что rules/skills source живёт в `.claude/` корня. При installing scope-gate из `extensions/scope-gate/rules/` в target — installer silently skips потому что source-path не существует там где ищется.

## Правильный манифест (extension.json)

```json
{
  "name": "my-extension",
  "ruleFiles": {
    "claude": [
      ".claude/rules/my-extension/my-rule.md"   ← SOURCE path (dev-pomogator repo root)
    ]
  },
  "skills": {
    "my-skill": ".claude/skills/my-skill"        ← SOURCE dir (dev-pomogator repo root)
  },
  "skillFiles": {
    "my-skill": [
      ".claude/skills/my-skill/SKILL.md"          ← TARGET paths (куда установлено)
    ]
  },
  "tools": {
    "my-tool": "tools/my-tool"                    ← SOURCE subdir of extension (relative to extensions/{name}/)
  },
  "toolFiles": {
    "my-tool": [
      ".dev-pomogator/tools/my-tool/script.ts"   ← TARGET paths для managed tracking
    ]
  }
}
```

### SOURCE vs TARGET paths — не перепутать

Installer обрабатывает поля по-разному:

| Field | Type | Что это | Resolution |
|-------|------|---------|------------|
| `ruleFiles.claude` | **SOURCE** | Где файл сейчас в dev-pomogator repo | `packageRoot + path` — должен существовать |
| `skills.{name}` | **SOURCE dir** | Директория в dev-pomogator repo | `packageRoot + path` — директория должна существовать |
| `tools.{name}` | **SOURCE dir** | Подпапка extension-а | `extensions/{ext}/ + path` |
| `skillFiles.{name}` | **TARGET paths** | Где файлы окажутся после install, для managed tracking | Installer вычисляет hash после copy |
| `toolFiles.{name}` | **TARGET paths** | Где tool-файлы в target, для integrity check | Installer вычисляет hash после copy |

**Не путать направление:** SOURCE fields = где искать файлы сейчас. TARGET fields = где файлы будут после установки.

### Нестандартный case — extension-local skills namespace

Specs-workflow использует `extensions/specs-workflow/.claude/skills/<skill>/` для **private child skills** (discovery-forms, requirements-chk-matrix, task-board-forms). Это легитимный pattern когда skills являются internal helpers конкретного extension, а не top-level skills. Installer всё равно копирует их в target `.claude/skills/{name}/` через `skills.{name}` source path. `extension.json.skills.{name}` просто указывает на extension-local SOURCE path.

## Чеклист (при создании extension)

- [ ] Rules созданы в `.claude/rules/{extension-name}/*.md` (dev-pomogator repo root)
- [ ] Skills созданы в `.claude/skills/{skill-name}/*` (dev-pomogator repo root)
- [ ] В `extensions/{name}/rules/` НЕТ файлов (empty dir OR нет dir)
- [ ] В `extensions/{name}/skills/` НЕТ файлов
- [ ] Tools в `extensions/{name}/tools/{tool}/` — единственное содержимое extension folder (кроме `extension.json`)
- [ ] extension.json `ruleFiles.claude` / `skills` пути указывают на `.claude/...`
- [ ] Validator прошёл: `npx tsx extensions/_shared/extension-layout-validate.ts`

## Validator

Запуск:
```bash
npx tsx extensions/_shared/extension-layout-validate.ts
```

Exit 0 — clean. Exit 1 — found violations (see stderr output for paths to fix).

Используется CI / pre-commit. Также вызывается PreToolUse hook (блокирует Write/Edit файлов в `extensions/*/rules/` или `extensions/*/skills/`).

## Связанные правила

- `.claude/rules/extension-manifest-integrity.md` — manifest должен перечислять все файлы extension
- `.claude/rules/gotchas/installer-hook-formats.md` — 3 формата hook registration в extension.json
- `.claude/rules/updater-sync-tools-hooks.md` — апдейтер синхронизирует ВСЕ artifacts плагинов
