import type {
  ImageProvider,
  ImageProviderRequest,
  ImageProviderResult,
  ProviderUsageEntry,
} from '@peertoreel/contracts';

/**
 * Write side of the provider ledger (ADR-0017 D11, root hard rule 7).
 *
 * The resolver and adapters stay storage-agnostic: they only see this port.
 * The Drizzle implementation lives in `@peertoreel/db`, so no adapter imports
 * Postgres (packages/assets has no DB dependency).
 */
export interface ProviderUsageWriter {
  record(entry: ProviderUsageEntry): Promise<void>;
}

export interface ProviderUsageContext {
  readonly writer: ProviderUsageWriter;
  /** Where the call happened: `assets`, `cli`, `worker`. */
  readonly source: string;
  /** Run that pays for the call; `null` for CLI/import work. */
  readonly runId?: string | null;
  /** Operation name; defaults to `image.generate`. */
  readonly operation?: string;
}

/**
 * Decorator that writes exactly one ledger row per successful provider call.
 *
 * Cost and units are copied from the provider result, never derived: `null`
 * stays `null` (`0` is a real measurement from the fake provider). A failing
 * write propagates — silently losing a spend record is worse than failing the
 * call that already happened.
 */
export function recordingImageProvider(
  provider: ImageProvider,
  context: ProviderUsageContext,
): ImageProvider {
  return {
    id: provider.id,
    get enabled(): boolean {
      return provider.enabled;
    },
    supports: (kind) => provider.supports(kind),
    async generate(request: ImageProviderRequest): Promise<ImageProviderResult> {
      const result = await provider.generate(request);

      await context.writer.record({
        provider: result.provider,
        operation: context.operation ?? 'image.generate',
        model: result.model,
        runId: context.runId ?? null,
        source: context.source,
        units: result.units ?? null,
        costUsd: result.costUsd,
        meta: {
          assetKey: request.key,
          kind: request.kind,
          styleId: request.styleId,
        },
      });

      return result;
    },
  };
}
