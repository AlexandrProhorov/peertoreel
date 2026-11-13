import {
  DEFAULT_STYLE_PRESET_ID,
  STARTER_ASSET_CATALOG,
  STARTER_ASSET_KEYS,
  buildAssetId,
  type AssetLicense,
  type AssetRecord,
  type AssetVariant,
} from '@peertoreel/contracts';
import { sha256Hex } from './content-hash.js';
import { readSvgViewBox } from './normalize-svg.js';

/**
 * Tier 0 is the curated starter pack, but it is stored as ordinary library
 * records (ADR-0017 D1/D4): same shape, same licence fields, same hash rule.
 * Nothing downstream special-cases `starter` beyond the resolution tier.
 */

/** Every starter icon is authored in this repository (ADR-0015 D2). */
export const AUTHORED_ASSET_LICENSE: AssetLicense = {
  name: 'authored',
  commercialUse: true,
};

export interface StarterAssetInput {
  readonly key: string;
  /** Relative to `apps/render-worker/public/`. */
  readonly objectKey: string;
  readonly tags: readonly string[];
  readonly width?: number;
  readonly height?: number;
}

export function starterAssetInputs(): readonly StarterAssetInput[] {
  return STARTER_ASSET_KEYS.map((key) => {
    const entry = STARTER_ASSET_CATALOG[key];

    return {
      key,
      objectKey: entry.path,
      tags: entry.tags,
    };
  });
}

function variantFor(
  objectKey: string,
  contentHash: string,
  width: number,
  height: number,
): AssetVariant {
  return {
    id: 'default',
    objectKey,
    mimeType: 'image/svg+xml',
    width,
    height,
    contentHash,
  };
}

/**
 * Build Tier 0 records from real bytes. `readContent` keeps the function pure
 * with respect to storage: the CLI passes `fs.readFile`, tests pass a fake.
 *
 * Tier 0 is authored and pre-normalized: it is the only source that is not
 * re-quantized on upload (ADR-0017 D5). Dimensions come from the real viewBox,
 * never a guessed constant.
 */
export async function buildStarterAssets(
  readContent: (objectKey: string) => Promise<string>,
  styleId: string = DEFAULT_STYLE_PRESET_ID,
  inputs: readonly StarterAssetInput[] = starterAssetInputs(),
): Promise<readonly AssetRecord[]> {
  const records: AssetRecord[] = [];

  for (const input of inputs) {
    const content = await readContent(input.objectKey);
    const contentHash = sha256Hex(content);
    const viewBox = readSvgViewBox(content);
    const width = input.width ?? viewBox?.width ?? 1024;
    const height = input.height ?? viewBox?.height ?? 1024;

    records.push({
      id: buildAssetId('starter', input.key),
      key: input.key,
      source: 'starter',
      kind: 'svg',
      styleId,
      contentHash,
      tags: [...input.tags],
      license: AUTHORED_ASSET_LICENSE,
      variants: [
        variantFor(
          input.objectKey,
          contentHash,
          Math.round(width),
          Math.round(height),
        ),
      ],
      metadata: { localPath: input.objectKey },
    });
  }

  return records;
}
