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
.\tools\specs-generator\scaffold-spec.ps1 -Name "{feature-slug}"
```

## Инструкция для агента

1. Получи название фичи от пользователя (или из аргумента команды)
2. Преобразуй в kebab-case если нужно
3. Запусти скрипт: `.\tools\specs-generator\scaffold-spec.ps1 -Name "{feature-slug}"`
4. Покажи результат создания
5. Предложи перейти к заполнению USER_STORIES.md (первый файл workflow)

## Связанные правила

- `specs-management.md` — полный workflow управления спеками
- `plan-pomogator.md` — формат планов разработки
