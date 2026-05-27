#!/bin/bash
URL="http://127.0.0.1:8083/api/claude?path=/mnt/d/repos/dev-pomogator"

echo "==== fresh GET ===="
curl -s -D /tmp/h.txt -o /tmp/b.json "$URL"
ETAG=$(awk -F': ' 'tolower($1)=="etag"{gsub(/[\r\n]/,"",$2); print $2}' /tmp/h.txt)
echo "ETag = [$ETAG]"
echo "size = $(stat -c %s /tmp/b.json) bytes"

echo
echo "==== WITH ETAG (expect 304) ===="
curl -s -D /tmp/h2.txt -o /tmp/b2.json -H "If-None-Match: $ETAG" "$URL" \
  -w "status=%{http_code} downloaded=%{size_download}b time=%{time_total}s\n"
echo "Body bytes after 304: $(stat -c %s /tmp/b2.json)"
echo "Response headers:"
cat /tmp/h2.txt
