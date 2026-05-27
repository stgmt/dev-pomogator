#!/bin/bash
# Открыть Chromium с CDP на виртуальном дисплее :1
# Использование: open-browser [url]
# Пример: open-browser https://vk.com

URL="${1:-about:blank}"

# GUI environment
export DISPLAY=":${DISPLAY_NUM:-1}"

chromium --no-sandbox --disable-dev-shm-usage \
  --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 \
  --user-data-dir=/tmp/chromium-profile \
  --no-first-run --no-default-browser-check \
  --display=:1 "$URL" &>/tmp/chromium.log &
echo "Chromium PID: $! → $URL"
