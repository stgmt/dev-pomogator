# Non-Functional Requirements

## Performance

- Login response under 200ms
- Registration under 500ms

## Security

- Passwords hashed with bcrypt
- JWT tokens expire after 24h

## Reliability

- Failed logins should not leak user existence
- Registration should be idempotent

## Usability

- Clear error messages for invalid credentials
- Email confirmation instructions
