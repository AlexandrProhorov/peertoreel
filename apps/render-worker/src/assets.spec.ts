import { describe, expect, it } from 'vitest';
import {
  InvalidAssetKeyError,
  assetUrl,
  resolveAssetKey,
} from './assets.js';

describe('asset key resolver', () => {
  it('treats a relative public/ path as a local asset', () => {
    expect(resolveAssetKey('assets/test-scene.svg')).toEqual({
      kind: 'local',
      key: 'assets/test-scene.svg',
    });
  });

  it('accepts http(s) and data URIs as remote input', () => {
    expect(resolveAssetKey('https://cdn.example.com/a.png')).toEqual({
      kind: 'remote',
      url: 'https://cdn.example.com/a.png',
    });
    expect(resolveAssetKey('data:image/svg+xml;base64,PHN2Zy8+')).toEqual({
      kind: 'data',
      url: 'data:image/svg+xml;base64,PHN2Zy8+',
    });
  });

  it('rejects traversal, absolute paths and unknown protocols', () => {
    for (const key of [
      '../secret.png',
      'assets/../../secret.png',
      '/etc/passwd',
      'C:\\Users\\asset.png',
      'ftp://example.com/a.png',
      'file:///tmp/a.png',
      '   ',
    ]) {
      expect(() => resolveAssetKey(key)).toThrow(InvalidAssetKeyError);
    }
  });

  it('does not call staticFile for remote or data assets', () => {
    expect(assetUrl({ kind: 'remote', url: 'https://example.com/a.png' })).toBe(
      'https://example.com/a.png',
    );
    expect(assetUrl({ kind: 'data', url: 'data:image/png;base64,AA==' })).toBe(
      'data:image/png;base64,AA==',
    );
  });
});
