#!/bin/bash
# Сохранить ПОЛНОЕ состояние devcontainer для переноса на другой ПК
#
# Что сохраняется:
#   docker commit (writable layer):
#      - Установленные приложения (и любые apt пакеты)
#   Named volume (выживает при Rebuild Container):
#      - ~/  (весь /home/vscode — Chrome, Claude, gh, cargo, npm, shell history)
#
# Использование:
#   bash .devcontainer/scripts/save.sh [имя_бэкапа]
#   bash .devcontainer/scripts/save.sh  # авто-имя по дате

set -e

BACKUP_NAME="${1:-devcontainer-$(date +%Y%m%d-%H%M)}"
OUTPUT_FILE="${BACKUP_NAME}.tar.gz"
IMAGE_TAG="{{PROJECT_NAME}}-snapshot:${BACKUP_NAME}"

echo "==============================================================="
echo "Сохранение devcontainer: ${BACKUP_NAME}"
echo "==============================================================="

# Найти запущенный devcontainer
echo "Ищу запущенный devcontainer..."
CONTAINER_ID=$(docker ps --filter "label=devcontainer.local_folder" \
    --format "{{.ID}}" | head -1)

if [ -z "$CONTAINER_ID" ]; then
    echo "Devcontainer не запущен."
    echo "   Открой проект в VS Code и попробуй снова."
    exit 1
fi

CONTAINER_NAME=$(docker ps --filter "id=$CONTAINER_ID" --format "{{.Names}}")
echo "Контейнер: ${CONTAINER_NAME} (${CONTAINER_ID})"

# Временная директория для сборки пакета
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# -- 1. Docker image (writable layer) --
echo ""
echo "Создаю снапшот контейнера (docker commit)..."
echo "   Сохраняется: apt пакеты, данные приложений..."
docker commit \
    --message "{{PROJECT_NAME}} devcontainer snapshot: ${BACKUP_NAME}" \
    "${CONTAINER_ID}" "${IMAGE_TAG}"

echo "   Экспортирую image в файл..."
docker save "${IMAGE_TAG}" | gzip > "${TMP_DIR}/image.tar.gz"
echo "Image сохранен"

# -- 2. Named volume (весь home) --
echo ""
echo "Сохраняю /home/vscode (named volume)..."

if docker volume inspect "{{PROJECT_NAME}}-home" &>/dev/null 2>&1; then
    docker run --rm \
        -v {{PROJECT_NAME}}-home:/vol_data/{{PROJECT_NAME}}-home \
        alpine tar czf - /vol_data 2>/dev/null > "${TMP_DIR}/volumes.tar.gz"
    echo "Home volume сохранён"
else
    echo "   {{PROJECT_NAME}}-home — не найден, пропускаю"
fi

# -- 3. Собрать все в один файл --
echo ""
echo "Собираю пакет: ${OUTPUT_FILE}"
tar czf "${OUTPUT_FILE}" -C "${TMP_DIR}" .

SIZE=$(du -sh "${OUTPUT_FILE}" | cut -f1)
echo ""
echo "==============================================================="
echo "Бэкап готов!"
echo "   Файл: ${OUTPUT_FILE}"
echo "   Размер: ${SIZE}"
echo ""
echo "Как перенести на другой ПК:"
echo "  1. Скопируй ${OUTPUT_FILE} на другой ПК (USB/облако/scp)"
echo "  2. На новом ПК клонируй репозиторий (получишь .devcontainer/)"
echo "  3. Запусти: bash .devcontainer/scripts/restore.sh ${OUTPUT_FILE}"
echo "==============================================================="
