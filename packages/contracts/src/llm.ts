import type { ProviderUsageEntry } from './assets.js';

/**
 * LLM transport ports (M3.6b.2).
 *
 * Business code (the SVG adapter, stage processors) depends on these ports,
 * never on a vendor SDK. One `complete` call is one HTTP attempt: retries live
 * in the caller, so the provider ledger can record real per-attempt usage.
 */

export type LlmThinkingMode = 'enabled' | 'disabled';

export interface LlmJsonUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

export interface LlmJsonRequest {
  readonly system: string;
  readonly user: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly thinking?: LlmThinkingMode;
}

export interface LlmJsonResponse {
  /** Raw JSON string from the model; parsing belongs to the caller. */
  readonly content: string;
  readonly usage: LlmJsonUsage;
  readonly model: string;
}

export interface LlmJsonClient {
  /** Exactly one request/response round-trip; no internal retries. */
  complete(request: LlmJsonRequest): Promise<LlmJsonResponse>;
}

/**
 * Append-only spend sink. Mirrors `ProviderUsageWriter` in `@peertoreel/assets`
 * so adapters can live in packages that never import the DB layer.
 */
export interface ProviderUsageSink {
  record(entry: ProviderUsageEntry): Promise<void>;
}
