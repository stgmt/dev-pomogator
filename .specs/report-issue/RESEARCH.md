# Research

## Problem

GitHub issue reporting from a support session is currently manual: the user must reconstruct the problem, decide which context is safe to share, open the correct repository, and recover their work when GitHub CLI access is unavailable. The canonical `/report-issue` command and skill will provide one in-session path for preparing and submitting a report for `stgmt/dev-pomogator` while preserving the user's control over every outward action.

## Scope and boundaries

This specification covers GitHub issue #37: the canonical `/report-issue` skill and command for dev-pomogator. It collects structured issue context in the current session, sanitizes it before every display, persistence, search, URL encoding, or post, presents a draft, and binds remote creation to explicit approval of that draft. It searches for duplicates, creates through authenticated `gh issue create`, and supplies local preservation plus a GitHub new-issue fallback when the normal remote path fails.

GitHub issue #40 extends `pomogator-doctor`; it is explicitly out of scope. This spec neither changes doctor diagnostics nor makes issue submission depend on them.

## Project Context

dev-pomogator is distributed as a canonical Claude Code marketplace plugin. The command must work from both a repository checkout and an installed plugin environment. Repository identity therefore must be resolved from a Git remote when available or from canonical plugin metadata as a fallback, rather than from a user-specific path, account, or configuration value.

The command performs an external side effect. Its safety boundary is the sanitized draft that the user explicitly approves: the title and body passed to duplicate search, local preservation, fallback URL encoding, browser opening, and `gh issue create` must be derived from that same approved draft. Secret-like strings and personal filesystem paths must be redacted before they cross that boundary.

## Research Findings

### Finding 1: Sanitize before every output and remote operation

The candidate report must be sanitized before it is displayed, persisted, used as a duplicate-search query, URL-encoded, or submitted. A one-time sanitization step that is later bypassed by an original field would permit accidental disclosure. The implementation should retain only the sanitized draft for downstream actions and treat raw context as ephemeral input.

### Finding 2: Confirmation must be bound to immutable draft content

Explicit confirmation is meaningful only when it approves the exact title and body used for creation. The command should calculate a draft identity from the sanitized content or otherwise prevent changes between presentation and `gh issue create`; any material edit requires the user to review and confirm again. A declined or cancelled confirmation must make no external call and create no fallback artifact.

### Finding 3: Duplicate search informs, not silently blocks

Search should run against sanitized title and summary terms in the resolved repository before remote creation. Matching issues should be shown to the user alongside the draft, with a clear choice to continue or cancel. The command must not post merely because no match is found, nor replace confirmation with duplicate detection.

### Finding 4: Fallback is a first-class recovery path

The recoverable failure set includes a missing GitHub CLI, unauthenticated CLI, offline or timeout failures, and a failed create response. After the user has approved the draft, each must atomically preserve the same sanitized Markdown report before producing an encoded `https://github.com/stgmt/dev-pomogator/issues/new?title=...&body=...` URL and attempting a best-effort browser open. Browser-opening failure must not discard the preserved report or hide the URL.

### Finding 5: Repository resolution must not embed a user's environment

The target `owner/repository` should be derived from a valid current Git remote first, with canonical plugin metadata as the distributed fallback. Resolution failure must be actionable and must not fabricate a target from a personal path, local username, or undocumented configuration. The selected identity must be shared by duplicate search, issue creation, and fallback URL building.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A raw session value bypasses redaction in a display, search query, local draft, URL, or `gh` argument. | Medium | High | Centralize sanitization at draft construction, discard raw values from downstream data structures, and test every outward sink against credential-shaped values and personal paths. |
| The user approves one draft but a changed title or body is submitted later. | Medium | High | Bind confirmation to a stable sanitized draft identity and require a new display and confirmation whenever the draft changes. |
| GitHub CLI unavailability or a network/create error loses the user's approved report. | Medium | High | Atomically write the approved sanitized Markdown before returning the encoded fallback URL; make browser opening best effort only. |
| Duplicate search leaks unsanitized context or incorrectly prevents a legitimate new report. | Medium | Medium | Search only with sanitized terms, show matches as information, and retain an explicit user choice to continue or cancel. |
| Installed-plugin execution cannot identify the report repository because no checkout remote is present. | Medium | Medium | Resolve a validated Git remote first, fall back to canonical plugin metadata, and emit actionable recovery guidance when neither is available. |
| Scope expands into the separate pomogator-doctor work tracked by GitHub issue #40. | Low | Medium | Keep doctor integration out of `/report-issue` requirements and validate that file changes stay within the reporting command and skill surface. |