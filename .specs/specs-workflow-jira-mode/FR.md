# Functional Requirements (FR)

## FR-1: JIRA_SOURCE.md presence triggers JIRA_SOURCE_PRESERVED tracing checks @feature100

When a spec directory contains `JIRA_SOURCE.md`, the spec validator SHALL emit a
`JIRA_SOURCE_PRESERVED` WARNING for each FR.md section heading that lacks a
"Jira imperative:" trace within the following 15 lines, for each AC section lacking
"Jira acceptance:" or "Evidence:", and for each .feature Scenario lacking a
"# Jira trace:" comment in the preceding 10 lines.

**Related AC:** [AC-1](ACCEPTANCE_CRITERIA.md#ac-1-fr-1)

## FR-2: "Jira imperative:" trace in FR.md section suppresses the JIRA_SOURCE_PRESERVED warning for that section @feature101

When a FR.md section heading is followed within 15 lines by a line starting with
"Jira imperative:", the spec validator SHALL NOT emit a JIRA_SOURCE_PRESERVED WARNING
for that section.

**Related AC:** [AC-2](ACCEPTANCE_CRITERIA.md#ac-2-fr-2)

## FR-3: Absence of JIRA_SOURCE.md makes JIRA_SOURCE_PRESERVED rule a no-op @feature102

When `JIRA_SOURCE.md` is absent from a spec directory, the spec validator SHALL emit
zero JIRA_SOURCE_PRESERVED warnings regardless of other spec file content.

**Related AC:** [AC-3](ACCEPTANCE_CRITERIA.md#ac-3-fr-3)

## FR-4: AC sections without Jira acceptance or Evidence emit JIRA_SOURCE_PRESERVED warning @feature103

When `JIRA_SOURCE.md` is present AND an ACCEPTANCE_CRITERIA.md section lacks
"Jira acceptance:" or "Evidence:" within 15 lines of its heading, the spec validator
SHALL emit a JIRA_SOURCE_PRESERVED WARNING for ACCEPTANCE_CRITERIA.md.

**Related AC:** [AC-4](ACCEPTANCE_CRITERIA.md#ac-4-fr-4)

## FR-5: .feature scenarios without "# Jira trace:" comment emit JIRA_SOURCE_PRESERVED warning @feature104

When `JIRA_SOURCE.md` is present AND a .feature Scenario lacks a "# Jira trace:"
comment in the 10 preceding lines, the spec validator SHALL emit a JIRA_SOURCE_PRESERVED
WARNING for the .feature file, with a message mentioning "Jira trace".

**Related AC:** [AC-5](ACCEPTANCE_CRITERIA.md#ac-5-fr-5)

## FR-6: checkJiraDrift detects cache-vs-live state divergence and fail-opens when MCP unavailable @feature105

- When `.jira-cache.json` is absent, `checkJiraDrift` SHALL return zero findings.
- When `.jira-cache.json` is present AND MCP is unavailable (mcpUnavailable=true),
  `checkJiraDrift` SHALL emit exactly one INFO finding with check='JIRA_DRIFT' and
  a message containing "skipped".
- When live Jira state is provided AND `issue_updated_at` differs from the cached value,
  `checkJiraDrift` SHALL emit a WARNING with message containing "Issue modified since intake".
- When live Jira state shows a higher comment count than cached, `checkJiraDrift` SHALL
  emit a WARNING with message containing "new comment".

**Related AC:** [AC-6](ACCEPTANCE_CRITERIA.md#ac-6-fr-6)

## FR-7: Jira-mode template files are distributed with the spec-generator @feature106

The following files SHALL exist under `tools/specs-generator/templates/`:
- `JIRA_SOURCE.md.template`
- `ATTACHMENTS.md.template`
- `JIRA_CACHE.schema.json`

**Related AC:** [AC-7](ACCEPTANCE_CRITERIA.md#ac-7-fr-7)
