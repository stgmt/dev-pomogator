# Design

## Architecture

REST API with JWT authentication.

## Components

### AuthController

- Login endpoint
- Token generation

### RegistrationController

- Registration endpoint
- Email validation

## Data Flow

```
Client → AuthController → Database → JWT Token
```
