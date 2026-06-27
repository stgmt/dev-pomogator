// BDD step-def fixture for the tui-test-runner analyst crash-resolution test.
// A sample auth-flow step-def whose failing Then (line 42) is the crash target the
// analyst resolves from yaml-v2-full.yaml's stack trace (tests/auth.steps.ts:42).
// A cucumber run can crash inside a step-def, so the crash resolves to step-def code.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

interface AuthWorld {
  request?: { token: { value: string; expired: boolean }; retries: number };
  serviceState?: { cacheReady: boolean; allowExpiredTokens: boolean; authMode: string };
  response?: { status: number; body: { ok: boolean } };
}

function createAuthResponse(status: number): { status: number; body: { ok: boolean } } {
  return {
    status,
    body: { ok: status === 200 },
  };
}

Given(/^a valid user$/, function (this: AuthWorld) {
  this.request = { token: { value: 'valid', expired: false }, retries: 0 };
});

Given(/^an expired token in strict mode$/, function (this: AuthWorld) {
  this.request = { token: { value: 'expired-token', expired: true }, retries: 0 };
  this.serviceState = {
    cacheReady: true,
    allowExpiredTokens: false,
    authMode: 'strict',
  };
});

When(/^the auth service responds$/, function (this: AuthWorld) {
  this.response = createAuthResponse(200);
});

Then(/^the request is rejected as expired$/, function (this: AuthWorld) {
  assert.equal(this.request!.token.expired, true);
  assert.equal(this.serviceState!.cacheReady, true);
  assert.equal(this.serviceState!.allowExpiredTokens, false);
  assert.equal(this.response!.status, 401); // FAILS: status is 200 — the crash line (42)
});

Then(/^a valid user authenticates$/, function (this: AuthWorld) {
  this.response = createAuthResponse(200);
  assert.equal(this.response.status, 200);
});
