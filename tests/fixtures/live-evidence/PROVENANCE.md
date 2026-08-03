# Live-evidence ground-truth fixture — provenance

Captured fixture for SPECGEN004_688 (FR-81g / AC-81.10). The digest constants in
`ground-truth.json` were computed OUTSIDE `tools/live-evidence/validator.mjs` so the
validator cannot agree with itself circularly:

- `workspace_digest` — Python 3 `hashlib.sha256` over `b"workspace.txt\x00" + bytes(workspace.txt) + b"\x00"`
  (independent re-implementation of the sorted-name digest loop; single file here).
- `trace_sha256` — Python 3 `hashlib.sha256` over the exact bytes of `trace.json`.
- `trace_event_sha256` — Python 3 `hashlib.sha256` over
  `json.dumps(event, sort_keys=True, separators=(",", ":"))`, the sorted-key compact form
  equivalent to the validator's `stableJson` for string/boolean/array payloads.

Commands used (2026-08-03, Windows host, Python 3.14):

```python
import hashlib, json
ws = open('tests/fixtures/live-evidence/workspace.txt', 'rb').read()
h = hashlib.sha256(); h.update(b'workspace.txt\x00'); h.update(ws); h.update(b'\x00')
tb = open('tests/fixtures/live-evidence/trace.json', 'rb').read()
event = json.loads(tb)['events'][0]
s = json.dumps(event, sort_keys=True, separators=(',', ':'))
```

## Byte-stability requirement

Digests are over EXACT file bytes. `.gitattributes` forces `text eol=lf` for this
directory so Windows checkouts (core.autocrlf=true) do not rewrite LF to CRLF and
silently change the digests. Do not edit the fixture files without recomputing all
three constants with an independent tool and recording the new capture here.

## git_sha

`manifest.json` carries a zero placeholder for `git_sha`; the BDD step stamps the
fixture repo's real HEAD before validation. `git_sha` is checkout-bound by design and
is therefore not part of the independent constants.
