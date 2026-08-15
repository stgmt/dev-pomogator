# Non-Functional Requirements — spec-dashboard

## Performance

## NFR-Perf-1: Response and rendering performance

- The same-origin adapter SHALL return a bounded status or summary response within 300 ms at p95 for a warm local provider and SHALL return a bounded trace response within 500 ms at p95 for a warm local provider.
- The kanban SHALL render the first 20 cards within 1 second at p95 on a supported desktop browser after the response is available.
- Large collections SHALL use bounded pagination or truncation metadata; the browser SHALL never require an unbounded graph payload.
- Performance evidence SHALL record the supported Node/runtime and browser versions, the fixed producer-shaped 1,000-card corpus identity and digest, concurrency `1`, a monotonic clock, at least 5 warm-up samples, and at least 30 measured samples per endpoint/view. p95 SHALL use nearest-rank calculation. Failed or partial samples SHALL fail the check and SHALL NOT be discarded from the denominator.

## NFR-Perf-2: Provider freshness and caching

- Read-only status responses MAY use conditional caching, but a cached response SHALL expose its retrieval time and provider freshness metadata. A stale response SHALL remain visibly stale and SHALL never be presented as current evidence.

## Security

## NFR-Sec-1: Read-only boundary and redaction

- Browser routes SHALL expose read-only operations only. No browser route, DTO, URL, error, or log SHALL contain credentials, tokens, secret values, raw local filesystem paths, or unredacted provider command arguments.
- Every provider or adapter failure SHALL include a stable safe diagnostic ID and a typed category without leaking the underlying exception or command line.
- The retained Plane shell SHALL not load Plane authentication, workspace, project, or backend credentials in the browser or adapter. Provider process/session state SHALL remain server-side.

## NFR-Sec-2: Same-origin and transport safety

- The browser API SHALL be same-origin by default and SHALL reject or safely handle cross-origin requests. The adapter SHALL validate spec and node identifiers before passing them to the stdio MCP process.
- The adapter SHALL fail closed for mutation requests and SHALL not expose MCP mutation tools through the browser boundary.
- Path-bearing DTO values SHALL be root-contained repository-relative POSIX paths only; traversal, absolute paths, evidence-store paths, secrets, and command arguments SHALL be rejected or redacted before serialization.

## Reliability

## NFR-Rel-1: Honest degradation

- Empty, not-run, stale, partial, unavailable, and provider-error states SHALL remain distinguishable in DTOs and UI. A missing result SHALL not be inferred to be `PASSED` or `GREEN`.
- If the provider is unavailable, the dashboard SHALL retain safe last-known metadata only when marked stale and SHALL show the provider-error category and diagnostic ID.

## NFR-Rel-2: Process and resource isolation

- The adapter SHALL bound request time, response size, and child-process/resource cleanup for every stdio MCP request. A failed request SHALL not leave a browser-visible mutation or an orphaned provider process.
- The browser, adapter, and MCP child process SHALL be closed by a guaranteed test cleanup hook, including when a test step throws; graceful cleanup SHALL escalate to forceful cleanup when required.

## Usability

## NFR-Use-1: Accessibility

- Primary kanban navigation, card detail, filters, status labels, and error states SHALL be keyboard operable, have programmatic names, and meet WCAG 2.1 AA contrast and focus requirements.
- Status meaning SHALL not rely on color alone; every lifecycle and result state SHALL include text or an accessible label.
- The browser SHALL preserve visible focus, support reduced-motion preferences, and allow keyboard navigation from a card to its trace and secondary graph views.

## NFR-Scale-1: Corpus and graph scale

- The UI SHALL remain bounded and usable for at least 1,000 cards across a corpus by paginating or virtualizing cards and by lazy-loading trace detail and neighborhoods.

## NFR-Compat-1: Runtime support

- The vendored Plane fork SHALL build with Node `>=22.18` and pnpm `11.3.0` using its committed lockfile and a frozen install. The shipped implementation SHALL target Node `>=22.18` and use the repository's TypeScript/ESM and Cucumber 12 conventions.
- `npm run build:dashboard` SHALL produce a self-contained Node server bundle at `tools/spec-dashboard/server.bundle.mjs` and a browser JavaScript bundle at `tools/spec-dashboard/ui/app.bundle.js`; `node tools/spec-dashboard/server.bundle.mjs --host 127.0.0.1 --port 0` SHALL be the canonical local launcher.
- The distributable strategy SHALL ship the retained Plane source and built shell as one versioned release unit, together with static assets, `vendor/plane/PROVENANCE.json`, the AGPL `COPYRIGHT.txt` notice, and corresponding-source metadata/routes. It SHALL not silently substitute an unpinned upstream snapshot or a separate clean-room shell.
- Build-time dependencies SHALL not be required after packaging. The launcher, static assets, license/source routes, and safe provider-error path SHALL run when project `node_modules` is absent. Any added browser-test dependency and Chromium installation SHALL be declared in `package.json`, `package-lock.json`, and the Docker test image; no web framework dependency may be added without a recorded decision and dependency-impact review.

## NFR-Legal-1: Plane-inspired clean-room strategy

- The prior clean-room-only strategy is superseded for this feature by a documented, pinned, and license-compliant vendored Plane fork. Plane-derived files SHALL be retained only for board, UI, design-system, and runtime shell portions; Plane backend, domain, authentication, workspace, project, database, and external-service portions SHALL be replaced or bypassed.
- The repository SHALL vendor `makeplane/plane` version `v1.4.1` at commit `5662b761062b0b2f9d42a6578b55481b5b069792`. `vendor/plane/PROVENANCE.json` SHALL be valid JSON and SHALL contain `upstreamRepository`, `upstreamVersion`, `upstreamCommit`, `upstreamRemote`, `license`, `licenseNotice`, `retainedAreas`, `bypassedAreas`, `localPatches`, and `syncPolicy`. It SHALL identify `https://github.com/makeplane/plane.git`, remote `plane-upstream`, `AGPL-3.0-only`, and `COPYRIGHT.txt`.
- Runtime SHALL use only the loopback read-only spec-generator-v4 MCP adapter for dashboard domain and evidence data. It SHALL not fetch upstream, contact Plane services, initialize Plane authentication, or depend on Plane workspace/project/backend state.
- Synchronization SHALL be manual and reviewable: fetch the pinned reference, compare the vendored tree with the exact commit, review retained/bypassed boundaries and declared local patches, update provenance and notices atomically, rebuild, and rerun clean-fork, license, upstream-sync, Node 22 build, dependency-absent, and BDD checks. Automatic unreviewed synchronization is forbidden.
- The distributable SHALL preserve the upstream `COPYRIGHT.txt` notice and identify the license as `AGPL-3.0-only`. Unauthenticated same-origin `GET /licenses/plane` SHALL expose the exact version, commit, license, notice location, and provenance metadata. `GET /source/plane` SHALL provide network-accessible corresponding source for the exact vendored commit plus declared local patches, either as a downloadable source archive or a stable URL, without browser-held credentials.
- No proprietary Plane component, proprietary project component, closed-source bundle, credentialed service, or unreviewed binary SHALL be vendored, linked, or distributed. The clean-fork and license checks SHALL inspect the vendored tree, manifests, generated asset manifest, source distribution, and provenance and SHALL fail closed on unknown provenance. Source metadata digests SHALL identify the same fork commit and declared local patches as the shipped assets.
