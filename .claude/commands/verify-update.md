# /verify-update — Проверка обновления через updater

## Описание

Проверяет, что updater корректно подхватывает обновления: bump версии, скачивание файлов, обновление managed hashes, бэкап user-модификаций.

## Параметры

- `TEST_DIR`: путь к тестовой директории (по умолчанию: `../test-update-pomogator`)
- `SOURCE_DIR`: путь к репозиторию dev-pomogator (по умолчанию: текущий проект)
- `HOME_DIR`: домашняя директория пользователя (по умолчанию: `$HOME` / `%USERPROFILE%`)

## Предусловия

- SOURCE_DIR — git repo с remote на GitHub (updater скачивает с `raw.githubusercontent.com`)
- Есть права на push в main (нужен bump + push)

## Как работает updater

`fetchExtensionManifest()` в `src/updater/github.ts` берёт `extension.json` с `raw.githubusercontent.com/stgmt/dev-pomogator/main`. Сравнивает `semver.gt(remote.version, installed.version)`. Если remote > installed — скачивает файлы через `downloadExtensionFile()`.

## Workflow

### Шаг 1: Подготовка + установка

1. `npm run build` в SOURCE_DIR
2. Создать TEST_DIR, `git init`, `mkdir .cursor`
3. Установить:
   ```bash
   node SOURCE_DIR/bin/cli.js --cursor --all
   node SOURCE_DIR/bin/cli.js --claude --all
   ```
4. Запомнить state: файлы, хеши, config

### Шаг 2: Bump версии + push

В SOURCE_DIR:
1. Выбрать расширение для теста (например `plan-pomogator`)
2. Bump версии: `extension.json` → `version: "X.Y.Z+1"`
3. Изменить содержимое одного файла (например добавить комментарий в `validate-plan.ts`)
4. `git add && git commit && git push`

**СТОП**: Подтвердить у пользователя перед push!

### Шаг 3: Запуск updater

В TEST_DIR (или любой директории):
```bash
node HOME_DIR/.dev-pomogator/scripts/check-update.js --force
```

### Шаг 4: Верификация

Проверить по чеклисту.

### Шаг 5: Cleanup

1. В SOURCE_DIR: revert bump commit + push
2. Удалить TEST_DIR

**СТОП**: Подтвердить у пользователя перед revert push!

---

## Чеклист

| # | Проверка | Что | Как |
|---|----------|-----|-----|
| U1 | Версия обновилась | Config: расширение version = новая версия | Прочитать `HOME_DIR/.dev-pomogator/config.json` |
| U2 | Файл обновился | `.dev-pomogator/tools/{ext}/{file}` содержит изменения | Прочитать файл в TEST_DIR |
| U3 | Managed files обновились | Config: `managed[projectPath].tools` содержит новый хеш | Сравнить хеши до и после |
| U4 | Остальные расширения не тронуты | Хеши файлов других расширений не изменились | Сравнить хеши |
| U5 | Hooks не задвоились | Кол-во hook entries не увеличилось | Сравнить до и после |
| U6 | User-modified файлы бэкапятся | Изменить файл вручную → обновить → бэкап в `.dev-pomogator/.user-overrides/` | Проверить директорию |
| U7 | PostInstall toolFiles обновлены | deps-install.py присутствует в `.dev-pomogator/tools/forbid-root-artifacts/` после обновления | Проверить файл + содержимое |
| U8 | PostInstall deps работают | `python3 deps-install.py` exit 0, pyyaml/pre-commit доступны | Запустить скрипт |

### Расширенная проверка U6

1. Перед Шагом 3, вручную изменить один managed файл в TEST_DIR (например дописать комментарий в tool-файл)
2. Запустить updater
3. Проверить:
   - Файл перезаписан upstream-версией
   - Старая (user-modified) версия сохранена в `TEST_DIR/.dev-pomogator/.user-overrides/{path}`
   - В `HOME_DIR/.dev-pomogator/last-update-report.md` есть запись о бэкапе

---

## Формат отчёта

```markdown
## Отчёт обновления dev-pomogator

### Summary
- Updater: OK/FAIL
- Bump: {ext} {old_ver} → {new_ver}
- Проблемы: N

### Чеклист

| # | Проверка | Результат | Детали |
|---|----------|-----------|--------|
| U1 | Версия обновилась | OK/FAIL | {version} |
| U2 | Файл обновился | OK/FAIL | {file} |
| U3 | Managed hashes | OK/FAIL | old: {hash1} → new: {hash2} |
| U4 | Другие расширения | OK/FAIL | |
| U5 | Hooks | OK/FAIL | before: N, after: N |
| U6 | User-modified backup | OK/FAIL | backup path: ... |
| U7 | PostInstall toolFiles | OK/FAIL | deps-install.py exists |
| U8 | PostInstall deps | OK/FAIL | pyyaml + pre-commit |

### Cleanup
- [ ] Revert commit reverted + pushed
- [ ] TEST_DIR удалён
```
