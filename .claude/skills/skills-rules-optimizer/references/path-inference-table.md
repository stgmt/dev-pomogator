# Path Inference Table

Reference for determining appropriate `paths:` glob patterns based on rule content.

## By file extension mentioned

| Extension in rule | Glob pattern |
|-------------------|-------------|
| `.ts`, `.tsx` | `**/*.{ts,tsx}` |
| `.js`, `.jsx` | `**/*.{js,jsx}` |
| `.py` | `**/*.py` |
| `.sql` | `**/*.sql` |
| `.cs` | `**/*.cs` |
| `.go` | `**/*.go` |
| `.rs` | `**/*.rs` |
| `.java` | `**/*.java` |
| `.rb` | `**/*.rb` |
| `.php` | `**/*.php` |
| `.css`, `.scss` | `**/*.{css,scss}` |
| `.html` | `**/*.html` |
| `.json` | `**/*.json` |
| `.yaml`, `.yml` | `**/*.{yaml,yml}` |
| `.md` | `**/*.md` |
| `.dockerfile`, `Dockerfile` | `**/Dockerfile*` |
| `.sh`, `.bash` | `**/*.{sh,bash}` |
| `.ps1` | `**/*.ps1` |

## By directory mentioned

| Directory in rule | Glob pattern |
|-------------------|-------------|
| `src/` | `src/**/*` |
| `tests/`, `test/` | `tests/**/*` or `test/**/*` |
| `migrations/` | `**/migrations/**/*` |
| `api/` | `**/api/**/*` |
| `components/` | `**/components/**/*` |
| `hooks/` | `**/hooks/**/*` |
| `services/` | `**/services/**/*` |
| `models/` | `**/models/**/*` |
| `config/` | `**/config/**/*` |
| `scripts/` | `**/scripts/**/*` |
| `.github/` | `.github/**/*` |
| `.claude/` | `.claude/**/*` |

## By domain keyword

| Keyword in rule | Glob pattern |
|-----------------|-------------|
| database, SQL, query, migration | `**/*.sql`, `**/migrations/**/*` |
| API, endpoint, route, controller | `**/api/**/*`, `**/controllers/**/*` |
| test, spec, assertion | `**/tests/**/*`, `**/*.test.*`, `**/*.spec.*` |
| Docker, container, compose | `**/Dockerfile*`, `**/docker-compose*` |
| CI/CD, pipeline, workflow | `.github/**/*`, `**/*.yml` |
| config, settings, environment | `**/config/**/*`, `**/*.{json,yaml,yml}` |

## Global rules (NO frontmatter)

These rule topics should remain **global** (loaded every session):

- Security practices (secrets, injection, OWASP)
- Git workflow (commits, branches, PRs)
- General code style (naming, formatting)
- Error handling philosophy (fail-fast, no silent catch)
- Project architecture overview
- Communication rules (language, format)
