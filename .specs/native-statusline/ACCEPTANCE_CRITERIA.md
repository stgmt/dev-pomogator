# Acceptance Criteria (EARS)

## AC-1 (FR-1)

**Требование:** [FR-1](FR.md#fr-1-reconciler-slot-classification)

WHEN `reconcileStatusLine` вызван с пустым/`undefined` существующим command THEN reconciler SHALL вернуть `action = "install"` с command `npx -y ccstatusline@latest`.

WHEN вызван с command, содержащим маркер `ccstatusline` THEN reconciler SHALL вернуть `action = "noop"`.

WHEN вызван с командой без маркера THEN reconciler SHALL вернуть `action = "keep-user"` с неизменным command.

## AC-2 (FR-2)

**Требование:** [FR-2](FR.md#fr-2-atomic-conditional-writer)

WHEN writer запущен на settings.json без `statusLine` THEN система SHALL записать `statusLine.command` атомарно (temp + rename) И сохранить все прочие поля settings.json без изменений.

IF reconciler вернул `noop` или `keep-user` THEN система SHALL НЕ выполнять запись на диск.

## AC-3 (FR-3)

**Требование:** [FR-3](FR.md#fr-3-native-statusline-sessionstart-hook)

WHEN SessionStart-хук отрабатывает И writer вернул `changed=true` THEN хук SHALL вывести hook JSON c непустым `systemMessage` И завершиться `exit 0`.

WHEN writer вернул `changed=false` THEN хук SHALL завершиться `exit 0` без `systemMessage`.

## AC-4 (FR-4)

**Требование:** [FR-4](FR.md#fr-4-ownership-marker)

WHEN существующий `statusLine.command` содержит подстроку `ccstatusline` THEN система SHALL классифицировать слот как «наш» (noop) И не перезаписывать его.

WHEN существующий command не содержит маркера THEN система SHALL классифицировать слот как чужой (keep-user).

## AC-5 (FR-5)

**Требование:** [FR-5](FR.md#fr-5-opt-out-switch)

IF `DEV_POMOGATOR_STATUSLINE=off` THEN система SHALL не выполнять никаких мутаций settings.json.

WHEN `DEV_POMOGATOR_STATUSLINE` не задан И слот пустой THEN система SHALL установить statusLine (default-on).

## AC-6 (FR-6)

**Требование:** [FR-6](FR.md#fr-6-hook-registration)

WHEN плагин установлен у пользователя THEN `.claude-plugin/hooks.json` SHALL содержать SessionStart-entry, вызывающий `tools/native-statusline/install_native_statusline.ts` через bootstrap.

WHEN репо работает в dogfood-режиме THEN `.claude/settings.json` SHALL содержать тот же SessionStart-entry.

## AC-7 (FR-7)

**Требование:** [FR-7](FR.md#fr-7-doctor-check-and-fix-action)

WHEN `/pomogator-doctor` запущен И native statusLine отсутствует THEN doctor SHALL пометить check как требующий fix И предложить fix-action.

WHEN пользователь применяет fix-action THEN система SHALL записать statusLine через тот же writer немедленно (в текущей сессии).

WHEN native statusLine уже присутствует THEN doctor SHALL пометить check OK без fix.

## AC-8 (FR-8)

**Требование:** [FR-8](FR.md#fr-8-idempotent-and-fail-open)

WHEN хук запускается повторно И statusLine уже наш THEN система SHALL не выполнять запись (mtime не меняется).

IF settings.json содержит невалидный JSON THEN хук SHALL завершиться `exit 0` без выброса исключения И без мутации файла.

## AC-9 (FR-9)

**Требование:** [FR-9](FR.md#fr-9-domain-separation-guard)

WHEN spec реализована THEN весь новый код SHALL находиться в `tools/native-statusline/` И FILE_CHANGES.md SHALL не содержать путей из `tools/test-statusline/` или TUI-домена.

## AC-10 (FR-10) OUT OF SCOPE

**Требование:** [FR-10](FR.md#fr-10-bundling-ccstatusline-out-of-scope)

> OUT OF SCOPE — см. FR-10. Сборка/вендоринг ccstatusline, `subagentStatusLine` и домен прогресса тестов не покрываются.
> Уточнение 2026-06-05: запись widget-конфига ccstatusline выведена в scope (FR-11); вендоринг бинаря — по-прежнему OUT.

## AC-11 (FR-11)

**Требование:** [FR-11](FR.md#fr-11-widget-config-seeding-and-repair-repo--cwd)

WHEN SessionStart hook запускается И `~/.config/ccstatusline/settings.json` отсутствует THEN система SHALL создать конфиг (атомарно) с каноническим 3-строчным столбиком: `model|context-length` / `git-root-dir|current-working-dir` / `git-branch|git-changes`.

WHEN hook запускается И конфиг-файл существует (любой формы) THEN hook SHALL НЕ мутировать его (byte-for-byte unchanged).

WHEN fix-action `apply-statusline.ts` запускается И конфиг «ours-shaped» (все типы виджетов ⊆ стоковые + наши: стоковый дефолт ИЛИ предыдущая ревизия layout dev-pomogator) И layout не равен канону THEN система SHALL нормализовать `lines` к каноническому столбику, сохранив все прочие поля конфига (read-modify-write).

WHEN fix-action запускается И конфиг содержит не-стоковый/не-наш тип виджета THEN система SHALL НЕ выполнять запись (keep-user, byte-for-byte).

WHEN fix-action запускается повторно И layout уже канонический THEN система SHALL НЕ выполнять запись (noop, идемпотентность).

IF конфиг существует но содержит невалидный JSON THEN система SHALL НЕ перезаписывать его (fail-open).

WHEN doctor check `C-NSW` выполняется И statusLine = ccstatusline И (конфиг отсутствует ИЛИ stock-shaped без repo/cwd) THEN check SHALL репортить `warning` с именами недостающих виджетов и fix-hint.

WHEN check выполняется И statusLine отсутствует/чужой THEN check SHALL репортить `ok` (домен C-NSL — не дублировать warning по одной root cause). WHEN layout кастомизирован THEN check SHALL репортить `ok` (left untouched).
