#!/bin/bash
# Восстановить devcontainer на новом ПК из бэкапа сделанного через save.sh
#
# После восстановления:
#   - Все установленные приложения будут на месте
#   - Весь /home/vscode восстановлен (Chrome, Claude, gh, cargo, npm, shell history)
#   - VS Code откроет проект в восстановленном контейнере
#
# Использование:
#   bash .devcontainer/scripts/restore.sh devcontainer-20260226-1200.tar.gz

set -e

BACKUP_FILE="${1}"

echo "==============================================================="
echo "Восстановление devcontainer из бэкапа"
echo "==============================================================="

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
    echo "Укажи файл бэкапа:"
    echo "   bash .devcontainer/scripts/restore.sh <backup.tar.gz>"
    echo ""
    echo "Доступные бэкапы в текущей папке:"
    ls -lh devcontainer-*.tar.gz 2>/dev/null || echo "  (не найдено)"
    exit 1
fi

echo "Файл: ${BACKUP_FILE}"
echo "   Размер: $(du -sh "${BACKUP_FILE}" | cut -f1)"

# Временная директория для распаковки
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

echo ""
echo "Распаковываю пакет..."
tar xzf "${BACKUP_FILE}" -C "${TMP_DIR}"

# -- 1. Загрузить Docker image --
echo ""
echo "Загружаю Docker image..."
echo "   Это может занять 2-5 минут..."
LOAD_OUTPUT=$(docker load < "${TMP_DIR}/image.tar.gz" 2>&1)
echo "$LOAD_OUTPUT"

IMAGE_TAG=$(echo "$LOAD_OUTPUT" | grep -oP "(?<=Loaded image: ).*" | tail -1)
if [ -z "$IMAGE_TAG" ]; then
    IMAGE_TAG=$(echo "$LOAD_OUTPUT" | grep -oP "{{PROJECT_NAME}}-snapshot:[^\s]+" | tail -1)
fi

echo ""
echo "Image загружен: ${IMAGE_TAG}"

# -- 2. Восстановить named volume (весь home) --
if [ -f "${TMP_DIR}/volumes.tar.gz" ]; then
    echo ""
    echo "Восстанавливаю /home/vscode (named volume)..."

    docker run --rm \
        -v {{PROJECT_NAME}}-home:/vol_data/{{PROJECT_NAME}}-home \
        -i alpine sh -c 'tar xzf - -C /' \
        < "${TMP_DIR}/volumes.tar.gz"

    echo "Home volume восстановлен (Chrome, Claude, gh, cargo, npm, shell history)"
else
    echo ""
    echo "Volumes не найдены в бэкапе (старый формат) — пропускаю"
fi

# -- 3. Обновить devcontainer.json --
DEVCONTAINER_JSON=".devcontainer/devcontainer.json"
if [ -f "$DEVCONTAINER_JSON" ] && [ -n "$IMAGE_TAG" ]; then
    echo ""
    echo "Обновляю devcontainer.json..."
    cp "$DEVCONTAINER_JSON" "${DEVCONTAINER_JSON}.bak"

    python3 -c "
import json, sys

with open('${DEVCONTAINER_JSON}', 'r') as f:
    config = json.load(f)

config.pop('build', None)
config['image'] = '${IMAGE_TAG}'

with open('${DEVCONTAINER_JSON}', 'w') as f:
    json.dump(config, f, indent=2, ensure_ascii=False)

print('devcontainer.json обновлен: будет использован снапшот вместо rebuild')
" 2>/dev/null || echo "Не удалось обновить JSON автоматически — сделай вручную (см. ниже)"
fi

echo ""
echo "==============================================================="
echo "Восстановление завершено!"
echo ""
echo "Следующие шаги:"
echo "  1. Открой папку проекта в VS Code"
echo "  2. VS Code спросит 'Reopen in Container' — нажми Yes"
echo "  3. Контейнер запустится из снапшота (все как было!)"
echo ""
if [ -f "${DEVCONTAINER_JSON}.bak" ]; then
    echo "  Оригинальный devcontainer.json сохранен как ${DEVCONTAINER_JSON}.bak"
    echo "      Чтобы вернуться к обычной сборке из Dockerfile:"
    echo "      mv ${DEVCONTAINER_JSON}.bak ${DEVCONTAINER_JSON}"
fi
echo "==============================================================="
