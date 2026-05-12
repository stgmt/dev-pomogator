# forbid-root-artifacts Schema

## Pipeline

```
                       ┌────────────────────────────┐
                       │     _classifier.py         │  ← single source of truth
                       │                            │
                       │  load_classifier_config(): │  reads BOTH yaml files,
                       │   default-whitelist.yaml + │  merges layers
                       │   .root-artifacts.yaml     │
                       │                            │
                       │  classify_file(name, cfg): │  layered:
                       │   1. user trash_patterns   │   - fnmatch
                       │   2. default trash (if on) │   - fnmatch
                       │   3. user config_patterns  │   - fnmatch
                       │   4. (mode=llm|hybrid)     │   - claude -p
                       │   5. unknown               │   - fallback
                       └──────┬─────────────┬───────┘
                              │             │
              from _classifier import ...
                              │             │
              ┌───────────────┘             └────────────────┐
              ▼                                               ▼
    ┌──────────────────────────┐             ┌────────────────────────────┐
    │     check.py             │             │    configure.py            │
    │                          │             │                            │
    │  load yaml               │             │  load yaml                 │
    │  load_classifier_config()│             │  load_classifier_config()  │
    │                          │             │                            │
    │  if auto_prune.enabled:  │             │  scan repo root            │
    │   stale = find_stale_*() │             │  for each file:            │
    │   if stale:              │             │   cls = classify_file(...) │
    │    atomic save yaml      │             │   if cls=='trash' &        │
    │    (without stale)       │             │      not --allow-trash:    │
    │    exit 1 (signal modify)│             │     skip + hint stdout     │
    │                          │             │   else: offer to user      │
    │  find_violations()       │             │                            │
    │  exit 0 / 1 / 2          │             │  atomic save yaml          │
    └──────────────────────────┘             └────────────────────────────┘
              │                                               │
              ▼                                               ▼
        pre-commit hook                                .root-artifacts.yaml
        output (modified                                (write target)
        files signal)
                              │
                              ▼
            ┌────────────────────────────────────┐
            │  .dev-pomogator/.classifier-cache  │  per-project, gitignored
            │  .json (LLM results, TTL 24h)      │
            └────────────────────────────────────┘
```

## Сущности

### `.root-artifacts.yaml` (user config — NEW optional sections)

```yaml
# Existing (preserved, backward compat)
mode: extend                          # extend | replace
allow: [...]                          # filenames in repo root
deny: [...]                           # explicitly denied
allowed_directories: [src, docs]      # optional directory restriction
ignore_patterns: ["*.tmp"]            # glob patterns to skip

# NEW — User trash patterns (override / extend defaults)
trash_patterns:
  - "*.testsettings"
  - "*.vssscc"

# NEW — User config patterns
config_patterns:
  - "*.toml"

# NEW — Use plugin-shipped trash defaults (default true)
use_default_trash_patterns: true

# NEW — Classifier mode + LLM settings
classifier:
  mode: hybrid                        # config | llm | hybrid (default hybrid)
  llm:
    cli: claude                       # CLI bin in PATH (default 'claude')
    timeout_seconds: 30
    cache_ttl_seconds: 86400

# NEW — Auto-prune behavior (default enabled)
auto_prune:
  enabled: true
```

**Field types:**
- `trash_patterns`: `list[str]` (fnmatch globs) — empty default
- `config_patterns`: `list[str]` (fnmatch globs) — empty default
- `use_default_trash_patterns`: `bool` (default `true`)
- `classifier.mode`: `'config' | 'llm' | 'hybrid'` (default `'hybrid'`)
- `classifier.llm.cli`: `str` (default `'claude'`)
- `classifier.llm.timeout_seconds`: `int` (default `30`)
- `classifier.llm.cache_ttl_seconds`: `int` (default `86400` = 24h)
- `auto_prune.enabled`: `bool` (default `true`)

### `default-whitelist.yaml` (плагин-side — NEW field)

```yaml
files: [...]                          # existing
patterns: [...]                       # existing — конфиг-маркеры

# NEW — VS legacy artifacts (researched per RESEARCH.md ## Технические находки)
trash_patterns_default:
  - "*.vssscc"
  - "*.vspscc"
  - "*.testsettings"
  - "UpgradeLog*.htm"
  - "UpgradeLog*.XML"
  - "*.suo"
  - "*.user"
```

### `_classifier.py` exports

```python
@dataclass
class ClassifierConfig:
    mode: Literal['config', 'llm', 'hybrid'] = 'hybrid'
    trash_patterns: list[str] = field(default_factory=list)    # merged user + default
    config_patterns: list[str] = field(default_factory=list)
    use_default_trash: bool = True
    auto_prune_enabled: bool = True
    llm_cli: str = 'claude'
    llm_timeout_seconds: int = 30
    llm_cache_ttl_seconds: int = 86400

def load_classifier_config(repo_root: Path, plugin_dir: Path) -> ClassifierConfig
def classify_file(filename: str, config: ClassifierConfig) -> Literal['trash', 'config', 'unknown']
def llm_classify(filename: str, config: ClassifierConfig, cache: dict) -> Literal['trash', 'config', 'unknown']
def find_stale_allow_entries(repo_root: Path, allow_list: list[str]) -> list[str]
def is_testsettings(name: str) -> bool   # specialized для AC-6 hint
```

### `.dev-pomogator/.classifier-cache.json` (per-project cache)

```json
{
  "schema_version": 1,
  "entries": {
    "foo.testsettings": {
      "result": "trash",
      "ts": 1714838000
    },
    "bar.unknown": {
      "result": "config",
      "ts": 1714838100
    }
  }
}
```

- `schema_version`: `int` — для future migrations (currently `1`)
- `entries`: `dict[str, CacheEntry]`:
  - `result`: `Literal['trash', 'config', 'unknown']`
  - `ts`: `int` (Unix epoch seconds)

### LLM Prompt (fixed format, FR-3)

```
Classify the file '{filename}' for repository root presence.
Reply with EXACTLY ONE word: trash | config | unknown.
- trash: build artifacts, temp files, IDE state, deprecated formats
- config: legitimate project config or documentation
- unknown: cannot determine
```

Subprocess invocation:
```python
subprocess.run(
    [config.llm_cli, '-p', PROMPT.format(filename=name), '--output-format', 'json'],
    capture_output=True, text=True, timeout=config.llm_timeout_seconds
)
```

Parse: stdout JSON → `result` field → first non-whitespace token.

### Auto-prune output format (check.py — FR-1)

When auto-prune fires (modifies yaml + signals modification):

```
forbid-root-artifacts auto-pruned 2 stale entries from .root-artifacts.yaml:
- foo.testsettings
- bar.txt
Run: git add .root-artifacts.yaml && git commit (yaml changes will be included in commit)
```

(Prints to stderr, exit code 1 = pre-commit framework "modified files" signal.)

### Trash hint format (configure.py — FR-2 / AC-6)

Generic:
```
{filename}: trash — add to .gitignore instead
```

Specialized для `*.testsettings`:
```
{filename}: deprecated VS test settings — see https://learn.microsoft.com/en-us/visualstudio/test/migrate-testsettings-to-runsettings
```

(Prints to stdout when configure.py обнаруживает trash-classified file.)

## Правила валидации

### Path traversal (NFR-Security-2, AC-3)

Entries в `allow:` / `deny:` ОБЯЗАНЫ быть basenames. Re-checking при load:
- Содержит `/` или `\` → skip with WARN «Skipping non-basename allow entry: ENTRY»
- Содержит `..` → skip with WARN
- Содержит `\0` (NUL byte) → skip with WARN

Stale-detection пропускает такие entries (НЕ удаляет, НЕ помечает как stale).

### YAML preservation (NFR-Reliability-3)

Auto-prune save сохраняет:
- Header comment (первые строки `# Configuration for forbid-root-artifacts ...`)
- Порядок ключей: `mode → allow → deny → allowed_directories → ignore_patterns → trash_patterns → config_patterns → use_default_trash_patterns → classifier → auto_prune`
- Не пере-форматирует existing entries в нетронутых секциях
- Comments в нетронутых секциях preserved (best-effort через ruamel.yaml если доступен; иначе через PyYAML normalization, документировать как known limitation)

### Atomic save (NFR-Security-3)

Pattern (применяется в check.py auto-prune И configure.py save_user_config):
```python
tmp = target.with_suffix(target.suffix + '.tmp')
with open(tmp, 'w', encoding='utf-8') as f:
    f.write(header_comment)
    yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)
os.replace(tmp, target)   # atomic move на POSIX и Windows
```

### Classifier mode validation

`classifier.mode` ∈ {`'config'`, `'llm'`, `'hybrid'`}. Если неизвестное значение → log WARN + fallback на `'config'` (safest — no LLM calls).

### LLM result validation (FR-3)

После parse stdout JSON:
- Token must be in `{'trash', 'config', 'unknown'}` (case-insensitive)
- Если что-то другое → fallback `'unknown'`, log WARN
- Если parse error / missing field / timeout / non-zero exit → fallback `'unknown'`

### Cache validation

При load `.dev-pomogator/.classifier-cache.json`:
- Если file missing → start with empty cache (normal first run)
- Если malformed JSON → log WARN, treat as empty, не crash (NFR-Reliability-6)
- Если `schema_version` != `1` → log WARN, treat as empty, ignore old cache (forward migration)
- При check entry: `now - entry.ts < ttl` → cache hit

### Classifier fallback (NFR-Reliability-1)

При `import _classifier` failure в `check.py`:
```python
_FALLBACK_TRASH_PATTERNS = ["*.tmp", "*.bak", "*.log", "*.swp", "*.suo", "*.user"]
```

Fallback purposefully minimal (6 universal patterns), не репликация полного — clear intent при code review что это safety net, не drift target.

### Exit codes invariants

- `check.py`:
  - `0` — no violations, no auto-prune fired (no stale OR auto_prune disabled)
  - `1` — violations found OR auto-prune modified yaml (pre-commit framework signal — re-stage)
  - `2` — config error (invalid YAML, missing repo, etc.)
- `configure.py`:
  - `0` — success (interactive complete / non-interactive done / --allow-trash override)
  - `2` — config error
