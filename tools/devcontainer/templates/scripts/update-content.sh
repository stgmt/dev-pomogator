#!/bin/bash
set -e

echo "DevContainer: Обновление контента (update-content)"

cd "{{WORKSPACE_FOLDER}}"

# Сохранение локальных изменений
if [[ -n $(git status -s) ]]; then
    echo "Сохранение локальных изменений..."
    git stash push -m "DevContainer: Auto-stash before update"
fi

# Получение последних изменений
git fetch origin
current_branch=$(git branch --show-current)
echo "Текущая ветка: $current_branch"

# Обновление ветки
if git show-ref --verify --quiet refs/remotes/origin/$current_branch; then
    git pull --no-rebase origin $current_branch || true
fi

# Восстановление локальных изменений
if git stash list | grep -q "DevContainer: Auto-stash"; then
    echo "Восстановление локальных изменений..."
    git stash pop || true
fi

echo "update-content завершен"
