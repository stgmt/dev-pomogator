# Docker-Only Tests

Все тесты запускаются только через Docker (`npm test` → `docker-compose.test.yml`).

## Правильно

- Тест-файлы в `tests/e2e/*.test.ts`
- BDD документация в `tests/features/**/*.feature`
- Запуск: `npm test` (Docker Compose)

## Неправильно

- Отдельный vitest конфиг для "unit" тестов
- Тесты вне `tests/e2e/`
- `npm run test:unit` или аналоги
- vitest.unit.config.ts, jest.config.ts и т.п. в корне

## Чеклист

- [ ] Тест-файл в `tests/e2e/`
- [ ] Есть парный `.feature` в `tests/features/`
- [ ] Запускается через `npm test` (Docker)
