# Functional Requirements — conflicting-fr-spec

This fixture intentionally contains two `### FR-1: Login` headings with
different bodies. The SpecGraph builder keeps only the first definition;
the PreToolUse hard hook (`spec-conformance-guard`) must DENY any
Write/Edit that creates this state with finding code `DUPLICATE_DEFINITION`.

### FR-1: Login

The system SHALL accept username + password and issue a session.

### FR-1: Login

The system SHALL accept email + magic link and issue a session.

This second body is intentionally different from the first to make the
duplicate easy to spot in a diff.
