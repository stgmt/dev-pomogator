---
name: create-spec
description: |
  Use this skill whenever the user wants to kickstart a new feature by generating its spec documents before any code is written. The intent signature: user names a feature (often as a slug) and asks for specs/спеки/спека/спецификация to be written, created, drafted, sketched, outlined, or made — sometimes listing desired artifacts (user stories, FR, NFR, AC, design, tasks, BDD `.feature` files, phase 0, TDD order), sometimes explaining they want tests and code to follow from them afterward. Handles English and Russian phrasing equally, including terse requests like "спеки по фиче сделай" or "spec out this feature". The core tell is: feature-naming + creation verb + spec vocabulary. Do NOT use for reading, showing, editing, reviewing, or deleting existing `.specs` content, for explaining what `.specs` is, or for writing development plans (that's plan-pomogator).
allowed-tools: Bash, Write, Read
argument-hint: "<feature-name>"
---

# /create-spec — Scaffold a new feature spec folder

Создаёт структуру папки спецификации в `.specs/{feature-slug}/`.

## Использование

Укажи название фичи в kebab-case:

```
/create-spec my-feature
```

Skill также автоматически срабатывает по натуральному языку (без `/`):
- "сделай спеки для hyperv-test-runner"
- "create spec for billing webhook idempotency"
- "набросай новые спеки по фиче notification-throttle"
- "напиши спецификацию для виндовс билд агента"

## Что будет создано

```
.specs/my-feature/
├── README.md
├── USER_STORIES.md
├── USE_CASES.md
├── RESEARCH.md
├── REQUIREMENTS.md
├── FR.md
├── NFR.md
├── ACCEPTANCE_CRITERIA.md
├── DESIGN.md
├── TASKS.md
├── FILE_CHANGES.md
└── my-feature.feature
```

## Скрипт

Команда вызывает shell-скрипт:

```sh
./.dev-pomogator/tools/specs-generator/scaffold-spec.ts -Name "{feature-slug}"
```

## Инструкция для агента

1. Получи название фичи от пользователя (или из аргумента команды)
2. Преобразуй в kebab-case если нужно
3. Запусти скрипт: `./.dev-pomogator/tools/specs-generator/scaffold-spec.ts -Name "{feature-slug}"`
4. Покажи результат создания
5. Предложи перейти к заполнению USER_STORIES.md (первый файл workflow)
6. Затем читать `.claude/rules/specs-workflow/specs-management.md` для полного 4-фазного workflow с STOP-точками

## Связанные правила

- `specs-management.md` — полный 4-фазный workflow управления спеками с STOP-точками
- `plan-pomogator.md` — формат планов разработки (НЕ путать со спеками — план это roadmap, спека это требования + дизайн + тесты)
