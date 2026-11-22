/**
 * Local 3D object library. Assets are inputs, not network calls: every entry is
 * a file under `public/assets/ui-emoji/` with a content hash that pins the
 * exact bytes.
 *
 * The hash is what makes generation cacheable: if a renderer or a future
 * generator asks for the same content hash, the existing file is reused; if the
 * hash does not match the scene reference, resolution fails loudly instead of
 * silently showing different art.
 *
 * Source: Microsoft Fluent Emoji 3D (MIT), see `public/assets/ui-emoji/LICENSE.md`.
 */
export const ASSET_KEYS = [
  'owl',
  'panda',
  'ledger',
  'candy',
  'crystal-ball',
  'framed-picture',
  'airplane',
  'envelope',
  'coin',
  'full-moon',
  'red-heart',
] as const;

export type UiAssetKey = (typeof ASSET_KEYS)[number];

export interface LocalAsset {
  readonly key: UiAssetKey;
  readonly file: string;
  /** sha256 of the file bytes. */
  readonly contentHash: string;
  readonly alt: string;
}

export const LOCAL_ASSETS: Record<UiAssetKey, LocalAsset> = {
  owl: {
    key: 'owl',
    file: 'assets/ui-emoji/owl-3d.png',
    contentHash:
      '7dfcdcdebd599787719d98f3057b0822522678e6752369ca3498a780ca7ba443',
    alt: 'Сова',
  },
  panda: {
    key: 'panda',
    file: 'assets/ui-emoji/panda-3d.png',
    contentHash:
      '31524ed035f8d769bc7d437268f30a65eb309ea216e84c09823d4f36c2f97070',
    alt: 'Панда',
  },
  ledger: {
    key: 'ledger',
    file: 'assets/ui-emoji/ledger-3d.png',
    contentHash:
      'c72c7ec1511af9f556f5a44c257db68b9e13d68a8e6883ed4e4df3aec07f63c8',
    alt: 'Дневник',
  },
  candy: {
    key: 'candy',
    file: 'assets/ui-emoji/candy-3d.png',
    contentHash:
      '79607ed1b5a0b96117723261fb9c79db77e63b154cebbd9af42ee8ddb6776fb9',
    alt: 'Конфета',
  },
  'crystal-ball': {
    key: 'crystal-ball',
    file: 'assets/ui-emoji/crystal-ball-3d.png',
    contentHash:
      'f42c5484bea4f33f7ba8ee2b5c7e2a51d17a9fcec36f2ba92334f62b7f95eb43',
    alt: 'Хрустальный шар',
  },
  'framed-picture': {
    key: 'framed-picture',
    file: 'assets/ui-emoji/framed-picture-3d.png',
    contentHash:
      'e70eeb3cd3b5c8bd6633a9ddf0c5f0bb7e0c4be45c89b9b2aad689276aad35bc',
    alt: 'Картина в рамке',
  },
  airplane: {
    key: 'airplane',
    file: 'assets/ui-emoji/airplane-3d.png',
    contentHash:
      'dda8d8e9ccaca71973f4ee75fcab085dcffbb89f3987a9d2cc5401f186268fa1',
    alt: 'Самолёт',
  },
  envelope: {
    key: 'envelope',
    file: 'assets/ui-emoji/envelope-3d.png',
    contentHash:
      '9671859aa64b65b6977b7ab6adc2e64220e75edf531a8e67c4b76e01ace04230',
    alt: 'Конверт',
  },
  coin: {
    key: 'coin',
    file: 'assets/ui-emoji/coin-3d.png',
    contentHash:
      '17e2a0c226342fe2cdd2612c56f5dd188870d1435076f47600313c04876f843b',
    alt: 'Монеты',
  },
  'full-moon': {
    key: 'full-moon',
    file: 'assets/ui-emoji/full-moon-3d.png',
    contentHash:
      '00dd24efe4fc9b13a020f59309d962ecd3bede581abeca5111056a8fc84c779e',
    alt: 'Луна',
  },
  'red-heart': {
    key: 'red-heart',
    file: 'assets/ui-emoji/red-heart-3d.png',
    contentHash:
      '7218cb9f08ed1ef38fcd83fe699a1125d07f50725f4c87a68cb7c9f4efb3c32b',
    alt: 'Сердце',
  },
};

const BY_CONTENT_HASH = new Map<string, LocalAsset>(
  Object.values(LOCAL_ASSETS).map((asset) => [asset.contentHash, asset]),
);

export interface AssetRef {
  readonly key: UiAssetKey;
  readonly contentHash: string;
}

export class AssetResolutionError extends Error {
  public readonly code: 'unknown-key' | 'hash-mismatch';

  public constructor(code: AssetResolutionError['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'AssetResolutionError';
  }
}

/**
 * Resolve a scene asset reference. The content hash is part of the reference, so
 * an edited file invalidates the scene instead of changing the video silently.
 */
export function resolveAsset(ref: AssetRef): LocalAsset {
  const asset = LOCAL_ASSETS[ref.key];

  if (asset === undefined) {
    throw new AssetResolutionError(
      'unknown-key',
      `Unknown UI asset "${ref.key}"`,
    );
  }

  if (asset.contentHash !== ref.contentHash) {
    throw new AssetResolutionError(
      'hash-mismatch',
      `Asset "${ref.key}" content changed: scene expects ${ref.contentHash}, library has ${asset.contentHash}`,
    );
  }

  return asset;
}

/** Reuse an already produced asset by content hash (generation cache contract). */
export function assetByContentHash(contentHash: string): LocalAsset | undefined {
  return BY_CONTENT_HASH.get(contentHash);
}
