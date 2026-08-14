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

## NFR-Sec-2: Same-origin and transport safety

- The browser API SHALL be same-origin by default and SHALL reject or safely handle cross-origin requests. The adapter SHALL validate spec and node identifiers before passing them to the stdio MCP process.
- The adapter SHALL fail closed for mutation requests and SHALL not expose MCP mutation tools through the browser boundary.

## Reliability

## NFR-Rel-1: Honest degradation

- Empty, not-run, stale, partial, unavailable, and provider-error states SHALL remain distinguishable in DTOs and UI. A missing result SHALL not be inferred to be `PASSED` or `GREEN`.
- If the provider is unavailable, the dashboard SHALL retain safe last-known metadata only when marked stale and SHALL show the provider-error category and diagnostic ID.

## NFR-Rel-2: Process and resource isolation

- The adapter SHALL bound request time, response size, and child-process/resource cleanup for every stdio MCP request. A failed request SHALL not leave a browser-visible mutation or an orphaned provider process.

## Usability

## NFR-Use-1: Accessibility

- Primary kanban navigation, card detail, filters, status labels, and error states SHALL be keyboard operable, have programmatic names, and meet WCAG 2.1 AA contrast and focus requirements.
- Status meaning SHALL not rely on color alone; every lifecycle and result state SHALL include text or an accessible label.

## NFR-Scale-1: Corpus and graph scale

- The UI SHALL remain bounded and usable for at least 1,000 cards across a corpus by paginating or virtualizing cards and by lazy-loading trace detail and neighborhoods.

## NFR-Compat-1: Runtime support

- The shipped implementation SHALL target Node 20 and use the repository's TypeScript/ESM and Cucumber 12 conventions. `npm run build:dashboard` SHALL produce a self-contained Node server bundle at `tools/spec-dashboard/server.bundle.mjs` and a browser JavaScript bundle at `tools/spec-dashboard/ui/app.bundle.js`; `node tools/spec-dashboard/server.bundle.mjs --host 127.0.0.1 --port 0` SHALL be the canonical local launcher. Both bundles and static assets SHALL be included by the existing `tools` package boundary and SHALL run when project `node_modules` is absent. Any added browser-test dependency and Chromium installation SHALL be declared in `package.json`, `package-lock.json`, and the Docker test image; no web framework dependency may be added without a recorded decision and dependency-impact review.

## NFR-Legal-1: Plane-inspired clean-room strategy

- Plane-inspired interaction patterns MAY inform the design. The default implementation SHALL be clean-room and SHALL not copy Plane source code or AGPL-covered implementation. Any future reuse requires legal approval, exact research references, and a mutable-preview risk record.
