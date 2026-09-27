import { describe, it, expect } from 'vitest';
import { LoginThrottle, MAX_FAILED_ATTEMPTS, THROTTLE_WINDOW_MS } from '../../src/loginThrottle.js';

/**
 * UNIT-06 — BR-07, AC-07: five failures are allowed, the sixth attempt is
 * blocked, the window expires, and a successful login resets the count.
 * Time is injected, so nothing here waits.
 */
function throttleAt(start = 0) {
  let now = start;
  const throttle = new LoginThrottle(() => now);
  return { throttle, advance: (ms: number) => (now += ms) };
}

const EMAIL = 'sarah.johnson@kmutt.ac.th';

describe('LoginThrottle (UNIT-06, BR-07)', () => {
  it('allows the first five failures and blocks the sixth attempt', () => {
    const { throttle } = throttleAt();

    for (let attempt = 1; attempt <= MAX_FAILED_ATTEMPTS; attempt += 1) {
      expect(throttle.isThrottled(EMAIL)).toBe(false);
      throttle.recordFailure(EMAIL);
    }

    expect(throttle.isThrottled(EMAIL)).toBe(true);
  });

  it('is scoped per email', () => {
    const { throttle } = throttleAt();

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) throttle.recordFailure(EMAIL);

    expect(throttle.isThrottled(EMAIL)).toBe(true);
    expect(throttle.isThrottled('david.lee@kmutt.ac.th')).toBe(false);
  });

  it('clears once the fifteen-minute window has passed', () => {
    const { throttle, advance } = throttleAt();

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) throttle.recordFailure(EMAIL);
    expect(throttle.isThrottled(EMAIL)).toBe(true);

    advance(THROTTLE_WINDOW_MS - 1);
    expect(throttle.isThrottled(EMAIL)).toBe(true);

    advance(2);
    expect(throttle.isThrottled(EMAIL)).toBe(false);
  });

  it('counts only failures inside the window, sliding as old ones age out', () => {
    const { throttle, advance } = throttleAt();

    throttle.recordFailure(EMAIL);
    throttle.recordFailure(EMAIL);
    advance(THROTTLE_WINDOW_MS + 1);

    // The two old failures are gone; three fresh ones are not enough.
    throttle.recordFailure(EMAIL);
    throttle.recordFailure(EMAIL);
    throttle.recordFailure(EMAIL);
    expect(throttle.isThrottled(EMAIL)).toBe(false);

    throttle.recordFailure(EMAIL);
    throttle.recordFailure(EMAIL);
    expect(throttle.isThrottled(EMAIL)).toBe(true);
  });

  it('resets the count on a successful login', () => {
    const { throttle } = throttleAt();

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt += 1) throttle.recordFailure(EMAIL);
    throttle.reset(EMAIL);

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt += 1) throttle.recordFailure(EMAIL);
    expect(throttle.isThrottled(EMAIL)).toBe(false);
  });
});
