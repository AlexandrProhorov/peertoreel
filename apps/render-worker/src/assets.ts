import { staticFile } from 'remotion';

/**
 * Where a storyboard asset key points. The renderer never fetches S3/fal.ai
 * itself: callers pass a local key under `public/`, an http(s) URL, or a data
 * URI. Anything else is a programming error, not a silent empty image.
 */
export type AssetLocation =
  | { kind: 'local'; key: string }
  | { kind: 'remote'; url: string }
  | { kind: 'data'; url: string };

export class InvalidAssetKeyError extends Error {
  constructor(readonly key: string, reason: string) {
    super(`Invalid asset key "${key}": ${reason}`);
    this.name = 'InvalidAssetKeyError';
  }
}

const LOCAL_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

function isSafeLocalKey(key: string): boolean {
  if (!LOCAL_KEY_PATTERN.test(key) || key.startsWith('/') || key.includes('\\')) {
    return false;
  }

  return key.split('/').every((segment) => segment !== '' && segment !== '..' && segment !== '.');
}

/** Pure key classifier: no filesystem, no network, no Remotion rendering. */
export function resolveAssetKey(rawKey: string): AssetLocation {
  const key = rawKey.trim();

  if (key.length === 0) {
    throw new InvalidAssetKeyError(rawKey, 'asset key is empty');
  }

  if (key.startsWith('data:')) {
    return { kind: 'data', url: key };
  }

  if (/^https?:\/\//i.test(key)) {
    return { kind: 'remote', url: key };
  }

  if (PROTOCOL_PATTERN.test(key)) {
    throw new InvalidAssetKeyError(
      rawKey,
      'only http(s) URLs, data URIs and local public/ keys are supported',
    );
  }

  if (!isSafeLocalKey(key)) {
    throw new InvalidAssetKeyError(
      rawKey,
      'local keys must be relative public/ paths without . or .. segments',
    );
  }

  return { kind: 'local', key };
}

/** Turn a resolved location into something an `<Img src>` can use. */
export function assetUrl(location: AssetLocation): string {
  switch (location.kind) {
    case 'local':
      return staticFile(location.key);
    case 'remote':
    case 'data':
      return location.url;
  }
}
