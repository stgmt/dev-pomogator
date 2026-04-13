# Non-Functional Requirements (NFR)

## Performance

- Linux test (CORE003_18) ДОЛЖЕН завершаться менее чем за 60 секунд (включая npx download tarball + npm reify + dev-pomogator install). Базируется на типичном времени одного `npx --yes github:stgmt/dev-pomogator --claude --all` ≈ 30-45 секунд в Docker контейнере с warmed npm cache.
- Windows test (CORE003_19) ДОЛЖЕН завершаться менее чем за 120 секунд (npm reify на Windows медленнее из-за file lock retries и cleanup attempts). Failing test обычно завершается быстрее (~ 30 секунд) поскольку npm exits на первом EPERM.

## Security

- N/A — тесты не работают с secrets/credentials. Используют public GitHub repo `stgmt/dev-pomogator` и public npm registry.
- Helper НЕ передаёт environment variables кроме `FORCE_COLOR=0` и `NPM_CONFIG_CACHE` (опционально). Никаких токенов / API keys.

## Reliability

- Linux test ДОЛЖЕН быть deterministic в Docker (single-process container, fresh `mkdtempSync` cache, no shared state с предыдущими test runs). Flaky behaviour не допускается — если падает 1 раз из 10, нужно искать root cause в helper-е, не retry-ить.
- Windows test может быть flaky из-за race conditions между npm и Windows AV/file watchers. Это **известное ограничение** — документировано в RESEARCH.md. CI на Windows host не считает разные failure modes (EPERM на разных файлах) как разные регрессии.
- Helper использует `timeout: 120_000` в spawnSync чтобы избежать infinite hang.

## Usability

- Failing CORE003_19 test ДОЛЖЕН выводить actionable error message: путь к `.specs/install-diagnostics/RESEARCH.md` для root cause + ссылку на skill `/install-diagnostics`. Test message не должен заставлять разработчика гадать.
- Skill `install-diagnostics` использует понятный язык (русский для триггеров, mixed RU/EN для технического контента) и предлагает 4 fix варианта по приоритету.
- BDD scenarios CORE003_18/19 написаны в gherkin естественным языком, понятным non-developer-ам (Product Manager / QA).
