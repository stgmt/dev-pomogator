---
paths:
  - "**/compact_bar.py"
  - "**/statusline_render*"
  - "**/widgets/**"
---

# Verify Render Target Before Editing

## Правило

ПЕРЕД редактированием render/statusline кода — ПРОВЕРИТЬ какой файл реально вызывается.

## Антипаттерн

Редактировать файл который "выглядит как render" без проверки что он вызывается.

## Пример из практики

5 коммитов в `statusline_render.cjs` (RUN badge, building Docker, ago timestamp) — файл не используется. Тестовый statusline рендерится `compact_bar.py` (TUI Python widget).

## Как правильно

1. Проверить `settings.json` (global + project) → `statusLine.command`
2. Если непонятно кто рендерит → добавить debug marker в output
3. Сделать скриншот → проверить что marker виден
4. Только потом редактировать

## Рендеринг в dev-pomogator

- **Тестовый statusline** (`vitest 125/678✅`) → `compact_bar.py` (TUI)
- **ccstatusline** (`npx -y ccstatusline@latest`) → git info, НЕ тесты
- **statusline_render.cjs** → legacy, не вызывается при ccstatusline

## Чеклист

- [ ] Проверил какой файл реально рендерит
- [ ] Сделал скриншот ПОСЛЕ правки
- [ ] Скриншот подтверждает что fix работает
