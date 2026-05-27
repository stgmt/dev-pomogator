# FR

Runtime paths must skip NARRATIVE check:
- `~/.dev-pomogator/config.json` — home dir
- `$HOME/.cache/foo.json` — env var
- `%APPDATA%/Roaming/x.json` — Windows env
- `/etc/passwd` — absolute Unix
- `C:\Users\foo\bar.ts` — Windows absolute

Real bug from corpus: pomogator-doctor spec emitted false NARRATIVE_PATH_MISSING on `~/.dev-pomogator/config.json`.
