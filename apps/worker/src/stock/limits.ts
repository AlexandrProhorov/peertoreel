/** Pixabay limits and guards for one visuals stage run. */
export const STOCK_LIMITS = {
  searchTimeoutMs: 15_000,
  downloadTimeoutMs: 30_000,
  maxVideoBytes: 50 * 1024 * 1024,
  maxImageBytes: 15 * 1024 * 1024,
  cacheTtlSec: 24 * 60 * 60,
  requestsPerWindow: 100,
  windowMs: 60_000,
} as const;
