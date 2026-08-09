# Use Cases

## UC-1: Add a Codex Plugin Surface to the Whitelist

A maintainer wants to mark a feature as Codex-plugin supported.

- Maintainer proposes a feature slug and plugin name.
- The whitelist checks that the feature has a `.codex-plugin/plugin.json` plan, marketplace entry, runtime contract, and verification method.
- If any evidence is missing, the feature remains `Draft` or `Blocked` instead of `Supported`.

## UC-2: Preserve Existing Claude Code Support

A maintainer adds Codex support for a feature that already has Claude Code plugin artifacts.

- Maintainer identifies the existing Claude artifacts and tests.
- Codex files are added separately.
- Verification confirms the Claude channel still exists and the Codex channel uses Codex-native paths and flags.

## UC-3: First Whitelist Entry Is Context Menu

The user asks for Windows Explorer right-click launch support for both Claude Code and Codex.

- The whitelist names `context-menu` as the first approved Codex plugin surface.
- The context-menu spec remains responsible for detailed Windows/Nilesoft launcher behavior.
- This spec gates Codex plugin packaging and verification requirements around that feature.

## UC-4: Reject Stale Claude-to-Codex Assumptions

A historical doc or skill claims a Codex behavior that is actually Claude-specific or stale.

- Maintainer compares the claim against local `codex --help`, `codex plugin --help`, official Codex docs, and local plugin cache examples.
- Unsupported claims are marked as drift and cannot become requirements.
- Implementation tasks include correcting the source artifact that contains the stale claim.

## UC-5: Verify Plugin Install and Runtime Load

A Codex plugin entry is ready for implementation review.

- Verification runs a real Codex plugin marketplace/install/list flow or an equivalent non-interactive integration harness.
- The check confirms installed/enabled status, manifest paths, and component loading expectations.
- Hook/MCP entries record trust and policy requirements separately from manifest validity.

## UC-6: Publish the Full Spec Generator as the Second Entry

A maintainer adds the full `spec-generator-v4` Codex plugin after the context-menu-only entry.

- The marketplace keeps `context-menu` first and adds `spec-generator-v4` second.
- The second record uses its own plugin source and manifest reference instead of widening or aliasing the context-menu package.
- This spec owns only ordering, distribution metadata, support status, and evidence gating.
- Skills, agents, hooks, MCP wiring, project-root behavior, and Codex Desktop runtime semantics stay owned by requirement 83 of the main `spec-generator-v4` spec.
- Until that requirement has passing installed-runtime evidence, the second entry remains `Draft` or `Blocked`.
