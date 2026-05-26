---
description: Создать готовый к работе git worktree (ветка + bootstrap + env + build + опц. PR/devcontainer)
allowed-tools: Bash, Read, Glob, Grep, AskUserQuestion, Skill
argument-hint: "<slug> [--pr=draft] [--skip-build] [--devcontainer]"
---

# /worktree

Тонкая обёртка над skill `worktree-setup`. Создаёт новый git worktree `<main-parent>/<main-basename>-<slug>`
на ветке `feat/<slug>` и делает его рабочим: ставит dev-pomogator инструменты, переносит локальные `.env`-файлы,
делает `npm install` + `npm run build`, проверяет doctor'ом, опционально открывает draft PR и/или поднимает devcontainer.

## Аргументы

- `<slug>` — kebab-case имя фичи (`^[a-z][a-z0-9-]*[a-z0-9]$`), обязателен.
- `--pr=draft` — запушить ветку и открыть draft PR на GitHub (через three-layer резолюцию owner/repo).
- `--skip-build` — пропустить `npm install` + `npm run build`.
- `--devcontainer` — после создания поднять контейнер (`docker compose build && up -d`) с уникальными портами.

## Инструкция для агента

Это вызов skill `worktree-setup` — invoke `Skill("worktree-setup")` с переданными аргументами `$ARGUMENTS`.
Skill сам прогонит `orchestrate.ts`, обработает интерактивные точки (`NEEDS_INPUT: sibling` / `NEEDS_INPUT: pr-repo`)
через AskUserQuestion и выведет per-step summary. Не дублируй логику здесь — следуй `.claude/skills/worktree-setup/SKILL.md`.
