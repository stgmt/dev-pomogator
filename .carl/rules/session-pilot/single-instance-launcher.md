# Single-Instance Launcher + Version Sync (session-pilot)

Правила для standalone-app лаунчера session-pilot (v0.5+). Нарушение → 10-20 окон ИЛИ мерцающий экран без интерфейса.

## Где что лежит (single source of truth)

Вся конфигурация и хелперы лаунчера — в `tools/session-pilot/sp-common.ps1`, который dot-source'ят `launch.ps1` (entry), `create-launcher.ps1` (ярлык) и `start-server.ps1` (автостарт). НЕ дублируй порт/профиль/URL по скриптам — бери из `sp-common.ps1` (`$SpPort`, `$SpUrl`, `$SpProfileDir`, `$SpAppId`, `$SpIconPath`, `$SpWindowTitle`).

## Single-instance: детект по выделенному профилю

Дашборд всегда запускается с выделенным `--user-data-dir` (`%LOCALAPPDATA%\session-pilot\browser-profile`). Поэтому **любой `msedge`/`chrome` процесс с этим профилем в командной строке + ненулевым `MainWindowHandle` = наше окно** (`Get-SpDashboardProcess` + чистый предикат `Test-SpProfileMatch`). `launch.ps1` сначала ищет окно: есть → `Show-SpWindow` (restore+foreground) и выход; нет → поднять сервер + открыть ровно одно `--app` окно.

- НЕ матчи по заголовку окна как primary signal (заголовок — вторичный). Профиль в cmdline — надёжный ключ.
- Edge на одно окно держит ~13 процессов (рендереры/GPU) — считать ОКНА по `MainWindowHandle != 0`, не процессы.

## ⚠️ Версия живёт в ТРЁХ местах — менять ВМЕСТЕ

При смене версии обнови все три синхронно:

1. `tools/session-pilot/extension.json` → `"version"`
2. `tools/session-pilot/handlers.py` → `/api/health` `"version"`
3. `tools/session-pilot/frontend.py` → `const FRONTEND_VERSION`

**Почему критично:** фронтенд при КАЖДОЙ загрузке (`checkServerVersion`, сразу + каждые 30с) сравнивает `FRONTEND_VERSION` с версией из `/api/health`. При несовпадении делает `location.href` (перезагрузку). Если поднять health но забыть `FRONTEND_VERSION` → бесконечный цикл перезагрузки → **мерцание, интерфейс не успевает показаться**. Инцидент 2026-05-27: health=0.5.0, FRONTEND_VERSION=0.4.0 → reload loop. Проверять надо НА ЖИВОЙ СТРАНИЦЕ (открыть окно), а не только `/api/health` (он отдаёт «правильную» версию — но петля во фронте). См. memory `feedback_verify-through-real-delivery-path`.

## SessionStart latency: Add-Type ленивый

`start-server.ps1` — SessionStart-хук с бюджетом <200ms. `sp-common.ps1` компилирует C# (`Add-Type` для window P/Invoke + IPropertyStore) **лениво** — только при первом вызове `Show-SpWindow`/`Set-SpProcessAppId`/`Set-SpShortcutAppId`. НЕ выноси `Add-Type` на верхний уровень файла — это вернёт ~200-300ms в hook path.

## Идентичность приложения

Ярлык несёт свою иконку (`Ensure-SpIcon` рисует `session-pilot.ico` через System.Drawing) + AppUserModelID `ClaudeCode.SessionPilot` (`Set-SpShortcutAppId` через IShellLink+IPropertyStore; PROPVARIANT(VT_LPWSTR) строится вручную — `InitPropVariantFromString` не экспортится по имени из propsys.dll на всех Windows). Оба best-effort: при провале single-instance + иконка всё равно работают. Идеальное слияние закреплённого ярлыка и окна Edge в одну кнопку таскбара НЕ гарантируется (Chromium держит свою идентичность окна).

## Тесты

`tools/session-pilot/tests/test_launcher.py` — SP047-050, 1:1 со сценариями в `session-pilot.feature` (@feature27/@feature23). GUI-интеграции (SP047 первый запуск открывает одно, SP048 повторный фокусирует) под флагом `SP_GUI_TEST=1`; детерминированные (SP049 иконка+AUMID, SP050 предикат) всегда. Все вызывают реальный PowerShell, не инспектят файлы.

## Чеклист при правке лаунчера

- [ ] Новая настройка → в `sp-common.ps1`, не хардкод по скриптам
- [ ] Смена версии → ВСЕ ТРИ места (extension.json + handlers.py + frontend.py)
- [ ] Проверил на ЖИВОЙ открытой странице (не только `/api/health`)
- [ ] `Add-Type` остался ленивым (не на верхнем уровне sp-common)
- [ ] Single-instance прогнан: `SP_GUI_TEST=1 python tests/test_launcher.py`
