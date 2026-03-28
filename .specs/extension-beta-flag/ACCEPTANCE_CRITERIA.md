# Acceptance Criteria (EARS)

## AC-1 (FR-1): stability field parsed from manifest @feature1

WHEN extension.json contains `"stability": "beta"` THEN installer SHALL read it as beta extension.

WHEN extension.json does NOT contain `stability` field THEN installer SHALL treat it as stable.

## AC-2 (FR-2): beta label in interactive checkbox @feature2

WHEN installer shows interactive checkbox AND extension has `stability: "beta"` THEN checkbox label SHALL contain "(BETA)" after extension name.

## AC-3 (FR-3): beta unchecked by default @feature2

WHEN installer shows interactive checkbox AND extension has `stability: "beta"` THEN checkbox SHALL be unchecked by default.

WHEN installer shows interactive checkbox AND extension has no stability or `stability: "stable"` THEN checkbox SHALL be checked by default.

## AC-4 (FR-4): --all excludes beta @feature3

WHEN installer runs with `--all` flag AND extension has `stability: "beta"` THEN extension SHALL NOT be installed.

WHEN installer runs with `--all` flag AND extension has no stability or `stability: "stable"` THEN extension SHALL be installed.

## AC-5 (FR-5): --include-beta overrides exclusion @feature4

WHEN installer runs with `--all --include-beta` flags THEN ALL extensions SHALL be installed including beta.

## AC-6 (FR-6): updater skips new beta @feature3

WHEN updater runs AND discovers new extension with `stability: "beta"` that was NOT previously installed THEN updater SHALL NOT install it.

WHEN updater runs AND beta extension IS already installed THEN updater SHALL update it normally.
