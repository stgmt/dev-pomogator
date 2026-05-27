#!/bin/bash
ZJ=$HOME/.local/bin/zellij
mkdir -p /tmp/dumps
echo "---list-sessions---"
$ZJ list-sessions 2>&1 || true
echo
for s in glowing-platypus oblong-ocelot exquisite-echidna feature-auth payments-fix refactor-storage docs-update hotfix-prod; do
  echo "=== $s ==="
  $ZJ -s "$s" action dump-screen --path /tmp/dumps/${s}.txt 2>&1 || echo "(fail: $s)"
done
echo
echo "---DUMPS---"
for f in /tmp/dumps/*.txt; do
  echo "##### $f $(stat -c %s $f) bytes #####"
done
