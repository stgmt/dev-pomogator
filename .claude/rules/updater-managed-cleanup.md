# Updater Managed Cleanup

Апдейтер имеет право удалять только свои артефакты. Все управляемые файлы должны трекаться в конфиге по `projectPath`.

## Правильно

- Обновлять commands/rules/tools строго по манифесту
- Хранить список управляемых файлов с SHA-256 хешами (`ManagedFileEntry { path, hash }`)
- Перед перезаписью файла — сравнивать хеш на диске с эталонным
- Если файл изменён пользователем — бэкапить в `{projectPath}/.dev-pomogator/.user-overrides/` перед перезаписью
- Обновлять/удалять hooks только для управляемых команд (smart merge)
- Удалять только устаревшие managed-файлы

## Неправильно

- Удалять пользовательские файлы или правила
- Перезаписывать файлы без проверки user-модификаций
- Применять backup-стратегию к hooks-файлам (hooks.json, .claude/settings.json — только smart merge)
- Оставлять устаревшие hooks после обновления

## User Modifications Protection

Стратегия: **Content Hash + Backup + Overwrite**

1. При записи managed-файла апдейтер сохраняет SHA-256 хеш содержимого
2. При следующем обновлении — сравнивает хеш файла на диске с сохранённым
3. Если хеши не совпадают (файл изменён пользователем):
   - Копирует текущий файл в `.dev-pomogator/.user-overrides/{relativePath}`
   - Перезаписывает upstream-версией
   - Записывает в `~/.dev-pomogator/last-update-report.md`
4. Hooks-файлы обновляются через smart merge (read-modify-write), пользовательские хуки не затрагиваются

## Personal-pomogator integration

Начиная с personal-pomogator spec, managed-cleanup scope расширен:

1. **Gitignore marker block** (`.gitignore` target проекта) — managed. При uninstall удаляется через `removeManagedGitignoreBlock`. См. `src/installer/gitignore.ts`.
2. **`.claude/settings.local.json` dev-pomogator entries** — managed. При uninstall удаляются через `stripDevPomogatorFromSettingsLocal` (preserving user keys). См. `src/installer/settings-local.ts`.
3. **Self-guard**: uninstall refuses to run в dev-pomogator source repo (`isDevPomogatorRepo` check). Защищает dogfooding.

## Чеклист

- [ ] Managed-список обновлён после апдейта (с хешами)
- [ ] Удалены только устаревшие managed-файлы
- [ ] User-модификации забэкаплены в `.dev-pomogator/.user-overrides/` перед перезаписью
- [ ] Hooks синхронизированы без дубликатов (smart merge)
- [ ] Пользовательские хуки сохранены при обновлении
- [ ] `.dev-pomogator/.user-overrides/` добавлен в `.gitignore`
- [ ] Managed gitignore marker block удаляется при uninstall (personal-pomogator FR-8)
- [ ] dev-pomogator entries стрипаются из `.claude/settings.local.json` при uninstall (preserve user keys)
- [ ] Uninstall refuses в dev-pomogator source repo (self-guard)
