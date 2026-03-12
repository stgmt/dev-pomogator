import { describe, expect, it } from 'vitest';

function createAuthResponse(status: number) {
  return {
    status,
    body: { ok: status === 200 },
  };
}

describe('auth flow', () => {
  it('should authenticate valid user', () => {
    const response = createAuthResponse(200);
    expect(response.status).toBe(200);
  });

  it('should reject expired token', () => {
    const token = {
      value: 'expired-token',
      expired: true,
    };

    const request = {
      token,
      retries: 0,
    };

    const serviceState = {
      cacheReady: true,
      allowExpiredTokens: false,
      authMode: 'strict',
    };

    const response = createAuthResponse(200);

    expect(request.token.expired).toBe(true);
    expect(serviceState.cacheReady).toBe(true);
    expect(serviceState.allowExpiredTokens).toBe(false);
    expect(serviceState.authMode).toBe('strict');
    expect(request.retries).toBe(0);
    expect(response.body.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.status).toBe(401);
  });

  it('should refresh token', () => {
    const response = createAuthResponse(200);
    expect(response.status).toBe(200);
  });
});
