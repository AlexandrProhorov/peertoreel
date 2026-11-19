import type { AssetBlobStore } from '@peertoreel/assets';

/**
 * S3-compatible implementation of the `AssetBlobStore` port (ADR-0017 D10).
 *
 * Thin by design: object naming and content addressing stay in contracts, S3
 * mechanics stay in `ObjectStorage`. `put` forwards the MIME type verbatim —
 * without a correct `Content-Type` the browser cannot render an SVG.
 */

/** The slice of `ObjectStorage` this adapter needs; keeps the test fake small. */
export interface AssetObjectStorage {
  putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
  getObject(key: string): Promise<Uint8Array>;
  presignGet(key: string, expiresInSec?: number): Promise<string>;
  objectExists(key: string): Promise<boolean>;
}

export class S3AssetBlobStore implements AssetBlobStore {
  constructor(
    private readonly storage: AssetObjectStorage,
    /** Must outlast a render; one hour by default. */
    private readonly defaultTtlSec = 3600,
  ) {}

  async put(
    objectKey: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<void> {
    await this.storage.putObject(objectKey, bytes, mimeType);
  }

  async urlFor(objectKey: string, expiresInSec?: number): Promise<string> {
    return this.storage.presignGet(
      objectKey,
      expiresInSec ?? this.defaultTtlSec,
    );
  }

  async get(objectKey: string): Promise<Uint8Array> {
    return this.storage.getObject(objectKey);
  }

  /** Content-addressed keys are immutable, so a successful HEAD is final. */
  async exists(objectKey: string): Promise<boolean> {
    return this.storage.objectExists(objectKey);
  }
}
