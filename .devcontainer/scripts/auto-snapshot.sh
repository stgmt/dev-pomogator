#!/bin/bash
# Фоновый демон автоматических снапшотов devcontainer
#
# Запускается автоматически через postStartCommand
# Настройка через env переменные:
#   SNAPSHOT_INTERVAL_HOURS=24  (интервал между снапшотами, default: 24)
#   MAX_AUTO_SNAPSHOTS=7        (хранить N последних авто-снапшотов, default: 7)
#
# Логи: /tmp/auto-snapshot.log

INTERVAL_HOURS="${SNAPSHOT_INTERVAL_HOURS:-24}"
MAX_KEEP="${MAX_AUTO_SNAPSHOTS:-7}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SNAPSHOT_DIR="/workspaces/dev-pomogator/.devcontainer/snapshots"

mkdir -p "$SNAPSHOT_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

rotate_old_snapshots() {
    local count
    count=$(ls "$SNAPSHOT_DIR"/auto-*.tar.gz 2>/dev/null | wc -l)

    if [ "$count" -gt "$MAX_KEEP" ]; then
        log "Ротация: оставляю ${MAX_KEEP} из ${count} авто-снапшотов"
        ls -t "$SNAPSHOT_DIR"/auto-*.tar.gz 2>/dev/null \
            | tail -n +$((MAX_KEEP + 1)) \
            | while read -r old_file; do
                local tag="dev-pomogator-snapshot:$(basename "${old_file%.tar.gz}")"
                log "   Удаляю: $(basename "$old_file")"
                rm -f "$old_file"
                docker rmi "$tag" 2>/dev/null || true
        done
    fi
}

do_snapshot() {
    local name="auto-$(date +%Y%m%d-%H%M)"
    log "Создаю снапшот: $name"

    if (cd "$SNAPSHOT_DIR" && bash "$SCRIPT_DIR/save.sh" "$name"); then
        log "Снапшот готов: $name.tar.gz"
        rotate_old_snapshots
        log "Текущие снапшоты:"
        ls -lh "$SNAPSHOT_DIR"/auto-*.tar.gz 2>/dev/null | awk '{print "   " $5 "  " $9}' || true
    else
        log "Ошибка при создании снапшота"
    fi
}

trap 'log "Демон остановлен."; exit 0' TERM INT

log "Автоснапшот запущен"
log "   Интервал:   каждые ${INTERVAL_HOURS} часов"
log "   Хранить:    последние ${MAX_KEEP} авто-снапшотов"
log "   Директория: $SNAPSHOT_DIR"

while true; do
    NEXT_AT=$(date -d "+${INTERVAL_HOURS} hours" '+%H:%M' 2>/dev/null || date '+%H:%M')
    log "Следующий снапшот в ~${NEXT_AT}"

    sleep $((INTERVAL_HOURS * 3600)) &
    wait $! 2>/dev/null || true

    do_snapshot
done
