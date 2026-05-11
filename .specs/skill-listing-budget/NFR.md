# Non-Functional Requirements (NFR)

## Performance

- **NFR-P1**: Запись в `~/.claude/settings.json` SHALL занимать ≤100ms на NVMe SSD (read + parse + decide + atomic write). На older HDD — ≤500ms.
- **NFR-P2**: Idempotent no-op path (FR-2) SHALL не вызывать `fs.writeFile` или `fs.move` вообще — только read + parse + compare.

## Security

- **NFR-S1**: Atomic write per `.claude/rules/atomic-config-save.md` — temp file в same directory + `fs.move(overwrite: true)`. Никакого partial write визибл другим процессам Claude Code.
- **NFR-S2**: При обнаружении битого JSON — backup в `~/.dev-pomogator/.user-overrides/settings.json.broken-{epoch}` (preserve audit trail). Никогда не silent-overwrite битого файла без backup.
- **NFR-S3**: Никаких write вне `~/.claude/settings.json` и `~/.dev-pomogator/.user-overrides/` от этой фичи (per `.claude/rules/no-unvalidated-manifest-paths.md` — все paths validated).

## Reliability

- **NFR-R1**: При любой read/parse/write ошибке (permission denied, disk full, locked file) installer SHALL продолжить остальные шаги install и записать warning в install report. Не abort install полностью.
- **NFR-R2**: Cross-platform: Windows, macOS, Linux. Path resolution через `os.homedir() + '/.claude/settings.json'` (cross-platform), не hardcoded `/`. На Windows fs.move атомарен per `fs-extra` semantics.
- **NFR-R3**: На Claude Code < 2.1.132 (где ключ не supported) — write выполняется в любом случае (Claude Code validator просто проигнорирует unknown key). No version-check fallback нужен.

## Usability

- **NFR-U1**: Install report строка про `skillListingBudgetFraction` SHALL быть human-readable, одна строка, формат из FR-4. Никаких stack traces или JSON dumps в успешном case.
- **NFR-U2**: README.md этой спеки SHALL объяснить простыми словами: что фичей делается, почему 1.0, как откатить (manual edit settings.json + не запускать dev-pomogator update).
