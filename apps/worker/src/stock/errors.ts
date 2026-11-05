export class StockError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'StockError';
  }
}

/** 429 and 5xx are transient; 0 means a network error or timeout. */
export function isRetryableStockStatus(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}
