/**
 * Login throttle (BR-07, AD-07): after five failed logins for one email within
 * fifteen minutes, further attempts for that email are refused until the
 * window passes.
 *
 * State is in-memory and per process, which is what a single local lab server
 * needs; a restart clears it. Only `401 INVALID_CREDENTIALS` outcomes are
 * recorded — a `403 ACCOUNT_INACTIVE` answer means the password was right, so
 * it is not an attempt worth counting. A successful login resets the email.
 *
 * `now` is injectable so the window can be tested without waiting.
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;

interface FailureRecord {
  /** Timestamps (ms) of failures still inside the window. */
  failures: number[];
}

export class LoginThrottle {
  private readonly records = new Map<string, FailureRecord>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  private prune(email: string): number[] {
    const record = this.records.get(email);
    if (!record) return [];

    const cutoff = this.now() - THROTTLE_WINDOW_MS;
    record.failures = record.failures.filter((at) => at > cutoff);

    if (record.failures.length === 0) {
      this.records.delete(email);
      return [];
    }
    return record.failures;
  }

  /** True when the email has reached the limit inside the current window. */
  isThrottled(email: string): boolean {
    return this.prune(email).length >= MAX_FAILED_ATTEMPTS;
  }

  recordFailure(email: string): void {
    const failures = this.prune(email);
    failures.push(this.now());
    this.records.set(email, { failures });
  }

  reset(email: string): void {
    this.records.delete(email);
  }

  /** Test helper: forget everything. */
  clear(): void {
    this.records.clear();
  }
}

/** The process-wide instance the login route uses. */
export const loginThrottle = new LoginThrottle();
