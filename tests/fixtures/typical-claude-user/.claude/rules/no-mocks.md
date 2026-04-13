# No Mocks Rule

When writing tests, never use mocks, stubs, or fakes for code under our control. Always exercise the real implementation.

## Allowed

- Real database (test instance)
- Real file system (temp directory)
- Real HTTP server (loopback)

## Forbidden

- `vi.mock()`, `jest.mock()`
- Hand-rolled fake classes that shadow real ones
- `sinon.stub()` on internal methods

## Why

Mock drift is the #1 source of "tests pass, prod breaks". Real integrations cost a few extra seconds and catch real bugs.
