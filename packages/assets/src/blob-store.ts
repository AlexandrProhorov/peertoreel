/**
 * Blob store port for the Asset Library (ADR-0017 D10).
 *
 * The resolver stays I/O-free: it produces records, not files. Uploading and
 * signing URLs is the persistence layer's job, so `packages/assets` never
 * imports an S3 SDK. `S3AssetBlobStore` lives in `@peertoreel/storage`.
 */
export interface AssetBlobStore {
  /** Upload bytes under a content-addressed key; `mimeType` becomes Content-Type. */
  put(objectKey: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  /** Time-limited download URL; must outlast a render. */
  urlFor(objectKey: string, expiresInSec?: number): Promise<string>;
  get(objectKey: string): Promise<Uint8Array>;
  /** Cheap existence probe: content-addressed keys are immutable, so a hit is final. */
  exists(objectKey: string): Promise<boolean>;
}

interface StoredBlob {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

/**
 * Test double and the only implementation in unit tests: no network, no files.
 * `memory://<key>` is an opaque URL the renderer never dereferences.
 */
export class InMemoryAssetBlobStore implements AssetBlobStore {
  private readonly objects = new Map<string, StoredBlob>();
  private uploads = 0;

  /** Number of `put` calls, so idempotency tests can assert "uploaded once". */
  get putCount(): number {
    return this.uploads;
  }

  has(objectKey: string): boolean {
    return this.objects.has(objectKey);
  }

  objectKeys(): readonly string[] {
    return [...this.objects.keys()];
  }

  async put(
    objectKey: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<void> {
    this.objects.set(objectKey, { bytes: new Uint8Array(bytes), mimeType });
    this.uploads += 1;
  }

  async urlFor(objectKey: string): Promise<string> {
    return `memory://${objectKey}`;
  }

  async get(objectKey: string): Promise<Uint8Array> {
    const stored = this.objects.get(objectKey);

    if (stored === undefined) {
      throw new Error(`Blob store has no object "${objectKey}"`);
    }

    return new Uint8Array(stored.bytes);
  }

  async exists(objectKey: string): Promise<boolean> {
    return this.objects.has(objectKey);
  }
}
