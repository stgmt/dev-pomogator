# User Stories

### User Story 1: Opt in explicitly to Headroom beta (Priority: P1)

**Требование:** [FR-1](FR.md#fr-1-beta-opt-in-gate)

As a cautious Claude Code user, I want Headroom beta disabled by default, so that
normal dev-pomogator install cannot silently rewrite global routing.

**Independent Test:** `@feature1` scenario verifies default install leaves
Headroom disabled.

---

### User Story 2: Choose the runtime topology (Priority: P1)

**Требование:** [FR-2](FR.md#fr-2-topology-selection)

As a user, I want to choose either Codex-sub2api or Anthropic-direct routing, so
that the installer does not mix two billing and auth models.

**Independent Test:** `@feature2` scenario verifies exactly one topology is
required.

---

### User Story 3: Prefer Docker when available (Priority: P1)

**Требование:** [FR-3](FR.md#fr-3-docker-first-runtime)

As a Windows/WSL user with Docker, I want the beta runtime to run in Docker, so
that Headroom/sub2api services are isolated, restartable, and diagnosable.

**Independent Test:** `@feature3` scenario verifies Docker is preferred when
reachable.

---

### User Story 4: Fall back to host/headless when Docker is unavailable (Priority: P2)

**Требование:** [FR-4](FR.md#fr-4-host-headless-fallback)

As a user without Docker, I want a host/headless fallback with autostart, so that
Headroom can still run without manual terminals.

**Independent Test:** `@feature4` scenario verifies host fallback planning.

---

### User Story 5: Run Headroom in a real optimization profile (Priority: P1)

**Требование:** [FR-5](FR.md#fr-5-peak-headroom-configuration)

As a user looking at Token Savings, I want the installer to run supported
token/compression settings and warm up dependencies, so that Headroom does not
look installed while doing zero compression.

**Independent Test:** `@feature5` scenario verifies stale unsupported flags are
skipped and supported optimization flags are used.

---

### User Story 6: Diagnose from live stats (Priority: P1)

**Требование:** [FR-6](FR.md#fr-6-verification-and-doctor)

As a user, I want doctor output based on `/health`, `/stats`, and smoke tests,
so that "works" means runtime evidence, not only service start.

**Independent Test:** `@feature6` scenario verifies the doctor classifies a
cache-mode zero-savings state.

---

### User Story 7: Roll back safely (Priority: P1)

**Требование:** [FR-7](FR.md#fr-7-safe-claude-settings-management)

As a user with many Claude Code hooks, I want settings edits to be backed up and
atomic, so that beta routing cannot erase existing hooks or plugin config.

**Independent Test:** `@feature7` scenario verifies unknown keys survive edit and
rollback.

---

### User Story 8: Read honest savings numbers (Priority: P1)

**Требование:** [FR-8](FR.md#fr-8-honest-savings-reporting)

As a user comparing dashboards, I want compression, prefix-cache, tool-search,
and RTK savings reported separately, so that zero Token Savings is explainable
instead of treated as a broken install.

**Independent Test:** `@feature8` scenario verifies zero compression is explained
without hiding prefix-cache savings.

---

### User Story 9: Use packaged skills and docs (Priority: P2)

**Требование:** [FR-9](FR.md#fr-9-packaged-skills-and-user-docs)

As a dev-pomogator user, I want a dedicated Headroom beta skill, so that it does
not get confused with the existing Meridian proxy skills.

**Independent Test:** `@feature9` scenario verifies the Headroom skill is
packaged separately.

---

### User Story 10: Keep regressions covered (Priority: P2)

**Требование:** [FR-10](FR.md#fr-10-regression-coverage)

As a maintainer, I want deterministic fixtures for the known failure modes, so
that future installer changes cannot reintroduce zero-savings or unsafe routing.

**Independent Test:** `@feature10` scenario verifies fixture coverage exists.

