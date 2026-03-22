---
paths:
  - "extensions/**"
  - "src/**"
  - "**/compact_bar.py"
  - "**/yaml_writer.ts"
  - "**/test_runner_wrapper.*"
---

# Post-Edit Verification Checklist

После КАЖДОГО изменения кода — выполнить ВСЕ шаги перед коммитом.

## Чеклист

- [ ] `npm run build` — компиляция без ошибок
- [ ] Скопировать изменённые файлы в installed location:
  - `extensions/*/tools/` → `.dev-pomogator/tools/`
  - `src/scripts/tsx-runner.js` → `~/.dev-pomogator/scripts/tsx-runner.js`
- [ ] Запустить тесты (`/run-tests`) в background
- [ ] Если UI/statusline изменения — сделать screenshot через `/debug-screenshot`
- [ ] Screenshot анализ: описать что ВИДНО, сравнить с ОЖИДАНИЕМ
- [ ] Коммит ТОЛЬКО после green tests + visual confirmation

## Антипаттерн

Коммитить после build pass без:
- копирования installed copies
- запуска тестов
- визуальной проверки UI изменений

## Пример из практики

5 коммитов в `statusline_render.cjs` — файл не вызывается. Ни один коммит не был проверен скриншотом. Если бы сделал screenshot после первого коммита — увидел бы что ничего не изменилось и не потратил бы 5 коммитов впустую.
