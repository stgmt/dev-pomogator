---
name: docker-optimize
description: >
  Analyze Dockerfiles and docker-compose files for build optimization opportunities.
  Suggests layer caching, .dockerignore, BuildKit cache mounts, multi-stage splits.
  Use when Docker builds are slow or when setting up Docker for a new project.
allowed-tools: Read, Glob, Grep, Bash, Edit, Write, AskUserQuestion, Agent
---

# /docker-optimize — Docker Build Optimization

## Mission

Analyze all Docker configuration in the project and produce a concrete optimization report with auto-fix capabilities. Inspired by hadolint (static rules), dive (layer analysis), and container-diet (AI auto-fix).

## When triggered

- **Manually**: User runs `/docker-optimize`
- **Context**: User mentions slow Docker builds, Docker optimization, Dockerfile review

## Arguments

- `/docker-optimize` — full analysis of all Dockerfiles + compose files
- `/docker-optimize Dockerfile.prod` — analyze specific file
- `/docker-optimize --fix` — analyze and auto-apply fixes (with confirmation)

## Execution Steps

### Step 0: Discovery

Find all Docker configuration files in the project:

```
Glob: **/Dockerfile*
Glob: **/docker-compose*.yml
Glob: **/.dockerignore
Glob: **/.gitignore (for .dockerignore comparison)
```

If no Dockerfile found, report "No Dockerfile found in project" and exit.

### Step 1: Dockerfile Analysis

For each Dockerfile found, Read it and check these rules (inspired by hadolint DL3000+ catalog):

**Layer Ordering (CRITICAL — biggest speedup)**
- `COPY . .` or `COPY --chown ... . .` BEFORE dependency install (`npm install`, `pip install`, `composer install`, `go mod download`, `cargo build`, `bundle install`) → **cache invalidation on every code change**
- Correct pattern: copy lockfile first → install deps → copy source
- Check for each ecosystem:
  - Node: `package.json` + `package-lock.json` before `npm ci`
  - Python: `requirements.txt` or `pyproject.toml` before `pip install`
  - Go: `go.mod` + `go.sum` before `go mod download`
  - Rust: `Cargo.toml` + `Cargo.lock` before `cargo build`
  - Ruby: `Gemfile` + `Gemfile.lock` before `bundle install`

**BuildKit Features**
- Missing `# syntax=docker/dockerfile:1` directive → no BuildKit features available
- No `--mount=type=cache` on package install RUN commands → deps redownloaded every build
- Suggest cache mount targets per ecosystem:
  - npm: `/root/.npm` or `~/.npm`
  - pip: `/root/.cache/pip`
  - apt: `/var/cache/apt`
  - go: `/go/pkg/mod`
  - cargo: `/usr/local/cargo/registry`

**Base Image**
- `FROM <image>:latest` or `FROM <image>` without tag → unpinned version (hadolint DL3007)
- `FROM <image>:<tag>` where tag is not slim/alpine variant → potentially oversized
- Multiple `FROM` without `AS` aliases → unnamed stages

**Heavy Layer Detection**
- Count consecutive heavy RUN commands (apt-get, pip install, npm install -g, curl|bash installs)
- If >3 heavy RUN commands → suggest splitting into base + app Dockerfile
- Estimate: each heavy RUN = ~30-120s build time

**Base Image Disconnection (CRITICAL)**
- Check if project has `Dockerfile.*.base`, `Dockerfile-base.*`, or `Dockerfile.base` files
- For each base Dockerfile found, find the corresponding app Dockerfile (e.g., `Dockerfile.test.base` → `Dockerfile.test`)
- If app Dockerfile starts with generic `FROM node:*` / `FROM python:*` / `FROM golang:*` etc. instead of using the base image → CRITICAL: all heavy installs are duplicated, base image is wasted
- Check `scripts/build-*-base.sh` or similar scripts to find the base image tag name
- Correct pattern: `FROM <project>-test-base:local` (or whatever tag the build script uses)
- Also check that `--mount=type=cache` is used for package install in the app Dockerfile (npm, pip, etc.) since base already has BuildKit syntax enabled

**Best Practices**
- `ADD` instead of `COPY` for local files (hadolint DL3020) → COPY is more explicit
- `apt-get install` without `-y` → fails in non-interactive
- `apt-get install` without `--no-install-recommends` → bloated image
- `apt-get install` without cleanup (`rm -rf /var/lib/apt/lists/*`) → wasted space (DL3009)
- `pip install` without `--no-cache-dir` → cached wheels in image (DL3042)
- `RUN cd ... && ...` instead of `WORKDIR` (DL3003)
- Multiple `RUN apt-get` instead of combining → extra layers
- `EXPOSE` missing for services

**Security**
- Running as root (no `USER` instruction) → container runs as root
- `COPY . .` without .dockerignore → may include .env, secrets, .git
- `ARG` with default secrets → baked into image layers

### Step 2: .dockerignore Analysis

Check:
- **Exists?** If not → CRITICAL: entire build context sent to daemon (including .git, node_modules)
- **Standard exclusions present?** Check for: `.git`, `node_modules`, `dist`, `build`, `coverage`, `.env`, `*.log`, `.DS_Store`
- **Compare with .gitignore** — anything in .gitignore but NOT in .dockerignore is likely missing
- **Overly broad?** If `*` with few `!` exceptions → may exclude needed files
- Calculate estimated build context size reduction

### Step 3: Docker Compose Analysis

For each docker-compose*.yml found, Read it and check:

- **Build context** — `.` is fine, but check if Dockerfile is in a subdirectory
- **Image naming** — services with `build:` should also have `image:` for caching
- **Healthchecks** — services without `healthcheck:` → no readiness detection
- **Volume mounts for dev** — source code mounted? If not, every change requires rebuild
- **Environment** — secrets in `environment:` instead of `env_file:` or Docker secrets
- **depends_on** — using `condition: service_healthy` vs basic depends_on
- **Compose Watch** — suggest `develop.watch` for hot-reload without rebuild

### Step 4: Report

Generate rich markdown report:

```markdown
## 🐳 Docker Optimization Report

### 📊 Summary

> **{N} Dockerfiles** | **{N} compose files** | **{exists/missing} .dockerignore**
> **Estimated speedup: ~{N}% faster incremental builds**

---

### 🔴 Critical Issues

> These cause the most build time waste

1. **{issue}** — {file}:{line}
   > {explanation}
   > **Fix:** {concrete fix}

---

### 🟡 Optimization Opportunities

> These would improve build performance

{N}. **{issue}** — {file}:{line}
   > {explanation}
   > **Fix:** {concrete fix}

---

### 🔵 Best Practice Suggestions

{N}. **{issue}** — {file}
   > {explanation}

---

### ✅ Already Optimized

- {what's already good}
```

### Step 5: Apply Fixes

After showing the report, use AskUserQuestion to offer fixes:

Options:
1. **Auto-fix all** — apply all suggested fixes
2. **Fix critical only** — apply only 🔴 issues
3. **Generate .dockerignore only** — just create/update .dockerignore
4. **Skip** — just keep the report

For each fix applied:
- Show the before/after diff
- Use Edit tool for existing files, Write for new files
- Never overwrite without showing the change first

### Step 6: Verify (optional)

If Docker is available (`docker --version` succeeds):
- Measure `docker build` time with `time` command
- Show before/after comparison
- If Docker is not available, skip this step silently

## Error Handling

- No Dockerfile found → report "No Docker configuration found" and suggest creating one
- Dockerfile parse error → report which lines couldn't be parsed, continue with rest
- Docker not installed → skip Step 6, all other steps work (file analysis only)

## Report Formatting Rules

- Use emoji consistently: 🔴 critical, 🟡 opportunity, 🔵 suggestion, ✅ good
- Include file path and line number for every finding
- Show concrete fix code, not generic advice
- Estimate time impact where possible (e.g., "saves ~30s per build")
- Keep total report under 100 lines — summarize if too many findings
