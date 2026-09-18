/**
 * Session tokens and the cookie that carries them (BR-10, AD-01,
 * api-spec.md §1.1).
 *
 * The raw token is 32 random bytes, base64url-encoded, and only ever exists in
 * the cookie. The database holds its SHA-256, so a leaked `Session` table does
 * not let anyone forge a cookie. Lifetime is absolute — eight hours from login,
 * no sliding renewal.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'toktickit_session';
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const SESSION_TOKEN_BYTES = 32;

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/**
 * `Secure` only in production: the lab runs over plain http on localhost, where
 * a Secure cookie would never be sent back.
 */
export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS,
    secure: process.env.NODE_ENV === 'production'
  };
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

/** Clearing must repeat the attributes that identify the cookie (path, etc.). */
export function clearSessionCookie(res: Response): void {
  const { maxAge: _maxAge, ...options } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, options);
}
