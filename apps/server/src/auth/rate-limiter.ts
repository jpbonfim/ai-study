interface Attempts {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number | null;
}

export type RateLimitDecision =
  | { allowed: true; remainingAttempts: number }
  | { allowed: false; remainingAttempts: 0; retryAfterSeconds: number };

/**
 * In-memory login throttling per client key (IP). After `maxAttempts` failures inside the window
 * the key is blocked until the window elapses; a success clears the history.
 */
export class LoginRateLimiter {
  private readonly attempts = new Map<string, Attempts>();

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitDecision {
    const record = this.attempts.get(key);
    if (!record) return { allowed: true, remainingAttempts: this.maxAttempts };

    const now = this.now();
    if (record.blockedUntil && record.blockedUntil > now) {
      return { allowed: false, remainingAttempts: 0, retryAfterSeconds: Math.ceil((record.blockedUntil - now) / 1000) };
    }
    if (now - record.firstAttemptAt > this.windowMs) {
      this.attempts.delete(key);
      return { allowed: true, remainingAttempts: this.maxAttempts };
    }
    if (record.count >= this.maxAttempts) {
      record.blockedUntil = record.firstAttemptAt + this.windowMs;
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds: Math.ceil((record.blockedUntil - now) / 1000),
      };
    }
    return { allowed: true, remainingAttempts: this.maxAttempts - record.count };
  }

  recordFailure(key: string): void {
    const now = this.now();
    const record = this.attempts.get(key);
    if (!record || now - record.firstAttemptAt > this.windowMs) {
      this.attempts.set(key, { count: 1, firstAttemptAt: now, blockedUntil: null });
      return;
    }
    record.count += 1;
    if (record.count >= this.maxAttempts) record.blockedUntil = now + this.windowMs;
  }

  recordSuccess(key: string): void {
    this.attempts.delete(key);
  }
}
