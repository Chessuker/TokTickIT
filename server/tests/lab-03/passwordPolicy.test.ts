import { describe, it, expect } from 'vitest';
import { PASSWORD_RULES, validatePassword } from '../../src/passwordPolicy.js';

/**
 * UNIT-01 — BR-08, AC-09: the password policy names exactly the failing rule.
 */
describe('validatePassword (UNIT-01, BR-08)', () => {
  it('accepts a password that satisfies every rule', () => {
    expect(validatePassword('Welcome123!')).toBeNull();
    expect(validatePassword('Aa1!aaaa')).toBeNull();
  });

  it('rejects an empty or non-string value', () => {
    expect(validatePassword('')).toBe('A password is required.');
    expect(validatePassword(undefined)).toBe('A password is required.');
    expect(validatePassword(42)).toBe('A password is required.');
  });

  it('enforces the 8-character minimum: 7 fails, 8 passes', () => {
    expect(validatePassword('Aa1!aaa')).toMatch(/at least 8/);
    expect(validatePassword('Aa1!aaaa')).toBeNull();
  });

  it('enforces the 72-byte maximum: 72 passes, 73 fails', () => {
    const seventyTwo = 'Aa1!' + 'a'.repeat(68);
    expect(seventyTwo).toHaveLength(72);
    expect(validatePassword(seventyTwo)).toBeNull();
    expect(validatePassword(seventyTwo + 'a')).toMatch(/at most 72/);
  });

  it('measures the maximum in bytes, not characters, because bcrypt truncates at 72 bytes', () => {
    // 'é' is two bytes in UTF-8: 4 ASCII + 35 × 2 = 74 bytes from 39 characters.
    const multiByte = 'Aa1!' + 'é'.repeat(35);
    expect(multiByte.length).toBeLessThan(72);
    expect(validatePassword(multiByte)).toMatch(/at most 72/);
  });

  it('names the missing upper-case letter', () => {
    expect(validatePassword('welcome123!')).toBe('Password must contain one upper-case letter.');
  });

  it('names the missing lower-case letter', () => {
    expect(validatePassword('WELCOME123!')).toBe('Password must contain one lower-case letter.');
  });

  it('names the missing digit', () => {
    expect(validatePassword('Welcome!!!')).toBe('Password must contain one digit.');
  });

  it('names the missing special character', () => {
    expect(validatePassword('Welcome123')).toBe('Password must contain one special character.');
  });

  it('exposes one rule per requirement for the live rules panel', () => {
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual(['length', 'upper', 'lower', 'digit', 'special']);
    expect(PASSWORD_RULES.every((rule) => rule.test('Welcome123!'))).toBe(true);
    expect(PASSWORD_RULES.find((rule) => rule.id === 'digit')?.test('Welcome!')).toBe(false);
  });
});
