import { describe, expect, it } from 'vitest';
import {
  S3AssetBlobStore,
  type AssetObjectStorage,
} from './asset-blob-store.js';

interface Call {
  readonly name: string;
  readonly key: string;
  readonly contentType?: string;
  readonly expiresInSec?: number;
}

function fakeStorage(exists = false): {
  storage: AssetObjectStorage;
  calls: Call[];
} {
  const calls: Call[] = [];

  return {
    calls,
    storage: {
      async putObject(key, _body, contentType) {
        calls.push({ name: 'putObject', key, contentType });
      },
      async getObject(key) {
        calls.push({ name: 'getObject', key });

        return new Uint8Array([1, 2, 3]);
      },
      async presignGet(key, expiresInSec) {
        calls.push({ name: 'presignGet', key, expiresInSec });

        return `https://example.test/${key}`;
      },
      async objectExists(key) {
        calls.push({ name: 'objectExists', key });

        return exists;
      },
    },
  };
}

const KEY = `assets/aa/${'a'.repeat(64)}/${'a'.repeat(64)}.svg`;

describe('S3AssetBlobStore', () => {
  it('forwards bytes and the MIME type as Content-Type', async () => {
    const { storage, calls } = fakeStorage();
    const blobs = new S3AssetBlobStore(storage);

    await blobs.put(KEY, new Uint8Array([1]), 'image/svg+xml');

    expect(calls).toEqual([
      { name: 'putObject', key: KEY, contentType: 'image/svg+xml' },
    ]);
  });

  it('presigns with the default and overridden TTL', async () => {
    const { storage, calls } = fakeStorage();
    const blobs = new S3AssetBlobStore(storage, 7200);

    await expect(blobs.urlFor(KEY)).resolves.toBe(`https://example.test/${KEY}`);
    await expect(blobs.urlFor(KEY, 60)).resolves.toBe(
      `https://example.test/${KEY}`,
    );

    expect(calls.map((call) => call.expiresInSec)).toEqual([7200, 60]);
  });

  it('delegates get and exists', async () => {
    const { storage, calls } = fakeStorage(true);
    const blobs = new S3AssetBlobStore(storage);

    await expect(blobs.get(KEY)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    await expect(blobs.exists(KEY)).resolves.toBe(true);
    expect(calls.map((call) => call.name)).toEqual(['getObject', 'objectExists']);
  });
});
