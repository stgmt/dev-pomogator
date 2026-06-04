# Design

## Реализуемые требования

- [FR-1: Auto-prune stale allow entries в check.py](FR.md#fr-1-auto-prune-stale-allow-entries-в-checkpy)
- [FR-2: User-configurable trash classification](FR.md#fr-2-user-configurable-trash-classification)
- [FR-3: LLM-driven classification через Claude Code CLI subscription](FR.md#fr-3-llm-driven-classification-через-claude-code-cli-subscription)
- [FR-4: Shared classifier module + extended yaml config](FR.md#fr-4-shared-classifier-module-extended-yaml-config)

## Компоненты

- `_classifier.py` — НОВЫЙ shared module:
  - `ClassifierConfig` dataclass: layered config (mode, user/default trash_patterns, llm settings, auto_prune flag)
  - `load_classifier_config(repo_root, plugin_dir) → ClassifierConfig` — читает `.root-artifacts.yaml` + `default-whitelist.yaml`, merges layers
  - `classify_file(filename, config) → 'trash' | 'config' | 'unknown'` — single source of classification truth
  - `llm_classify(filename, llm_config, cache) → ...` — Claude Code CLI subprocess invocation (если mode=llm/hybrid И не matched)
  - `find_stale_allow_entries(repo_root, allow_list) → list[str]` — детекция отсутствующих файлов с path-traversal protection
  - `_load_cache()`, `_save_cache()`, `_cache_get()`, `_cache_put()` — JSON cache I/O в `.dev-pomogator/.classifier-cache.json`
- `check.py` — обновлён:
  - `from _classifier import classify_file, load_classifier_config, find_stale_allow_entries`
  - Auto-prune logic: после load yaml → `find_stale_allow_entries()` → если non-empty И `auto_prune.enabled` → атомарно save очищенный yaml + signal modification
  - Embedded `_FALLBACK_TRASH_PATTERNS` для graceful degradation при отсутствии `_classifier.py`
- `configure.py` — обновлён:
  - `from _classifier import classify_file, load_classifier_config`
  - Trash filter в `find_files_not_in_whitelist()` — использует layered config classify
  - `--allow-trash` флаг для override
  - Существующий `save_user_config()` — обернуть в atomic save (fix existing bug)
- `default-whitelist.yaml` — расширен: добавлено `trash_patterns_default: [*.vssscc, *.vspscc, *.testsettings, UpgradeLog*.htm, UpgradeLog*.XML, *.suo, *.user]`
- `.root-artifacts.yaml.template` — расширен с примерами всех новых секций (`trash_patterns:`, `classifier:`, `auto_prune:`, `use_default_trash_patterns:`)
- `extension.json` — обновлён: `toolFiles[]` += `_classifier.py`; bump version 1.0.0 → 1.1.0

## Где лежит реализация

- App-код: `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/`
  - `_classifier.py` (NEW)
  - `check.py` (MODIFY)
  - `configure.py` (MODIFY)
  - `default-whitelist.yaml` (MODIFY — append `trash_patterns_default:`)
  - `.root-artifacts.yaml.template` (MODIFY — append optional sections с comments)
- Wiring: `extensions/forbid-root-artifacts/extension.json` (toolFiles[], version)
- Tests: `tests/e2e/forbid-root-artifacts.test.ts` (extend existing PLUGIN004 describe-блоки)
- Feature: `tests/features/plugins/forbid-root-artifacts/PLUGIN004_forbid-root-artifacts.feature` (extend existing)
- Spec feature: `.specs/forbid-root-artifacts/forbid-root-artifacts.feature`

## Директории и файлы

- `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/_classifier.py` (create)
- `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/check.py` (edit)
- `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/configure.py` (edit)
- `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/default-whitelist.yaml` (edit)
- `extensions/forbid-root-artifacts/tools/forbid-root-artifacts/.root-artifacts.yaml.template` (edit)
- `extensions/forbid-root-artifacts/extension.json` (edit)
- `tests/e2e/forbid-root-artifacts.test.ts` (edit — append describe-блоки)
- `tests/features/plugins/forbid-root-artifacts/PLUGIN004_forbid-root-artifacts.feature` (edit — append Scenarios)
- `.specs/forbid-root-artifacts/forbid-root-artifacts.feature` (edit — populate с per-FR Scenarios)

## Алгоритм

### A. `_classifier.py` — single source of truth

1. `ClassifierConfig` dataclass:
   ```python
   @dataclass
   class ClassifierConfig:
       mode: Literal['config', 'llm', 'hybrid'] = 'hybrid'
       trash_patterns: list[str]              # merged user + default
       config_patterns: list[str]              # merged user + default
       use_default_trash: bool = True
       auto_prune_enabled: bool = True
       llm_cli: str = 'claude'
       llm_timeout_seconds: int = 30
       llm_cache_ttl_seconds: int = 86400
   ```

2. `load_classifier_config(repo_root, plugin_dir) → ClassifierConfig`:
   - Read `default-whitelist.yaml` → extract `trash_patterns_default`, `patterns` (config_patterns)
   - Read `.root-artifacts.yaml` → extract `trash_patterns`, `config_patterns`, `classifier`, `auto_prune`, `use_default_trash_patterns`
   - Merge: user_trash + (default_trash if use_default_trash else []) — deduplicate
   - Apply defaults for missing fields

3. `classify_file(filename, config) → Literal['trash', 'config', 'unknown']`:
   - Layer 1: matches `config.trash_patterns` (fnmatch) → `'trash'`
   - Layer 2: matches `config.config_patterns` → `'config'`
   - Layer 3: если `config.mode in ('llm', 'hybrid')` → return `llm_classify(filename, config, cache)`
   - Layer 4: `'unknown'`

4. `llm_classify(filename, config, cache) → ...`:
   - Cache check: `_cache_get(filename, ttl=config.llm_cache_ttl_seconds)` → если valid → return cached
   - Available check: `if not shutil.which(config.llm_cli) → return 'unknown'` + warn-once
   - Subprocess: `claude -p '<prompt>' --output-format json` с timeout `config.llm_timeout_seconds`
   - Parse: stdout JSON `result` field → first non-whitespace token in {`trash`, `config`, `unknown`}
   - Cache put + return
   - Любой error → `'unknown'`

5. `find_stale_allow_entries(repo_root, allow_list) → list[str]`:
   - Iterate `allow_list`
   - Skip entries containing `/`, `\`, `..`, `\0` (NFR-Security-2 path traversal protection)
   - Filter: not `(repo_root / entry).exists()`
   - Return sorted list

6. Cache I/O — `.dev-pomogator/.classifier-cache.json`:
   ```json
   {
     "schema_version": 1,
     "entries": {
       "foo.testsettings": {"result": "trash", "ts": 1714838000}
     }
   }
   ```

### B. `check.py` — refactor + auto-prune

1. Удалить inline `TRASH_PATTERNS`, `CONFIG_PATTERNS`, `classify_file()` (lines 157-216 existing)
2. Добавить graceful import:
   ```python
   try:
       from _classifier import classify_file, load_classifier_config, find_stale_allow_entries
       _classifier_loaded = True
   except ImportError:
       _classifier_loaded = False
       _FALLBACK_TRASH_PATTERNS = ["*.tmp", "*.bak", "*.log", "*.swp", "*.suo", "*.user"]
       def classify_file(name, _cfg=None):
           return 'trash' if any(fnmatch.fnmatch(name.lower(), p.lower()) for p in _FALLBACK_TRASH_PATTERNS) else 'unknown'
       def find_stale_allow_entries(repo_root, allow_list):
           return [e for e in allow_list if '/' not in e and '\\' not in e and '..' not in e and not (repo_root / e).exists()]
       print("WARNING: classifier module missing — using fallback", file=sys.stderr)
   ```
3. В `main()`:
   - После `load_user_config()` — `cfg = load_classifier_config(repo_root, plugin_dir)`
   - Если `cfg.auto_prune_enabled` → `stale = find_stale_allow_entries(repo_root, user_config.allow)`
   - Если non-empty:
     - Modify in-memory user_config (remove stale)
     - Atomic save обновлённого yaml (preserve header + key order + non-touched sections)
     - Print stderr: «forbid-root-artifacts auto-pruned N stale entries from .root-artifacts.yaml. Run `git add .root-artifacts.yaml && git commit` to include yaml changes.»
     - exit 1 (signal for pre-commit framework that files were modified — standard pattern)
   - Иначе — продолжить existing find_violations() flow

### C. `configure.py` — trash filter + atomic save

1. `from _classifier import classify_file, load_classifier_config` (наверху)
2. Добавить `--allow-trash` flag в argparse
3. Modify `find_files_not_in_whitelist()` (существующий lines 311-341):
   - `cfg = load_classifier_config(repo_root, plugin_dir)`
   - Для каждого root-file: `cls = classify_file(name, cfg)`
   - Если `cls == 'trash'` И `not args.allow_trash`:
     - НЕ append в `not_in_whitelist`
     - Print stdout hint (specialized для `*.testsettings` → SettingsMigrator URL; иначе generic «add to .gitignore»)
4. Modify `save_user_config()` (существующий lines 401-424):
   - Wrap в atomic temp-file + `os.replace` pattern (per `atomic-config-save` rule, fix existing bug)

### D. `default-whitelist.yaml` — добавить trash_patterns_default

```yaml
files: [...]   # existing
patterns: [...]  # existing

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

### E. `.root-artifacts.yaml.template` — расширить с примерами

```yaml
# existing sections preserved...

# NEW — User trash patterns (override default-whitelist.yaml trash_patterns_default)
# trash_patterns: []
#   # - "*.testsettings"
#   # - "*.vssscc"

# config_patterns: []
#   # - "*.toml"

# Use plugin-shipped trash patterns (default true)
# use_default_trash_patterns: true

# Classifier mode: config | llm | hybrid (default hybrid)
# classifier:
#   mode: hybrid
#   llm:
#     cli: claude          # Claude Code CLI binary in PATH (subscription)
#     timeout_seconds: 30
#     cache_ttl_seconds: 86400

# Auto-prune stale allow entries on pre-commit (default enabled)
# auto_prune:
#   enabled: true
```

### F. `extension.json` — manifest update

1. `version`: `"1.0.0"` → `"1.1.0"` (minor — backward compat preserved)
2. `toolFiles.forbid-root-artifacts[]` → добавить `.dev-pomogator/tools/forbid-root-artifacts/_classifier.py`
3. `description` обновить mention auto-prune + LLM classification

## API

### CLI: `configure.py`

Существующие flags:
- (no flag) — interactive mode
- `--non-interactive` — auto-add all non-trash root files

Новые flags:
- `--allow-trash` — disable trash filter (legitimate edge case override)

Exit codes без изменений: 0 / 2.

### CLI: `check.py`

Без изменений в interface. Новое поведение:
- При `auto_prune.enabled: true` И есть stale entries → modifies yaml + exit 1 (pre-commit framework signal)
- Stderr содержит actionable message с указанием на `git add` + retry commit

Exit codes:
- 0 — no violations, no auto-prune
- 1 — violations OR auto-prune modified files (pre-commit framework re-stage signal)
- 2 — config error

### Python API: `_classifier.py`

```python
@dataclass
class ClassifierConfig: ...

def load_classifier_config(repo_root: Path, plugin_dir: Path) -> ClassifierConfig
def classify_file(filename: str, config: ClassifierConfig) -> Literal['trash', 'config', 'unknown']
def llm_classify(filename: str, config: ClassifierConfig, cache: dict) -> Literal['trash', 'config', 'unknown']
def find_stale_allow_entries(repo_root: Path, allow_list: list[str]) -> list[str]
```

### YAML schema (full): см. SCHEMA.md

## Key Decisions

> Auto-populated by Skill `requirements-chk-matrix` during Phase 2. Hook `design-decision-guard` enforces format:
> each `### Decision:` block must include **Rationale:**, **Trade-off:**, **Alternatives considered:** with at least 2 alternative bullets.

### Decision: Auto-prune в pre-commit (yaml modified by hook), не отдельная команда

**Rationale:** User direction: «прун должен быть автоматом». Pre-commit hook standard pattern (как у prettier/black/ruff format) — hook modifies file, commit fails с message «files were modified», user делает git add + retry. Изменения yaml попадают в тот же commit что и удалённые файлы — atomic, `git revert` восстанавливает both.

**Trade-off:** Coupling с pre-commit framework UX — user должен понимать «hook modified files, re-stage» pattern (документируется в README, NFR-Usability-5). Для людей не знакомых с этим паттерном — первое срабатывание сюрприз. Но это широко известная convention.

**Alternatives considered:**
- Opt-in `--prune` command — rejected (user explicitly direct: «должен быть автоматом»)
- Hook only-warns, не модифицирует — rejected: stale entries будут жить вечно если user не запустит cleanup отдельно
- Modify yaml в `post-commit` hook (после commit) — rejected: создаёт detached working tree state, файлы НЕ atomic с commit, `git revert` не восстановит yaml
- `prepare-commit-msg` hook — rejected: hook fires до presence-чека, неправильное место в lifecycle

### Decision: User-configurable classification (yaml-driven), не hardcoded TRASH_PATTERNS

**Rationale:** User direction: «мусор не мусор решают юзеры — есть конфиг или промт через нейронку». Plugin поставляет capabilities (classification mechanism), user заполняет policies (что считается мусором). VS legacy patterns переезжают в `default-whitelist.yaml` как opinionated default, user может выключить через `use_default_trash_patterns: false`.

**Trade-off:** Больше yaml polymorphism — больше surface для misconfiguration. Mitigated через graceful defaults (если `classifier:` отсутствует → mode=hybrid, use_default_trash=true, auto_prune=true) — out-of-the-box experience остаётся работоспособным без yaml editing.

**Alternatives considered:**
- Hardcoded TRASH_PATTERNS в Python (предыдущий план) — rejected: пользователь явно запретил «решать за всех»
- Только hardcoded + override через `deny:` существующего yaml — rejected: confused semantics (deny = «not allowed to be in repo» vs trash = «classification»)
- Embed default trash list прямо в Python с yaml override — rejected: смешивает code + config; добавление нового pattern требует code release

### Decision: LLM через Claude Code CLI subprocess (subscription), 0 API keys

**Rationale:** User direction: «никакого апи кея — это заточена на клауде кли там подписка». `claude -p '<prompt>' --output-format json` использует уже-залогиненную сессию Claude Code CLI, никаких credentials в плагине / в env vars. Если CLI отсутствует (e.g. CI без Claude Code) → graceful fallback `'unknown'`.

**Trade-off:** Subprocess overhead на каждый LLM call (~500-2000ms startup). Mitigated через JSON cache (24h TTL по default) — типичный repo кэшируется после первого pre-commit. Slow path acceptable для unknown files (rare).

**Alternatives considered:**
- Anthropic SDK с API key — rejected (user explicit: no API key)
- Local LLM (Ollama, llamafile) — rejected: out of scope FR-6, добавляет dependency которая не у всех есть
- Claude API через generic HTTP client — rejected: equivalent to API key (нужны credentials)
- Skill-based invocation through Claude Code session — rejected: skills работают inside Claude Code session, не из standalone Python script на pre-commit

### Decision: Cache в `.dev-pomogator/.classifier-cache.json` (per-project, gitignored)

**Rationale:** Per-project cache избегает cross-project leakage и stale results. JSON format — simple, atomic-savable, no schema migration burden. Path `.dev-pomogator/` уже used by other plugins для project-local state — конвенция repo.

**Trade-off:** Cache file invisible to user если они хотят debug «почему classifier returned X для файла Y». Mitigated через documented format в SCHEMA.md + раздел «Debugging classifier» в README.

**Alternatives considered:**
- In-memory cache only (no persistence) — rejected: каждый pre-commit re-classifies — bypassing main cache benefit (avoid repeat LLM calls)
- Global cache в `~/.dev-pomogator/classifier-cache.json` — rejected: cross-project leakage, security concern (одна project's classification влияет на другой)
- Per-file dotfile (e.g. `.classify-cache` рядом с каждым yaml) — rejected: dirty repo, ad-hoc, не gitignore-friendly

### Decision: Graceful fallback в check.py при отсутствии `_classifier.py`

**Rationale:** Pre-commit hooks НЕ должны crash из-за impedance mismatch версий (broken upgrade scenario UC-7). check.py остаётся работоспособным если developer manually copy старый check.py поверх новой структуры или auto-update частично failed.

**Trade-off:** Дублирование минимального TRASH_PATTERNS набора в check.py (как `_FALLBACK_TRASH_PATTERNS`). Это explicitly accepted дублирование с purpose, не drift risk — fallback умышленно minimal (6 universal patterns) и помечен `_FALLBACK_` префиксом — clear intent при code review.

**Alternatives considered:**
- Hard fail если import fails — rejected: ломает downstream pre-commit на upgrade, блокирует все коммиты
- Auto-download `_classifier.py` при missing — rejected: pre-commit hook не должен делать network calls; security + offline scenarios
- Fail loudly с non-zero exit — rejected: блокирует все коммиты пока user не разберётся; UX hostile

## BDD Test Infrastructure (ОБЯЗАТЕЛЬНО)

> Step 6 — feature classification.

**Classification:** TEST_DATA_ACTIVE
**TEST_FORMAT:** BDD
**Framework:** Vitest (TypeScript) — Reqnroll detection в RESEARCH.md был false positive (fixture `tests/fixtures/steps-validator/csharp/Project.csproj`). Реальный test framework — `vitest` через `npm test` / `/run-tests`.
**Install Command:** already installed (vitest есть в `package.json` dev-pomogator)
**Evidence:** `tests/e2e/forbid-root-artifacts.test.ts:1` — `import` from vitest (describe/it/expect/beforeAll/afterAll/beforeEach destructuring) + RESEARCH.md `### Existing Patterns & Extensions` row "Existing tests"
**Verdict:** Расширить existing PLUGIN004 test file новыми `describe()` блоками (Auto-Prune, Trash Classification, LLM Classification, Shared Classifier). Никаких новых hooks НЕ нужно — beforeEach/afterAll уже корректно создают/удаляют temp repos. Test data ephemeral. Для LLM tests — mock `claude` через PATH stub (создаём fake `claude` binary в test repo PATH).

### Существующие hooks

| Hook файл | Тип | Тег/Scope | Что делает | Можно переиспользовать? |
|-----------|-----|-----------|------------|------------------------|
| `tests/e2e/forbid-root-artifacts.test.ts:57-60` | beforeAll | describe('PLUGIN004') | `tempDir = path.join(os.tmpdir(), ...); fs.ensureDir(tempDir)` | Да — все новые describe-блоки используют тот же tempDir |
| `tests/e2e/forbid-root-artifacts.test.ts:62-64` | afterAll | describe('PLUGIN004') | `fs.remove(tempDir)` | Да — cleanup teardown |
| `tests/e2e/forbid-root-artifacts.test.ts:66-74` | beforeEach | describe('PLUGIN004') | new testRepoDir, initGitRepo, copy tools | Да — каждый новый it() получает свежий repo |

### Новые hooks

Не требуются. Существующие hooks покрывают все новые scenarios. Для LLM mocking — inline в самом it() через создание fake `claude` shell script в test repo's PATH (no global hook).

### Cleanup Strategy

Existing pattern: tempDir удаляется в `afterAll`, новый testRepoDir создаётся per-test в `beforeEach`. Cache file `.dev-pomogator/.classifier-cache.json` — внутри testRepoDir, удаляется automatically через `afterAll`. Никаких persistent test data между тестами.

### Test Data & Fixtures

| Fixture/Data | Путь | Назначение | Lifecycle |
|-------------|------|------------|-----------|
| Stale YAML с allow:[foo.testsettings] | inline в test (fs.writeFile) | Setup для PLUGIN004_AUTOPRUNE_01..03 | per-scenario, deleted в afterAll |
| Trash files (`*.testsettings`, `*.vssscc`) | inline в test (fs.writeFile с empty content) | Setup для PLUGIN004_TRASH_01..03 | per-scenario |
| YAML с user trash_patterns | inline | PLUGIN004_TRASH_01 | per-scenario |
| YAML с classifier.mode=hybrid + fake claude в PATH | inline shell script | PLUGIN004_LLM_01..03 | per-scenario; cleanup automatic via testRepoDir removal |
| Cache file `.dev-pomogator/.classifier-cache.json` | inline | PLUGIN004_LLM_03 (cache hit verification) | per-scenario |

### Shared Context / State Management

| Ключ | Тип | Записывается в | Читается в | Назначение |
|------|-----|----------------|------------|------------|
| `testRepoDir` | string | beforeEach | каждый it() | Path к fresh test repo для текущего теста |
| `tempDir` | string | beforeAll | beforeEach (для построения testRepoDir) | Top-level tempo директория для всего describe |
| `fakeClaudeStubPath` | string | per-test inline | LLM tests | Path к mock claude binary для PATH override |
