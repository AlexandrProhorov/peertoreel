import type { ProviderUsageWriter } from '@peertoreel/assets';
import {
  providerUsageEntrySchema,
  type ProviderUsageEntry,
} from '@peertoreel/contracts';
import type { Database } from './client.js';
import { providerUsage } from './schema.js';

/**
 * Postgres writer for the provider spend ledger (ADR-0017 D11, root hard
 * rule 7). One row per real provider call, append-only: no updates, no deletes,
 * no estimates. `costUsd: null` is stored as `NULL`, never as `0`.
 */
export class DrizzleProviderUsageWriter implements ProviderUsageWriter {
  constructor(private readonly db: Database) {}

  async record(entry: ProviderUsageEntry): Promise<void> {
    const parsed = providerUsageEntrySchema.parse(entry);

    await this.db.insert(providerUsage).values({
      provider: parsed.provider,
      operation: parsed.operation,
      model: parsed.model,
      runId: parsed.runId,
      source: parsed.source,
      units: parsed.units,
      costUsd: parsed.costUsd === null ? null : parsed.costUsd.toFixed(6),
      meta: { ...parsed.meta },
    });
  }
}
