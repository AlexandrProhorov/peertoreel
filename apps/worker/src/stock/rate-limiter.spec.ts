import { describe, expect, it } from 'vitest';
import { SlidingWindowRateLimiter } from './rate-limiter.js';

describe('SlidingWindowRateLimiter', () => {
  it('allows calls under the limit without sleeping', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const limiter = new SlidingWindowRateLimiter(
      2,
      1_000,
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    );

    await limiter.acquire();
    await limiter.acquire();

    expect(sleeps).toEqual([]);
  });

  it('waits until the oldest call leaves the window', async () => {
    let now = 0;
    const sleeps: number[] = [];
    const limiter = new SlidingWindowRateLimiter(
      2,
      1_000,
      () => now,
      async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    );

    await limiter.acquire();
    now = 400;
    await limiter.acquire();
    now = 700;
    await limiter.acquire();

    expect(sleeps).toEqual([300]);

    now = 1_400;
    await limiter.acquire();
    expect(sleeps).toEqual([300]);
  });
});
