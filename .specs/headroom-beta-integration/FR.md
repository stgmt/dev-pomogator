# Functional Requirements

## FR-1: Beta opt-in gate

**Acceptance:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)

dev-pomogator SHALL expose Headroom integration as an explicit beta opt-in.

The feature MUST NOT:

- run during normal plugin install without user opt-in;
- mutate `~/.claude/settings.json` without a backup;
- start a non-loopback unauthenticated proxy;
- imply that Headroom is required for dev-pomogator.

Accepted opt-in surfaces:

- a skill or slash command such as `headroom-beta`;
- a CLI flag such as `--headroom-beta`;
- an env/config key such as `DEV_POMOGATOR_HEADROOM_BETA=1`.

Trace: @feature1.

## FR-2: Topology selection

**Acceptance:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)

The beta installer SHALL ask for or receive exactly one topology:

- `codex-sub2api`: Claude Code -> Headroom -> sub2api -> OpenAI/Codex subscription.
- `anthropic-direct`: Claude Code -> Headroom -> Anthropic API.

The selected topology SHALL be recorded in dev-pomogator-owned config. The
installer SHALL NOT mix Codex subscription routing and direct Anthropic routing
inside the same generated Claude Code endpoint.

Trace: @feature2.

## FR-3: Docker-first runtime

**Acceptance:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)

If Docker is available on the host or through WSL, the beta installer SHALL
prefer a Docker runtime.

The Docker runtime SHALL:

- run Headroom as a managed service with persistent state volume;
- expose Headroom on the configured local port, default `127.0.0.1:8787`;
- run sub2api only for `codex-sub2api`;
- configure service health checks;
- persist logs for doctor analysis;
- avoid storing secrets in tracked repo files.

Trace: @feature3.

## FR-4: Host headless fallback

**Acceptance:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)

If Docker is unavailable on both host and WSL, the installer SHALL offer a
host/headless fallback.

The fallback SHALL:

- install `headroom-ai` with required extras in an isolated environment;
- use retry loops for Windows file-lock install failures;
- create an OS-native autostart unit:
  - Windows Task Scheduler;
  - Linux systemd user service;
  - macOS LaunchAgent;
- expose start, stop, status, and uninstall commands;
- verify the same `/health` and `/stats` contract as Docker mode.

Trace: @feature4.

## FR-5: Peak Headroom configuration

**Acceptance:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)

The installer SHALL configure Headroom for token savings by default when the
user chooses the optimization profile.

Minimum required behavior:

- run with `--mode token` or equivalent `HEADROOM_MODE=token`;
- enable `--intercept-tool-results` when supported and safe;
- enable `--no-ccr-proactive-expansion` when supported;
- use `--no-subscription-tracking` for Codex-sub2api unless explicitly needed;
- set bounded concurrency and compression worker values;
- install code-aware dependencies such as tree-sitter through package extras;
- warm up compression/model paths with synthetic text, log, JSON, and code
  compression checks.

The installer SHALL inspect `headroom proxy --help` and skip unsupported flags
instead of failing on stale documentation.

Trace: @feature5.

## FR-6: Verification and doctor

**Acceptance:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)

The beta feature SHALL provide a doctor that proves runtime health from live
signals:

- `/health` reports ready;
- `/stats.summary.mode` matches the requested mode;
- `/stats` compression counters increase after a synthetic compressible request
  in token mode;
- provider prefix-cache savings are reported separately from compression token
  savings;
- tool-search/RTK/context-tool savings are reported separately;
- sub2api route/model evidence is checked for `codex-sub2api`;
- direct Anthropic smoke evidence is checked for `anthropic-direct`.

Trace: @feature6.

## FR-7: Safe Claude settings management

**Acceptance:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)

Any global Claude Code settings edit SHALL:

- read and write JSON without losing unknown keys;
- preserve existing hooks and plugin settings;
- create timestamped backups before mutation;
- write atomically;
- include rollback;
- never print API keys, OAuth tokens, or refresh tokens.

Trace: @feature7.

## FR-8: Honest savings reporting

**Acceptance:** [AC-8](ACCEPTANCE_CRITERIA.md#ac-8-fr-8)

User-facing output SHALL distinguish:

- proxy compression tokens saved;
- provider prefix-cache tokens/cost savings;
- tool-search schema deferral;
- RTK/context-tool savings;
- output-shaping estimates, if enabled.

The report SHALL explicitly say "Token Savings can be zero" when Headroom is in
cache mode or when no compressible payload crossed the proxy.

Trace: @feature8.

## FR-9: Packaged skills and user docs

**Acceptance:** [AC-9](ACCEPTANCE_CRITERIA.md#ac-9-fr-9)

dev-pomogator SHALL ship a focused skill/command for Headroom beta operations:

- install;
- doctor;
- dashboard;
- switch topology;
- rollback;
- uninstall.

The existing Meridian skills SHALL remain Meridian-specific unless a future spec
explicitly merges them.

Trace: @feature9.

## FR-10: Regression coverage

**Acceptance:** [AC-10](ACCEPTANCE_CRITERIA.md#ac-10-fr-10)

The implementation SHALL include regression coverage for:

- zero savings caused by cache mode;
- unsupported stale Headroom flags;
- Docker host unavailable with WSL Docker available;
- Docker unavailable with host fallback;
- non-loopback bind without token;
- malformed or pre-existing Claude settings;
- Codex-sub2api and Anthropic-direct topology selection.

Trace: @feature10.
