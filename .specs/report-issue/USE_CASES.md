# Use Cases

## UC-1: Название

**Primary actor:** dev-pomogator user

**Goal:** Turn a user-described failure and relevant in-session context into one approved GitHub issue.

**Preconditions:** `/report-issue` is available; a repository identity can be resolved; GitHub CLI is authenticated and reachable.

**Main flow:**
1. The user invokes `/report-issue` and provides a concise title and description.
2. The command collects only relevant in-session diagnostic context.
3. The command sanitizes the complete candidate title, body, and search terms.
4. The command searches the resolved repository for related issues and presents any matches.
5. The command displays the final sanitized draft and asks for explicit confirmation.
6. After confirmation, the command creates one GitHub issue and reports its URL.

**Success outcome:** The issue tracker receives exactly the user-approved sanitized draft.

**Related stories:** User Story 1, User Story 2, User Story 3

## UC-2: Название

**Primary actor:** privacy-conscious user

**Goal:** Stop a report before any remote side effect when the displayed draft is not acceptable.

**Preconditions:** A sanitized draft has been generated.

**Main flow:**
1. The command presents the sanitized title, body, duplicate matches, and intended repository.
2. The user declines confirmation or cancels the interaction.
3. The command exits without searching further, persisting a draft, opening a browser, or creating an issue.

**Success outcome:** No report content leaves the confirmation boundary.

**Related stories:** User Story 2

## UC-3: Название

**Primary actor:** dev-pomogator user

**Goal:** Retain an approved report when GitHub access is unavailable.

**Preconditions:** The user has approved a sanitized draft; GitHub CLI is missing, logged out, offline, timed out, or returns a create error.

**Main flow:**
1. The command detects or receives the remote failure.
2. The command atomically writes the approved sanitized Markdown draft to its local report location.
3. The command URL-encodes the same title and body into the GitHub new-issue endpoint.
4. The command displays the draft location and fallback URL, then attempts to open the URL without treating browser failure as report loss.

**Success outcome:** The user retains a reusable draft and can finish submission manually.

**Related stories:** User Story 4

## UC-4: Название

**Primary actor:** plugin user

**Goal:** Select a stable issue destination without user-specific configuration.

**Preconditions:** `/report-issue` is running in either a dev-pomogator checkout or a canonical plugin installation.

**Main flow:**
1. The command attempts to read the current Git remote identity.
2. If no suitable remote is available, it reads canonical plugin metadata.
3. It validates that the selected identity is an owner/repository pair.
4. It uses the resolved target for duplicate search, issue creation, and fallback URL construction.

**Success outcome:** Reports route to the dev-pomogator issue tracker or explain why no target could be resolved.

**Related stories:** User Story 5

## UC-5: Название

**Primary actor:** maintainer

**Goal:** Keep GitHub report submission independent from the separate GitHub diagnostics work for issue #40.

**Preconditions:** Both improvements are planned in the same repository.

**Main flow:**
1. The maintainer invokes `/report-issue` only for issue reporting.
2. The command does not modify, depend on, or claim pomogator-doctor GitHub diagnostics.
3. The maintainer tracks #40 in its own scope and specification if needed.

**Success outcome:** The report-issue contract remains focused and avoids coupling to unrelated doctor findings.

**Related stories:** User Story 5