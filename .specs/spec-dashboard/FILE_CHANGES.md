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
