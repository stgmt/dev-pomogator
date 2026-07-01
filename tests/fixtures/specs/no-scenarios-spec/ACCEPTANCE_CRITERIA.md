# Acceptance Criteria — no-scenarios-spec

### AC-1 (FR-1): Registration accepts new email

WHEN a new email is submitted with a valid password THEN the system SHALL create the account.

### AC-2 (FR-2): Login issues session token

WHEN valid credentials are submitted THEN the system SHALL respond with a session token.

### AC-3 (FR-3): Reset link expires

WHEN a reset link is older than 24 hours THEN the system SHALL refuse the reset.

### AC-4 (FR-4): Deactivation is permanent

WHEN a user confirms deactivation THEN the system SHALL mark the account closed and refuse subsequent logins.

### AC-5 (FR-5): Profile edit persists

WHEN a profile field is updated THEN the system SHALL persist the change atomically.
