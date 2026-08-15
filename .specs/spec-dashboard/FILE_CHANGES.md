# File Changes — spec-dashboard

> Paths are repository-relative. Existing files are **EDIT**; absent planned files are **CREATE**.

| Action | Path | Purpose | Requirements |
|---|---|---|---|
| CREATE | `tools/spec-dashboard/server.ts` | Loopback same-origin read-only HTTP server, static asset serving, safe diagnostic IDs | FR-5, NFR-Sec-1, NFR-Sec-2 |
| CREATE | `tools/spec-dashboard/server.bundle.mjs` | Self-contained Node 20 server/adapter bundle used by the canonical deps-absent launcher | FR-5, NFR-Compat-1, NFR-Rel-2 |
| CREATE | `tools/spec-dashboard/mcp-adapter.ts` | Stdio MCP read-tool allowlist including bounded `list_tasks` and `find_refs`, 5s timeout, one safe transient retry, typed errors | FR-1, FR-3, FR-4, FR-5, NFR-Rel-1, NFR-Rel-2 |
| CREATE | `tools/spec-dashboard/dto.ts` | Versioned task-card, trace, relationship, evidence, and safe error DTOs | FR-1, FR-2, FR-3, FR-4, FR-5 |
| CREATE | `tools/spec-dashboard/ui/index.html` | Accessible task-kanban shell and secondary graph panel | FR-1, NFR-Use-1 |
| CREATE | `tools/spec-dashboard/ui/app.ts` | Task cards, authored/verified state separation, detail, gaps, impact, evidence, typed degraded states | FR-1, FR-2, FR-3, NFR-Use-1 |
| CREATE | `tools/spec-dashboard/ui/app.bundle.js` | Browser-executable JavaScript generated from `app.ts` | FR-1, FR-2, FR-3, NFR-Compat-1 |
| CREATE | `tools/spec-dashboard/ui/styles.css` | Responsive, keyboard-visible, reduced-motion styles | FR-1, NFR-Use-1 |
| CREATE | `tools/spec-dashboard/README.md` | `node tools/spec-dashboard/server.bundle.mjs --host 127.0.0.1 --port 0` startup, privacy, packaging and license notes | FR-5, NFR-Compat-1 |
| CREATE | `tools/spec-dashboard/spec-dashboard_SCHEMA.md` | Implemented task-card, DTO and error contract mirror | FR-1, FR-5, NFR-Sec-1 |
| CREATE | `tests/features/spec-dashboard/SPECDASH001_spec_dashboard.feature` | Docker Cucumber API and headless Chromium scenarios through the real HTTP adapter and stdio MCP | FR-1, FR-2, FR-3, FR-4, FR-5 |
| CREATE | `tests/step_definitions/spec-dashboard.steps.ts` | Real adapter/MCP/browser steps, task-specific performance/accessibility/security/startup proof, guaranteed process/browser cleanup | FR-1, FR-2, FR-3, FR-4, FR-5 |
| CREATE | `tests/features/spec-dashboard/fixtures/status-and-trace.json` | Producer-shaped response/error and fixed 1,000-task corpus fixtures; real-artifact cross-check required | FR-1, FR-4, FR-5, FIXTURES.md |
| EDIT | `package.json` | Add `build:dashboard`, `start:dashboard`, Playwright library dependency, and existing TypeScript/ESM wiring | NFR-Compat-1 |
| EDIT | `package-lock.json` | Lock the declared browser-test dependency | NFR-Compat-1 |
| EDIT | `Dockerfile.test.base` | Install pinned headless Chromium and Linux dependencies for Docker-only browser BDD | NFR-Use-1, NFR-Compat-1 |
| EDIT | `cucumber.json` | Wire the executable feature, dashboard steps and reused hooks into the Docker profile; no host run | FR-1, FR-5, NFR-Compat-1 |
| DO NOT MODIFY | `tools/spec-graph/**` | Remains owned by spec-generator-v4 | FR-4, FR-5 |
| DO NOT MODIFY | `tools/spec-mcp-server/**` | Remains the canonical MCP provider | FR-4, FR-5 |
| DO NOT MODIFY | `tools/specs-generator/**` | No second parser/status engine | FR-4 |

All new behavior is BDD-first and exercised only through the centralized Docker runner. No new non-BDD test file is planned.


## Vendored Plane fork and corresponding-source changes

| Change | Path | Contract |
|---|---|---|
| CREATE | `vendor/plane/PROVENANCE.json` | Upstream, version, exact commit, `plane-upstream`, AGPL notice, retained/bypassed areas, local patches, manual sync policy |
| CREATE/RETAIN | `vendor/plane/COPYRIGHT.txt` | Exact upstream `AGPL-3.0-only` notice |
| CREATE | `vendor/plane/source/` or equivalent source archive metadata | Network-accessible corresponding source for the exact pinned fork plus local patches |
| RETAIN | `vendor/plane/board/**`, `vendor/plane/ui/**`, `vendor/plane/design-system/**`, `vendor/plane/runtime/**` | Plane board/UI/design-system/runtime shell portions |
| BYPASS | Plane backend, domain, auth, workspace, project, database, external-service paths | No Plane domain data or Plane service dependency at runtime |
| EDIT | `tools/spec-dashboard/server.ts`, `tools/spec-dashboard/mcp-adapter.ts`, `tools/spec-dashboard/dto.ts` | Loopback same-origin adapter, seven-tool read allowlist, typed errors, redaction, bounded stdio lifecycle |
| EDIT/CREATE | `tools/spec-dashboard/server.bundle.mjs`, `tools/spec-dashboard/ui/app.bundle.js`, static UI assets | Node >=22.18 distributable, retained shell, provider-error and license/source routes |
| EDIT | `tools/spec-dashboard/README.md`, `tools/spec-dashboard/spec-dashboard_SCHEMA.md` | Fork provenance, launcher, distribution, DTO, license, corresponding-source contracts |
| EDIT | `package.json`, `package-lock.json`, vendored lockfile, build metadata | Node 22 and pnpm 11.3.0 frozen inputs; declared browser-test dependencies |
| EDIT | `Dockerfile.test.base`, `cucumber.json`, `tests/hooks/before-after.ts` | Docker-only BDD, real-artifact checks, non-root runtime, guaranteed cleanup |
| EDIT/CREATE | `tests/features/spec-dashboard/SPECDASH001_spec_dashboard.feature`, `tests/step_definitions/spec-dashboard.steps.ts`, fork/license fixtures | Clean-fork, license, upstream-sync, Node 22 build, deps-absent, browser, performance, accessibility, security, provider-boundary scenarios |
| DO NOT MODIFY | `tools/spec-graph/**`, `tools/spec-mcp-server/**`, `tools/specs-generator/**` | spec-generator-v4 graph, MCP provider, parser, lifecycle, status remain authoritative |

All provenance, notices, source metadata, and build changes SHALL be committed atomically. Runtime upstream fetching, Plane service calls, proprietary components, and unreviewed binaries are forbidden.

