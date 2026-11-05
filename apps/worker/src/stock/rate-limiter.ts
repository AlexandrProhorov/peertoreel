export interface RateLimiter {
  acquire(): Promise<void>;
}

/**
 * In-process sliding window. The visuals queue runs with concurrency 1, so this
 * is effectively a global 100 req / 60 s limit for the app. If the worker is
 * scaled horizontally, this must move to Redis.
 */
export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly hits: number[] = [];

  constructor(
    private readonly limit = 100,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const current = this.now();

      while (
        this.hits.length > 0 &&
        current - (this.hits[0] ?? current) >= this.windowMs
      ) {
        this.hits.shift();
      }

      if (this.hits.length < this.limit) {
        this.hits.push(current);
        return;
      }

      const oldest = this.hits[0] ?? current;
      const waitMs = Math.max(1, this.windowMs - (current - oldest));

      await this.sleep(waitMs);
    }
  }
}
