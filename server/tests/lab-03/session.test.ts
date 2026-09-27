import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  generateSessionToken,
  hashSessionToken,
  isSessionExpired,
  sessionCookieOptions,
  sessionExpiry
} from '../../src/session.js';

/**
 * UNIT-05 — BR-10: the session helper produces a 32-byte random token, stores
 * only its SHA-256, expires eight hours after login, and rejects an expired
 * session.
 */
describe('session helper (UNIT-05, BR-10)', () => {
  it('generates a base64url token of 32 random bytes', () => {
    const token = generateSessionToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('generates a different token every time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    expect(tokens.size).toBe(50);
  });

  it('hashes the token with SHA-256 so the raw value is never stored', () => {
    const token = generateSessionToken();
    const expected = createHash('sha256').update(token).digest('hex');

    expect(hashSessionToken(token)).toBe(expected);
    expect(hashSessionToken(token)).not.toContain(token);
    expect(hashSessionToken(token)).toHaveLength(64);
  });

  it('sets expiry to exactly eight hours after login', () => {
    const loginAt = new Date('2026-09-15T08:00:00.000Z');

    expect(sessionExpiry(loginAt).toISOString()).toBe('2026-09-15T16:00:00.000Z');
    expect(SESSION_TTL_MS).toBe(8 * 60 * 60 * 1000);
  });

  it('treats a session as expired once expiresAt has been reached', () => {
    const expiresAt = new Date('2026-09-15T16:00:00.000Z');

    expect(isSessionExpired(expiresAt, new Date('2026-09-15T15:59:59.999Z'))).toBe(false);
    expect(isSessionExpired(expiresAt, new Date('2026-09-15T16:00:00.000Z'))).toBe(true);
    expect(isSessionExpired(expiresAt, new Date('2026-09-16T00:00:00.000Z'))).toBe(true);
  });

  it('describes an httpOnly, SameSite=Lax cookie on the root path with the 8 h lifetime', () => {
    const options = sessionCookieOptions();

    expect(SESSION_COOKIE).toBe('toktickit_session');
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.maxAge).toBe(SESSION_TTL_MS);
    // Plain http on localhost: a Secure cookie would never come back.
    expect(options.secure).toBe(false);
  });
});
