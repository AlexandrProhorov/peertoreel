import type {
  StockAsset,
  StockAssetKind,
  VisualScene,
  VisualSceneAsset,
} from '@kadence/contracts';
import type { BeatTiming } from './beat-timings.js';

export type VisualScenePlan = Omit<VisualScene, 'asset'>;

export const FALLBACK_ASSET: VisualSceneAsset = {
  kind: 'fallback',
  objectKey: null,
  contentType: null,
  width: null,
  height: null,
  provider: null,
  providerAssetId: null,
  author: null,
  pageUrl: null,
};

export function planVisualScenes(
  timings: readonly BeatTiming[],
): VisualScenePlan[] {
  return timings.map((timing, idx) => ({
    idx,
    part: timing.part,
    beatIndex: timing.beatIndex,
    text: timing.text,
    visualDirection: timing.visualDirection,
    startSec: timing.startSec,
    endSec: timing.endSec,
  }));
}

export function withAsset(
  plan: VisualScenePlan,
  asset: VisualSceneAsset,
): VisualScene {
  return { ...plan, asset };
}

export interface SelectStockAssetOptions {
  kind: StockAssetKind;
  /** Prefer clips at least this long; shorter clips are still looped by FFmpeg. */
  minDurationSec: number;
  maxBytes: number;
  usedProviderAssetIds?: ReadonlySet<string>;
  /** Assets from the previous visuals manifest, excluded on regeneration. */
  avoidProviderAssetIds?: ReadonlySet<string>;
  /**
   * Anchor tokens that must be present in the provider tags. When set and no
   * candidate matches, selection returns null so the caller can fall back to
   * an anchor-only search.
   */
  requiredTagTokens?: readonly string[];
}

function isVertical(asset: StockAsset): boolean {
  return (
    asset.width !== null && asset.height !== null && asset.height > asset.width
  );
}

function score(asset: StockAsset): number {
  // Pixabay returns results in relevance order. Rank dominates so a relevant
  // dog clip wins over a prettier but unrelated cat clip; verticality and
  // resolution are tie-breakers.
  let value = Math.max(0, 20 - Math.min(asset.rank, 20)) * 10_000_000;

  if (isVertical(asset)) {
    value += 1_000_000;
  }

  value += Math.min((asset.width ?? 0) * (asset.height ?? 0), 8_000_000);

  if (asset.kind === 'video') {
    value += Math.min(asset.durationSec ?? 0, 60) * 1_000;
  }

  return value;
}

function matchesTagTokens(
  asset: StockAsset,
  tokens: readonly string[],
): boolean {
  if (tokens.length === 0) {
    return true;
  }

  const tagText = asset.tags.join(' ').toLowerCase();

  return tokens.every((token) => tagText.includes(token.toLowerCase()));
}

function isUsable(asset: StockAsset, options: SelectStockAssetOptions): boolean {
  if (asset.kind !== options.kind) {
    return false;
  }

  if (asset.sizeBytes !== null && asset.sizeBytes > options.maxBytes) {
    return false;
  }

  return true;
}

function hasEnoughFootage(
  asset: StockAsset,
  minDurationSec: number,
): boolean {
  return (
    asset.kind !== 'video' ||
    asset.durationSec === null ||
    asset.durationSec >= minDurationSec
  );
}

/**
 * Picks one asset from a search result: vertical first, then resolution and
 * duration. Assets already used by another scene are skipped when possible, so
 * the same query (hook and first beat) does not produce identical neighbours.
 */
export function selectStockAsset(
  candidates: readonly StockAsset[],
  options: SelectStockAssetOptions,
): StockAsset | null {
  const tagTokens = options.requiredTagTokens ?? [];
  const usable = candidates.filter(
    (candidate) =>
      isUsable(candidate, options) &&
      matchesTagTokens(candidate, tagTokens),
  );

  if (usable.length === 0) {
    return null;
  }

  const unused = usable.filter(
    (candidate) =>
      !options.usedProviderAssetIds?.has(candidate.providerAssetId),
  );
  const fresh = unused.filter(
    (candidate) =>
      !options.avoidProviderAssetIds?.has(candidate.providerAssetId),
  );
  const notAvoided = usable.filter(
    (candidate) =>
      !options.avoidProviderAssetIds?.has(candidate.providerAssetId),
  );
  let pool = usable;

  if (notAvoided.length > 0) {
    pool = notAvoided;
  }

  if (unused.length > 0) {
    pool = unused;
  }

  if (fresh.length > 0) {
    pool = fresh;
  }

  const withFootage = pool.filter((candidate) =>
    hasEnoughFootage(candidate, options.minDurationSec),
  );
  const preferred = withFootage.length > 0 ? withFootage : pool;

  return [...preferred].sort((left, right) => score(right) - score(left))[0] ??
    null;
}
