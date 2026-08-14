# Spec remediation dogfood provenance

The fixture captures the defect classes uncovered during the `spec-dashboard` dogfood session, not a synthetic happy-path spec:

- card identity changed to canonical `Task`;
- bounded inventory required `list_tasks` across authored statuses;
- authored lifecycle was separated from evidence-derived verification/readiness;
- complete directed neighbors required `find_refs`; `get_trace.related_nodes` remained summary-only;
- unsupported history was made explicitly unavailable;
- API checks were insufficient for browser UX;
- the complete launch→selection→board/filter/page→detail→evidence/file/graph→back/context→retry/deep-link journey was still missing;
- performance, accessibility, security/cleanup and dependency-absent launcher proof became separate obligations.

The redacted `semantic-review.json` is the machine-shaped category-17 output consumed by the regression. It intentionally contains no credentials, command arguments, host paths or private evidence-store locations.
