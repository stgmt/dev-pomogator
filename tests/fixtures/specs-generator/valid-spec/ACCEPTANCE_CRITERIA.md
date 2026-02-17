# Acceptance Criteria

## AC-1: Scaffold Creates Structure

WHEN user runs scaffold-spec.ps1 with valid name
THEN system SHALL create folder .specs/valid-spec/ with 14 files

## AC-2: Scaffold Validates Name

WHEN user runs scaffold-spec.ps1 with invalid name (not kebab-case)
THEN system SHALL return error with exit code 2

## AC-3: Validate Checks Structure

WHEN user runs validate-spec.ps1 on folder with missing files
THEN system SHALL report STRUCTURE errors for each missing file

## AC-4: Validate Checks FR Format

WHEN user runs validate-spec.ps1 on folder with FR.md without FR-N headers
THEN system SHALL report FR_FORMAT error

## AC-5: Status Shows Phase

WHEN user runs spec-status.ps1 on partially filled spec
THEN system SHALL report current phase AND progress percentage
