# Functional Requirements (FR)

## FR-1: stability field in extension.json @feature1

Optional field `stability` в Extension interface: `'stable' | 'beta'`. Default (отсутствует) = `'stable'`. Backward compatible — существующие manifests не ломаются.

**Связанные AC:** AC-1
**Use Case:** UC-4

## FR-2: Installer checkbox показывает beta label @feature2

В интерактивном режиме beta плагины показаны с пометкой `(BETA)` в имени. Stable плагины без пометки.

**Связанные AC:** AC-2
**Use Case:** UC-1

## FR-3: Beta unchecked по умолчанию в interactive mode @feature2

В интерактивном checkbox beta плагины по умолчанию unchecked. Stable — checked. Пользователь может вручную включить beta.

**Связанные AC:** AC-3
**Use Case:** UC-1

## FR-4: --all исключает beta @feature3

В non-interactive mode с `--all` beta плагины НЕ устанавливаются. Только stable.

**Связанные AC:** AC-4
**Use Case:** UC-2

## FR-5: --include-beta включает beta при --all @feature4

Флаг `--include-beta` в комбинации с `--all` устанавливает ВСЕ плагины включая beta.

**Связанные AC:** AC-5
**Use Case:** UC-3

## FR-6: Updater не добавляет новые beta @feature3

Автообновление обновляет только уже установленные плагины. Новые beta не добавляются автоматически.

**Связанные AC:** AC-6
**Use Case:** UC-5
