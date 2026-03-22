# No Blocking on Tests

## Правило

Docker тесты занимают 7-12 минут. НИКОГДА не блокировать сессию ожиданием.

## Правильно

```
# Запустить в фоне
run_in_background: true

# Продолжать работу
# Когда notification придёт — обработать результат
```

## Неправильно

```
# Блокировка на 30 минут
TaskOutput block=true timeout=600000

# Убийство Docker тестов
TaskStop  # → zombie processes, broken pipes
```

## Чеклист

- [ ] Тесты запущены с `run_in_background: true`
- [ ] НЕ использовал `TaskOutput block=true` для Docker тестов
- [ ] НЕ использовал `TaskStop` для Docker тестов
- [ ] Продолжал работу пока тесты бегут
