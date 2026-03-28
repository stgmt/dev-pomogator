# File Changes

Список файлов, которые будут добавлены/изменены при реализации фичи.

См. также: [README.md](README.md) и [TASKS.md](TASKS.md).

| Path | Action | Reason |
|------|--------|--------|
| `src/installer/extensions.ts` | edit | FR-1 — добавить `stability` в Extension interface |
| `src/installer/index.ts` | edit | FR-2, FR-3, FR-4, FR-5 — checkbox label, default checked, --all filter, --include-beta |
| `src/index.ts` | edit | FR-5 — parse --include-beta CLI arg |
| `extensions/docker-optimization/extension.json` | edit | FR-1 — добавить `"stability": "beta"` (первый beta plugin) |
| `tests/e2e/beta-flag.test.ts` | create | Интеграционные тесты для всех AC |
| `tests/features/core/CORE019_beta-flag.feature` | create | BDD сценарии |
