# Category 14 — Memory-constraint compliance

Use project memory only as a source of user-owned constraints, never as implementation evidence.

1. Resolve the current project's Claude memory directory from the encoded working directory.
2. Read `feedback_*.md` memories and extract explicit forbidden literals and required patterns.
3. Scan spec prose through the MCP read door; never use raw filesystem reads over `.specs/`.
4. Report exact source memory, spec document, and line. Strong MUST/never constraints are P0; softer preferences are P1.
5. If a required pattern is semantic rather than mechanically searchable, emit a bounded review finding instead of guessing compliance.

Coverage is limited to documents returned by `list_spec_docs`; non-document artifacts remain engine-owned checks.
