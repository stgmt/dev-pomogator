---
description: Создать новую спецификацию в .specs/
allowed-tools: Shell, Write, Read
argument-hint: "<feature-name>"
---

# /create-spec

Создаёт структуру папки спецификации в `.specs/{feature-slug}/`.

## Использование

Укажи название фичи в kebab-case:

```
/create-spec my-feature
```

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

Команда вызывает PowerShell скрипт:

```powershell
.\.dev-pomogator\tools\specs-generator\scaffold-spec.ps1 -Name "{feature-slug}"
```

## Инструкция для агента

1. Получи название фичи от пользователя (или из аргумента команды)
2. Преобразуй в kebab-case если нужно
3. Запусти скрипт: `.\.dev-pomogator\tools\specs-generator\scaffold-spec.ps1 -Name "{feature-slug}"`
4. Покажи результат создания

## Phase-aware workflow (ОБЯЗАТЕЛЬНО)

PreToolUse hook (`phase-gate.ts`) физически блокирует запись в файлы будущих фаз.
Работай СТРОГО по фазам, на каждой СТОП-точке используй AskUserQuestion для подтверждения.

**Phase 1 (Discovery):** Заполни USER_STORIES.md, USE_CASES.md, RESEARCH.md.
→ СТОП #1: AskUserQuestion — "Подтверждаешь Discovery?"
→ После подтверждения: `spec-status.ps1 -ConfirmStop Discovery`

**Phase 1.5 (Context):** Заполни секцию Project Context в RESEARCH.md (или пропусти).
→ СТОП #1.5: AskUserQuestion — "Подтверждаешь Context?"
→ После подтверждения: `spec-status.ps1 -ConfirmStop Context`

**Phase 2 (Requirements):** Заполни FR.md, NFR.md, ACCEPTANCE_CRITERIA.md, DESIGN.md, FILE_CHANGES.md, REQUIREMENTS.md, .feature.
→ СТОП #2: AskUserQuestion — "Подтверждаешь Requirements?"
→ После подтверждения: `spec-status.ps1 -ConfirmStop Requirements`

**Phase 3 (Finalization):** Заполни TASKS.md, README.md, CHANGELOG.md.
→ СТОП #3: AskUserQuestion — "Подтверждаешь Finalization?"
→ После подтверждения: `spec-status.ps1 -ConfirmStop Finalization`
→ Автоматически запускается Phase 3+ (Audit)

## Связанные правила

- `specs-management.md` — полный workflow управления спеками
- `plan-pomogator.md` — формат планов разработки
